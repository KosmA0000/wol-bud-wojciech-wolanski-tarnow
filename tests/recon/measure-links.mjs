import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { REPO_ROOT, loadHtml, resolveSiteUrl } from './lib-html.mjs';
import { writeJson, writeMd, mdTable } from './lib-md.mjs';

async function exists(root, rel) {
  try { await access(join(root, ...rel.split('/'))); return true; } catch { return false; }
}

export async function measureLinks(outDir, pagesData, root = REPO_ROOT) {
  const sitePages = pagesData.pages.filter((p) => p.type !== 'panel');
  const publicPages = sitePages.filter((p) => p.type !== 'przekierowanie');
  const pageMap = new Map(sitePages.map((p) => [p.path, p]));
  const idsByPage = new Map();
  const adjDirect = new Map();
  const adjWithRedirects = new Map();

  for (const p of sitePages) {
    const { dom } = await loadHtml(p.path, root);
    idsByPage.set(p.path, new Set(dom.querySelectorAll('[id]').map((e) => e.getAttribute('id'))));
    adjDirect.set(p.path, new Set());
    adjWithRedirects.set(p.path, new Set());
    if (p.type === 'przekierowanie' && p.redirect?.targetPath) adjWithRedirects.get(p.path).add(p.redirect.targetPath);
  }

  const brokenLinks = [];
  const brokenAnchors = [];
  const linksToRedirects = [];
  const brokenImages = [];
  const imagesWithoutAlt = [];

  for (const p of publicPages) {
    const { dom } = await loadHtml(p.path, root);
    for (const a of dom.querySelectorAll('a[href]')) {
      const res = resolveSiteUrl(p.path, a.getAttribute('href'));
      if (res.kind !== 'internal' && res.kind !== 'anchor') continue;
      if (!(await exists(root, res.path))) {
        brokenLinks.push({ from: p.path, href: res.raw, resolved: res.path });
        continue;
      }
      if (pageMap.has(res.path)) {
        adjDirect.get(p.path).add(res.path);
        adjWithRedirects.get(p.path).add(res.path);
        if (pageMap.get(res.path).type === 'przekierowanie') {
          linksToRedirects.push({ from: p.path, href: res.raw, redirectPage: res.path, finalTarget: pageMap.get(res.path).redirect?.targetPath });
        }
        if (res.hash && !idsByPage.get(res.path)?.has(res.hash)) {
          brokenAnchors.push({ from: p.path, href: res.raw, target: res.path, missingId: res.hash });
        }
      }
    }
    for (const img of dom.querySelectorAll('img')) {
      const src = img.getAttribute('src');
      const alt = img.getAttribute('alt');
      const isLightboxPlaceholder = img.getAttribute('id') === 'lightboxImg';
      if (!isLightboxPlaceholder && (alt === null || alt.trim() === '')) {
        imagesWithoutAlt.push({ page: p.path, src: src || '' });
      }
      for (const attr of ['src', 'data-lightbox-src']) {
        const val = img.getAttribute(attr);
        if (!val) continue;
        const r = resolveSiteUrl(p.path, val);
        if (r.kind === 'internal' && !(await exists(root, r.path))) brokenImages.push({ page: p.path, attr, val, resolved: r.path });
      }
    }
    for (const el of dom.querySelectorAll('[data-src]')) {
      const val = el.getAttribute('data-src');
      const r = resolveSiteUrl(p.path, val);
      if (r.kind === 'internal' && !(await exists(root, r.path))) brokenImages.push({ page: p.path, attr: 'data-src', val, resolved: r.path });
    }
  }

  const bfs = (adj) => {
    const seen = new Set(['index.html']);
    const q = ['index.html'];
    while (q.length) {
      const cur = q.shift();
      for (const nxt of adj.get(cur) || []) if (!seen.has(nxt)) { seen.add(nxt); q.push(nxt); }
    }
    return publicPages.filter((p) => !seen.has(p.path)).map((p) => p.path);
  };
  const unreachableDirect = bfs(adjDirect);
  const unreachableViaRedirects = bfs(adjWithRedirects);

  const sitemapXml = await readFile(join(root, 'sitemap.xml'), 'utf8');
  const smPaths = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => {
    const loc = m[1].replace(/^https?:\/\/[^/]+\/?/, '');
    return !loc ? 'index.html' : loc.endsWith('/') ? `${loc}index.html` : loc;
  });
  const smSet = new Set(smPaths);
  const manifest = JSON.parse(await readFile(join(root, 'assets', 'cms-manifest.json'), 'utf8'));
  const mfPaths = (manifest.pages || []).map((x) => x.path);
  const mfSet = new Set(mfPaths);

  const sitemapDiff = {
    totalInSitemap: smPaths.length,
    redirectsInSitemap: smPaths.filter((p) => pageMap.get(p)?.type === 'przekierowanie'),
    missingFromDisk: smPaths.filter((p) => !pageMap.has(p)),
    publicMissingFromSitemap: publicPages.filter((p) => !smSet.has(p.path)).map((p) => p.path),
  };
  const manifestDiff = {
    totalInManifest: mfPaths.length,
    redirectsInManifest: mfPaths.filter((p) => pageMap.get(p)?.type === 'przekierowanie'),
    missingFromDisk: mfPaths.filter((p) => !pageMap.has(p)),
    publicMissingFromManifest: publicPages.filter((p) => !mfSet.has(p.path)).map((p) => p.path),
  };

  const result = {
    summary: {
      brokenLinks: brokenLinks.length,
      brokenAnchors: brokenAnchors.length,
      linksToRedirects: linksToRedirects.length,
      brokenImages: brokenImages.length,
      imagesWithoutAlt: imagesWithoutAlt.length,
      unreachableDirect: unreachableDirect.length,
      unreachableViaRedirects: unreachableViaRedirects.length,
      redirectsInSitemap: sitemapDiff.redirectsInSitemap.length,
      redirectsInManifest: manifestDiff.redirectsInManifest.length,
    },
    brokenLinks, brokenAnchors, linksToRedirects, brokenImages, imagesWithoutAlt,
    unreachableDirect, unreachableViaRedirects, sitemapDiff, manifestDiff,
  };
  await writeJson(outDir, 'links-broken.json', result);

  await writeMd(outDir, 'niespojnosci.md', [
    '# Niespójności strony, linki i rozbieżności manifestów',
    '',
    'Pełne dane w `links-broken.json`.',
    '',
    mdTable(['Kontrola', 'Wynik'], Object.entries(result.summary).map(([k, v]) => [k, String(v)])),
    '',
    '## Strony publiczne nieosiągalne od `index.html`',
    `- Bez podążania za przekierowaniami (${unreachableDirect.length}): ${unreachableDirect.map((x) => `\`${x}\``).join(', ') || 'brak'}`,
    `- Z podążaniem za przekierowaniami (${unreachableViaRedirects.length}): ${unreachableViaRedirects.map((x) => `\`${x}\``).join(', ') || 'brak'}`,
    '',
    '## Zepsute linki i kotwice',
    `- Zepsute pliki docelowe: **${brokenLinks.length}**`,
    `- Zepsute kotwice \`#id\`: **${brokenAnchors.length}**${brokenAnchors.length ? '\n' + brokenAnchors.map((b) => `  - \`${b.from}\` -> \`${b.href}\` (brak \`#${b.missingId}\` w \`${b.target}\`)`).join('\n') : ''}`,
    `- Linki wewnętrzne prowadzące do stron przekierowań: **${linksToRedirects.length}** (z czego głównie w \`produkty/index.html\`)`,
    '',
    '## Rozbieżności `sitemap.xml` i `cms-manifest.json`',
    `- W \`sitemap.xml\` wpisano **${sitemapDiff.redirectsInSitemap.length}** stron przekierowań (mających \`meta robots="noindex"\`)! Brakujące na dysku: ${sitemapDiff.missingFromDisk.length}. Publiczne pominięte w sitemap: ${sitemapDiff.publicMissingFromSitemap.length}.`,
    `- W \`cms-manifest.json\` wpisano **${manifestDiff.redirectsInManifest.length}** stron przekierowań. Brakujące na dysku: ${manifestDiff.missingFromDisk.length}. Publiczne pominięte w manifeście: ${manifestDiff.publicMissingFromManifest.length}.`,
  ]);

  return result;
}
