export const QR_MISMATCH_MSG = 'El QR no corresponde a la validación del registro escaneado';

const PKG_PREFIXES = ['HOMLY-PKG:', 'HOMLY:PKG:'];
const VIS_PREFIXES = ['HOMLY-VIS:', 'HOMLY:VIS:'];

function prefixesFor(kind) {
  return kind === 'vis' ? VIS_PREFIXES : PKG_PREFIXES;
}

function foreignPrefixesFor(kind) {
  return kind === 'vis' ? PKG_PREFIXES : VIS_PREFIXES;
}

function canonicalPrefix(kind) {
  return kind === 'vis' ? 'HOMLY-VIS:' : 'HOMLY-PKG:';
}

export function parseHomlyQr(raw, kind) {
  const text = String(raw || '').trim();
  if (!text) return { ok: false };
  const upper = text.toUpperCase();
  if (foreignPrefixesFor(kind).some(prefix => upper.startsWith(prefix))) {
    return { ok: false };
  }
  for (const prefix of prefixesFor(kind)) {
    if (upper.startsWith(prefix)) {
      const token = text.slice(prefix.length).trim();
      if (!token) return { ok: false };
      return { ok: true, token, payload: `${canonicalPrefix(kind)}${token}` };
    }
  }
  return { ok: false };
}

export function qrMatchesExpected(scanned, expectedPayload, kind) {
  const scannedQr = parseHomlyQr(scanned, kind);
  const expectedQr = parseHomlyQr(expectedPayload, kind);
  return scannedQr.ok && expectedQr.ok && scannedQr.token === expectedQr.token;
}

export function acceptScannedQr(raw, kind, expectedPayload) {
  const parsed = parseHomlyQr(raw, kind);
  if (!parsed.ok) return { ok: false };
  if (expectedPayload && !qrMatchesExpected(parsed.payload, expectedPayload, kind)) {
    return { ok: false };
  }
  return parsed;
}
