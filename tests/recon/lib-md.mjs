import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export async function writeJson(outDir, name, data) {
  await mkdir(outDir, { recursive: true });
  const p = join(outDir, name);
  await writeFile(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
  return p;
}

export async function writeMd(outDir, name, lines) {
  await mkdir(outDir, { recursive: true });
  const p = join(outDir, name);
  const content = Array.isArray(lines) ? lines.join('\n') + '\n' : String(lines);
  await writeFile(p, content, 'utf8');
  return p;
}

export function mdTable(headers, rows) {
  const esc = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  const head = `| ${headers.map(esc).join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.map(esc).join(' | ')} |`);
  return [head, sep, ...body].join('\n');
}

export function countBy(items, keyFn) {
  const map = new Map();
  for (const it of items) {
    const k = keyFn(it);
    map.set(k, (map.get(k) || 0) + 1);
  }
  return Object.fromEntries([...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pl')));
}
