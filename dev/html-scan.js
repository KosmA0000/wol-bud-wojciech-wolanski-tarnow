// Port skanera validateSafeHtmlDocument z _common.php: te same reguły i komunikaty, żeby tryb lokalny odrzucał to samo co hosting.
import { decodeEntities } from './html-entities.js';

const TAG_RE = /<([a-zA-Z][a-zA-Z0-9:-]*)(\s+(?:"[^"]*"|'[^']*'|[^>"'])*)?\s*\/?>/gs;
const ATTR_RE = /\s+([a-zA-Z_:][a-zA-Z0-9:._-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gs;
const BAD_SCHEME = /(?:javascript|vbscript):|data:(?:text\/html|image\/svg|application\/)|expression\s*\(/i;
const SCRIPT_SRC_OK = /^(?:\.\/|(?:\.\.\/)*)assets\/(?:site|home-page)\.js(?:\?v=[a-zA-Z0-9._-]+)?$/;

/** @param {string} chunk atrybuty jednego tagu @returns {string|null} błąd */
function scanAttributes(chunk) {
  for (const a of chunk.matchAll(ATTR_RE)) {
    const name = a[1].toLowerCase();
    if (/^on[a-z]+$/i.test(name)) return `Wykryto zabroniony atrybut zdarzenia HTML: ${name}.`;
    const raw = a[2] || a[3] || a[4] || '';
    if (raw && BAD_SCHEME.test(decodeEntities(raw).replace(/[\x00-\x20]+/g, ''))) {
      return `Wykryto niebezpieczny schemat lub wyrażenie (javascript:, vbscript:, data:text/html, data:image/svg) w atrybucie ${name}.`;
    }
  }
  return null;
}

/** @param {string} html @returns {string|null} */
function scanScripts(html) {
  const opens = (html.match(/<\s*script\b/gi) || []).length;
  if (opens === 0) return null;
  const pairs = [...html.matchAll(/<\s*script\b([^>]*)>([\s\S]*?)<\s*\/\s*script\s*>/gi)];
  if (pairs.length !== opens) return 'Wykryto nieprawidłowy lub niedomknięty tag <script>.';
  for (const [, attrs, inner] of pairs) {
    if (inner.trim() !== '') return 'Wykryto niedozwolony kod inline wewnątrz tagu <script>.';
    if ((attrs.match(/\bsrc\s*=/gi) || []).length !== 1) return 'Tag <script> musi posiadać dokładnie jeden atrybut src.';
    const m = attrs.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i);
    const src = (m && (m[1] || m[2] || m[3]) || '').trim();
    if (!src) return 'Tag <script> bez dozwolonego atrybutu src jest zabroniony.';
    if (!SCRIPT_SRC_OK.test(src)) return `Tag <script> wskazuje na niedozwolony skrypt spoza białej listy: ${src}`;
  }
  return null;
}

/**
 * Sprawdza dokument HTML. Zwraca null, gdy bezpieczny, albo komunikat błędu (jak w PHP).
 * Uwaga: tak jak PHP odrzuca meta refresh, więc strony-przekierowania nie przejdą (znalezisko dla PHP).
 * @param {string} html
 * @returns {string|null}
 */
export function scanHtml(html) {
  if (html.includes('\0')) return 'Dokument HTML zawiera niedozwolone bajty zerowe.';
  if (/<\?(?:php|=|\s)|<%/i.test(html)) return 'Wykryto niedozwolone tagi serwerowe PHP/ASP w dokumencie HTML.';
  if (/<\s*(?:iframe|object|embed|applet|base|form)\b/i.test(html)) {
    return 'Wykryto zabroniony element HTML (iframe, object, embed, applet, base lub form).';
  }
  if (/<\s*meta\b[^>]*\bhttp-equiv\s*=\s*(?:"|')?\s*refresh\b/i.test(html)) {
    return 'Wykryto zabronione przekierowanie meta http-equiv="refresh".';
  }
  for (const tag of html.matchAll(TAG_RE)) {
    const err = tag[2] ? scanAttributes(tag[2]) : null;
    if (err) return err;
  }
  return scanScripts(html);
}
