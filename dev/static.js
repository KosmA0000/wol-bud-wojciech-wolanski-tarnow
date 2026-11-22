// Serwowanie plików: strona z piaskownicy, panel/ ze źródła (tylko odczyt). Ochrona ścieżek GET.
import fs from 'node:fs';
import path from 'node:path';
import { isInside } from './safe-path.js';
import { SECURITY_HEADERS } from './http-util.js';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.pdf': 'application/pdf', '.webmanifest': 'application/manifest+json',
};

/**
 * Zamienia ścieżkę URL na plik w root albo zwraca null (404). Odrzuca .., ukryte segmenty, \, bajt zerowy,
 * błędne kodowanie % i dowiązania prowadzące poza root.
 * @param {string} root katalog bazowy
 * @param {string} urlPath część po prefiksie, zaczynająca się od /
 * @returns {{ file: string } | { redirect: true } | null}
 */
export function resolveStatic(root, urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch { return null; }
  if (decoded.includes('\0') || decoded.includes('\\') || decoded.length > 1024) return null;
  const segments = decoded.split('/').filter((s) => s !== '');
  if (segments.some((s) => s === '..' || s.startsWith('.') || s.includes(':'))) return null;
  let realRoot;
  try { realRoot = fs.realpathSync(root); } catch { return null; }
  const found = realInside(realRoot, path.join(realRoot, ...segments));
  if (!found) return null;
  if (found.stat.isDirectory()) {
    if (!decoded.endsWith('/')) return { redirect: true };
    const index = realInside(realRoot, path.join(found.real, 'index.html'));
    return index && index.stat.isFile() ? { file: index.real } : null;
  }
  return found.stat.isFile() ? { file: found.real } : null;
}

/**
 * realpath kandydata, o ile istnieje i po rozwiązaniu dowiązań leży w realRoot (L-017).
 * @param {string} realRoot @param {string} candidate
 * @returns {{ real: string, stat: fs.Stats } | null}
 */
function realInside(realRoot, candidate) {
  let real;
  try { real = fs.realpathSync(candidate); } catch { return null; }
  if (!isInside(realRoot, real)) return null;
  return { real, stat: fs.statSync(real) };
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {string} file
 * @param {(text: string) => string} [transform] modyfikacja treści HTML w locie (źródło bez zmian)
 */
export function sendFile(res, file, transform) {
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  let body = fs.readFileSync(file);
  if (transform) body = Buffer.from(transform(body.toString('utf8')));
  res.writeHead(200, {
    'Content-Type': type, 'Content-Length': body.length,
    'Cache-Control': 'no-store', 'X-Content-Type-Options': SECURITY_HEADERS['X-Content-Type-Options'],
  });
  res.end(body);
}

/** @param {import('node:http').ServerResponse} res @param {number} status @param {string} text */
export function sendText(res, status, text, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(text);
}

/** Wstawia znacznik trybu lokalnego do panel/index.html, żeby stary panel używał lokalnego proxy AI. */
export function injectLocalMeta(html) {
  const tag = '<meta name="cms-local-proxy" content="1">';
  if (html.includes('name="cms-local-proxy"')) return html;
  return html.replace(/<head([^>]*)>/i, (m) => `${m}\n  ${tag}`);
}

/** Konfiguracja panelu w trybie lokalnym: oryginał + tryb hosting (endpointy PHP emulowane). */
export const LOCAL_CONFIG_JS = `import { config as base } from './config.js?source=1';
export const config = Object.freeze({ ...base, mode: 'hosting', requireLogin: true, local: true });
`;
