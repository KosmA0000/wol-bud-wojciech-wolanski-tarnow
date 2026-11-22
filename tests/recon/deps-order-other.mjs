import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { REPO_ROOT, loadHtml, cleanText, resolveSiteUrl } from './lib-html.mjs';

const KNOWN_BRANDS = [
  'DOMEL', 'WIŚNIOWSKI', 'FILL', 'ALUPROF', 'MOBILUS', 'SOMFY', 'WIKĘD', 'ERKADO', 'WILLINGEN',
  'SCHÜCO', 'DEBOW', 'SALAMANDER', 'HENSFORT', 'KÖMMERLING', 'DOBROPLAST', 'MIROLA', 'MEDOS',
  'DECCO', 'HANAROL', 'VEKA', 'GEALAN', 'WINKHAUS', 'PORTA', 'DRE', 'POL-SKONE', 'PETECKI',
  'ILLBRUCK', 'KRISPOL', 'GERDA', 'MAR-TOM', 'AGMAR', 'SELT', 'FAKTORIA', 'PORTOS', 'VEGAS',
];

async function measureOrder(publicPages, root) {
  const docs = new Map();
  for (const p of publicPages) docs.set(p.path, (await loadHtml(p.path, root)).dom);
  const hrefs = (dom, pagePath, sel) => dom.querySelectorAll(sel).map((a) => ({
    path: resolveSiteUrl(pagePath, a.getAttribute('href') || '').path,
    label: cleanText(a.querySelector('h3,h4,span')?.text || a.text),
    hash: resolveSiteUrl(pagePath, a.getAttribute('href') || '').hash,
  }));

  const catProductOrders = {};
  const prodOwner = new Map();
  for (const p of publicPages.filter((x) => x.type === 'kategoria')) {
    const cards = docs.get(p.path).querySelectorAll('.cat-products-grid .cat-prod-card').map((card) => {
      const a = card.querySelector('a[href]');
      const r = resolveSiteUrl(p.path, a?.getAttribute('href') || '');
      return { path: r.path, label: cleanText(card.querySelector('h3')?.text || a?.text || '') };
    }).filter((c) => c.path);
    catProductOrders[p.path] = cards.map((c) => c.path);
    cards.forEach((c, idx) => prodOwner.set(c.path, { category: p.path, index: idx, list: cards }));
  }

  let prodNavExactLinear = 0, prodNavCyclic = 0;
  const prodNavAnomalies = [];
  for (const p of publicPages.filter((x) => x.type === 'produkt')) {
    const dom = docs.get(p.path);
    const prevA = dom.querySelector('nav.product-nav-bar a.pnav-prev');
    const nextA = dom.querySelector('nav.product-nav-bar a.pnav-next');
    const allA = dom.querySelector('nav.product-nav-bar a.pnav-all');
    const prevPath = prevA ? resolveSiteUrl(p.path, prevA.getAttribute('href')).path : null;
    const nextPath = nextA ? resolveSiteUrl(p.path, nextA.getAttribute('href')).path : null;
    const allPath = allA ? resolveSiteUrl(p.path, allA.getAttribute('href')).path : null;
    const own = prodOwner.get(p.path);
    if (!own) {
      prodNavAnomalies.push({ product: p.path, issue: 'brak karty w kategorii' });
      continue;
    }
    const { list, index, category } = own;
    const expLinPrev = index > 0 ? list[index - 1].path : null;
    const expLinNext = index < list.length - 1 ? list[index + 1].path : null;
    const expCycPrev = list[(index - 1 + list.length) % list.length].path;
    const expCycNext = list[(index + 1) % list.length].path;
    if (prevPath === expLinPrev && nextPath === expLinNext && allPath === category) prodNavExactLinear += 1;
    else if (prevPath === expCycPrev && nextPath === expCycNext && allPath === category) prodNavCyclic += 1;
    else prodNavAnomalies.push({ product: p.path, category, prevPath, nextPath, expLinPrev, expLinNext, allPath });
  }

  const homeDom = docs.get('index.html');
  const sampleCatDom = docs.get('kategorie/okna-pcv/index.html');
  const gl = JSON.parse(await readFile(join(root, 'assets', 'site-globals.json'), 'utf8'));
  const pathsOf = (dom, pagePath, sel) => hrefs(dom, pagePath, sel).map((x) => x.path);

  const categoryOrders = {
    homeGrid: pathsOf(homeDom, 'index.html', '.home-catalog-grid a.home-cat-card'),
    ofertaGrid: pathsOf(docs.get('oferta/index.html'), 'oferta/index.html', '.home-catalog-grid a.home-cat-card'),
    quickNav: pathsOf(sampleCatDom, 'kategorie/okna-pcv/index.html', '.cat-quick-nav a'),
    sidebar: pathsOf(sampleCatDom, 'kategorie/okna-pcv/index.html', 'aside.subpage-sidebar .sidebar-links a'),
  };
  const subcatOrders = {
    homeExtraPills: pathsOf(homeDom, 'index.html', '.home-extra-categories a.home-extra-category'),
    roletySubcats: pathsOf(docs.get('kategorie/rolety/index.html'), 'kategorie/rolety/index.html', '.subcat-grid a.subcat-card'),
    parapetySubcats: pathsOf(docs.get('kategorie/parapety-blaty/index.html'), 'kategorie/parapety-blaty/index.html', '.subcat-grid a.subcat-card'),
  };
  const menuMatchesGlobals = JSON.stringify(pathsOf(homeDom, 'index.html', 'nav#site-menu a[data-desktop-href]')) === JSON.stringify((gl.menu || []).map((m) => m.href));
  const footerMatchesGlobals = JSON.stringify(pathsOf(homeDom, 'index.html', 'footer .footer-links a')) === JSON.stringify((gl.footerLinks || []).map((m) => m.href));
  const servicesOrder = {
    home: hrefs(homeDom, 'index.html', '.home-services-grid a').map((x) => x.hash || x.path),
    uslugiIds: docs.get('uslugi/index.html').querySelectorAll('article.service-card[id]').map((e) => e.getAttribute('id')),
  };
  const textsOf = (pagePath, sel) => docs.get(pagePath).querySelectorAll(sel).map((h) => cleanText(h.text));
  const storesOrder = {
    naszeSklepy: textsOf('nasze-sklepy/index.html', '.location-card h2'),
    kontakt: textsOf('kontakt/index.html', '.kt-store-title'),
    sidebar: sampleCatDom.querySelectorAll('aside.subpage-sidebar .sidebar-store strong').map((h) => cleanText(h.text)),
  };

  return {
    productsCount: publicPages.filter((x) => x.type === 'produkt').length,
    prodNavExactLinear, prodNavCyclic, prodNavAnomalies,
    categoryOrders, subcatOrders, menuMatchesGlobals, footerMatchesGlobals, servicesOrder, storesOrder,
  };
}

