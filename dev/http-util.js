// Wspólne narzędzia HTTP serwera dev: błędy, odpowiedzi JSON w formacie PHP reply(), odczyt treści z limitem.

/** Błąd HTTP z treścią JSON zgodną z reply() z _common.php. */
export class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} message komunikat po polsku dla panelu
   * @param {Record<string, unknown>} [extra] dodatkowe pola odpowiedzi
   * @param {Record<string, string>} [headers] dodatkowe nagłówki odpowiedzi (np. Retry-After)
   */
  constructor(status, message, extra = {}, headers = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
    this.headers = headers;
  }
}

/** Nagłówki bezpieczeństwa jak sendSecurityHeaders() w PHP. */
export const SECURITY_HEADERS = Object.freeze({
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
});

/**
 * Wysyła JSON {ok, ...payload}; ok = status 2xx (jak reply() w PHP).
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {Record<string, unknown>} [payload]
 * @param {Record<string, string>} [headers]
 */
export function sendJson(res, status, payload = {}, headers = {}) {
  const body = JSON.stringify({ ok: status >= 200 && status < 300, ...payload });
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

/**
 * Wysyła błąd HTTP jako JSON.
 * @param {import('node:http').ServerResponse} res
 * @param {HttpError} err
 */
export function sendError(res, err) {
  sendJson(res, err.status, { error: err.message, ...err.extra }, err.headers);
}

/**
 * Wysyła 204 dla OPTIONS albo 405 dla metody spoza listy. Zwraca true, gdy odpowiedź poszła.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string[]} allowed np. ['POST']
 * @param {string} expectedText np. 'POST' albo 'GET lub POST'
 */
export function handleMethod(req, res, allowed, expectedText) {
  const allow = [...allowed, 'OPTIONS'].join(', ');
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...SECURITY_HEADERS, Allow: allow });
    res.end();
    return true;
  }
  if (!allowed.includes(req.method || '')) {
    sendJson(res, 405, { error: `Niedozwolona metoda HTTP. Oczekiwano ${expectedText}.` }, { Allow: allow });
    return true;
  }
  return false;
}

/**
 * Czyta treść żądania z twardym limitem bajtów (nagłówek Content-Length i faktyczny strumień).
 * @param {import('node:http').IncomingMessage} req
 * @param {number} limit
 * @param {string} tooLargeMessage
 * @returns {Promise<Buffer>}
 */
export function readBody(req, limit, tooLargeMessage) {
  const declared = Number(req.headers['content-length'] || 0);
  if (declared > limit) {
    req.resume();
    return Promise.reject(new HttpError(413, tooLargeMessage));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let failed = false;
    req.on('data', (chunk) => {
      if (failed) return;
      size += chunk.length;
      if (size > limit) {
        failed = true;
        reject(new HttpError(413, tooLargeMessage));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => { if (!failed) resolve(Buffer.concat(chunks)); });
    req.on('error', () => { if (!failed) reject(new HttpError(400, 'Nie udało się odczytać treści żądania.')); });
  });
}

/**
 * Parsuje JSON żądania; wymaga obiektu (nie listy).
 * @param {Buffer} buf
 * @param {string} notObjectMessage
 * @returns {Record<string, any>}
 */
export function parseJsonObject(buf, notObjectMessage) {
  let data;
  try {
    data = JSON.parse(buf.toString('utf8'));
  } catch {
    throw new HttpError(400, 'Nieprawidłowy format JSON żądania.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new HttpError(400, notObjectMessage);
  }
  return data;
}
