import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  REPO_ROOT, walkHtml, loadHtml, cleanText, depthOf, parseRefresh, resolveSiteUrl, classifyPage,
} from './lib-html.mjs';
import { writeJson, writeMd, mdTable, countBy } from './lib-md.mjs';

export async function measurePages(outDir, root = REPO_ROOT) {
  const htmlFiles = await walkHtml(root, true);
  const fileSet = new Set(htmlFiles);
  const pages = [];

  for (const rel of htmlFiles) {
    const { raw, dom } = await loadHtml(rel, root);
    const st = await stat(join(root, ...rel.split('/')));
    const { type, reason } = classifyPage(rel, dom);
    const title = cleanText(dom.querySelector('title')?.text || '');
    const h1 = cleanText(dom.querySelector('h1')?.text || '');
    const metaDesc = dom.querySelector('meta[name="description"]')?.getAttribute('content') ?? null;
    const canonical = dom.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null;
    const robots = dom.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null;
    const themeColor = dom.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null;
    const refresh = parseRefresh(dom);
    let redirect = null;
    if (refresh) {
      const resolved = refresh.rawUrl ? resolveSiteUrl(rel, refresh.rawUrl) : null;
      const targetPath = resolved?.kind === 'internal' ? resolved.path : null;
      redirect = {
        rawUrl: refresh.rawUrl,
        targetPath,
        targetHash: resolved?.hash ?? null,
        targetExists: targetPath ? fileSet.has(targetPath) : false,
      };
    }
    pages.push({
      path: rel,
      bytes: st.size,
      depth: depthOf(rel),
      type,
      reason,
      title,
      h1: h1 || null,
      metaDescription: metaDesc,
      canonical,
      robots,
      themeColor,
      redirect,
    });
  }

  const byPath = new Map(pages.map((p) => [p.path, p]));
  for (const p of pages) {
    if (p.redirect?.targetPath) {
      const t = byPath.get(p.redirect.targetPath);
      p.redirect.targetType = t ? t.type : null;
      p.redirect.targetIsRedirect = t?.type === 'przekierowanie';
    }
  }

  const publicPages = pages.filter((p) => p.type !== 'przekierowanie' && p.type !== 'panel');
  const redirects = pages.filter((p) => p.type === 'przekierowanie');
  const summary = {
    totalHtmlFiles: pages.length,
    siteHtmlFiles: pages.filter((p) => p.type !== 'panel').length,
    publicPages: publicPages.length,
    redirects: redirects.length,
    panelFiles: pages.filter((p) => p.type === 'panel').length,
    byType: countBy(pages, (p) => p.type),
    byDepthPublic: countBy(publicPages, (p) => String(p.depth)),
    canonicalPresentCount: publicPages.filter((p) => p.canonical).length,
    missingH1Public: publicPages.filter((p) => !p.h1).map((p) => p.path),
    brokenRedirects: redirects.filter((p) => !p.redirect?.targetExists).map((p) => p.path),
    chainedRedirects: redirects.filter((p) => p.redirect?.targetIsRedirect).map((p) => p.path),
  };

  await writeJson(outDir, 'pages.json', { summary, pages });

  const typeRows = Object.entries(summary.byType).map(([k, v]) => [k, String(v)]);
  const pageRows = pages.map((p) => [
    `\`${p.path}\``, String(p.depth), p.type, p.title || '—',
    p.redirect ? `→ \`${p.redirect.targetPath}\` (${p.redirect.targetExists ? 'istnieje' : 'BRAK'})` : p.reason,
  ]);
  await writeMd(outDir, 'typy-stron.md', [
    '# Typy stron w repozytorium WOL-BUD',
    '',
    `Źródło pomiaru: wszystkie pliki HTML w repozytorium (${summary.totalHtmlFiles} plików = ${summary.publicPages} stron publicznych + ${summary.redirects} przekierowań + ${summary.panelFiles} plik panelu). Pełne dane w \`pages.json\`.`,
    '',
    '## Podsumowanie liczbowe',
    '',
    mdTable(['Typ', 'Liczba'], typeRows),
    '',
    `- Strony publiczne z tagiem \`<link rel="canonical">\`: **${summary.canonicalPresentCount} / ${summary.publicPages}**`,
    `- Strony publiczne bez \`<h1>\`: **${summary.missingH1Public.length}**`,
    `- Przekierowania z brakującym celem: **${summary.brokenRedirects.length}**`,
    `- Przekierowania łańcuchowe (cel jest kolejnym przekierowaniem): **${summary.chainedRedirects.length}**`,
    '',
    '## Klasyfikacja wszystkich plików HTML',
    '',
    mdTable(['Ścieżka', 'Głębokość', 'Typ', 'Tytuł', 'Uzasadnienie / Cel przekierowania'], pageRows),
  ]);

  return { summary, pages };
}
