import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { REPO_ROOT, loadHtml, cleanText, resolveSiteUrl } from './lib-html.mjs';
import { writeJson, writeMd, mdTable } from './lib-md.mjs';

function classifyLink(fromPage, a) {
  if (a.closest('header.bar .menu-panel')) return 'menu desktop';
  if (a.closest('header.bar .brand')) return 'inne';
  if (a.closest('footer .footer-links')) return 'stopka';
  if (a.closest('.breadcrumbs')) return 'okruszki';
  if (a.closest('.cat-quick-nav')) return 'pasek kategorii';
  if (a.closest('.subpage-sidebar')) return 'sidebar';
  if (a.closest('.product-nav-bar')) return 'inne';
  if (fromPage.path === 'index.html' && a.closest('.home-catalog-grid, .home-extra-categories, .home-featured-grid, .realization-cards, .home-services-grid')) {
    return 'kafel na stronie głównej';
  }
  if (fromPage.path === 'oferta/index.html' && a.closest('.home-catalog-grid')) return 'kafel na Ofercie';
  if (fromPage.type === 'kategoria' && a.closest('.cat-products-grid, .cat-prod-card')) return 'karta produktu w kategorii';
  return 'link w treści';
}

function addEdge(map, target, edge) {
  if (!map.has(target)) map.set(target, []);
  map.get(target).push(edge);
}

