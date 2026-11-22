// Szkielet CLI walidatora: npm run validate -- --root <katalog>. Raport JSON na stdout, kod wyjścia 0/1.
// Reguły niezmienników przyjdą z kontraktu walidatora w fazie 1; lista RULES jest na razie pusta.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * @typedef {{ rule: string, file?: string, message: string }} Violation
 * @typedef {{ id: string, check: (root: string, files: string[]) => Violation[] }} Rule
 */

/** @type {Rule[]} */
export const RULES = [];

/** Katalogi najwyższego poziomu, które nie są stroną (panel, kod i testy w kopii repozytorium). */
const NOT_SITE_DIRS = ['panel', 'dev', 'tests', 'docs', 'tools'];

/** @param {string} root @returns {string[]} ścieżki względne stron .html, bez katalogów ukrytych i panelu */
export function listHtml(root) {
  const out = [];
  for (const e of fs.readdirSync(root, { withFileTypes: true, recursive: true })) {
    if (!e.isFile() || !e.name.toLowerCase().endsWith('.html')) continue;
    const rel = path.relative(root, path.join(e.parentPath, e.name)).split(path.sep).join('/');
    const segs = rel.split('/');
    if (NOT_SITE_DIRS.includes(segs[0].toLowerCase())) continue;
    if (!segs.some((s) => s.startsWith('.') || s === 'node_modules')) out.push(rel);
  }
  return out.sort();
}

/**
 * @param {string[]} argv
 * @param {Rule[]} [rules]
 * @returns {{ code: 0|1, report: Record<string, unknown> }}
 */
export function runValidate(argv, rules = RULES) {
  let root = null;
  for (let i = 0; i < argv.length; i += 1) {
    const [flag, inline] = argv[i].split(/=(.*)/s, 2);
    if (flag === '--root') root = inline ?? argv[++i] ?? null;
    else return fail(`Nieznany argument: ${argv[i]}`);
  }
  if (!root) return fail('Podaj katalog strony: npm run validate -- --root <katalog>.');
  const abs = path.resolve(root);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) return fail(`Katalog nie istnieje: ${abs}`);
  const files = listHtml(abs);
  const violations = rules.flatMap((r) => r.check(abs, files).map((v) => ({ ...v, rule: v.rule || r.id })));
  const ok = violations.length === 0;
  return { code: ok ? 0 : 1, report: { ok, root: abs, rules: rules.map((r) => r.id), checkedFiles: files.length, violations,
    note: rules.length ? undefined : 'Szkielet: brak reguł do fazy 1 (kontrakt walidatora).' } };
}

/** @param {string} message */
function fail(message) {
  return { code: 1, report: { ok: false, error: message, violations: [] } };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const { code, report } = runValidate(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = code;
}
