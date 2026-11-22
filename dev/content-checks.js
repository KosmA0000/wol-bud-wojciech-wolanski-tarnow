// Kontrola treści zapisywanych plików według rozszerzenia (reguły decodeFilePayload z api.php).
import path from 'node:path';
import { scanHtml } from './html-scan.js';

const SERVER_TAG = /<\?(?:php|=|\s)|<%/i;

/** @param {string} text @returns {string|null} */
function checkSitemap(text) {
  const bad = /<\?(?:php|=)|<script\b|<!ENTITY\b|<!DOCTYPE\b|javascript:/i.test(text)
    || !text.trimStart().startsWith('<?xml')
    || !text.includes('<urlset')
    || /<loc>[^<]*\/panel(?:\/|<)/i.test(text);
  return bad ? 'Publikacja odrzucona: nieprawidłowy plik sitemap.xml.' : null;
}

/** @param {string} text @returns {string|null} */
function checkRobots(text) {
  const bad = /<\?(?:php|=)|<script\b/i.test(text)
    || /^\s*Disallow\s*:\s*\/\s*$/im.test(text)
    || !/^\s*Disallow\s*:\s*\/panel\/?\s*$/im.test(text);
  return bad ? 'Publikacja odrzucona: robots.txt musi blokować /panel/ i nie może blokować całej witryny.' : null;
}

/** @param {string} text @param {string} p @returns {string|null} */
function checkJson(text, p) {
  if (/<\?(?:php|=|\s)/i.test(text)) return `Wykryto niedozwolony kod serwerowy w pliku: ${p}`;
  try { JSON.parse(text); } catch { return `Plik JSON ma niepoprawną składnię: ${p}`; }
  return null;
}

/** @param {string} text @param {string} p @returns {string|null} */
function checkOtherText(text, p) {
  if (SERVER_TAG.test(text)) return `Wykryto niedozwolony kod serwerowy w pliku: ${p}`;
  if (/<!ENTITY\b|<script\b/i.test(text)) return `Plik zawiera niedozwoloną treść (encje XML lub skrypt): ${p}`;
  if (/expression\s*\(|javascript:|@import\s+url\(\s*['"]?https?:/i.test(text)) {
    return `Plik zawiera niedozwolone wyrażenie lub obcy import: ${p}`;
  }
  return null;
}

/**
 * Zwraca null, gdy treść pliku jest dopuszczalna, albo polski komunikat błędu.
 * Pliki binarne (obrazy) nie są skanowane poza limitem rozmiaru.
 * @param {string} p ścieżka po validateWritePath
 * @param {Buffer} bytes
 * @returns {{ error: string, security: boolean } | null}
 */
export function checkContent(p, bytes) {
  const lower = p.toLowerCase();
  const ext = path.posix.extname(lower).slice(1);
  const text = () => bytes.toString('utf8');
  if (ext === 'html') {
    const err = scanHtml(text());
    return err ? { error: `Publikacja odrzucona ze względów bezpieczeństwa (${p}): ${err}`, security: true } : null;
  }
  if (ext === 'json') return wrap(checkJson(text(), p));
  if (lower === 'sitemap.xml') return wrap(checkSitemap(text()), true);
  if (lower === 'robots.txt') return wrap(checkRobots(text()), true);
  if (ext === 'xml' || ext === 'txt' || ext === 'css') return wrap(checkOtherText(text(), p), true);
  return null;
}

/** @param {string|null} error @param {boolean} [security] */
function wrap(error, security = false) {
  return error ? { error, security } : null;
}

/**
 * Sprawdza poprawność UTF-8 (odpowiednik preg_match('//u') w PHP).
 * @param {string} s
 */
export function isWellFormedUtf8String(s) {
  return typeof s === 'string' && s.isWellFormed();
}
