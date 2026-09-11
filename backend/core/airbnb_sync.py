"""Airbnb listing helpers: parse public listing IDs and host-exported iCal feeds.

Homly never logs into Airbnb or scrapes listing pages. Hosts paste the listing
URL (or ID) and the official calendar export URL from Airbnb → Calendar.
Full listing catalog via OAuth requires Airbnb Preferred Software Partner access.
"""
from __future__ import annotations

import re
import socket
from datetime import date, datetime, timedelta
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

from django.utils import timezone


LISTING_ID_RE = re.compile(
    r'(?:https?://)?(?:www\.)?airbnb\.[^/\s]+/(?:rooms|listings)/(\d{5,18})',
    re.I,
)
BARE_ID_RE = re.compile(r'^\d{5,18}$')

AIRBNB_ICAL_HOSTS = {
    'airbnb.com', 'www.airbnb.com',
    'airbnb.mx', 'www.airbnb.mx',
    'airbnb.com.mx', 'www.airbnb.com.mx',
    'airbnb.es', 'www.airbnb.es',
    'airbnb.co', 'www.airbnb.co',
    'airbnb.com.ar', 'www.airbnb.com.ar',
    'airbnb.com.co', 'www.airbnb.com.co',
    'airbnb.cl', 'www.airbnb.cl',
    'airbnb.com.pe', 'www.airbnb.com.pe',
    'airbnb.com.br', 'www.airbnb.com.br',
    'airbnb.ca', 'www.airbnb.ca',
    'airbnb.co.uk', 'www.airbnb.co.uk',
    'ical.airbnb.com',
}

MAX_ICAL_BYTES = 1_000_000


def parse_listing_id(value: str) -> str | None:
    raw = (value or '').strip()
    if not raw:
        return None
    if BARE_ID_RE.match(raw):
        return raw
    m = LISTING_ID_RE.search(raw)
    return m.group(1) if m else None


def listing_url_from_id(listing_id: str) -> str:
    return f'https://www.airbnb.com/rooms/{listing_id}'


def _is_airbnb_host(host: str) -> bool:
    if not host or host in {'localhost'} or host.endswith('.local'):
        return False
    if re.match(r'^\d+\.\d+\.\d+\.\d+$', host) or ':' in host:
        return False
    if host in AIRBNB_ICAL_HOSTS or host.endswith('.airbnb.com'):
        return True
    parts = host.split('.')
    if parts[0] == 'www':
        parts = parts[1:]
    if len(parts) == 2 and parts[0] == 'airbnb' and 2 <= len(parts[1]) <= 3:
        return True
    if len(parts) == 3 and parts[0] == 'airbnb' and parts[1] == 'com' and len(parts[2]) == 2:
        return True
    return False


def is_allowed_ical_url(url: str) -> bool:
    try:
        parsed = urlparse((url or '').strip())
    except Exception:
        return False
    if parsed.scheme != 'https':
        return False
    if parsed.username or parsed.password:
        return False
    host = (parsed.hostname or '').lower().rstrip('.')
    return _is_airbnb_host(host)


def _host_is_public(host: str) -> bool:
    try:
        infos = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    except socket.gaierror:
        return False
    for info in infos:
        ip = info[4][0]
        if ip.startswith(('10.', '127.', '169.254.', '192.168.')) or ip.startswith('172.'):
            # 172.16–31 is private; cheap check
            if ip.startswith('172.'):
                try:
                    second = int(ip.split('.')[1])
                    if 16 <= second <= 31:
                        return False
                except ValueError:
                    return False
            else:
                return False
        if ip == '::1' or ip.startswith('fc') or ip.startswith('fd'):
            return False
    return True


def fetch_ical(url: str) -> str:
    if not is_allowed_ical_url(url):
        raise ValueError('La URL del calendario debe ser el export iCal HTTPS de Airbnb.')
    host = urlparse(url).hostname.lower()
    if not _host_is_public(host):
        raise ValueError('No se pudo validar el host del calendario.')
    req = Request(url, headers={
        'User-Agent': 'HomlyRentas/1.0 (Airbnb iCal sync; soporte@homly.mx)',
        'Accept': 'text/calendar, text/plain, */*',
    })
    try:
        with urlopen(req, timeout=8) as resp:
            data = resp.read(MAX_ICAL_BYTES + 1)
    except HTTPError as e:
        raise ValueError(f'Airbnb respondió {e.code} al leer el calendario.') from e
    except URLError as e:
        raise ValueError('No se pudo leer el calendario de Airbnb.') from e
    if len(data) > MAX_ICAL_BYTES:
        raise ValueError('El calendario iCal es demasiado grande.')
    return data.decode('utf-8', errors='replace')


