"""
Email sending for Homly: verification codes and welcome invitations.
Uses Django's email backend (configure EMAIL_* in .env and settings).
Styled HTML email with Homly logo (Homly_Full.png) and brand colors (naranja, crema).
Logo is attached as inline MIME (cid:) inside a multipart/related container so it
displays correctly in ALL major clients: Gmail, Outlook, Hotmail, Yahoo, AOL, etc.
"""
import logging
import os

# Standard-library MIME builders — needed for correct multipart/related structure
from email.mime.application import MIMEApplication
from email.mime.image import MIMEImage
from email.utils import formatdate, make_msgid

from django.conf import settings
from django.core.mail import EmailMessage, get_connection
# Django's safe MIME classes support as_bytes(linesep=...) required by Django's SMTP backend
from django.core.mail.message import SafeMIMEMultipart, SafeMIMEText

logger = logging.getLogger(__name__)

# Code expiry in minutes
CODE_EXPIRY_MINUTES = 10

# Colores del logo Homly — mismo tono naranja y crema
COLORS = {
    'orange': '#F76F57',      # naranja/coral del logo (casa y punto)
    'orange_light': '#FFE8E4', # fondo suave para caja del código
    'green': '#1E594F',        # verde del texto "homly"
    'cream': '#FDFBF7',        # crema del fondo (mismo tono que la app)
    'cream_outer': '#F9F5ED',  # crema exterior
    'ink_800': '#2D2720',
    'ink_600': '#5C5347',
    'white': '#FFFFFF',
}

EMAIL_ASSETS_DIR = os.path.join(os.path.dirname(__file__), 'email_assets')
LOGO_CID = 'homlylogo'


def _read_logo_bytes(filename: str) -> bytes | None:
    """Read logo file from email_assets. Returns None if missing."""
    path = os.path.join(EMAIL_ASSETS_DIR, filename)
    if not os.path.isfile(path):
        return None
    with open(path, 'rb') as f:
        return f.read()


def _build_html_email(code: str) -> str:
    """Build branded HTML body. Logo referenced as cid:homlylogo (attached separately)."""
    c = COLORS
    # cid: reference so Gmail/Outlook show the attached inline image
    logo_img = f'<img src="cid:{LOGO_CID}" alt="Homly" width="180" style="display:block; height:auto; max-width:180px;" />'

    return f"""
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Tu código de acceso Homly</title>
</head>
<body style="margin:0; padding:0; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background-color:{c['cream_outer']};">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:{c['cream_outer']}; padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:420px; background:{c['cream']}; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(26,22,18,0.08);">
          <!-- Header con logo Homly -->
          <tr>
            <td style="background-color:{c['cream']}; padding:32px 28px; text-align:center;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center">
                    {logo_img}
                  </td>
                </tr>
                <tr><td style="height:8px;"></td></tr>
                <tr>
                  <td align="center">
                    <span style="font-size:13px; font-weight:600; color:{c['ink_600']}; letter-spacing:0.04em;">Property Management</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 28px;">
              <p style="margin:0 0 8px; font-size:16px; font-weight:600; color:{c['ink_800']};">
                Tu código de verificación
              </p>
              <p style="margin:0 0 24px; font-size:14px; color:{c['ink_600']}; line-height:1.5;">
                Usa este código para iniciar sesión en Homly.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center" style="background:{c['orange_light']}; border:2px solid {c['orange']}; border-radius:12px; padding:20px 24px;">
                    <span style="font-size:32px; font-weight:800; letter-spacing:8px; color:{c['orange']}; font-family:monospace;">{code}</span>
                  </td>
                </tr>
              </table>
              <p style="margin:20px 0 0; font-size:13px; color:{c['ink_600']}; text-align:center;">
                Válido por {CODE_EXPIRY_MINUTES} minutos
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 28px; background:{c['cream']}; border-top:1px solid #E8DFD1;">
              <p style="margin:0; font-size:12px; color:{c['ink_600']}; text-align:center; line-height:1.5;">
                Si no solicitaste este código, puedes ignorar este correo. Tu cuenta está segura.
              </p>
              <p style="margin:12px 0 0; font-size:11px; color:{c['ink_600']}; text-align:center;">
                © Homly — La administración que tu hogar se merece
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


def _build_plain_message(code: str) -> str:
    """Plain text fallback for email clients that don't support HTML."""
    return (
        f"Tu código de verificación Homly es: {code}\n\n"
        f"Válido por {CODE_EXPIRY_MINUTES} minutos.\n\n"
        "Si no solicitaste este código, puedes ignorar este correo."
    )


ROLE_DESCRIPTIONS = {
    'admin':      ('Administrador', 'Tienes acceso completo para gestionar pagos, usuarios, reportes y la configuración del condominio.'),
    'tesorero':   ('Tesorero', 'Puedes registrar y revisar pagos, acceder a reportes financieros y gestionar la cobranza mensual.'),
    'contador':   ('Contador', 'Tienes acceso a los reportes financieros, estados de cuenta y resúmenes de cobranza.'),
    'auditor':    ('Auditor', 'Puedes consultar reportes y estados de cuenta para fines de revisión, sin modificar datos.'),
    'vecino':     ('Vecino / Residente', 'Puedes consultar el estado de cuenta de tu unidad, ver tus cargos y pagos registrados.'),
    'vigilante':  ('Vigilante', 'Puedes consultar la información del condominio que el administrador habilite para tu perfil.'),
}


