"""
Email sending for Homly: verification codes and welcome invitations.
Uses Django's email backend (configure EMAIL_* in .env and settings).
Styled HTML email with Homly logo (Homly_Full.png) and brand colors (naranja, crema).
Logo is attached as inline MIME (cid:) so it displays in Gmail, Outlook, etc.
"""
import logging
import os

from email.mime.image import MIMEImage

from django.conf import settings
from django.core.mail import EmailMultiAlternatives

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


def _build_invitation_html(user_name: str, tenant_name: str, role: str, unit_name: str | None, app_url: str) -> str:
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
                            Escribe tu correo electrónico (<strong>{{}}</strong> — el de esta invitación).
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


def _build_invitation_plain(user_name: str, tenant_name: str, role: str, unit_name: str | None, app_url: str) -> str:
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
        f'2. Escribe tu correo electrónico (el de esta invitación).\n'
        f'3. Recibirás un código de verificación de 6 dígitos. Ingrésalo para acceder.\n'
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
    """
    app_url = getattr(settings, 'HOMLY_APP_URL', 'https://app.homly.com.mx')
    subject = f'Bienvenido a Homly — {tenant_name}'
    plain = _build_invitation_plain(user_name, tenant_name, role, unit_name, app_url)
    html = _build_invitation_html(user_name, tenant_name, role, unit_name, app_url)
    try:
        msg = EmailMultiAlternatives(
            subject=subject,
            body=plain,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[email],
        )
        msg.attach_alternative(html, 'text/html')

        logo_data = _read_logo_bytes('homly-full.png')
        if logo_data:
            logo_part = MIMEImage(logo_data, 'png')
            logo_part.add_header('Content-Disposition', 'inline', filename='homly-full.png')
            logo_part.add_header('Content-ID', f'<{LOGO_CID}>')
            msg.attach(logo_part)

        msg.send(fail_silently=False)
        return True
    except Exception as e:
        logger.exception('Error sending invitation email to %s: %s', email, e)
        print(f'[EMAIL ERROR] {type(e).__name__}: {e}', flush=True)
        return False


def send_verification_email(email: str, code: str) -> bool:
    """
    Send the verification code to the user's email.
    Sends both HTML (styled) and plain text fallback.
    Logo is attached as inline image (cid:) so it displays in major email clients.
    """
    subject = 'Tu código de acceso Homly'
    plain = _build_plain_message(code)
    html = _build_html_email(code)
    try:
        msg = EmailMultiAlternatives(
            subject=subject,
            body=plain,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[email],
        )
        msg.attach_alternative(html, 'text/html')

        # Attach logo as inline image so it shows in Gmail, Outlook, etc. (base64 is often blocked)
        logo_data = _read_logo_bytes('homly-full.png')
        if logo_data:
            logo_part = MIMEImage(logo_data, 'png')
            logo_part.add_header('Content-Disposition', 'inline', filename='homly-full.png')
            logo_part.add_header('Content-ID', f'<{LOGO_CID}>')
            msg.attach(logo_part)

        msg.send(fail_silently=False)
        return True
    except Exception as e:
        logger.exception('Error sending verification email to %s: %s', email, e)
        print(f'[EMAIL ERROR] {type(e).__name__}: {e}', flush=True)
        return False