def _unfold_ical(text: str) -> str:
    return (
        text.replace('\r\n ', '')
            .replace('\n ', '')
            .replace('\r\n\t', '')
            .replace('\n\t', '')
    )


def _parse_ical_date(value: str) -> date | None:
    raw = (value or '').split(':')[-1].strip()
    raw = raw.split('T')[0]
    if len(raw) >= 8 and raw[:8].isdigit():
        try:
            return date(int(raw[0:4]), int(raw[4:6]), int(raw[6:8]))
        except ValueError:
            return None
    return None


def parse_ical_events(text: str, horizon_days: int = 180) -> list[dict]:
    """Return compact events [{start, end, summary}] overlapping [today-30, today+horizon]."""
    today = date.today()
    window_start = today - timedelta(days=30)
    window_end = today + timedelta(days=horizon_days)
    body = _unfold_ical(text or '')
    events = []
    for block in re.split(r'BEGIN:VEVENT', body, flags=re.I)[1:]:
        chunk = block.split('END:VEVENT', 1)[0]
        start = end = None
        summary = 'Reservado'
        for line in chunk.splitlines():
            upper = line.upper()
            if upper.startswith('DTSTART'):
                start = _parse_ical_date(line)
            elif upper.startswith('DTEND'):
                end = _parse_ical_date(line)
            elif upper.startswith('SUMMARY:'):
                summary = line.split(':', 1)[-1].strip() or summary
        if not start:
            continue
        # DATE-valued DTEND is exclusive in iCal
        exclusive_end = end or (start + timedelta(days=1))
        inclusive_end = exclusive_end - timedelta(days=1)
        if inclusive_end < window_start or start > window_end:
            continue
        events.append({
            'start': start.isoformat(),
            'end': exclusive_end.isoformat(),
            'summary': summary[:160],
        })
        if len(events) >= 250:
            break
    events.sort(key=lambda e: e['start'])
    return events


def occupied_on(events: list[dict], day: date | None = None) -> bool:
    day = day or date.today()
    ds = day.isoformat()
    for ev in events or []:
        start = ev.get('start') or ''
        end = ev.get('end') or start
        if start <= ds < end:
            return True
    return False


def next_code_for_listing(tenant, listing_id: str) -> str:
    base = f'AB-{listing_id}'[:36]
    from .models import RentalProperty
    if not RentalProperty.objects.filter(tenant=tenant, code=base).exists():
        return base
    for i in range(2, 50):
        code = f'{base}-{i}'[:40]
        if not RentalProperty.objects.filter(tenant=tenant, code=code).exists():
            return code
    return f'AB-{timezone.now().strftime("%H%M%S")}'


def sync_listing_ical(listing) -> dict:
    """Fetch iCal, store snapshot, update occupancy. Returns summary dict."""

    listing.last_sync_error = ''
    if not listing.sync_enabled:
        listing.save(update_fields=['last_sync_error', 'updated_at'])
        return {'ok': False, 'error': 'Sincronización desactivada'}
    if not listing.ical_url:
        listing.last_sync_error = 'Falta la URL iCal del anuncio'
        listing.save(update_fields=['last_sync_error', 'updated_at'])
        return {'ok': False, 'error': listing.last_sync_error}
    try:
        raw = fetch_ical(listing.ical_url)
        events = parse_ical_events(raw)
    except ValueError as e:
        listing.last_sync_error = str(e)[:400]
        listing.save(update_fields=['last_sync_error', 'updated_at'])
        return {'ok': False, 'error': listing.last_sync_error}

    listing.ical_events = events
    listing.occupied_now = occupied_on(events)
    listing.last_synced_at = timezone.now()
    listing.save(update_fields=[
        'ical_events', 'occupied_now', 'last_synced_at', 'last_sync_error', 'updated_at',
    ])
    if listing.connection_id:
        listing.connection.last_synced_at = listing.last_synced_at
        listing.connection.save(update_fields=['last_synced_at', 'updated_at'])

    prop = listing.property
    if prop and prop.status not in ('mantenimiento', 'inactiva'):
        has_contract = prop.contracts.exclude(
            status__in=('cancelado', 'finalizado', 'borrador')
        ).exists()
        new_status = 'ocupada' if (has_contract or listing.occupied_now) else 'disponible'
        if prop.status in ('disponible', 'ocupada', 'reservada') and prop.status != new_status:
            prop.status = new_status
            prop.save(update_fields=['status', 'updated_at'])

    return {
        'ok': True,
        'events': len(events),
        'occupied_now': listing.occupied_now,
        'last_synced_at': listing.last_synced_at.isoformat(),
    }
