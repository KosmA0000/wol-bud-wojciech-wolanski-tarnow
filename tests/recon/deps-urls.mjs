import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { REPO_ROOT, loadHtml, resolveSiteUrl, parseRefresh } from './lib-html.mjs';

const SKIP_HTML_ATTRS = new Set(['href', 'data-desktop-href', 'data-mobile-home-href', 'content']);

function classifyPlace(fromPage, el, attr) {
  if (el.closest('header.bar .menu-panel')) {
    return { placeKind: attr === 'data-mobile-home-href' ? 'menu-mobile-anchor' : 'menu-desktop', selector: `nav#site-menu a[${attr}]` };
  }
  if (el.closest('header.bar .brand')) return { placeKind: 'header-brand', selector: 'header.bar a.brand' };
  if (el.closest('footer .footer-links')) return { placeKind: 'footer', selector: 'footer .footer-links a' };
  if (el.closest('nav.breadcrumbs')) return { placeKind: 'breadcrumbs', selector: 'nav.breadcrumbs a' };
  if (el.closest('.cat-quick-nav')) {
    return { placeKind: fromPage.path === 'realizacje/index.html' ? 'realizacje-nav' : 'cat-quick-nav', selector: '.cat-quick-nav a' };
  }
  if (el.closest('aside.subpage-sidebar')) return { placeKind: 'sidebar', selector: 'aside.subpage-sidebar a' };
  if (el.closest('nav.product-nav-bar')) {
    const sub = el.classList.contains('pnav-prev') ? '.pnav-prev' : el.classList.contains('pnav-next') ? '.pnav-next' : '.pnav-all';
    return { placeKind: 'product-nav-bar', selector: `nav.product-nav-bar a${sub}` };
  }
  if (fromPage.path === 'index.html') {
    if (el.closest('.home-catalog-grid')) return { placeKind: 'home-tile', selector: '.home-catalog-grid a.home-cat-card' };
    if (el.closest('.home-extra-categories')) return { placeKind: 'home-pill', selector: '.home-extra-categories a.home-extra-category' };
    if (el.closest('.home-featured-grid')) return { placeKind: 'home-featured', selector: '.home-featured-grid a' };
    if (el.closest('.home-services-box')) return { placeKind: 'home-service', selector: '.home-services-box a' };
    if (el.closest('.realization-cards')) return { placeKind: 'home-realization', selector: '.realization-cards a' };
  }
  if (fromPage.path === 'oferta/index.html' && el.closest('.home-catalog-grid')) {
    return { placeKind: 'oferta-tile', selector: '.home-catalog-grid a.home-cat-card' };
  }
  if (el.closest('.cat-products-grid')) return { placeKind: 'cat-prod-card', selector: '.cat-products-grid .cat-prod-card a' };
  if (el.closest('.subcat-grid')) return { placeKind: 'subcat-card', selector: '.subcat-grid a.subcat-card' };
  return { placeKind: 'content-link', selector: `${el.rawTagName?.toLowerCase() || 'a'}[${attr}]` };
}

function addOcc(map, target, occ) {
  if (!map.has(target)) map.set(target, []);
  map.get(target).push(occ);
}

