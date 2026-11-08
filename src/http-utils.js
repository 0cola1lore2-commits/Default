// Ajutoare HTTP: răspunsuri JSON, citirea corpului cererii, antete de securitate, verificare de origine.

export const SECURITY_HEADERS = Object.freeze({
  // Totul vine de pe același domeniu: fără scripturi, stiluri sau fonturi externe.
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
});

/** Eroare cu cod HTTP, trimisă clientului ca JSON. `extra.headers` devin antete de răspuns. */
export class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export function sendJson(res, status, body, headers = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(data);
}

export function sendText(res, status, text, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(text);
}

/** Citește corpul ca JSON, cu limită de mărime. */
export function readJsonBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const type = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    if (type !== 'application/json') {
      reject(new HttpError(415, 'unsupported_media_type', 'Trimite datele ca JSON (Content-Type: application/json).'));
      return;
    }
    const tooLarge = () => new HttpError(413, 'payload_too_large', 'Cererea este prea mare.', { headers: { Connection: 'close' } });
    if (Number(req.headers['content-length']) > limit) {
      reject(tooLarge());
      return;
    }

    const chunks = [];
    let size = 0;
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      req.resume(); // golește restul, ca răspunsul să poată fi trimis
      reject(err);
    };
    req.on('data', (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > limit) fail(tooLarge());
      else chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'invalid_json', 'JSON invalid.'));
      }
    });
    req.on('error', fail);
  });
}

/**
 * Protecție CSRF: o cerere care schimbă date trebuie să vină de pe același site.
 * Browserul trimite antetul Origin la POST/PATCH; dacă lipsește (curl, aplicații), cererea e acceptată,
 * dar autentificarea rămâne necesară acolo unde e cazul.
 */
export function isSameOrigin(req, { extraHosts = [] } = {}) {
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  try {
    const host = new URL(origin).host;
    return [req.headers.host, ...extraHosts].filter(Boolean).includes(host);
  } catch {
    return false;
  }
}

/** Separă calea de query string, fără a folosi `new URL` (care ar interpreta `//host` ca adresă). */
export function parseTarget(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.startsWith('/') || rawUrl.startsWith('//')) {
    throw new HttpError(400, 'bad_request', 'Cerere invalidă.');
  }
  const q = rawUrl.indexOf('?');
  const pathname = q === -1 ? rawUrl : rawUrl.slice(0, q);
  return { pathname, query: new URLSearchParams(q === -1 ? '' : rawUrl.slice(q + 1)) };
}