def _build_invitation_html(user_name: str, tenant_name: str, role: str, unit_name: str | None, app_url: str, email: str = '') -> str:
    """Build branded HTML for the welcome invitation email."""
    c = COLORS
    logo_img = f'<img src="cid:{LOGO_CID}" alt="Homly" width="160" style="display:block; height:auto; max-width:160px;" />'
    role_label, role_desc = ROLE_DESCRIPTIONS.get(role, (role.capitalize(), 'Tienes acceso al sistema Homly.'))
    unit_block = (
        f'<tr><td style="padding:10px 0 0;">'
        f'<p style="margin:0; font-size:13px; color:{c["ink_600"]};">'
        f'<strong>Unidad asignada:</strong> {unit_name}</p></td></tr>'
    ) if unit_name else ''

    return f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Bienvenido a Homly — {tenant_name}</title>
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background-color:{c['cream_outer']};">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:{c['cream_outer']};padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
          style="max-width:480px;background:{c['cream']};border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(26,22,18,0.08);">

          <!-- Header logo -->
          <tr>
            <td style="background:{c['cream']};padding:32px 28px 20px;text-align:center;">
              {logo_img}
              <p style="margin:10px 0 0;font-size:13px;font-weight:600;color:{c['ink_600']};letter-spacing:0.04em;">Property Management</p>
            </td>
          </tr>

          <!-- Título de bienvenida -->
          <tr>
            <td style="padding:0 28px;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                style="background:{c['orange']};border-radius:12px;padding:20px 24px;">
                <tr>
                  <td>
                    <p style="margin:0;font-size:11px;font-weight:700;color:rgba(255,255,255,0.75);text-transform:uppercase;letter-spacing:0.08em;">Invitación al sistema</p>
                    <p style="margin:6px 0 0;font-size:20px;font-weight:800;color:{c['white']};line-height:1.2;">
                      ¡Bienvenido a Homly, {user_name.split()[0]}!
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Cuerpo -->
          <tr>
            <td style="padding:24px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">

                <!-- Intro -->
                <tr>
                  <td style="padding-bottom:20px;">
                    <p style="margin:0;font-size:14px;color:{c['ink_800']};line-height:1.6;">
                      Has sido invitado a <strong>{tenant_name}</strong> en <strong style="color:{c['green']};">Homly</strong>,
                      la plataforma de administración de condominios que te permite consultar pagos, estados de cuenta y comunicados
                      de tu comunidad desde cualquier lugar.
                    </p>
                  </td>
                </tr>

                <!-- Separador -->
                <tr><td style="height:1px;background:#E8DFD1;margin-bottom:20px;"></td></tr>

                <!-- Datos del acceso -->
                <tr>
                  <td style="padding:16px 0 0;">
                    <p style="margin:0 0 12px;font-size:12px;font-weight:700;color:{c['ink_600']};text-transform:uppercase;letter-spacing:0.06em;">
                      Tu acceso
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                      style="background:{c['cream_outer']};border-radius:10px;padding:16px 18px;">
                      <tr>
                        <td>
                          <p style="margin:0;font-size:13px;color:{c['ink_600']};">
                            <strong>Condominio:</strong> {tenant_name}</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0 0;">
                          <p style="margin:0;font-size:13px;color:{c['ink_600']};">
                            <strong>Email de acceso:</strong> Este correo electrónico</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0 0;">
                          <p style="margin:0;font-size:13px;color:{c['ink_600']};">
                            <strong>Perfil asignado:</strong>
                            <span style="background:{c['orange_light']};color:{c['orange']};font-weight:700;
                              padding:2px 10px;border-radius:20px;font-size:12px;margin-left:6px;">
                              {role_label}
                            </span>
                          </p>
                        </td>
                      </tr>
                      {unit_block}
                    </table>
                  </td>
                </tr>

                <!-- Qué puedes hacer -->
                <tr>
                  <td style="padding:20px 0 0;">
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                      style="background:#F0FAF7;border-left:3px solid {c['green']};border-radius:0 8px 8px 0;padding:14px 16px;">
                      <tr>
                        <td>
                          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:{c['green']};text-transform:uppercase;letter-spacing:0.06em;">
                            Con tu perfil de {role_label} podrás:
                          </p>
                          <p style="margin:0;font-size:13px;color:{c['ink_600']};line-height:1.5;">
                            {role_desc}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Cómo entrar -->
                <tr>
                  <td style="padding:24px 0 0;">
                    <p style="margin:0 0 12px;font-size:12px;font-weight:700;color:{c['ink_600']};text-transform:uppercase;letter-spacing:0.06em;">
                      ¿Cómo entrar al sistema?
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                      <tr>
                        <td style="padding:6px 0;">
                          <p style="margin:0;font-size:13px;color:{c['ink_800']};line-height:1.5;">
                            <strong style="color:{c['orange']};">1.</strong>
                            Ingresa a <a href="{app_url}" style="color:{c['green']};font-weight:700;">{app_url}</a>
                          </p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;">
                          <p style="margin:0;font-size:13px;color:{c['ink_800']};line-height:1.5;">
                            <strong style="color:{c['orange']};">2.</strong>
                            Escribe tu correo electrónico (<strong>{email}</strong> — el de esta invitación).
                          </p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;">
                          <p style="margin:0;font-size:13px;color:{c['ink_800']};line-height:1.5;">
                            <strong style="color:{c['orange']};">3.</strong>
                            Recibirás un código de verificación de 6 dígitos en tu correo. Ingrésalo para acceder.
                          </p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;">
                          <p style="margin:0;font-size:13px;color:{c['ink_800']};line-height:1.5;">
                            <strong style="color:{c['orange']};">4.</strong>
                            ¡Listo! Explora el sistema con tu perfil de <strong>{role_label}</strong>.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- CTA -->
                <tr>
                  <td style="padding:28px 0 0;text-align:center;">
                    <a href="{app_url}"
                      style="display:inline-block;background:{c['orange']};color:{c['white']};font-weight:700;
                        font-size:14px;padding:14px 32px;border-radius:10px;text-decoration:none;letter-spacing:0.02em;">
                      Entrar a Homly →
                    </a>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 28px;background:{c['cream']};border-top:1px solid #E8DFD1;">
              <p style="margin:0;font-size:12px;color:{c['ink_600']};text-align:center;line-height:1.5;">
                Si crees que recibiste este correo por error, puedes ignorarlo.<br>
                Nadie más que tú puede acceder a tu cuenta.
              </p>
              <p style="margin:10px 0 0;font-size:11px;color:{c['ink_600']};text-align:center;">
                © Homly — La administración que tu hogar se merece
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _build_invitation_plain(user_name: str, tenant_name: str, role: str, unit_name: str | None, app_url: str, email: str = '') -> str:
    role_label, role_desc = ROLE_DESCRIPTIONS.get(role, (role.capitalize(), ''))
    unit_line = f'\nUnidad asignada: {unit_name}' if unit_name else ''
    return (
        f'¡Bienvenido a Homly, {user_name}!\n\n'
        f'Has sido invitado al condominio "{tenant_name}" en Homly, la plataforma de administración de condominios.\n\n'
        f'DATOS DE TU ACCESO\n'
        f'Condominio: {tenant_name}\n'
        f'Perfil: {role_label}{unit_line}\n\n'
        f'CON TU PERFIL PODRÁS:\n{role_desc}\n\n'
        f'CÓMO INGRESAR AL SISTEMA:\n'
        f'1. Ve a {app_url}\n'
        f'2. Escribe tu correo electrónico: {email}\n'
        f'3. Recibirás un código de verificación de 6 dígitos en tu correo. Ingrésalo para acceder.\n'
        f'4. ¡Listo! Explora el sistema con tu perfil de {role_label}.\n\n'
        f'Si crees que recibiste este correo por error, puedes ignorarlo.\n\n'
        f'© Homly — La administración que tu hogar se merece'
    )


def send_welcome_invitation(
    email: str,
    user_name: str,
    tenant_name: str,
    role: str,
    unit_name: str | None = None,
) -> bool:
    """
    Send a welcome / invitation email to a user added to a condominio.
    Includes tenant name, role description, access URL and login instructions.
    Uses multipart/related MIME structure for cross-provider logo rendering.
    """
    app_url = getattr(settings, 'HOMLY_APP_URL', 'https://homly.com.mx/login')
    from_email = _get_noreply()
    subject = f'Bienvenido a Homly — {tenant_name}'
    plain = _build_invitation_plain(user_name, tenant_name, role, unit_name, app_url, email)
    html = _build_invitation_html(user_name, tenant_name, role, unit_name, app_url, email)
    try:
        mime = _make_mime_message(
            subject=subject,
            plain=plain,
            html=html,
            from_email=from_email,
            to_emails=[email],
            logo_data=_read_logo_bytes('homly-full.png'),
        )
        return _dispatch_mime(mime, from_email, [email])
    except Exception as e:
        logger.exception('Error sending invitation email to %s: %s', email, e)
        print(f'[EMAIL ERROR] {type(e).__name__}: {e}', flush=True)
        return False


def send_verification_email(email: str, code: str) -> bool:
    """
    Send the verification code to the user's email.
    Sends both HTML (styled) and plain text fallback.
    Logo is embedded inline using multipart/related so it renders in
    Gmail, Outlook, Hotmail, Yahoo, AOL and all other major clients.
    Returns True when the backend confirms dispatch, False on any failure.
    """
    from_email = _get_noreply()
    subject = 'Tu código de acceso Homly'
    plain = _build_plain_message(code)
    html = _build_html_email(code)
    try:
        mime = _make_mime_message(
            subject=subject,
            plain=plain,
            html=html,
            from_email=from_email,
            to_emails=[email],
            logo_data=_read_logo_bytes('homly-full.png'),
        )
        return _dispatch_mime(mime, from_email, [email])
    except Exception as e:
        logger.exception('Error sending verification email to %s: %s', email, e)
        print(f'[EMAIL ERROR] {type(e).__name__}: {e}', flush=True)
        return False