export async function measureUrlDeps(pagesData, root = REPO_ROOT) {
  const allPages = pagesData.pages.filter((p) => p.type !== 'panel');
  const byTarget = new Map(allPages.map((p) => [p.path, []]));
  const extraAttrs = [];

  for (const p of allPages) {
    const { raw, dom } = await loadHtml(p.path, root);
    const ref = parseRefresh(dom);
    if (ref?.rawUrl) {
      const r = resolveSiteUrl(p.path, ref.rawUrl);
      if (r.kind === 'internal' && byTarget.has(r.path)) {
        addOcc(byTarget, r.path, { from: p.path, attr: 'meta[http-equiv="refresh"]', selector: 'meta[http-equiv="refresh"]', placeKind: 'meta-refresh', hash: r.hash });
      }
    }
    for (const el of dom.querySelectorAll('a[href], [data-desktop-href], [data-mobile-home-href]')) {
      for (const attr of ['href', 'data-desktop-href', 'data-mobile-home-href']) {
        const val = el.getAttribute(attr);
        if (!val) continue;
        const r = resolveSiteUrl(p.path, val);
        const tgt = r.kind === 'anchor' ? p.path : r.path;
        if ((r.kind === 'internal' || (attr === 'data-mobile-home-href' && r.kind === 'anchor')) && byTarget.has(tgt)) {
          const { placeKind, selector } = classifyPlace(p, el, attr);
          addOcc(byTarget, tgt, { from: p.path, attr, selector, placeKind, hash: r.hash });
        }
      }
    }
    for (const m of raw.matchAll(/\s([a-zA-Z0-9_-]+)=["']([^"']*\.html(?:[?#][^"']*)?)["']/g)) {
      if (!SKIP_HTML_ATTRS.has(m[1])) extraAttrs.push({ from: p.path, attr: m[1], val: m[2] });
    }
  }

  const sm = await readFile(join(root, 'sitemap.xml'), 'utf8');
  for (const m of sm.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const rel = m[1].replace(/^https?:\/\/[^/]+\/?/, '');
    const path = !rel ? 'index.html' : rel.endsWith('/') ? `${rel}index.html` : rel;
    if (byTarget.has(path)) addOcc(byTarget, path, { from: 'sitemap.xml', attr: 'loc', selector: 'url>loc', placeKind: 'sitemap', hash: null });
  }
  const mf = JSON.parse(await readFile(join(root, 'assets', 'cms-manifest.json'), 'utf8'));
  for (const mp of mf.pages || []) {
    if (byTarget.has(mp.path)) addOcc(byTarget, mp.path, { from: 'assets/cms-manifest.json', attr: 'path', selector: 'pages[].path', placeKind: 'manifest', hash: null });
  }
  const gl = JSON.parse(await readFile(join(root, 'assets', 'site-globals.json'), 'utf8'));
  for (const [grp, arr] of [['menu', gl.menu || []], ['footerLinks', gl.footerLinks || []]]) {
    for (const it of arr) {
      if (it.href && byTarget.has(it.href)) addOcc(byTarget, it.href, { from: 'assets/site-globals.json', attr: `${grp}[].href`, selector: grp, placeKind: 'site-globals', hash: null });
      if (it.mobileHref) {
        const r = resolveSiteUrl('index.html', it.mobileHref);
        if (byTarget.has(r.path)) addOcc(byTarget, r.path, { from: 'assets/site-globals.json', attr: `${grp}[].mobileHref`, selector: grp, placeKind: 'site-globals', hash: r.hash });
      }
    }
  }
  const siteJs = await readFile(join(root, 'assets', 'site.js'), 'utf8');
  const jsIdxHits = siteJs.match(/index\.html/g)?.length || 0;
  for (let i = 0; i < jsIdxHits; i++) addOcc(byTarget, 'index.html', { from: 'assets/site.js', attr: 'string', selector: 'site.js', placeKind: 'site-js', hash: null });
  const robotsTxt = await readFile(join(root, 'robots.txt'), 'utf8');
  const robotsDirectives = robotsTxt.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const out = {};
  for (const p of allPages) {
    const occs = byTarget.get(p.path) || [];
    const byPlaceKind = {};
    for (const o of occs) byPlaceKind[o.placeKind] = (byPlaceKind[o.placeKind] || 0) + 1;
    out[p.path] = { type: p.type, total: occs.length, filesCount: new Set(occs.map((o) => o.from)).size, withHashCount: occs.filter((o) => o.hash).length, byPlaceKind, occurrences: occs };
  }
  return {
    publicPagesCount: allPages.filter((p) => p.type !== 'przekierowanie').length,
    redirectsCount: allPages.filter((p) => p.type === 'przekierowanie').length,
    extraAttrs,
    robotsDirectives,
    byTarget: out,
  };
}