export async function measureInbound(outDir, pagesData, root = REPO_ROOT) {
  const publicPages = pagesData.pages.filter((p) => p.type !== 'przekierowanie' && p.type !== 'panel');
  const inbound = new Map(pagesData.pages.filter((p) => p.type !== 'panel').map((p) => [p.path, []]));

  for (const p of publicPages) {
    const { dom } = await loadHtml(p.path, root);
    for (const a of dom.querySelectorAll('a[href]')) {
      const res = resolveSiteUrl(p.path, a.getAttribute('href'));
      if (res.kind === 'internal' && inbound.has(res.path)) {
        addEdge(inbound, res.path, { kind: classifyLink(p, a), from: p.path, text: cleanText(a.text), hash: res.hash });
      }
      const mob = a.getAttribute('data-mobile-home-href');
      if (mob) {
        const mRes = resolveSiteUrl(p.path, mob);
        if (mRes.kind === 'internal' || mRes.kind === 'anchor') {
          addEdge(inbound, mRes.path, { kind: 'kotwica mobilna', from: p.path, text: cleanText(a.text), hash: mRes.hash });
        }
      }
    }
  }

  const sitemapXml = await readFile(join(root, 'sitemap.xml'), 'utf8');
  for (const m of sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const loc = m[1].replace(/^https?:\/\/[^/]+\/?/, '');
    const path = !loc ? 'index.html' : loc.endsWith('/') ? `${loc}index.html` : loc;
    if (inbound.has(path)) addEdge(inbound, path, { kind: 'sitemap.xml', from: 'sitemap.xml', text: m[1] });
  }
  const manifest = JSON.parse(await readFile(join(root, 'assets', 'cms-manifest.json'), 'utf8'));
  for (const mp of manifest.pages || []) {
    if (inbound.has(mp.path)) addEdge(inbound, mp.path, { kind: 'cms-manifest.json', from: 'assets/cms-manifest.json', text: mp.label || '' });
  }
  const globals = JSON.parse(await readFile(join(root, 'assets', 'site-globals.json'), 'utf8'));
  for (const it of [...(globals.menu || []), ...(globals.footerLinks || [])]) {
    if (inbound.has(it.href)) addEdge(inbound, it.href, { kind: 'site-globals.json', from: 'assets/site-globals.json', text: it.label || '' });
  }

  const byPage = {};
  for (const p of publicPages) {
    const edges = inbound.get(p.path) || [];
    const counts = {};
    for (const e of edges) counts[e.kind] = (counts[e.kind] || 0) + 1;
    byPage[p.path] = { type: p.type, title: p.title, totalInbound: edges.length, countsByKind: counts, sources: edges };
  }

  const cats = publicPages.filter((p) => p.type === 'kategoria');
  const catMatrix = cats.map((c) => {
    const b = byPage[c.path].countsByKind;
    return {
      path: c.path, h1: c.h1 || c.title,
      home: Boolean(b['kafel na stronie głównej']),
      oferta: Boolean(b['kafel na Ofercie']),
      pasek: Boolean(b['pasek kategorii']),
      sidebar: Boolean(b['sidebar']),
      sitemap: Boolean(b['sitemap.xml']),
      manifest: Boolean(b['cms-manifest.json']),
      linkWTresci: b['link w treści'] || 0,
      okruszki: b['okruszki'] || 0,
    };
  });

  const prods = publicPages.filter((p) => p.type === 'produkt');
  const prodMatrix = prods.map((pr) => {
    const b = byPage[pr.path].countsByKind;
    return {
      path: pr.path, h1: pr.h1 || pr.title,
      kartaWKategorii: b['karta produktu w kategorii'] || 0,
      home: Boolean(b['kafel na stronie głównej']),
      spisProduktow: (byPage[pr.path].sources || []).some((s) => s.from === 'produkty/index.html'),
      sitemap: Boolean(b['sitemap.xml']),
      manifest: Boolean(b['cms-manifest.json']),
    };
  });

  await writeJson(outDir, 'inbound.json', { publicCount: publicPages.length, categoryMatrix: catMatrix, productMatrix: prodMatrix, byPage });

  const yn = (v) => (v ? 'TAK' : 'NIE');
  const sumCat = (k) => `${catMatrix.filter((r) => r[k]).length} z ${catMatrix.length}`;
  const catRows = catMatrix.map((r) => [
    `\`${r.path}\``, r.h1, yn(r.home), yn(r.oferta), yn(r.pasek), yn(r.sidebar), String(r.okruszki), yn(r.sitemap), yn(r.manifest),
  ]);
  const prodMissingCat = prodMatrix.filter((r) => r.kartaWKategorii === 0);
  const prodMissingSpis = prodMatrix.filter((r) => !r.spisProduktow);

  await writeMd(outDir, 'drogi-dojscia.md', [
    '# Drogi dojścia — pomiar stanu zastanego',
    '',
    'Pełne dane źródłowe dla wszystkich stron publicznych: `inbound.json`.',
    '',
    `## Kategorie (${catMatrix.length} pełnych stron kategorii)`,
    `- Kafel na stronie głównej (siatka + dodatkowe): **${sumCat('home')}**`,
    `- Kafel na Ofercie: **${sumCat('oferta')}**`,
    `- Pasek kategorii (\`.cat-quick-nav\`): **${sumCat('pasek')}** (+ 1 link do \`uslugi/index.html\`)`,
    `- Panel boczny (\`.subpage-sidebar .sidebar-links\`): **${sumCat('sidebar')}** (+ 1 link do \`uslugi/index.html\`)`,
    `- \`sitemap.xml\`: **${sumCat('sitemap')}** · \`cms-manifest.json\`: **${sumCat('manifest')}**`,
    '',
    mdTable(['Kategoria', 'H1', 'Home', 'Oferta', 'Pasek kat.', 'Sidebar', 'Okruszki prod.', 'Sitemap', 'Manifest'], catRows),
    '',
    `## Produkty (${prodMatrix.length} stron produktów)`,
    `- Linkowane z karty w kategorii (\`.cat-prod-card\`): **${prodMatrix.length - prodMissingCat.length} z ${prodMatrix.length}**`,
    `- Linkowane ze spisu \`produkty/index.html\`: **${prodMatrix.length - prodMissingSpis.length} z ${prodMatrix.length}**`,
    `- Produkty bez karty w żadnej kategorii: ${prodMissingCat.length ? prodMissingCat.map((r) => `\`${r.path}\``).join(', ') : 'brak'}`,
    `- Produkty nieobecne w \`produkty/index.html\`: ${prodMissingSpis.length ? prodMissingSpis.map((r) => `\`${r.path}\``).join(', ') : 'brak'}`,
  ]);

  return { byPage, catMatrix, prodMatrix };
}
