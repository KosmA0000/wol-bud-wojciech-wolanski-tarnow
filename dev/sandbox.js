// Piaskownica: jednorazowa kopia strony w .sandbox/<port>/ (site/ + private/), reset kopiuje źródło od nowa.
import fs from 'node:fs';
import path from 'node:path';

/** Elementy katalogu głównego repo, które nie są treścią strony (nie trafiają do kopii). */
export const EXCLUDED_TOP = Object.freeze([
  'panel', 'dev', 'tests', 'docs', 'tools', 'node_modules', 'package.json', 'package-lock.json',
]);

/**
 * @typedef {{ base: string, dir: string, siteRoot: string, privateDir: string, sourceRoot: string, port: number }} Sandbox
 */

/**
 * Ścieżki piaskownicy dla portu. Nie tworzy niczego na dysku.
 * @param {string} sourceRoot katalog repo ze stroną (tylko odczyt)
 * @param {string} base katalog bazowy piaskownic, np. <repo>/.sandbox
 * @param {number} port
 * @returns {Sandbox}
 */
export function sandboxPaths(sourceRoot, base, port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Nieprawidłowy port piaskownicy: ${port}`);
  const dir = path.join(path.resolve(base), String(port));
  return { base: path.resolve(base), dir, siteRoot: path.join(dir, 'site'), privateDir: path.join(dir, 'private'),
    sourceRoot: path.resolve(sourceRoot), port };
}

/** @param {string} sourceRoot @returns {(src: string) => boolean} */
function copyFilter(sourceRoot) {
  return (src) => {
    const rel = path.relative(sourceRoot, src);
    if (rel === '') return true;
    const parts = rel.split(path.sep);
    if (parts.some((p) => p.startsWith('.'))) return false;
    if (parts.length === 1 && EXCLUDED_TOP.includes(parts[0])) return false;
    return !fs.lstatSync(src).isSymbolicLink();
  };
}

/**
 * Usuwa katalog piaskownicy portu. Odmawia, gdy ścieżka nie leży w katalogu bazowym albo wskazuje źródło.
 * @param {Sandbox} sb
 */
export function removeSandbox(sb) {
  const rel = path.relative(sb.base, sb.dir);
  if (rel !== String(sb.port) || isWithin(sb.dir, sb.sourceRoot)) {
    throw new Error(`Odmowa usunięcia katalogu spoza piaskownicy: ${sb.dir}`);
  }
  fs.rmSync(sb.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

/** Czy b leży w a (lub jest a). @param {string} a @param {string} b */
function isWithin(a, b) {
  const rel = path.relative(a, b);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Tworzy świeżą kopię strony (usuwa poprzednią). Źródło jest tylko czytane.
 * @param {Sandbox} sb
 * @returns {{ createdAt: string, files: number }}
 */
export function resetSandbox(sb) {
  if (isWithin(sb.siteRoot, sb.sourceRoot)) throw new Error('Piaskownica nie może zawierać źródła strony.');
  removeSandbox(sb);
  fs.mkdirSync(sb.privateDir, { recursive: true });
  fs.mkdirSync(sb.siteRoot, { recursive: true });
  const filter = copyFilter(sb.sourceRoot);
  // Kopia po wpisach najwyższego poziomu: .sandbox/ leży w źródle, a cpSync odmawia kopiowania do własnego podkatalogu.
  for (const name of fs.readdirSync(sb.sourceRoot)) {
    const src = path.join(sb.sourceRoot, name);
    if (!filter(src)) continue;
    fs.cpSync(src, path.join(sb.siteRoot, name), { recursive: true, filter, verbatimSymlinks: true });
  }
  const info = { createdAt: new Date().toISOString(), files: countFiles(sb.siteRoot), source: sb.sourceRoot, port: sb.port };
  fs.writeFileSync(path.join(sb.dir, 'sandbox.json'), JSON.stringify(info, null, 2));
  return info;
}

/**
 * Zapewnia piaskownicę: świeżą (fresh=true) albo istniejącą, jeśli jest kompletna.
 * @param {Sandbox} sb @param {boolean} fresh
 */
export function ensureSandbox(sb, fresh) {
  if (!fresh && fs.existsSync(path.join(sb.dir, 'sandbox.json')) && fs.existsSync(sb.siteRoot)) {
    return JSON.parse(fs.readFileSync(path.join(sb.dir, 'sandbox.json'), 'utf8'));
  }
  return resetSandbox(sb);
}

/** @param {string} dir */
export function countFiles(dir) {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) if (e.isFile()) n += 1;
  return n;
}
