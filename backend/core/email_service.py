"""
Email sending for verification codes.
Uses Django's email backend (configure EMAIL_* in .env and settings).
Styled HTML email matching Homly brand (naranja/amber, cream).
"""
import logging

from django.conf import settings
from django.core.mail import EmailMultiAlternatives

logger = logging.getLogger(__name__)

# Code expiry in minutes
CODE_EXPIRY_MINUTES = 10

# Homly brand colors — naranja (amber)
COLORS = {
    'orange_500': '#F59E0B',
    'orange_600': '#D97706',
    'orange_700': '#B45309',
    'orange_800': '#92400E',
    'orange_50': '#FFFBEB',
    'ink_800': '#2D2720',
    'ink_600': '#5C5347',
    'cream': '#FDFBF7',
    'sand_100': '#F3EDE4',
    'white': '#FFFFFF',
}


def _build_html_email(code: str) -> str:
    """Build branded HTML email body."""
    c = COLORS
    return f"""
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Tu código de acceso Homly</title>
</head>
<body style="margin:0; padding:0; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background-color:{c['sand_100']};">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:{c['sand_100']}; padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:420px; background:{c['white']}; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(26,22,18,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color:{c['orange_600']}; padding:32px 28px; text-align:center;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center">
                    <span style="font-size:28px; font-weight:800; color:{c['white']}; letter-spacing:-0.02em;">Homly</span>
                  </td>
                </tr>
                <tr><td style="height:8px;"></td></tr>
                <tr>
                  <td align="center">
                    <span style="font-size:13px; font-weight:600; color:rgba(255,255,255,0.85); letter-spacing:0.04em;">Property Management</span>
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
                  <td align="center" style="background:{c['orange_50']}; border:2px solid {c['orange_500']}; border-radius:12px; padding:20px 24px;">
                    <span style="font-size:32px; font-weight:800; letter-spacing:8px; color:{c['orange_700']}; font-family:monospace;">{code}</span>
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
            <td style="padding:20px 28px; background:{c['cream']}; border-top:1px solid {c['sand_100']};">
              <p style="margin:0; font-size:12px; color:{c['ink_600']}; text-align:center; line-height:1.5;">
                Si no solicitaste este código, puedes ignorar este correo. Tu cuenta está segura.
              </p>
              <p style="margin:12px 0 0; font-size:11px; color:{c['ink_600']}; text-align:center; opacity:0.8;">
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


def send_verification_email(email: str, code: str) -> bool:
    """
    Send the verification code to the user's email.
    Sends both HTML (styled) and plain text fallback.
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
        msg.send(fail_silently=False)
        return True
    except Exception as e:
        logger.exception('Error sending verification email to %s: %s', email, e)
        print(f'[EMAIL ERROR] {type(e).__name__}: {e}', flush=True)
        return False
