// npm run check:size: pliki nowego kodu do 150 linii (ostrzeżenie), twardo 200 (błąd); README w każdym katalogu z wpisem na plik.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './args.js';

/** Katalogi nowego kodu. Stary panel/ i .github/ nie podlegają limitom (zastany kod). */
export const DEFAULT_DIRS = Object.freeze(['dev', 'tests/unit', 'core', 'studio']);
const CODE_EXT = new Set(['.js', '.mjs', '.cjs', '.css', '.php']);
export const SOFT_LIMIT = 150;
export const HARD_LIMIT = 200;

/** @param {string} dir @returns {string[]} katalogi (z dir) bez ukrytych i node_modules */
function walkDirs(dir) {
  const out = [dir];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'fixtures') out.push(...walkDirs(path.join(dir, e.name)));
  }
  return out;
}

/** @param {string} text */
const countLines = (text) => (text === '' ? 0 : text.replace(/\r?\n$/, '').split(/\r?\n/).length);

/**
 * @param {string} root katalog repo
 * @param {readonly string[]} dirs katalogi względne
 * @returns {{ errors: string[], warnings: string[], checked: number }}
 */
export function checkSize(root, dirs = DEFAULT_DIRS) {
  const errors = [];
  const warnings = [];
  let checked = 0;
  for (const rel of dirs) {
    const base = path.join(root, rel);
    if (!fs.existsSync(base)) continue;
    for (const dir of walkDirs(base)) {
      const shown = path.relative(root, dir).split(path.sep).join('/');
      const files = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && e.name !== 'README.md').map((e) => e.name);
      const readmePath = path.join(dir, 'README.md');
      const readme = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf8') : null;
      if (readme === null) errors.push(`${shown}/: brak README.md`);
      for (const name of files) {
        if (readme !== null && !readme.includes(name)) errors.push(`${shown}/README.md: brak wpisu dla ${name}`);
        if (!CODE_EXT.has(path.extname(name).toLowerCase())) continue;
        checked += 1;
        const lines = countLines(fs.readFileSync(path.join(dir, name), 'utf8'));
        if (lines > HARD_LIMIT) errors.push(`${shown}/${name}: ${lines} linii (twardy limit ${HARD_LIMIT})`);
        else if (lines > SOFT_LIMIT) warnings.push(`${shown}/${name}: ${lines} linii (cel ${SOFT_LIMIT})`);
      }
    }
  }
  return { errors, warnings, checked };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const dirs = process.argv.slice(2);
  const { errors, warnings, checked } = checkSize(REPO_ROOT, dirs.length ? dirs : DEFAULT_DIRS);
  for (const w of warnings) process.stdout.write(`OSTRZEŻENIE ${w}\n`);
  for (const e of errors) process.stdout.write(`BŁĄD ${e}\n`);
  process.stdout.write(`check:size: ${checked} plików, ${errors.length} błędów, ${warnings.length} ostrzeżeń\n`);
  process.exitCode = errors.length ? 1 : 0;
}
