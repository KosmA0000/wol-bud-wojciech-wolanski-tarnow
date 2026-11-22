// Wywołanie API dostawcy AI z limitem czasu i mapowaniem błędów HTTP na polskie komunikaty (executeUpstreamRequest z PHP).
import { maskSecrets } from './log.js';

export const UPSTREAM_TIMEOUT_MS = 45_000;

/** @type {Record<number, [number, string]>} kod dostawcy → [kod odpowiedzi, komunikat] */
const ERRORS = {
  401: [401, 'Klucz API AI skonfigurowany na serwerze jest nieprawidłowy lub wygasł.'],
  403: [403, 'Dostawca AI odrzucił dostęp (403). Sprawdź uprawnienia klucza API i dostępność wybranego modelu.'],
  404: [404, 'Wybrany model AI nie został znaleziony u dostawcy. Sprawdź nazwę modelu.'],
  429: [429, 'Przekroczono limit zapytań lub środków po stronie dostawcy AI (429). Odczekaj chwilę i spróbuj ponownie.'],
  503: [502, 'Model AI jest chwilowo przeciążony po stronie dostawcy (HTTP 503). Spróbuj ponownie za chwilę.'],
};

/** @param {string} body @param {string[]} secrets */
function upstreamDetail(body, secrets) {
  try {
    const d = JSON.parse(body);
    const msg = typeof d?.error?.message === 'string' ? d.error.message : (typeof d?.message === 'string' ? d.message : '');
    const clean = maskSecrets(msg, secrets).trim();
    return clean.length > 220 ? `${clean.slice(0, 217)}...` : clean;
  } catch {
    return '';
  }
}

/** @param {number} code @param {string} body @param {string[]} secrets */
function mapError(code, body, secrets) {
  if (ERRORS[code]) return { ok: false, upstreamStatus: code, status: ERRORS[code][0], error: ERRORS[code][1] };
  if (code === 400) {
    const detail = upstreamDetail(body, secrets);
    return { ok: false, upstreamStatus: 400, status: 400, error: `API AI odrzuciło treść zapytania (400).${detail ? ` Szczegóły: ${detail}` : ''}` };
  }
  const error = code >= 500
    ? `Usługa AI jest chwilowo przeciążona lub niedostępna po stronie dostawcy (HTTP ${code}). Spróbuj ponownie za chwilę.`
    : `Nieoczekiwany błąd dostawcy AI (HTTP ${code}).`;
  return { ok: false, upstreamStatus: code, status: 502, error };
}

/**
 * @param {{ url: string, headers: Record<string, string>, payload: object, secrets: string[],
 *   fetchImpl?: typeof fetch, timeoutMs?: number }} o
 * @returns {Promise<{ ok: true, data: any } | { ok: false, status: number, upstreamStatus?: number, error: string }>}
 */
export async function callUpstream({ url, headers, payload, secrets, fetchImpl = fetch, timeoutMs = UPSTREAM_TIMEOUT_MS }) {
  let res;
  let body;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'WOLBUD-Dev-AI-Proxy/1.0', ...headers },
      body: JSON.stringify(payload),
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
    body = await res.text();
  } catch (err) {
    if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      return { ok: false, status: 504, error: `Przekroczono czas oczekiwania na odpowiedź modelu AI (${Math.round(timeoutMs / 1000)} s). Spróbuj ponownie.` };
    }
    return { ok: false, status: 502, error: 'Nie udało się połączyć z zewnętrznym API AI. Sprawdź połączenie z internetem albo spróbuj za chwilę.' };
  }
  if (res.status < 200 || res.status >= 300) return mapError(res.status, body, secrets);
  try {
    const data = JSON.parse(body);
    if (!data || typeof data !== 'object') throw new Error('format');
    return { ok: true, data };
  } catch {
    return { ok: false, status: 502, error: 'API AI zwróciło nieprawidłową odpowiedź JSON.' };
  }
}
