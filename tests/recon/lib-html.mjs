import { readdir, readFile } from 'node:fs/promises';
import { join, posix, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';

export const TESTS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = resolve(TESTS_ROOT, '..');
export const DEFAULT_OUT = 'C:\\Users\\User\\OpenBot\\Shared\\wolbud\\rekonesans';
const IGNORE_DIRS = new Set(['.git', '.github', 'node_modules', 'tests', 'tools', 'assets', 'img']);
const MAIN_TOP_SLUGS = new Set(['oferta', 'realizacje', 'o-firmie', 'nasze-sklepy', 'kontakt']);

export async function walkHtml(root = REPO_ROOT, includePanel = false) {
  const files = [];
  async function visit(dir, relBase) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (IGNORE_DIRS.has(e.name)) continue;
      if (!includePanel && relBase === '' && e.name === 'panel') continue;
      const full = join(dir, e.name);
      const rel = relBase ? `${relBase}/${e.name}` : e.name;
      if (e.isDirectory()) await visit(full, rel);
      else if (e.isFile() && e.name.endsWith('.html')) files.push(rel);
    }
  }
  await visit(root, '');
  return files.sort();
}

export async function loadHtml(relPath, root = REPO_ROOT) {
  const raw = await readFile(join(root, ...relPath.split('/')), 'utf8');
  return { raw, dom: parse(raw, { comment: false }) };
}

export function cleanText(s) {
  return String(s ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

export function depthOf(relPath) {
  return relPath.split('/').length - 1;
}

export function expectedPrefix(relPath) {
  const d = depthOf(relPath);
  return d === 0 ? '' : '../'.repeat(d);
}

export function parseRefresh(dom) {
  const meta = dom.querySelector('meta[http-equiv="refresh"], meta[http-equiv="Refresh"]');
  if (!meta) return null;
  const content = meta.getAttribute('content') || '';
  const m = content.match(/url\s*=\s*['"]?([^'";\s]+)['"]?/i);
  return { content, rawUrl: m ? m[1] : null };
}

export function resolveSiteUrl(fromPath, href) {
  if (!href) return { kind: 'empty', raw: href };
  const trimmed = href.trim();
  if (/^(mailto:|tel:|javascript:|data:)/i.test(trimmed)) return { kind: 'special', raw: trimmed };
  if (/^https?:\/\//i.test(trimmed)) return { kind: 'external', raw: trimmed };
  const hashIdx = trimmed.indexOf('#');
  const qIdx = trimmed.indexOf('?');
  const cut = Math.min(hashIdx >= 0 ? hashIdx : Infinity, qIdx >= 0 ? qIdx : Infinity);
  const pathPart = cut === Infinity ? trimmed : trimmed.slice(0, cut);
  const hash = hashIdx >= 0 ? trimmed.slice(hashIdx + 1) : null;
  if (!pathPart) return { kind: 'anchor', path: fromPath, hash, raw: trimmed };
  const baseDir = posix.dirname(fromPath);
  const joined = pathPart.startsWith('/') ? pathPart.slice(1) : posix.normalize(posix.join(baseDir, pathPart));
  const target = joined.endsWith('/') ? `${joined}index.html` : joined;
  return { kind: 'internal', path: target, hash, raw: trimmed };
}

export function classifyPage(relPath, dom) {
  if (relPath === 'panel/index.html') return { type: 'panel', reason: 'Aplikacja starego panelu CMS (/panel/).' };
  const refresh = parseRefresh(dom);
  if (refresh) return { type: 'przekierowanie', reason: `Zawiera meta http-equiv="refresh" (${refresh.rawUrl || refresh.content}).` };
  if (relPath === 'index.html') return { type: 'home', reason: 'Strona główna witryny (index.html w katalogu głównym).' };
  const parts = relPath.split('/');
  if (parts.length === 2 && parts[0] === 'uslugi') {
    return { type: 'usługa', reason: 'Główna strona usług (uslugi/index.html); linkowana w menu, stopce, sekcji usług na home i pasku kategorii.' };
  }
  if (parts.length === 2 && MAIN_TOP_SLUGS.has(parts[0])) {
    return { type: 'główna', reason: `Strona najwyższego poziomu (${parts[0]}/) obecna w menu głównym i stopce.` };
  }
  if (parts[0] === 'kategorie' && parts.length >= 2) {
    return { type: 'kategoria', reason: 'Pełna strona kategorii w katalogu kategorie/ (bez meta refresh).' };
  }
  if (relPath === 'produkty/index.html') {
    return { type: 'własna', reason: 'Indeks/spis produktów (produkty/index.html) o odrębnym szablonie bez paska kategorii i sidebaru.' };
  }
  if (parts[0] === 'produkty' && parts.length >= 3) {
    return { type: 'produkt', reason: 'Karta produktu w katalogu produkty/ (bez meta refresh).' };
  }
  if (parts[0] === 'promocje') {
    return { type: 'promocja', reason: 'Strona w katalogu promocje/.' };
  }
  return { type: 'własna', reason: 'Strona spoza standardowych prefiksów katalogowych.' };
}

export function normalizeUrls(html, relPath) {
  const pref = expectedPrefix(relPath);
  const stripped = pref
    ? html.replace(new RegExp(`((?:href|src|data-desktop-href|data-mobile-home-href)=["'])${pref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'), '$1')
    : html;
  return stripped.replace(/\s+/g, ' ').trim();
}
