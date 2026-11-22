// Walidacja i dekodowanie całej paczki publikacji przed zapisem czegokolwiek (jak api.php).
import { HttpError } from './http-util.js';
import { validateWritePath } from './safe-path.js';
import { checkContent, isWellFormedUtf8String } from './content-checks.js';

export const MAX_FILE_BYTES = 6 * 1024 * 1024;
export const MAX_FILES_COUNT = 200;
export const MAX_DELETIONS_COUNT = 100;
export const MANIFEST_PATH = 'assets/cms-manifest.json';

/** @param {unknown} v */
function isValidRevision(v) {
  return typeof v === 'string' && v !== '' && v.length <= 128 && /^[a-zA-Z0-9._-]+$/.test(v);
}

/**
 * @param {Record<string, any>} item
 * @returns {{ path: string, bytes: Buffer }}
 */
function decodeFile(item) {
  const p = validateWritePath(item.path);
  const encoding = item.encoding ?? 'utf-8';
  const content = item.content;
  if (typeof content !== 'string') throw new HttpError(400, `Brak zawartości dla pliku: ${p}`);
  let bytes;
  if (encoding === 'base64') {
    const cleaned = content.replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned) || cleaned.length % 4 !== 0) {
      throw new HttpError(400, `Uszkodzone kodowanie base64 dla pliku: ${p}`);
    }
    bytes = Buffer.from(cleaned, 'base64');
  } else if (encoding === 'utf-8') {
    if (!isWellFormedUtf8String(content)) throw new HttpError(400, `Nieprawidłowe kodowanie UTF-8 w pliku: ${p}`);
    bytes = Buffer.from(content, 'utf8');
  } else {
    throw new HttpError(400, `Nieobsługiwane kodowanie pliku: ${p}`);
  }
  if (bytes.length > MAX_FILE_BYTES) throw new HttpError(413, `Plik przekracza maksymalny rozmiar 6 MB: ${p}`);
  const problem = checkContent(p, bytes);
  if (problem) throw new HttpError(400, problem.error, problem.security ? { code: 'SECURITY_ERROR' } : {});
  return { path: p, bytes };
}

/**
 * Sprawdza pola żądania publikacji i zwraca plan zapisu: pliki (manifest osobno, na koniec) i usunięcia.
 * @param {Record<string, any>} req
 */
export function preparePublish(req) {
  const files = req.files ?? [];
  const deletions = req.deletions ?? [];
  const { expectedRevision = null, nextRevision = null } = req;
  if (!Array.isArray(files) || !Array.isArray(deletions)) {
    throw new HttpError(400, 'Pola files oraz deletions muszą być listami.');
  }
  if (files.length > MAX_FILES_COUNT || deletions.length > MAX_DELETIONS_COUNT) {
    throw new HttpError(400, 'Przekroczono maksymalną liczbę plików w jednej publikacji.');
  }
  if (files.length === 0 && deletions.length === 0) throw new HttpError(400, 'Brak zmian do opublikowania.');
  if (expectedRevision !== null && !isValidRevision(expectedRevision)) {
    throw new HttpError(400, 'Nieprawidłowy format expectedRevision.');
  }
  if (nextRevision !== null && !isValidRevision(nextRevision)) {
    throw new HttpError(400, 'Nieprawidłowy format nextRevision.');
  }
  /** @type {Map<string, Buffer>} */
  const prepared = new Map();
  for (const item of files) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new HttpError(400, 'Nieprawidłowy wpis w liście files.');
    const f = decodeFile(item);
    prepared.set(f.path, f.bytes);
  }
  const toDelete = [...new Set(deletions.map((d) => validateWritePath(d, { isDeletion: true })))]
    .filter((d) => !prepared.has(d));
  const manifest = prepared.get(MANIFEST_PATH) ?? null;
  prepared.delete(MANIFEST_PATH);
  return { files: [...prepared].map(([path, bytes]) => ({ path, bytes })), manifest, deletions: toDelete, expectedRevision, nextRevision };
}
