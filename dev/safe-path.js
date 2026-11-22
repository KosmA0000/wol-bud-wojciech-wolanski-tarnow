// Ochrona ścieżek zapisu i usuwania (reguły validateSafePath z api.php + biała lista rozszerzeń karty Z-002).
import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from './http-util.js';

/**
 * Rozszerzenia, które wolno zapisać. svg wyłączone: może nieść skrypt (XSS), a skaner regexowy
 * z PHP da się obejść. js wyłączone: zapis kodu wykonywanego na stronie omija sanityzację HTML.
 */
export const ALLOWED_EXTENSIONS = Object.freeze(['html', 'css', 'json', 'xml', 'txt', 'webp', 'jpg', 'jpeg', 'png', 'ico']);
export const FORBIDDEN_TOP_DIRS = Object.freeze(['panel', '.github', '.git', 'cgi-bin', 'backups', 'cms-backups', 'node_modules']);
export const FORBIDDEN_EXACT_PATHS = Object.freeze([
  'assets/site.js', 'assets/site.css', 'assets/home-page.js', 'assets/home-content.js', 'assets/home-content.css',
]);
export const ROOT_SEO_FILES = Object.freeze(['sitemap.xml', 'robots.txt']);
const PROTECTED_DELETE_PREFIXES = ['assets/', 'panel/'];
const DANGEROUS_EXT = /\.(?:php\d*|phtml|phar|pht|shtml|cgi|pl|py|rb|sh|bash|exe|bat|cmd|htaccess|htpasswd|ini|env|js|mjs|cjs|svg)(?:\.|$)/i;
export const MAX_PATH_LENGTH = 255;

/**
 * Sprawdza względną ścieżkę z żądania zapisu/usunięcia. Zwraca ją bez zmian albo rzuca HttpError 400/403.
 * Znaki spoza [a-zA-Z0-9/._-] (w tym %, \, :, polskie litery) są odrzucane, więc nie ma czego dekodować.
 * @param {unknown} p
 * @param {{ isDeletion?: boolean }} [opts]
 * @returns {string}
 */
export function validateWritePath(p, { isDeletion = false } = {}) {
  if (typeof p !== 'string' || p === '' || p.length > MAX_PATH_LENGTH) {
    throw new HttpError(400, 'Nieprawidłowa lub pusta ścieżka pliku.');
  }
  if (p.includes('\0') || p.includes('\\') || p.includes('..') || p.startsWith('/') || p.endsWith('/') || p.includes('//')) {
    throw new HttpError(400, `Niedozwolona ścieżka pliku: ${p}`);
  }
  if (!/^[a-zA-Z0-9/._-]+$/.test(p)) {
    throw new HttpError(400, `Ścieżka pliku zawiera niedozwolone znaki: ${p}`);
  }
  const segments = p.split('/');
  if (segments.some((s) => s === '' || s === '.' || s.startsWith('.'))) {
    throw new HttpError(403, `Niedozwolony segment ścieżki (pliki lub katalogi ukryte): ${p}`);
  }
  const lower = p.toLowerCase();
  if (FORBIDDEN_TOP_DIRS.includes(segments[0].toLowerCase())) {
    throw new HttpError(403, `Zapis i usuwanie w tym katalogu są zabronione: ${p}`);
  }
  if (FORBIDDEN_EXACT_PATHS.includes(lower)) {
    throw new HttpError(403, `Modyfikacja chronionego zasobu systemowego jest zabroniona: ${p}`);
  }
  if (DANGEROUS_EXT.test(p)) {
    throw new HttpError(403, `Niedozwolony typ pliku: ${p}`);
  }
  const ext = path.posix.extname(lower).slice(1);
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new HttpError(403, `Niedozwolone rozszerzenie pliku: ${p}`);
  }
  if (isDeletion) checkDeletion(lower, p);
  return p;
}

/** @param {string} lower @param {string} p */
function checkDeletion(lower, p) {
  if (lower === 'index.html' || ROOT_SEO_FILES.includes(lower)) {
    throw new HttpError(403, `Nie można usunąć chronionego pliku głównego: ${p}`);
  }
  if (PROTECTED_DELETE_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
    throw new HttpError(403, `Nie można usunąć chronionego pliku: ${p}`);
  }
}

/**
 * Czy kandydat (ścieżka bezwzględna po realpath) leży wewnątrz katalogu root (też po realpath).
 * @param {string} root
 * @param {string} candidate
 */
export function isInside(root, candidate) {
  const rel = path.relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Zamienia zweryfikowaną ścieżkę względną na bezwzględną w root i sprawdza, że żaden istniejący
 * segment nie jest dowiązaniem (symlink/junction) wyprowadzającym poza root.
 * @param {string} root katalog bazowy (istniejący)
 * @param {string} rel ścieżka po validateWritePath
 * @returns {string}
 */
export function resolveInside(root, rel) {
  const realRoot = fs.realpathSync(root);
  let current = realRoot;
  for (const segment of rel.split('/')) {
    current = path.join(current, segment);
    let st;
    try { st = fs.lstatSync(current); } catch { break; }
    if (st.isSymbolicLink()) {
      throw new HttpError(403, 'Niedozwolone dowiązanie symboliczne w ścieżce docelowej.');
    }
  }
  const target = path.join(realRoot, ...rel.split('/'));
  if (!isInside(realRoot, target)) {
    throw new HttpError(403, 'Ścieżka docelowa wykracza poza katalog witryny.');
  }
  return target;
}