# ─── Helpers ───────────────────────────────────────────────────────────────

def _fmt_amount(amount, symbol='$') -> str:
    try:
        n = float(amount or 0)
    except (TypeError, ValueError):
        n = 0.0
    return f'{symbol}{n:,.0f}'


def _make_mime_message(
    subject: str,
    plain: str,
    html: str,
    from_email: str,
    to_emails: list[str],
    cc_emails: list[str] | None = None,
    logo_data: bytes | None = None,
    pdf_attachment: tuple | None = None,  # (filename, bytes, mimetype)
):
    """
    Build an RFC-compliant MIME message with correct multipart structure.

    Final tree when logo + PDF are present:
        multipart/mixed
          multipart/related        ← groups HTML with its inline image
            multipart/alternative  ← text/plain fallback + text/html
              text/plain
              text/html
            image/png  (Content-ID: <homlylogo>)
          application/pdf          ← regular attachment

    Without PDF:
        multipart/related
          multipart/alternative
            text/plain
            text/html
          image/png

    Without logo (plain + html only):
        multipart/alternative
          text/plain
          text/html

    This structure is required for inline CID images to render in
    Outlook, Hotmail, Yahoo, AOL, and other strict RFC-conformant clients.
    Gmail is more lenient and accepts the old flat structure, but all
    clients accept this correct structure.
    """
    # ── Innermost: text alternatives ────────────────────────────────────────
    alt = SafeMIMEMultipart('alternative')
    alt.attach(SafeMIMEText(plain, 'plain', 'utf-8'))
    alt.attach(SafeMIMEText(html, 'html', 'utf-8'))

    # ── Middle: wrap with related if there is an inline logo ────────────────
    if logo_data:
        related = SafeMIMEMultipart('related')
        related.attach(alt)
        logo_part = MIMEImage(logo_data, 'png')
        logo_part.add_header('Content-Disposition', 'inline', filename='homly-full.png')
        logo_part.add_header('Content-ID', f'<{LOGO_CID}>')
        related.attach(logo_part)
        inner = related
    else:
        inner = alt

    # ── Outer: wrap with mixed only when there is a file attachment ──────────
    if pdf_attachment:
        fname, fbytes, _ = pdf_attachment
        outer = SafeMIMEMultipart('mixed')
        outer.attach(inner)
        pdf_part = MIMEApplication(fbytes, Name=fname)
        pdf_part.add_header('Content-Disposition', 'attachment', filename=fname)
        outer.attach(pdf_part)
        payload = outer
    else:
        payload = inner

    # ── Headers ──────────────────────────────────────────────────────────────
    # NOTE: MIMEBase.__init__ already sets MIME-Version: 1.0 on every part.
    # Do NOT set it again here — duplicate MIME-Version headers are malformed
    # and are rejected or spam-scored by Yahoo, AOL and some Outlook configs.
    payload['Subject'] = subject
    payload['From'] = from_email
    payload['To'] = ', '.join(to_emails)
    if cc_emails:
        payload['Cc'] = ', '.join(cc_emails)
    payload['Date'] = formatdate(localtime=True)
    payload['Message-ID'] = make_msgid(
        domain=from_email.split('@')[-1] if '@' in from_email else 'homly.com.mx'
    )

    return payload


def _dispatch_mime(mime_msg, from_email: str, all_recipients: list[str]) -> bool:
    """Send a pre-built MIME message through Django's configured email backend.
    Works with any backend: SMTP, console, locmem, etc."""

    class _RawMIMEWrapper(EmailMessage):
        """Thin EmailMessage subclass that returns a pre-built MIME object."""
        def __init__(self, raw_mime, from_addr, recipients):
            super().__init__(from_email=from_addr, to=recipients)
            self._raw_mime = raw_mime

        def message(self):
            return self._raw_mime

    wrapper = _RawMIMEWrapper(mime_msg, from_email, all_recipients)
    return bool(wrapper.send(fail_silently=False))


def _get_noreply() -> str:
    """Return the configured no-reply address, falling back to DEFAULT_FROM_EMAIL."""
    return (
        getattr(settings, 'HOMLY_NOREPLY_EMAIL', None)
        or getattr(settings, 'DEFAULT_FROM_EMAIL', 'no-reply@homly.com.mx')
    )


def _send_branded_email(
    subject: str,
    plain: str,
    html: str,
    to_emails: list[str],
    from_email: str | None = None,
    pdf_attachment: tuple | None = None,   # (filename, bytes, 'application/pdf')
    cc_emails: list[str] | None = None,    # CC recipients
) -> bool:
    """Send a branded Homly email with correct multipart/related MIME structure.

    Uses a proper multipart/related > multipart/alternative + inline-image tree
    so the logo renders in Gmail, Outlook/Hotmail, Yahoo, AOL, and all other
    RFC-conformant clients.

    Optional pdf_attachment: (filename, content_bytes, mimetype).
    Optional cc_emails: list of CC addresses.
    """
    if not from_email:
        from_email = _get_noreply()

    logo_data = _read_logo_bytes('homly-full.png')
    all_recipients = list(to_emails) + list(cc_emails or [])

    try:
        mime = _make_mime_message(
            subject=subject,
            plain=plain,
            html=html,
            from_email=from_email,
            to_emails=to_emails,
            cc_emails=cc_emails,
            logo_data=logo_data,
            pdf_attachment=pdf_attachment,
        )
        return _dispatch_mime(mime, from_email, all_recipients)
    except Exception as e:
        logger.exception('Error sending email to %s: %s', to_emails, e)
        print(f'[EMAIL ERROR] {type(e).__name__}: {e}', flush=True)
        return False


def _email_header_html(c: dict, logo_img: str, title: str, subtitle: str = '') -> str:
    sub_block = f'<p style="margin:6px 0 0;font-size:13px;font-weight:600;color:{c["ink_600"]};">{subtitle}</p>' if subtitle else ''
    return f"""
<tr>
  <td style="background:{c['cream']};padding:28px 28px 20px;text-align:center;border-bottom:3px solid {c['green']};">
    {logo_img}
    <p style="margin:10px 0 0;font-size:13px;font-weight:600;color:{c['ink_600']};letter-spacing:0.04em;">Property Management</p>
    <p style="margin:12px 0 0;font-size:18px;font-weight:800;color:{c['ink_800']};">{title}</p>
    {sub_block}
  </td>
</tr>"""


def _email_footer_html(c: dict) -> str:
    return f"""
<tr>
  <td style="padding:18px 28px;border-top:1px solid #E8DFD1;text-align:center;">
    <p style="margin:0;font-size:12px;color:{c['ink_600']};line-height:1.5;">Este correo fue generado automáticamente por Homly.</p>
    <p style="margin:8px 0 0;font-size:11px;color:{c['ink_600']};">© Homly — La administración que tu hogar se merece</p>
  </td>
</tr>"""


def _email_table_row(c: dict, cols: list, header: bool = False, section: bool = False) -> str:
    if section:
        return f'<tr><td colspan="{len(cols)}" style="background:{c["cream_outer"]};padding:8px 12px;font-size:10px;font-weight:700;color:{c["ink_600"]};text-transform:uppercase;letter-spacing:0.05em;">{cols[0]}</td></tr>'
    bg = c['green'] if header else 'transparent'
    text_color = c['white'] if header else c['ink_800']
    cells = ''
    for i, col in enumerate(cols):
        align = 'right' if i > 0 else 'left'
        weight = '700' if header else '400'
        cells += f'<td style="padding:9px 12px;text-align:{align};font-size:{"11" if header else "13"}px;font-weight:{weight};color:{text_color};white-space:nowrap;">{col}</td>'
    return f'<tr style="border-bottom:1px solid {c["cream_outer"]};">{cells}</tr>'


