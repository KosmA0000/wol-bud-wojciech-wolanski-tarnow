// Atomowy zapis i bezpieczne usuwanie plików wewnątrz katalogu piaskownicy (odpowiednik writeFileAtomically z PHP).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { HttpError } from './http-util.js';
import { resolveInside, isInside } from './safe-path.js';

const PROTECTED_EMPTY_DIRS = ['assets', 'img', 'panel', 'css', 'js'];

/**
 * Zapisuje plik przez plik tymczasowy i rename. Katalogi tworzy segment po segmencie bez symlinków.
 * @param {string} root katalog strony w piaskownicy
 * @param {string} rel ścieżka po validateWritePath
 * @param {Buffer|string} bytes
 */
export function writeFileAtomic(root, rel, bytes) {
  const target = resolveInside(root, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (!isInside(fs.realpathSync(root), fs.realpathSync(path.dirname(target)))) {
    throw new HttpError(403, 'Ścieżka docelowa wykracza poza katalog witryny.');
  }
  if (fs.existsSync(target) && fs.lstatSync(target).isDirectory()) {
    throw new HttpError(403, `Nie można nadpisać ścieżki (katalog lub symlink): ${rel}`);
  }
  const tmp = path.join(path.dirname(target), `.cms-${crypto.randomBytes(10).toString('hex')}.tmp`);
  try {
    fs.writeFileSync(tmp, bytes);
    fs.renameSync(tmp, target);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    if (err instanceof HttpError) throw err;
    throw new HttpError(500, `Nie udało się atomowo podmienić pliku: ${rel}`);
  }
}

/**
 * Usuwa plik (jeśli istnieje) i puste katalogi nadrzędne poza chronionymi. Zwraca true, gdy usunięto.
 * @param {string} root
 * @param {string} rel ścieżka po validateWritePath({isDeletion:true})
 * @returns {boolean}
 */
export function deleteFileSafe(root, rel) {
  const target = resolveInside(root, rel);
  let st;
  try { st = fs.lstatSync(target); } catch { return false; }
  if (!st.isFile()) {
    throw new HttpError(403, `Nie można usunąć nieprawidłowego celu: ${rel}`);
  }
  fs.unlinkSync(target);
  cleanupEmptyParents(root, rel);
  return true;
}

/**
 * @param {string} root
 * @param {string} rel
 */
export function cleanupEmptyParents(root, rel) {
  const realRoot = fs.realpathSync(root);
  let dirRel = path.posix.dirname(rel);
  while (dirRel !== '.' && dirRel !== '') {
    if (PROTECTED_EMPTY_DIRS.includes(dirRel.split('/')[0].toLowerCase())) return;
    const full = path.join(realRoot, ...dirRel.split('/'));
    try {
      if (fs.lstatSync(full).isSymbolicLink() || fs.readdirSync(full).length > 0) return;
      fs.rmdirSync(full);
    } catch {
      return;
    }
    dirRel = path.posix.dirname(dirRel);
  }
}
