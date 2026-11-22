import { readdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const testsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const suites = process.argv.slice(2);
if (suites.length === 0) {
  console.error('Użycie: node scripts/run-suites.mjs <suite...>');
  process.exit(2);
}

async function collectTests(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await collectTests(full)));
    else if (e.isFile() && /\.test\.m?js$/.test(e.name)) out.push(full);
  }
  return out.sort();
}

const files = [];
for (const suite of suites) {
  const found = await collectTests(resolve(testsRoot, suite));
  console.log(`[suite:${suite}] znaleziono plików testowych: ${found.length}`);
  files.push(...found);
}

if (files.length === 0) {
  console.log('Wszystkie wskazane zestawy są puste — OK (0 testów do uruchomienia).');
  process.exit(0);
}

const res = spawnSync(process.execPath, ['--test', ...files], {
  cwd: testsRoot,
  stdio: 'inherit',
});
process.exit(res.status ?? 1);