# ─── Receipt Email ──────────────────────────────────────────────────────────

def send_receipt_email(
    emails: list[str],
    tenant_name: str,
    tenant_rfc: str,
    currency_symbol: str,
    unit_code: str,
    unit_name: str,
    responsible: str,
    period_str: str,
    folio: str,
    payment_type_label: str,
    payment_date_label: str,
    rows: list[dict],       # [{concept, charge, paid, balance, is_section?}]
    total_charges: float,
    total_paid: float,
    saldo: float,
    pdf_attachment: tuple | None = None,   # (filename, bytes, 'application/pdf')
) -> bool:
    """Send a branded payment receipt email."""
    c = COLORS
    logo_img = f'<img src="cid:{LOGO_CID}" alt="Homly" width="150" style="display:block;height:auto;max-width:150px;" />'

    def fmt(n): return _fmt_amount(n, currency_symbol)

    # Build rows HTML
    rows_html = ''
    for row in rows:
        if row.get('is_section'):
            rows_html += _email_table_row(c, [row['concept']], section=True)
        else:
            bal = float(row.get('balance', 0))
            bal_color = c['orange'] if bal > 0 else c['green']
            bal_cell = f'<td style="padding:9px 12px;text-align:right;font-size:13px;font-weight:600;color:{bal_color};">{fmt(bal)}</td>'
            rows_html += (
                f'<tr style="border-bottom:1px solid {c["cream_outer"]};">'
                f'<td style="padding:9px 12px;font-size:13px;color:{c["ink_800"]};">{row["concept"]}</td>'
                f'<td style="padding:9px 12px;text-align:right;font-size:13px;color:{c["ink_600"]};">{fmt(row.get("charge", 0))}</td>'
                f'<td style="padding:9px 12px;text-align:right;font-size:13px;color:{c["green"]};font-weight:600;">{fmt(row.get("paid", 0))}</td>'
                f'{bal_cell}'
                f'</tr>'
            )

    saldo_color = c['orange'] if float(saldo) > 0 else c['green']
    folio_line = f'<div style="font-size:14px;font-weight:800;color:{c["orange"]};margin-top:4px;">No. {folio}</div>' if folio else ''
    rfc_line = f'<div style="font-size:12px;color:{c["ink_600"]};margin-top:2px;">RFC: {tenant_rfc}</div>' if tenant_rfc else ''

    html = f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recibo de Pago — {period_str}</title></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background:{c['cream_outer']};">
<table width="100%" cellpadding="0" cellspacing="0" style="background:{c['cream_outer']};padding:40px 20px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:{c['cream']};border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(26,22,18,0.08);">

<!-- HEADER -->
<tr><td style="padding:24px 28px 20px;border-bottom:3px solid {c['green']};">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="vertical-align:top;">
        {logo_img}
        <div style="margin-top:10px;font-size:15px;font-weight:800;color:{c['ink_800']};">{tenant_name}</div>
        {rfc_line}
      </td>
      <td style="text-align:right;vertical-align:top;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;color:{c['ink_600']};text-transform:uppercase;">Recibo de Pago</div>
        {folio_line}
        <div style="font-size:13px;font-weight:600;color:{c['orange']};margin-top:4px;">{period_str}</div>
        <div style="font-size:11px;color:{c['ink_600']};margin-top:3px;">{payment_date_label}</div>
      </td>
    </tr>
  </table>
</td></tr>

<!-- INTRO -->
<tr><td style="padding:20px 28px 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FAF7;border-left:3px solid {c['green']};border-radius:0 8px 8px 0;padding:14px 18px;">
    <tr>
      <td>
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:{c['green']};text-transform:uppercase;letter-spacing:0.06em;">Contenido de este correo</p>
        <p style="margin:0;font-size:13px;color:{c['ink_600']};line-height:1.6;">
          Este correo contiene el <strong>recibo de pago del período {period_str}</strong> correspondiente a la unidad
          <strong>{unit_code} — {unit_name}</strong> del condominio <strong>{tenant_name}</strong>.
          Incluye el desglose de cargos obligatorios, abonos registrados y el saldo resultante.
        </p>
      </td>
    </tr>
  </table>
</td></tr>

<!-- UNIT INFO -->
<tr><td style="padding:16px 28px;background:{c['cream_outer']};">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="width:50%;padding-bottom:8px;">
        <div style="font-size:10px;font-weight:700;color:{c['ink_600']};text-transform:uppercase;letter-spacing:0.06em;">Unidad</div>
        <div style="font-size:14px;font-weight:700;color:{c['ink_800']};margin-top:2px;">{unit_code} — {unit_name}</div>
      </td>
      <td style="width:50%;padding-bottom:8px;">
        <div style="font-size:10px;font-weight:700;color:{c['ink_600']};text-transform:uppercase;letter-spacing:0.06em;">Responsable</div>
        <div style="font-size:13px;color:{c['ink_800']};margin-top:2px;">{responsible}</div>
      </td>
    </tr>
    <tr>
      <td>
        <div style="font-size:10px;font-weight:700;color:{c['ink_600']};text-transform:uppercase;letter-spacing:0.06em;">Forma de Pago</div>
        <div style="font-size:13px;color:{c['ink_800']};margin-top:2px;">{payment_type_label}</div>
      </td>
      <td>
        <div style="font-size:10px;font-weight:700;color:{c['ink_600']};text-transform:uppercase;letter-spacing:0.06em;">Fecha de Pago</div>
        <div style="font-size:13px;color:{c['ink_800']};margin-top:2px;">{payment_date_label}</div>
      </td>
    </tr>
  </table>
</td></tr>

<!-- TABLE -->
<tr><td style="padding:0 28px 24px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;border:1px solid {c['cream_outer']};border-radius:8px;overflow:hidden;">
    <thead>
      <tr style="background:{c['green']};">
        <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:{c['white']};text-transform:uppercase;">Concepto</th>
        <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:{c['white']};text-transform:uppercase;">Cargo</th>
        <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:{c['white']};text-transform:uppercase;">Abono</th>
        <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:{c['white']};text-transform:uppercase;">Saldo</th>
      </tr>
    </thead>
    <tbody>
      {rows_html}
    </tbody>
    <tfoot>
      <tr style="background:{c['cream_outer']};border-top:2px solid {c['green']};">
        <td style="padding:12px;font-size:13px;font-weight:800;color:{c['ink_800']};">TOTAL</td>
        <td style="padding:12px;text-align:right;font-size:13px;font-weight:700;color:{c['ink_800']};">{fmt(total_charges)}</td>
        <td style="padding:12px;text-align:right;font-size:13px;font-weight:700;color:{c['green']};">{fmt(total_paid)}</td>
        <td style="padding:12px;text-align:right;font-size:14px;font-weight:800;color:{saldo_color};">{fmt(saldo)}</td>
      </tr>
    </tfoot>
  </table>
</td></tr>