async function measureOther(publicPages, root) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const extraBrands = new Set();
  for (const p of publicPages) {
    for (const el of (await loadHtml(p.path, root)).dom.querySelectorAll('.sill-producer-logo img')) {
      const name = cleanText(el.getAttribute('alt')).toUpperCase();
      if (name.length >= 2 && name.length <= 24) extraBrands.add(name);
    }
  }
  const brandCounts = new Map([...new Set([...KNOWN_BRANDS, ...extraBrands])].map((b) => [b, { name: b, hits: 0, files: new Set() }]));
  const priceValues = [], pdfLinks = [], ctaCounts = new Map();
  let priceMentionCount = 0;
  const metaStats = { jsonLd: 0, ogTags: 0, twitterTags: 0, canonical: 0, cssVersions: new Map(), jsVersions: new Map(), googleFontsFigtree: 0, homeContentCss: 0 };

  for (const p of publicPages) {
    const { raw, dom } = await loadHtml(p.path, root);
    const bodyText = cleanText(dom.querySelector('main')?.text || '');
    for (const b of brandCounts.keys()) {
      const m = bodyText.match(new RegExp(`(?<![\\p{L}\\p{N}])${esc(b)}(?![\\p{L}\\p{N}])`, 'giu'));
      if (m) { const rec = brandCounts.get(b); rec.hits += m.length; rec.files.add(p.path); }
    }
    for (const m of bodyText.matchAll(/\d[\d\s,.]*\s*(?:zł|PLN|EUR|€)(?!\w)/gi)) priceValues.push({ page: p.path, match: m[0] });
    priceMentionCount += (bodyText.match(/bezpłatn[aey]\s+wycen[aęy]/gi) || []).length;
    for (const a of dom.querySelectorAll('a[href$=".pdf"], a[href*=".pdf?"]')) {
      pdfLinks.push({ page: p.path, href: a.getAttribute('href'), text: cleanText(a.text) });
    }
    for (const el of dom.querySelectorAll('.cta-banner-dark h3, .sidebar-box--dark .eyebrow, .home-cat-cta, .cat-prod-btn')) {
      const t = cleanText(el.text);
      if (t) ctaCounts.set(t, (ctaCounts.get(t) || 0) + 1);
    }
    metaStats.jsonLd += dom.querySelectorAll('script[type="application/ld+json"]').length;
    metaStats.ogTags += dom.querySelectorAll('meta[property^="og:"]').length;
    metaStats.twitterTags += dom.querySelectorAll('meta[name^="twitter:"]').length;
    metaStats.canonical += dom.querySelectorAll('link[rel="canonical"]').length;
    if (raw.includes('fonts.googleapis.com') && raw.includes('Figtree')) metaStats.googleFontsFigtree += 1;
    if (raw.includes('home-content.css')) metaStats.homeContentCss += 1;
    const cssH = dom.querySelector('link[href*="site.css"]')?.getAttribute('href')?.replace(/^(?:\.\.\/)*/, '') || 'BRAK';
    const jsS = dom.querySelector('script[src*="site.js"]')?.getAttribute('src')?.replace(/^(?:\.\.\/)*/, '') || 'BRAK';
    metaStats.cssVersions.set(cssH, (metaStats.cssVersions.get(cssH) || 0) + 1);
    metaStats.jsVersions.set(jsS, (metaStats.jsVersions.get(jsS) || 0) + 1);
  }
  return {
    prices: { numericPricesCount: priceValues.length, numericPrices: priceValues, freeQuotePhraseCount: priceMentionCount },
    brands: [...brandCounts.values()].filter((b) => b.hits > 0).map((b) => ({ name: b.name, hits: b.hits, filesCount: b.files.size })).sort((a, b) => b.hits - a.hits),
    pdfs: { count: pdfLinks.length, pagesCount: new Set(pdfLinks.map((x) => x.page)).size, sample: pdfLinks.slice(0, 8) },
    repeatedCtas: [...ctaCounts.entries()].map(([text, count]) => ({ text, count })).sort((a, b) => b.count - a.count),
    metaAndAssets: { ...metaStats, cssVersions: Object.fromEntries(metaStats.cssVersions), jsVersions: Object.fromEntries(metaStats.jsVersions) },
  };
}

export async function measureOrderAndOther(pagesData, root = REPO_ROOT) {
  const publicPages = pagesData.pages.filter((p) => p.type !== 'przekierowanie' && p.type !== 'panel');
  const [order, other] = await Promise.all([measureOrder(publicPages, root), measureOther(publicPages, root)]);
  return { order, other };
}
