"""
Homly — Comando de migración de archivos Base64 a FileField
============================================================
Convierte los datos binarios almacenados como Base64 en campos TextField
a archivos reales en disco (o almacenamiento externo configurado en settings).

USO:
    # Ver cuántos registros necesitan migración (modo lectura, no modifica nada):
    python manage.py migrate_base64_to_files --dry-run

    # Ejecutar migración completa:
    python manage.py migrate_base64_to_files

    # Solo un modelo específico:
    python manage.py migrate_base64_to_files --model tenant
    python manage.py migrate_base64_to_files --model unit
    python manage.py migrate_base64_to_files --model payment
    python manage.py migrate_base64_to_files --model gasto
    python manage.py migrate_base64_to_files --model bankstatement

PRECONDICIONES:
    - La migración 0041_filefield_migration debe estar aplicada.
    - El directorio MEDIA_ROOT debe ser accesible y tener espacio suficiente.
    - Para almacenamiento externo (S3): configurar DEFAULT_FILE_STORAGE en settings.py.

NOTAS:
    - El comando es idempotente: omite registros que ya tienen el *_file poblado.
    - Los campos Base64 originales NO se eliminan automáticamente (requiere otra migración).
    - Después de verificar que la migración es correcta, los campos Base64 pueden
      ser eliminados con: python manage.py makemigrations --name remove_base64_fields
      (modificando models.py para quitar los campos TextField deprecados).
"""
import base64
import uuid
import logging
from io import BytesIO