{_email_footer_html(c)}
</table>
</td></tr>
</table>
</body>
</html>"""

    plain = (
        f'Recibo de Pago — {period_str}\n'
        f'{tenant_name}\n\n'
        f'Unidad: {unit_code} — {unit_name}\n'
        f'Responsable: {responsible}\n'
        f'Forma de Pago: {payment_type_label}\n'
        f'Fecha: {payment_date_label}\n\n'
        f'Total Cargos: {fmt(total_charges)}\n'
        f'Total Abonado: {fmt(total_paid)}\n'
        f'Saldo: {fmt(saldo)}\n\n'
        f'© Homly — La administración que tu hogar se merece'
    )

    return _send_branded_email(
        subject=f'Recibo de Pago — {period_str} | {unit_code}',
        plain=plain,
        html=html,
        to_emails=emails,
        pdf_attachment=pdf_attachment,
    )


# ─── Unit Statement Email ───────────────────────────────────────────────────

def send_unit_statement_email(
    emails: list[str],
    tenant_name: str,
    unit_code: str,
    unit_name: str,
    responsible: str,
    period_from: str,
    period_to: str,
    rows: list[dict],   # [{period, charges, paid, balance, status}]
    total_charges: float,
    total_paid: float,
    balance: float,
    pdf_attachment: tuple | None = None,   # (filename, bytes, 'application/pdf')
) -> bool:
    """Send a branded unit estado de cuenta email, optionally with a PDF attachment."""
    c = COLORS
    logo_img = f'<img src="cid:{LOGO_CID}" alt="Homly" width="150" style="display:block;height:auto;max-width:150px;" />'

    STATUS_LABELS = {
        'pagado': ('Pagado', '#1E594F'),
        'exento': ('Exento', '#1E594F'),
        'parcial': ('Parcial', '#D97706'),
        'pendiente': ('Pendiente', '#DC2626'),
        'futuro': ('Futuro', '#6B7280'),
    }

    def fmt(n): return _fmt_amount(n, '$')

    rows_html = ''
    for row in rows:
        st_label, st_color = STATUS_LABELS.get(row.get('status', 'pendiente'), ('—', '#6B7280'))
        bal = float(row.get('balance', 0))
        bal_color = c['orange'] if bal > 0 else c['green']
        rows_html += (
            f'<tr style="border-bottom:1px solid {c["cream_outer"]};">'
            f'<td style="padding:9px 12px;font-size:13px;color:{c["ink_800"]};">{row.get("period", "")}</td>'
            f'<td style="padding:9px 12px;text-align:right;font-size:13px;color:{c["ink_600"]};">{fmt(row.get("charges", 0))}</td>'
            f'<td style="padding:9px 12px;text-align:right;font-size:13px;color:{c["green"]};font-weight:600;">{fmt(row.get("paid", 0))}</td>'
            f'<td style="padding:9px 12px;text-align:right;font-size:13px;font-weight:600;color:{bal_color};">{fmt(bal)}</td>'
            f'<td style="padding:9px 12px;text-align:center;"><span style="font-size:11px;font-weight:700;color:{st_color};background:{st_color}18;padding:2px 8px;border-radius:20px;">{st_label}</span></td>'
            f'</tr>'
        )

    bal_color = c['orange'] if float(balance) > 0 else c['green']
    range_str = f'{period_from} — {period_to}'

    html = f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Estado de Cuenta — {unit_code}</title></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background:{c['cream_outer']};">
<table width="100%" cellpadding="0" cellspacing="0" style="background:{c['cream_outer']};padding:40px 20px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:{c['cream']};border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(26,22,18,0.08);">

<!-- HEADER -->
<tr><td style="padding:28px 28px 20px;text-align:center;border-bottom:3px solid {c['green']};">
  {logo_img}
  <p style="margin:10px 0 0;font-size:13px;font-weight:600;color:{c['ink_600']};letter-spacing:0.04em;">Property Management</p>
  <p style="margin:8px 0 0;font-size:18px;font-weight:800;color:{c['ink_800']};">Estado de Cuenta</p>
  <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:{c['ink_600']};">{tenant_name}</p>
</td></tr>

<!-- INTRO -->
<tr><td style="padding:20px 28px 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FAF7;border-left:3px solid {c['green']};border-radius:0 8px 8px 0;padding:14px 18px;">
    <tr>
      <td>
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:{c['green']};text-transform:uppercase;letter-spacing:0.06em;">Contenido de este correo</p>
        <p style="margin:0;font-size:13px;color:{c['ink_600']};line-height:1.6;">
          Este correo contiene el <strong>estado de cuenta de la unidad {unit_code} — {unit_name}</strong>
          del condominio <strong>{tenant_name}</strong>, correspondiente al período <strong>{range_str}</strong>.
          Incluye el historial de cargos, abonos y saldo acumulado por período.
        </p>
      </td>
    </tr>
  </table>
</td></tr>

<!-- UNIT INFO -->
<tr><td style="padding:16px 28px;background:{c['cream_outer']};">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="width:50%;padding-bottom:6px;">
        <div style="font-size:10px;font-weight:700;color:{c['ink_600']};text-transform:uppercase;letter-spacing:0.06em;">Unidad</div>
        <div style="font-size:14px;font-weight:700;color:{c['ink_800']};margin-top:2px;">{unit_code} — {unit_name}</div>
      </td>
      <td style="width:50%;padding-bottom:6px;">
        <div style="font-size:10px;font-weight:700;color:{c['ink_600']};text-transform:uppercase;letter-spacing:0.06em;">Responsable</div>
        <div style="font-size:13px;color:{c['ink_800']};margin-top:2px;">{responsible}</div>
      </td>
    </tr>
    <tr>
      <td colspan="2">
        <div style="font-size:10px;font-weight:700;color:{c['ink_600']};text-transform:uppercase;letter-spacing:0.06em;">Período</div>
        <div style="font-size:13px;color:{c['ink_800']};margin-top:2px;">{range_str}</div>
      </td>
    </tr>
  </table>
</td></tr>

<!-- SUMMARY -->
<tr><td style="padding:16px 28px;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="width:33%;text-align:center;padding:12px;background:{c['cream_outer']};border-radius:8px;margin:0 4px;">
        <div style="font-size:10px;font-weight:700;color:{c['ink_600']};text-transform:uppercase;">Total Cargos</div>
        <div style="font-size:18px;font-weight:800;color:{c['ink_800']};margin-top:4px;">{fmt(total_charges)}</div>
      </td>
      <td style="width:4px;"></td>
      <td style="width:33%;text-align:center;padding:12px;background:{c['cream_outer']};border-radius:8px;">
        <div style="font-size:10px;font-weight:700;color:{c['ink_600']};text-transform:uppercase;">Total Abonado</div>
        <div style="font-size:18px;font-weight:800;color:{c['green']};margin-top:4px;">{fmt(total_paid)}</div>
      </td>
      <td style="width:4px;"></td>
      <td style="width:33%;text-align:center;padding:12px;background:{c['cream_outer']};border-radius:8px;">
        <div style="font-size:10px;font-weight:700;color:{c['ink_600']};text-transform:uppercase;">Saldo</div>
        <div style="font-size:18px;font-weight:800;color:{bal_color};margin-top:4px;">{fmt(balance)}</div>
      </td>
    </tr>
  </table>
</td></tr>

<!-- TABLE -->
<tr><td style="padding:0 28px 24px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid {c['cream_outer']};border-radius:8px;overflow:hidden;">
    <thead>
      <tr style="background:{c['green']};">
        <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:{c['white']};text-transform:uppercase;">Período</th>
        <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:{c['white']};text-transform:uppercase;">Cargos</th>
        <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:{c['white']};text-transform:uppercase;">Abonado</th>
        <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:{c['white']};text-transform:uppercase;">Saldo</th>
        <th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:700;color:{c['white']};text-transform:uppercase;">Estado</th>
      </tr>
    </thead>
    <tbody>
      {rows_html}
    </tbody>
  </table>
</td></tr>

{_email_footer_html(c)}
</table>
</td></tr>
</table>
</body>
</html>"""

    plain = (
        f'Estado de Cuenta — {unit_code} — {unit_name}\n'
        f'{tenant_name}\n'
        f'Período: {range_str}\n\n'
        f'Total Cargos: {fmt(total_charges)}\n'
        f'Total Abonado: {fmt(total_paid)}\n'
        f'Saldo: {fmt(balance)}\n\n'
        f'© Homly — La administración que tu hogar se merece'
    )

    return _send_branded_email(
        subject=f'Estado de Cuenta — {unit_code} | {tenant_name}',
        plain=plain,
        html=html,
        to_emails=emails,
        pdf_attachment=pdf_attachment,
    )


