// Kopie zapasowe w prywatnym katalogu piaskownicy: original, auto-*, manual-* (jak _common.php).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { HttpError } from './http-util.js';

export const BACKUP_ID_RE = /^(?:original|(?:auto|manual)-\d{8}-\d{6}(?:-[a-f0-9]{4})?)$/;
const EXCLUDED_TOP_DIRS = ['panel', '.git', '.github', 'cgi-bin', 'img', 'node_modules'];
const AUTO_KEEP = 10;
const ORIGINAL_LABEL = 'Oryginalna wersja strony (fabryczna)';

/** @param {string} privateDir */
export function backupsRoot(privateDir) {
  const root = path.join(privateDir, 'cms-backups');
  fs.mkdirSync(root, { recursive: true });
  return root;
}

/**
 * Pliki do kopii: każdy .html (poza wykluczonymi katalogami) i .json bezpośrednio w assets/.
 * @param {string} siteRoot
 * @returns {string[]} ścieżki względne posortowane
 */
export function collectSiteFiles(siteRoot) {
  /** @type {string[]} */
  const out = [];
  const walk = (dir, prefix) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.isSymbolicLink()) continue;
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!(prefix === '' && EXCLUDED_TOP_DIRS.includes(e.name.toLowerCase()))) walk(path.join(dir, e.name), rel);
      } else if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        if (ext === '.html' || (ext === '.json' && prefix.toLowerCase() === 'assets')) out.push(rel);
      }
    }
  };
  walk(siteRoot, '');
  return out.sort();
}

/** @param {string} id @param {string} type @param {string} label @param {string} siteRoot @param {string} root */
function writeSnapshot(siteRoot, root, id, type, label) {
  const tmp = path.join(root, `.tmp-${id}-${crypto.randomBytes(4).toString('hex')}`);
  const files = collectSiteFiles(siteRoot);
  let sizeBytes = 0;
  try {
    for (const rel of files) {
      const dest = path.join(tmp, 'files', ...rel.split('/'));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const data = fs.readFileSync(path.join(siteRoot, ...rel.split('/')));
      fs.writeFileSync(dest, data);
      sizeBytes += data.length;
    }
    const meta = { id, label, createdAt: new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00'),
      immutable: type === 'original', type, fileCount: files.length, sizeBytes, files };
    fs.mkdirSync(tmp, { recursive: true });
    fs.writeFileSync(path.join(tmp, 'meta.json'), JSON.stringify(meta, null, 2));
    fs.renameSync(tmp, path.join(root, id));
    const { files: _omit, ...summary } = meta;
    return summary;
  } catch (err) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw err instanceof HttpError ? err : new HttpError(500, `Nie udało się zapisać kopii zapasowej: ${id}`);
  }
}

/** Tworzy kopię "original", jeśli jej nie ma. Istniejącej nigdy nie nadpisuje. */
export function ensureOriginal(siteRoot, privateDir) {
  const root = backupsRoot(privateDir);
  const dir = path.join(root, 'original');
  if (fs.existsSync(path.join(dir, 'meta.json'))) return;
  if (fs.existsSync(dir)) throw new HttpError(500, 'Katalog kopii oryginalnej jest uszkodzony i wymaga weryfikacji administratora.');
  writeSnapshot(siteRoot, root, 'original', 'original', ORIGINAL_LABEL);
}

/** @param {Date} d */
function stamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

/**
 * Tworzy kopię auto-* albo manual-*; dla auto-* zostawia 10 najnowszych.
 * @param {string} siteRoot @param {string} privateDir @param {'auto'|'manual'} kind @param {string} label
 */
export function createSnapshot(siteRoot, privateDir, kind, label) {
  ensureOriginal(siteRoot, privateDir);
  const root = backupsRoot(privateDir);
  const prefix = kind === 'manual' ? 'manual' : 'auto';
  let clean = String(label || '').replace(/[\x00-\x1F\x7F]+/g, ' ').trim().slice(0, 120);
  if (!clean) clean = prefix === 'manual' ? 'Kopia ręczna' : 'Automatyczna kopia zapasowa';
  const base = `${prefix}-${stamp(new Date())}`;
  let id = base;
  while (fs.existsSync(path.join(root, id))) id = `${base}-${crypto.randomBytes(2).toString('hex')}`;
  const meta = writeSnapshot(siteRoot, root, id, prefix, clean);
  if (prefix === 'auto') rotateAuto(root);
  return meta;
}

/** @param {string} root */
function rotateAuto(root) {
  const autos = fs.readdirSync(root).filter((e) => /^auto-\d{8}-\d{6}(?:-[a-f0-9]{4})?$/.test(e)).sort().reverse();
  for (const old of autos.slice(AUTO_KEEP)) fs.rmSync(path.join(root, old), { recursive: true, force: true });
}

/** Lista kopii: najnowsze najpierw, "original" zawsze na końcu. @param {string} privateDir */
export function listBackups(privateDir) {
  const root = backupsRoot(privateDir);
  const items = [];
  for (const id of fs.readdirSync(root)) {
    if (!BACKUP_ID_RE.test(id)) continue;
    let m;
    try { m = JSON.parse(fs.readFileSync(path.join(root, id, 'meta.json'), 'utf8')); } catch { continue; }
    const original = id === 'original';
    items.push({ id, label: String(m.label ?? (original ? ORIGINAL_LABEL : id)), createdAt: String(m.createdAt ?? ''),
      immutable: original || Boolean(m.immutable), type: original ? 'original' : String(m.type ?? 'auto'),
      fileCount: Number(m.fileCount) || 0, sizeBytes: Number(m.sizeBytes) || 0 });
  }
  return items.sort((a, b) => {
    if ((a.id === 'original') !== (b.id === 'original')) return a.id === 'original' ? 1 : -1;
    return b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
  });
}
