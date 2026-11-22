// Przywracanie kopii zapasowej w piaskownicy (restoreBackupSnapshot z _common.php).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { HttpError } from './http-util.js';
import { BACKUP_ID_RE, backupsRoot, ensureOriginal, createSnapshot } from './backup-store.js';
import { scanHtml } from './html-scan.js';
import { writeFileAtomic, deleteFileSafe } from './fs-write.js';
import { validateWritePath } from './safe-path.js';

const MANIFEST = 'assets/cms-manifest.json';

/** @param {string} dir @returns {string[]} */
function listFiles(dir) {
  const out = [];
  const walk = (d, prefix) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.isSymbolicLink()) continue;
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), rel);
      else if (e.isFile()) out.push(rel);
    }
  };
  walk(dir, '');
  return out.sort();
}

/** Czy ścieżkę z manifestu wolno usunąć: te same reguły co usuwanie w api.php (L-020). @param {unknown} p */
function isDeletablePage(p) {
  if (typeof p !== 'string' || !p.toLowerCase().endsWith('.html')) return false;
  try { validateWritePath(p, { isDeletion: true }); return true; } catch { return false; }
}

/** Ścieżki podstron z bieżącego manifestu (do sprzątnięcia stron dodanych po kopii). @param {string} siteRoot */
function manifestPages(siteRoot) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(siteRoot, 'assets', 'cms-manifest.json'), 'utf8'));
    if (!Array.isArray(data?.pages)) return [];
    return data.pages.map((p) => p?.path).filter(isDeletablePage);
  } catch {
    return [];
  }
}

/** @param {string} filesRoot @returns {{ toWrite: Map<string, Buffer>, manifest: Buffer|null }} */
function readSnapshot(filesRoot) {
  const toWrite = new Map();
  let manifest = null;
  for (const rel of listFiles(filesRoot)) {
    const lower = rel.toLowerCase();
    const isHtml = lower.endsWith('.html');
    if (!isHtml && !(lower.endsWith('.json') && lower.startsWith('assets/'))) continue;
    const bytes = fs.readFileSync(path.join(filesRoot, ...rel.split('/')));
    if (isHtml) {
      const err = scanHtml(bytes.toString('utf8'));
      if (err) throw new HttpError(500, `Plik w kopii nie przeszedł weryfikacji bezpieczeństwa (${rel}): ${err}`);
    }
    if (lower === MANIFEST) manifest = bytes;
    else toWrite.set(rel, bytes);
  }
  if (toWrite.size === 0 && !manifest) throw new HttpError(500, 'Wybrana kopia zapasowa jest pusta i nie może zostać przywrócona.');
  return { toWrite, manifest };
}

/**
 * Przywraca kopię o podanym id. Najpierw robi kopię bezpieczeństwa bieżącego stanu.
 * @param {string} siteRoot @param {string} privateDir @param {string} id
 */
export function restoreSnapshot(siteRoot, privateDir, id) {
  if (!BACKUP_ID_RE.test(id)) throw new HttpError(400, 'Nieprawidłowy identyfikator kopii zapasowej.');
  const dir = path.join(backupsRoot(privateDir), id);
  const filesRoot = path.join(dir, 'files');
  if (!fs.existsSync(path.join(dir, 'meta.json')) || !fs.existsSync(filesRoot)) {
    throw new HttpError(404, 'Wybrana kopia zapasowa nie istnieje na serwerze.');
  }
  ensureOriginal(siteRoot, privateDir);
  const pre = createSnapshot(siteRoot, privateDir, 'auto', `Kopia przed przywróceniem (${id})`);
  const { toWrite, manifest } = readSnapshot(filesRoot);
  const previousPages = manifestPages(siteRoot);
  for (const [rel, bytes] of toWrite) writeFileAtomic(siteRoot, rel, bytes);
  let removed = 0;
  for (const rel of previousPages) {
    if (!toWrite.has(rel) && deleteFileSafe(siteRoot, rel)) removed += 1;
  }
  const revision = crypto.randomUUID();
  let restored = toWrite.size;
  if (manifest) {
    let out = manifest;
    try {
      const m = JSON.parse(manifest.toString('utf8'));
      Object.assign(m, { revision, updatedAt: new Date().toISOString(), restoredFrom: id });
      out = Buffer.from(`${JSON.stringify(m, null, 2)}\n`);
    } catch { /* zostaw bajty bez zmian, jak PHP */ }
    writeFileAtomic(siteRoot, MANIFEST, out);
    restored += 1;
  }
  return { restoredId: id, revision, restoredFiles: restored, removedFiles: removed, preRestoreBackupId: pre.id };
}