from django.core.management.base import BaseCommand, CommandError
from django.core.files.base import ContentFile
from django.db import transaction

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Migra archivos almacenados como Base64 (TextField) a FileField/ImageField'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Solo muestra cuántos registros se migrarían, sin modificar nada.',
        )
        parser.add_argument(
            '--model',
            choices=['tenant', 'unit', 'payment', 'gasto', 'bankstatement', 'all'],
            default='all',
            help='Modelo a migrar. Default: all',
        )
        parser.add_argument(
            '--batch-size',
            type=int,
            default=50,
            help='Número de registros a procesar por lote. Default: 50',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        model_filter = options['model']
        batch_size = options['batch_size']

        if dry_run:
            self.stdout.write(self.style.WARNING('MODO DRY-RUN: no se modificará ningún registro.\n'))

        total_ok = 0
        total_skip = 0
        total_err = 0

        tasks = {
            'tenant':      self._migrate_tenant,
            'unit':        self._migrate_unit,
            'payment':     self._migrate_payment,
            'gasto':       self._migrate_gasto,
            'bankstatement': self._migrate_bankstatement,
        }

        to_run = tasks if model_filter == 'all' else {model_filter: tasks[model_filter]}

        for name, fn in to_run.items():
            self.stdout.write(self.style.HTTP_INFO(f'\n── Migrando: {name.upper()} ──'))
            ok, skip, err = fn(dry_run=dry_run, batch_size=batch_size)
            total_ok += ok
            total_skip += skip
            total_err += err

        self.stdout.write('\n' + '─' * 50)
        self.stdout.write(self.style.SUCCESS(f'Migrados:  {total_ok}'))
        self.stdout.write(self.style.WARNING(f'Omitidos:  {total_skip}  (ya tenían archivo)'))
        if total_err:
            self.stdout.write(self.style.ERROR(f'Errores:   {total_err}'))
        else:
            self.stdout.write(f'Errores:   {total_err}')

        if not dry_run and total_ok > 0:
            self.stdout.write(self.style.SUCCESS(
                '\nMigración completada. Verifica que los archivos se subieron correctamente '
                'antes de eliminar los campos Base64 originales.'
            ))

    # ── Helpers ──────────────────────────────────────────────────────────────

    def _decode_base64(self, data: str) -> bytes | None:
        """Decodifica Base64 quitando el prefijo data URI si existe."""
        if not data:
            return None
        # Quitar prefijo tipo "data:image/png;base64," o "data:application/pdf;base64,"
        if ',' in data:
            data = data.split(',', 1)[1]
        try:
            return base64.b64decode(data)
        except Exception as e:
            logger.warning(f'Error decodificando Base64: {e}')
            return None

    def _guess_extension(self, raw: bytes, default: str = '.bin') -> str:
        """Detecta extensión por magic bytes."""
        if raw[:4] == b'%PDF':
            return '.pdf'
        if raw[:8] == b'\x89PNG\r\n\x1a\n':
            return '.png'
        if raw[:3] == b'\xff\xd8\xff':
            return '.jpg'
        if raw[:6] in (b'GIF87a', b'GIF89a'):
            return '.gif'
        if raw[:4] == b'RIFF' and raw[8:12] == b'WEBP':
            return '.webp'
        return default

    def _save_file(self, field, raw: bytes, prefix: str, default_ext: str = '.bin') -> bool:
        ext = self._guess_extension(raw, default=default_ext)
        filename = f'{prefix}_{uuid.uuid4().hex}{ext}'
        field.save(filename, ContentFile(raw), save=False)
        return True

    # ── Migraciones por modelo ────────────────────────────────────────────────

    def _migrate_tenant(self, dry_run=False, batch_size=50):
        from core.models import Tenant
        ok, skip, err = 0, 0, 0
        qs = Tenant.objects.filter(logo__gt='').exclude(logo_file__gt='')
        total = qs.count()
        self.stdout.write(f'  Tenants con logo Base64 pendiente: {total}')
        if dry_run or total == 0:
            return total if dry_run else ok, skip, err

        for obj in qs.iterator(chunk_size=batch_size):
            raw = self._decode_base64(obj.logo)
            if not raw:
                err += 1
                self.stdout.write(self.style.ERROR(f'  ERROR decodificando tenant {obj.id}'))
                continue
            try:
                with transaction.atomic():
                    self._save_file(obj.logo_file, raw, f'tenant_{obj.id}', '.png')
                    obj.save(update_fields=['logo_file'])
                ok += 1
            except Exception as e:
                err += 1
                self.stdout.write(self.style.ERROR(f'  ERROR guardando tenant {obj.id}: {e}'))

        self.stdout.write(f'  → OK: {ok}  Errores: {err}')
        return ok, skip, err

    def _migrate_unit(self, dry_run=False, batch_size=50):
        from core.models import Unit
        ok, skip, err = 0, 0, 0
        qs = Unit.objects.filter(previous_debt_evidence__gt='').exclude(previous_debt_evidence_file__gt='')
        total = qs.count()
        self.stdout.write(f'  Units con evidencia Base64 pendiente: {total}')
        if dry_run or total == 0:
            return total if dry_run else ok, skip, err

        for obj in qs.iterator(chunk_size=batch_size):
            raw = self._decode_base64(obj.previous_debt_evidence)
            if not raw:
                err += 1
                continue
            try:
                with transaction.atomic():
                    self._save_file(obj.previous_debt_evidence_file, raw, f'unit_{obj.id}', '.pdf')
                    obj.save(update_fields=['previous_debt_evidence_file'])
                ok += 1
            except Exception as e:
                err += 1
                self.stdout.write(self.style.ERROR(f'  ERROR unit {obj.id}: {e}'))

        self.stdout.write(f'  → OK: {ok}  Errores: {err}')
        return ok, skip, err

    def _migrate_payment(self, dry_run=False, batch_size=50):
        from core.models import Payment
        ok, skip, err = 0, 0, 0
        qs = Payment.objects.filter(evidence__gt='').exclude(evidence_file__gt='')
        total = qs.count()
        self.stdout.write(f'  Payments con evidencia Base64 pendiente: {total}')
        if dry_run or total == 0:
            return total if dry_run else ok, skip, err

        for obj in qs.iterator(chunk_size=batch_size):
            raw = self._decode_base64(obj.evidence)
            if not raw:
                err += 1
                continue
            try:
                with transaction.atomic():
                    self._save_file(obj.evidence_file, raw, f'payment_{obj.id}', '.jpg')
                    obj.save(update_fields=['evidence_file'])
                ok += 1
            except Exception as e:
                err += 1
                self.stdout.write(self.style.ERROR(f'  ERROR payment {obj.id}: {e}'))

        self.stdout.write(f'  → OK: {ok}  Errores: {err}')
        return ok, skip, err

    def _migrate_gasto(self, dry_run=False, batch_size=50):
        from core.models import GastoEntry
        ok, skip, err = 0, 0, 0
        qs = GastoEntry.objects.filter(evidence__gt='').exclude(evidence_file__gt='')
        total = qs.count()
        self.stdout.write(f'  GastoEntries con evidencia Base64 pendiente: {total}')
        if dry_run or total == 0:
            return total if dry_run else ok, skip, err

        for obj in qs.iterator(chunk_size=batch_size):
            raw = self._decode_base64(obj.evidence)
            if not raw:
                err += 1
                continue
            try:
                with transaction.atomic():
                    self._save_file(obj.evidence_file, raw, f'gasto_{obj.id}', '.pdf')
                    obj.save(update_fields=['evidence_file'])
                ok += 1
            except Exception as e:
                err += 1
                self.stdout.write(self.style.ERROR(f'  ERROR gasto {obj.id}: {e}'))

        self.stdout.write(f'  → OK: {ok}  Errores: {err}')
        return ok, skip, err

    def _migrate_bankstatement(self, dry_run=False, batch_size=50):
        from core.models import BankStatement
        ok, skip, err = 0, 0, 0
        qs = BankStatement.objects.filter(file_data__gt='').exclude(statement_file__gt='')
        total = qs.count()
        self.stdout.write(f'  BankStatements con PDF Base64 pendiente: {total}')
        if dry_run or total == 0:
            return total if dry_run else ok, skip, err

        for obj in qs.iterator(chunk_size=batch_size):
            raw = self._decode_base64(obj.file_data)
            if not raw:
                err += 1
                continue
            try:
                with transaction.atomic():
                    self._save_file(obj.statement_file, raw, f'bank_{obj.tenant_id}_{obj.period}', '.pdf')
                    obj.save(update_fields=['statement_file'])
                ok += 1
            except Exception as e:
                err += 1
                self.stdout.write(self.style.ERROR(f'  ERROR bankstatement {obj.id}: {e}'))

        self.stdout.write(f'  → OK: {ok}  Errores: {err}')
        return ok, skip, err