# ─── General Statement Email ────────────────────────────────────────────────

def send_general_statement_email(
    emails: list[str],
    tenant_name: str,
    cutoff_str: str,
    units_data: list[dict],  # [{unit_code, unit_name, responsible, total_charges, total_paid, balance}]
    total_cargo: float,
    total_abono: float,
    total_deuda: float,
) -> bool:
    """Send a branded general estado de cuenta email (all units summary)."""
    c = COLORS
    logo_img = f'<img src="cid:{LOGO_CID}" alt="Homly" width="150" style="display:block;height:auto;max-width:150px;" />'

    def fmt(n): return _fmt_amount(n, '$')

    rows_html = ''
    for u in units_data:
        bal = float(u.get('balance', 0))
        adj_bal = max(0, bal)
        bal_color = c['orange'] if adj_bal > 0 else c['green']
        rows_html += (
            f'<tr style="border-bottom:1px solid {c["cream_outer"]};">'
            f'<td style="padding:9px 12px;font-size:12px;font-weight:700;color:{c["ink_800"]};">{u.get("unit_code", "")}</td>'
            f'<td style="padding:9px 12px;font-size:12px;color:{c["ink_600"]};">{u.get("unit_name", "")}</td>'
            f'<td style="padding:9px 12px;font-size:12px;color:{c["ink_600"]};">{u.get("responsible", "")}</td>'
            f'<td style="padding:9px 12px;text-align:right;font-size:12px;color:{c["ink_600"]};">{fmt(u.get("total_charges", 0))}</td>'
            f'<td style="padding:9px 12px;text-align:right;font-size:12px;color:{c["green"]};font-weight:600;">{fmt(u.get("total_paid", 0))}</td>'
            f'<td style="padding:9px 12px;text-align:right;font-size:12px;font-weight:700;color:{bal_color};">{fmt(adj_bal)}</td>'
            f'</tr>'
        )

    html = f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Estado General — {tenant_name}</title></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background:{c['cream_outer']};">
<table width="100%" cellpadding="0" cellspacing="0" style="background:{c['cream_outer']};padding:40px 20px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:700px;background:{c['cream']};border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(26,22,18,0.08);">

<!-- HEADER -->
<tr><td style="padding:28px 28px 20px;text-align:center;border-bottom:3px solid {c['green']};">
  {logo_img}
  <p style="margin:10px 0 0;font-size:13px;font-weight:600;color:{c['ink_600']};letter-spacing:0.04em;">Property Management</p>
  <p style="margin:8px 0 0;font-size:18px;font-weight:800;color:{c['ink_800']};">Estado General de Cuenta</p>
  <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:{c['ink_600']};">{tenant_name}</p>
  <p style="margin:4px 0 0;font-size:12px;color:{c['ink_600']};">Corte al: {cutoff_str}</p>
</td></tr>

<!-- INTRO -->
<tr><td style="padding:20px 28px 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FAF7;border-left:3px solid {c['green']};border-radius:0 8px 8px 0;padding:14px 18px;">
    <tr>
      <td>
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:{c['green']};text-transform:uppercase;letter-spacing:0.06em;">Contenido de este correo</p>
        <p style="margin:0;font-size:13px;color:{c['ink_600']};line-height:1.6;">
          Este correo contiene el <strong>estado general de cuenta del condominio {tenant_name}</strong>
          con corte al <strong>{cutoff_str}</strong>. Incluye el resumen consolidado de cargos, abonos y adeudos
          de todas las unidades, así como el desglose individual por unidad.
        </p>
      </td>
    </tr>
  </table>
</td></tr>

<!-- SUMMARY -->
<tr><td style="padding:16px 28px;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="width:33%;text-align:center;padding:12px;background:{c['cream_outer']};border-radius:8px;">
        <div style="font-size:10px;font-weight:700;color:{c['ink_600']};text-transform:uppercase;">Total Cargos</div>
        <div style="font-size:18px;font-weight:800;color:{c['ink_800']};margin-top:4px;">{fmt(total_cargo)}</div>
      </td>
      <td style="width:4px;"></td>
      <td style="width:33%;text-align:center;padding:12px;background:{c['cream_outer']};border-radius:8px;">
        <div style="font-size:10px;font-weight:700;color:{c['ink_600']};text-transform:uppercase;">Total Abonado</div>
        <div style="font-size:18px;font-weight:800;color:{c['green']};margin-top:4px;">{fmt(total_abono)}</div>
      </td>
      <td style="width:4px;"></td>
      <td style="width:33%;text-align:center;padding:12px;background:{c['cream_outer']};border-radius:8px;">
        <div style="font-size:10px;font-weight:700;color:{c['ink_600']};text-transform:uppercase;">Total Adeudo</div>
        <div style="font-size:18px;font-weight:800;color:{c['orange']};margin-top:4px;">{fmt(total_deuda)}</div>
      </td>
    </tr>
  </table>
</td></tr>

<!-- TABLE -->
<tr><td style="padding:0 28px 24px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid {c['cream_outer']};border-radius:8px;overflow:hidden;">
    <thead>
      <tr style="background:{c['green']};">
        <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:{c['white']};text-transform:uppercase;">Código</th>
        <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:{c['white']};text-transform:uppercase;">Unidad</th>
        <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:{c['white']};text-transform:uppercase;">Responsable</th>
        <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:{c['white']};text-transform:uppercase;">Cargos</th>
        <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:{c['white']};text-transform:uppercase;">Abonado</th>
        <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:{c['white']};text-transform:uppercase;">Adeudo</th>
      </tr>
    </thead>
    <tbody>
      {rows_html}
    </tbody>
  </table>
</td></tr>

