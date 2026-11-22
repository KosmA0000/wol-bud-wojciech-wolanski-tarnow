// Emulacja auth.php: lokalna sesja bez hasła, token CSRF losowany przy starcie serwera.
import crypto from 'node:crypto';
import { HttpError, sendJson, handleMethod, readBody, parseJsonObject } from './http-util.js';

/** Tworzy stan sesji lokalnej. Token czyta tylko strona z tego samego źródła (brak nagłówków CORS). */
export function createSession() {
  return { csrfToken: crypto.randomBytes(32).toString('hex') };
}

/**
 * Wymaga nagłówka X-CMS-CSRF-Token zgodnego z tokenem sesji (jak requireAuthenticated w PHP).
 * @param {import('node:http').IncomingMessage} req
 * @param {{ csrfToken: string }} session
 */
export function requireCsrf(req, session) {
  const got = Buffer.from(String(req.headers['x-cms-csrf-token'] || ''));
  const want = Buffer.from(session.csrfToken);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) {
    throw new HttpError(401, 'Wymagane zalogowanie do panelu CMS.');
  }
}

/**
 * GET ?status=1 → zalogowany; POST {action: login|logout}. Tryb lokalny nie sprawdza hasła.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {{ session: { csrfToken: string } }} ctx
 */
export async function handleAuth(req, res, ctx) {
  if (handleMethod(req, res, ['GET', 'POST'], 'GET lub POST')) return;
  const status = { authenticated: true, csrfToken: ctx.session.csrfToken, mode: 'hosting', local: true };
  if (req.method === 'GET') {
    sendJson(res, 200, status);
    return;
  }
  const body = parseJsonObject(await readBody(req, 16 * 1024, 'Żądanie logowania jest zbyt duże.'),
    'Oczekiwano obiektu JSON z polem action.');
  const action = typeof body.action === 'string' ? body.action.trim().toLowerCase() : '';
  if (action === 'logout') {
    sendJson(res, 200, { authenticated: false, csrfToken: null, mode: 'hosting', local: true });
    return;
  }
  if (action !== 'login') throw new HttpError(400, 'Nieobsługiwana akcja. Dozwolone wartości: login, logout.');
  sendJson(res, 200, status);
}
