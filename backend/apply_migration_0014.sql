-- ============================================================
--  Migración 0014: show_in_normal / show_in_additional / show_in_gastos
--  Ejecutar en el servidor con:
--    psql -U <usuario> -d <base_de_datos> -f apply_migration_0014.sql
--  O con Django:
--    python manage.py migrate
-- ============================================================

BEGIN;

-- Agregar columnas de visibilidad por formulario
ALTER TABLE extra_fields
  ADD COLUMN IF NOT EXISTS show_in_normal     BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS show_in_additional BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS show_in_gastos     BOOLEAN NOT NULL DEFAULT TRUE;

-- Registrar la migración en la tabla de Django
INSERT INTO django_migrations (app, name, applied)
  SELECT 'core', '0014_extrafield_show_in_forms', NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM django_migrations
    WHERE app = 'core' AND name = '0014_extrafield_show_in_forms'
  );

COMMIT;
