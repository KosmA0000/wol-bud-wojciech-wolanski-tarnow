import { readdir, readFile } from 'node:fs/promises';
import { join, resolve, relative, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const testsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(testsRoot, '..');
const TARGET_MAX = 150;
const HARD_MAX = 200;
const CHECK_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.css']);
const IGNORE_DIRS = new Set(['node_modules', '.git', '.github', 'panel', 'assets', 'img', 'tools', 'test-results', 'playwright-report', '.visual-tmp']);

const args = process.argv.slice(2);
const roots = args.length > 0 ? args.map((a) => resolve(process.cwd(), a)) : [testsRoot, resolve(repoRoot, 'src'), resolve(repoRoot, 'dev')];

async function walk(dir, acc = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (IGNORE_DIRS.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) await walk(full, acc);
    else if (e.isFile() && CHECK_EXT.has(extname(e.name))) acc.push(full);
  }
  return acc;
}

const files = [];
for (const r of roots) await walk(r, files);
files.sort();

const warnings = [];
const failures = [];
for (const f of files) {
  const txt = await readFile(f, 'utf8');
  const lines = txt.length === 0 ? 0 : txt.split(/\r?\n/).length - (txt.endsWith('\n') ? 1 : 0);
  const rel = relative(repoRoot, f).replace(/\\/g, '/');
  if (lines > HARD_MAX) failures.push({ rel, lines });
  else if (lines > TARGET_MAX) warnings.push({ rel, lines });
}

console.log(`check:size — sprawdzono ${files.length} plików (cel <= ${TARGET_MAX}, twardy limit <= ${HARD_MAX}).`);
for (const w of warnings) console.warn(`WARN  ${w.lines} linii: ${w.rel}`);
for (const e of failures) console.error(`FAIL  ${e.lines} linii (> ${HARD_MAX}): ${e.rel}`);
if (failures.length > 0) process.exit(1);
console.log(warnings.length ? `OK z ${warnings.length} ostrzeżeniami.` : 'OK — wszystkie pliki w limicie.');