{_email_footer_html(c)}
</table>
</td></tr>
</table>
</body>
</html>"""

    plain = (
        f'Estado General de Cuenta — {tenant_name}\n'
        f'Corte al: {cutoff_str}\n\n'
        f'Total Cargos: {fmt(total_cargo)}\n'
        f'Total Abonado: {fmt(total_abono)}\n'
        f'Total Adeudo: {fmt(total_deuda)}\n\n'
        + '\n'.join(
            f'{u.get("unit_code","")} | {u.get("unit_name","")} | {u.get("responsible","")} | Adeudo: {fmt(max(0, float(u.get("balance", 0))))}'
            for u in units_data
        )
        + '\n\n© Homly — La administración que tu hogar se merece'
    )

    return _send_branded_email(
        subject=f'Estado General de Cuenta — {tenant_name} | {cutoff_str}',
        plain=plain,
        html=html,
        to_emails=emails,
    )


# ─── Notification Alert Email ───────────────────────────────────────────────

# Metadata per notification type: (emoji, label, accent_color)
NOTIF_META: dict[str, tuple[str, str, str]] = {
    'reservation_new':       ('📅', 'Nueva Reserva',         '#3B82F6'),  # blue
    'reservation_approved':  ('✅', 'Reserva Aprobada',      '#10B981'),  # green
    'reservation_rejected':  ('❌', 'Reserva Rechazada',     '#EF4444'),  # red
    'reservation_cancelled': ('🚫', 'Reserva Cancelada',     '#F59E0B'),  # amber
    'payment_registered':    ('💳', 'Pago Registrado',       '#10B981'),  # green
    'payment_updated':       ('✏️',  'Pago Actualizado',      '#3B82F6'),  # blue
    'payment_deleted':       ('🗑️',  'Pago Eliminado',        '#EF4444'),  # red
    'period_closed':         ('🔒', 'Período Cerrado',        '#8B5CF6'),  # purple
    'period_reopened':       ('🔓', 'Período Reabierto',      '#F59E0B'),  # amber
    'general':               ('🔔', 'Notificación',          '#F76F57'),  # homly orange
}


def _build_notification_html(
    user_name: str,
    notif_type: str,
    title: str,
    message: str,
    tenant_name: str,
    app_url: str,
) -> str:
    """Branded HTML for a notification alert email."""
    c = COLORS
    logo_img = f'<img src="cid:{LOGO_CID}" alt="Homly" width="160" style="display:block;height:auto;max-width:160px;" />'
    emoji, type_label, accent = NOTIF_META.get(notif_type, NOTIF_META['general'])
    # Lighten accent for background (use a fixed soft tint — inline CSS can't do alpha easily)
    accent_light = '#F0F9FF' if accent == '#3B82F6' else \
                   '#F0FDF4' if accent == '#10B981' else \
                   '#FEF2F2' if accent == '#EF4444' else \
                   '#FFFBEB' if accent == '#F59E0B' else \
                   '#F5F3FF' if accent == '#8B5CF6' else \
                   '#FFF7ED'

    # Escape message line breaks to <br>
    message_html = message.replace('\n', '<br>')

    first_name = user_name.split()[0] if user_name else 'Usuario'

    return f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{type_label} — {tenant_name}</title>
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background-color:{c['cream_outer']};">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:{c['cream_outer']};padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
          style="max-width:480px;background:{c['cream']};border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(26,22,18,0.08);">

          <!-- Header logo -->
          <tr>
            <td style="background:{c['cream']};padding:28px 28px 16px;text-align:center;">
              {logo_img}
              <p style="margin:8px 0 0;font-size:12px;font-weight:600;color:{c['ink_600']};letter-spacing:0.04em;">Property Management</p>
            </td>
          </tr>

          <!-- Accent banner -->
          <tr>
            <td style="padding:0 28px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                style="background:{accent};border-radius:12px;padding:16px 20px;">
                <tr>
                  <td>
                    <p style="margin:0;font-size:11px;font-weight:700;color:rgba(255,255,255,0.8);text-transform:uppercase;letter-spacing:0.08em;">{type_label}</p>
                    <p style="margin:4px 0 0;font-size:18px;font-weight:800;color:#FFFFFF;line-height:1.3;">{emoji} {title}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:24px 28px;">
              <p style="margin:0 0 18px;font-size:14px;color:{c['ink_800']};line-height:1.5;">
                Hola <strong>{first_name}</strong>,
              </p>
              <!-- Message box -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                style="background:{accent_light};border-left:4px solid {accent};border-radius:0 8px 8px 0;padding:14px 16px;margin-bottom:20px;">
                <tr>
                  <td>
                    <p style="margin:0;font-size:13px;color:{c['ink_800']};line-height:1.6;">{message_html}</p>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 6px;font-size:13px;color:{c['ink_600']};line-height:1.5;">
                Ingresa a <strong style="color:{c['green']};">Homly</strong> para ver los detalles completos y tomar acción si es necesario.
              </p>
              <p style="margin:0;font-size:12px;color:{c['ink_600']};">
                Condominio: <strong>{tenant_name}</strong>
              </p>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="padding:24px 0 0;text-align:center;">
                    <a href="{app_url}"
                      style="display:inline-block;background:{c['orange']};color:#FFFFFF;font-weight:700;
                        font-size:14px;padding:14px 32px;border-radius:10px;text-decoration:none;letter-spacing:0.02em;">
                      Ingresar a Homly →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:18px 28px;background:{c['cream']};border-top:1px solid #E8DFD1;text-align:center;">
              <p style="margin:0;font-size:12px;color:{c['ink_600']};line-height:1.5;">
                Este aviso fue generado automáticamente por Homly.<br>Si no esperabas este correo puedes ignorarlo.
              </p>
              <p style="margin:10px 0 0;font-size:11px;color:{c['ink_600']};">
                © Homly — La administración que tu hogar se merece
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def send_notification_email(
    email: str,
    user_name: str,
    notif_type: str,
    title: str,
    message: str,
    tenant_name: str = '',
) -> bool:
    """
    Send a notification alert email to a single user.

    Args:
        email:       Recipient email address.
        user_name:   Display name used in the greeting.
        notif_type:  One of the keys in NOTIF_META (e.g. 'payment_registered').
        title:       Short notification title (same as the in-app notification title).
        message:     Body of the notification (same as the in-app message).
        tenant_name: Condominium / tenant display name shown in the email.

    Returns True on success, False if the send failed.
    """
    app_url  = getattr(settings, 'HOMLY_APP_URL',      'https://homly.com.mx/login')
    _, type_label, _ = NOTIF_META.get(notif_type, NOTIF_META['general'])
    subject  = f'{type_label} — {title}'
    if tenant_name:
        subject = f'[{tenant_name}] {subject}'

    plain = (
        f'Hola {user_name},\n\n'
        f'{message}\n\n'
        f'Ingresa a Homly para ver los detalles: {app_url}\n\n'
        f'Condominio: {tenant_name}\n'
        f'© Homly — La administración que tu hogar se merece'
    )
    html = _build_notification_html(user_name, notif_type, title, message, tenant_name, app_url)
    return _send_branded_email(subject=subject, plain=plain, html=html, to_emails=[email])


# ═══════════════════════════════════════════════════════════
#  LANDING REGISTRATION REQUEST — confirmation + internal alert
# ═══════════════════════════════════════════════════════════

def send_registration_notification(request_data: dict) -> bool:
    """Send two emails when a new condominium registration is submitted
    through the landing page /registro form:

    1. Confirmation email → applicant (admin_email)
       FROM: no-reply@homly.com.mx
       CC:   ctorres@spotynet.com   (internal copy so the team is notified)

    2. Internal alert → no-reply@homly.com.mx
       FROM: no-reply@homly.com.mx
       CC:   ctorres@spotynet.com
       (summary of the lead details for the operations mailbox)

    Returns True only if both sends succeed.
    """
    c           = COLORS
    from_email  = getattr(settings, 'HOMLY_NOREPLY_EMAIL', 'no-reply@homly.com.mx')
    cc_email    = 'ctorres@spotynet.com'
    internal_to = 'no-reply@homly.com.mx'

    nombre      = request_data.get('admin_nombre', '')
    apellido    = request_data.get('admin_apellido', '')
    full_name   = f'{nombre} {apellido}'.strip() or 'Administrador'
    admin_email = request_data.get('admin_email', '')
    condo       = request_data.get('condominio_nombre', '')
    pais        = request_data.get('condominio_pais', '')
    estado      = request_data.get('condominio_estado', '')
    ciudad      = request_data.get('condominio_ciudad', '')
    unidades    = request_data.get('condominio_unidades', '')
    tipo_admin  = request_data.get('condominio_tipo_admin', '')
    currency    = request_data.get('condominio_currency', '')
    mensaje     = request_data.get('mensaje', '')
    cargo       = request_data.get('admin_cargo', '')
    telefono    = request_data.get('admin_telefono', '')

    tipo_labels = {
        'mesa_directiva': 'Mesa Directiva',
        'administrador':  'Administrador Externo',
        'comite':         'Comité',
    }
    tipo_label = tipo_labels.get(tipo_admin, tipo_admin)

    ubicacion_parts = [p for p in [ciudad, estado, pais] if p]
    ubicacion       = ', '.join(ubicacion_parts) or '—'

    logo_img = f'<img src="cid:{LOGO_CID}" alt="Homly" width="160" style="display:block;height:auto;max-width:160px;" />'

    # ── 1. Confirmation email to applicant ────────────────────────────────────
    subject_confirm = '¡Recibimos tu solicitud! Homly estará contigo pronto'
    plain_confirm = (
        f'Hola {full_name},\n\n'
        f'Recibimos la solicitud de registro de {condo}.\n'
        f'Nuestro equipo revisará la información y se pondrá en contacto contigo '
        f'en menos de 24 horas para comenzar la configuración de tu cuenta.\n\n'
        f'Condominio: {condo}\n'
        f'Ubicación: {ubicacion}\n'
        f'Unidades: {unidades}\n\n'
        f'Si tienes alguna duda escríbenos a hola@homly.com.mx\n\n'
        f'© Homly — La administración que tu hogar se merece'
    )
    html_confirm = f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:{c['cream_outer']};font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:{c['cream_outer']};padding:32px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">
      <tr><td style="background:{c['green']};padding:28px 32px;text-align:center;border-bottom:3px solid {c['orange']};">
        {logo_img}
        <p style="margin:10px 0 0;font-size:12px;font-weight:600;color:rgba(253,251,247,0.6);letter-spacing:0.06em;">GESTIÓN DE CONDOMINIOS</p>
      </td></tr>
      <tr><td style="padding:36px 40px 28px;">
        <h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:{c['green']};letter-spacing:-0.5px;">¡Solicitud recibida!</h1>
        <p style="margin:0 0 24px;font-size:15px;color:{c['ink_600']};line-height:1.65;">
          Hola <strong>{full_name}</strong>, recibimos los datos del condominio <strong>{condo}</strong>.
          Nuestro equipo se pondrá en contacto contigo en las próximas <strong>24 horas</strong>.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:{c['cream']};border-radius:12px;overflow:hidden;margin-bottom:24px;">
          <tr><td colspan="2" style="padding:12px 16px;font-size:11px;font-weight:700;color:{c['orange']};letter-spacing:0.7px;text-transform:uppercase;border-bottom:1px solid #E8DFD1;">Datos de tu solicitud</td></tr>
          <tr><td style="padding:10px 16px;font-size:13px;color:{c['ink_600']};font-weight:500;width:40%;border-bottom:1px solid #F3EDE4;">Condominio</td><td style="padding:10px 16px;font-size:13px;font-weight:700;color:{c['ink_800']};border-bottom:1px solid #F3EDE4;">{condo}</td></tr>
          <tr><td style="padding:10px 16px;font-size:13px;color:{c['ink_600']};font-weight:500;border-bottom:1px solid #F3EDE4;">Ubicación</td><td style="padding:10px 16px;font-size:13px;font-weight:700;color:{c['ink_800']};border-bottom:1px solid #F3EDE4;">{ubicacion}</td></tr>
          <tr><td style="padding:10px 16px;font-size:13px;color:{c['ink_600']};font-weight:500;border-bottom:1px solid #F3EDE4;">Unidades</td><td style="padding:10px 16px;font-size:13px;font-weight:700;color:{c['ink_800']};border-bottom:1px solid #F3EDE4;">{unidades}</td></tr>
          <tr><td style="padding:10px 16px;font-size:13px;color:{c['ink_600']};font-weight:500;">Tipo de admin.</td><td style="padding:10px 16px;font-size:13px;font-weight:700;color:{c['ink_800']};">{tipo_label}</td></tr>
        </table>
        <p style="font-size:13px;color:{c['ink_600']};line-height:1.65;margin:0 0 8px;">
          ¿Alguna pregunta? Escríbenos a
          <a href="mailto:hola@homly.com.mx" style="color:{c['orange']};font-weight:600;text-decoration:none;">hola@homly.com.mx</a>
        </p>
      </td></tr>
      <tr><td style="background:{c['cream']};padding:18px 40px;text-align:center;border-top:1px solid #E8DFD1;">
        <p style="margin:0;font-size:12px;color:#B8B0A5;">© Homly · La administración que tu hogar se merece</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>"""

    ok1 = _send_branded_email(
        subject=subject_confirm,
        plain=plain_confirm,
        html=html_confirm,
        to_emails=[admin_email],
        from_email=from_email,
        cc_emails=[cc_email],
    ) if admin_email else True

    # ── 2. Internal alert to operations mailbox ───────────────────────────────
    subject_internal = f'🏠 Nueva solicitud de registro: {condo}'
    rows = [
        ('Condominio',        condo),
        ('Ubicación',         ubicacion),
        ('Unidades',          str(unidades)),
        ('Moneda',            currency),
        ('Tipo de admin.',    tipo_label),
        ('Nombre',            full_name),
        ('Correo',            admin_email),
        ('Teléfono',          telefono or '—'),
        ('Cargo',             cargo or '—'),
        ('Mensaje',           mensaje or '—'),
    ]
    rows_html = ''.join(
        f'<tr><td style="padding:9px 14px;font-size:13px;color:{c["ink_600"]};font-weight:500;width:40%;border-bottom:1px solid #F3EDE4;">{k}</td>'
        f'<td style="padding:9px 14px;font-size:13px;font-weight:700;color:{c["ink_800"]};border-bottom:1px solid #F3EDE4;">{v}</td></tr>'
        for k, v in rows
    )
    plain_internal = (
        f'Nueva solicitud de registro\n\n'
        + '\n'.join(f'{k}: {v}' for k, v in rows)
        + f'\n\n© Homly — Sistema de gestión'
    )
    html_internal = f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:{c['cream_outer']};font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:{c['cream_outer']};padding:32px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">
      <tr><td style="background:{c['green']};padding:24px 32px;text-align:center;border-bottom:3px solid {c['orange']};">
        {logo_img}
        <p style="margin:8px 0 0;font-size:12px;color:rgba(253,251,247,0.6);font-weight:600;letter-spacing:0.06em;">ALERTA INTERNA · NUEVA SOLICITUD</p>
      </td></tr>
      <tr><td style="padding:28px 36px 20px;">
        <h2 style="margin:0 0 6px;font-size:18px;font-weight:800;color:{c['green']};">Nueva solicitud: {condo}</h2>
        <p style="margin:0 0 20px;font-size:14px;color:{c['ink_600']};">Se recibió una nueva solicitud de registro a través de la landing page.</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:{c['cream']};border-radius:12px;overflow:hidden;">
          <tr><td colspan="2" style="padding:11px 14px;font-size:11px;font-weight:700;color:{c['orange']};letter-spacing:0.7px;text-transform:uppercase;border-bottom:1px solid #E8DFD1;">Detalles del lead</td></tr>
          {rows_html}
        </table>
      </td></tr>
      <tr><td style="background:{c['cream']};padding:16px 36px;text-align:center;border-top:1px solid #E8DFD1;">
        <p style="margin:0;font-size:11px;color:#B8B0A5;">Alerta interna automática · Homly</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>"""

    ok2 = _send_branded_email(
        subject=subject_internal,
        plain=plain_internal,
        html=html_internal,
        to_emails=[internal_to],
        from_email=from_email,
        cc_emails=[cc_email],
    )

    return ok1 and ok2
