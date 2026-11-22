// Dodatkowe reguły ścieżek zapisu z Z-005: wielkość liter (L-019), segmenty niebezpieczne na Windows (L-020),
// dozwolone typy plików i ich miejsca (D-010).
import path from 'node:path';
import { HttpError } from './http-util.js';

/** Nazwy urządzeń Windows: zarezerwowane z dowolnym rozszerzeniem (con.html to nadal CON). */
const WINDOWS_DEVICE = /^(?:con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³]|conin\$|conout\$)(?:\..*)?$/i;

/**
 * L-020: segment zakończony kropką lub spacją (Windows go obcina, więc trafia w inny plik) albo nazwa urządzenia.
 * @param {string[]} segments @param {string} p
 */
export function checkWindowsSegments(segments, p) {
  for (const s of segments) {
    if (s.endsWith('.') || s.endsWith(' ')) throw new HttpError(400, `Segment ścieżki nie może kończyć się kropką: ${p}`);
    if (WINDOWS_DEVICE.test(s)) throw new HttpError(400, `Zarezerwowana nazwa pliku systemu Windows: ${p}`);
  }
}

/**
 * L-019: poza img/ wszystkie ścieżki są małymi literami (wszystkie strony i pliki danych tak wyglądają),
 * więc ta sama ścieżka nie może mieć dwóch zapisów na systemie bez rozróżniania wielkości liter.
 * @param {string} p
 */
export function checkCase(p) {
  if (p.startsWith('img/')) return;
  if (p !== p.toLowerCase()) throw new HttpError(400, `Ścieżka poza img/ musi być zapisana małymi literami: ${p}`);
}

const IMAGE_EXT = ['webp', 'jpg', 'jpeg', 'png'];
const ROOT_SEO = ['sitemap.xml', 'robots.txt'];

/**
 * D-010: html poza assets/ i img/; json tylko w assets/; xml i txt tylko jako sitemap.xml i robots.txt;
 * obrazy rastrowe tylko w img/. Wszystko inne 403.
 * @param {string} lower ścieżka małymi literami @param {string} p
 */
export function checkTypeLocation(lower, p) {
  const ext = path.posix.extname(lower).slice(1);
  const top = lower.split('/')[0];
  const ok = (ext === 'html' && top !== 'assets' && top !== 'img')
    || (ext === 'json' && top === 'assets' && lower.split('/').length === 2)
    || ROOT_SEO.includes(lower)
    || (IMAGE_EXT.includes(ext) && top === 'img');
  if (!ok) throw new HttpError(403, `Niedozwolony typ pliku w tym miejscu: ${p}`);
}
