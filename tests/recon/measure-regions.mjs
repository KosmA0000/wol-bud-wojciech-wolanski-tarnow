import { REPO_ROOT, loadHtml, cleanText, expectedPrefix, normalizeUrls } from './lib-html.mjs';
import { writeJson, writeMd, mdTable } from './lib-md.mjs';

const REGION_SELECTORS = [
  ['header', 'header.bar'],
  ['menuPanel', 'nav#site-menu'],
  ['footer', 'footer'],
  ['btnBack', '.page-nav-bar .btn-back'],
  ['catQuickNav', '.cat-quick-nav'],
  ['sidebar', 'aside.subpage-sidebar'],
  ['lightbox', '#lightboxModal'],
  ['scrollTop', '#scrollTopBtn'],
  ['contactBubbles', 'nav.contact-bubbles'],
];

function stripActive(html, name) {
  let out = html;
  if (name === 'catQuickNav') out = out.replace(/ is-active/g, '');
  if (name === 'sidebar') out = out.replace(/ style="font-weight:700; color:var\(--highlight\);"/g, '');
  return out;
}

export async function measureRegions(outDir, pagesData, root = REPO_ROOT) {
  const publicPages = pagesData.pages.filter((p) => p.type !== 'przekierowanie' && p.type !== 'panel');
  const variants = Object.fromEntries(REGION_SELECTORS.map(([k]) => [k, new Map()]));
  const missing = Object.fromEntries(REGION_SELECTORS.map(([k]) => [k, []]));
  const headAssets = new Map();
  const breadcrumbs = [];
  const homeIds = new Set();
  const mobileAnchors = new Map();

  for (const p of publicPages) {
    const { dom } = await loadHtml(p.path, root);
    if (p.path === 'index.html') {
      for (const el of dom.querySelectorAll('[id]')) homeIds.add(el.getAttribute('id'));
    }
    const css = dom.querySelector('link[href*="site.css"]')?.getAttribute('href') || 'BRAK';
    const js = dom.querySelector('script[src*="site.js"]')?.getAttribute('src') || 'BRAK';
    const pref = expectedPrefix(p.path);
    const assetKey = `css=${css.replace(pref, '{ROOT}')} | js=${js.replace(pref, '{ROOT}')} | theme=${p.themeColor || 'BRAK'}`;
    if (!headAssets.has(assetKey)) headAssets.set(assetKey, []);
    headAssets.get(assetKey).push(p.path);

    for (const a of dom.querySelectorAll('nav#site-menu a[data-mobile-home-href]')) {
      const val = a.getAttribute('data-mobile-home-href');
      const m = val.match(/#([^#]+)$/);
      const id = m ? m[1] : null;
      if (!mobileAnchors.has(id)) mobileAnchors.set(id, { id, label: cleanText(a.text), rawExample: val, pagesCount: 0 });
      mobileAnchors.get(id).pagesCount += 1;
    }

    for (const [name, sel] of REGION_SELECTORS) {
      const el = dom.querySelector(sel);
      if (!el) {
        missing[name].push(p.path);
        continue;
      }
      const norm = stripActive(normalizeUrls(el.outerHTML, p.path), name);
      if (!variants[name].has(norm)) variants[name].set(norm, []);
      variants[name].get(norm).push(p.path);
    }

    const bc = dom.querySelector('nav.breadcrumbs');
    if (!bc) {
      breadcrumbs.push({ path: p.path, type: p.type, present: false, items: [], pattern: 'BRAK' });
    } else {
      const links = bc.querySelectorAll('a').map((a) => ({ text: cleanText(a.text), href: a.getAttribute('href'), hasHomeAttr: a.hasAttribute('data-home-link') }));
      const current = cleanText(bc.querySelector('[aria-current="page"]')?.text || '');
      const pattern = [...links.map((l) => l.text), current].filter(Boolean).join(' / ');
      breadcrumbs.push({ path: p.path, type: p.type, present: true, links, current, pattern, homeHref: links[0]?.href || null });
    }
  }

  const anchorReport = [...mobileAnchors.values()].map((a) => ({ ...a, existsOnHome: homeIds.has(a.id) }));
  const bcDeviations = breadcrumbs.filter((b) => {
    if (b.type === 'home') return b.present;
    if (!b.present) return true;
    if (b.type === 'kategoria') return b.links.length !== 2 || b.links[1]?.text !== 'Oferta';
    if (b.type === 'produkt') return b.links.length !== 2 || !b.links[1]?.href?.includes('kategorie/');
    return b.homeHref && !b.homeHref.includes('#oferta');
  });

  await writeJson(outDir, 'breadcrumbs.json', { totalPublic: publicPages.length, deviationsCount: bcDeviations.length, deviations: bcDeviations, pages: breadcrumbs });

  const regRows = REGION_SELECTORS.map(([name, sel]) => {
    const vCount = variants[name].size;
    const present = publicPages.length - missing[name].length;
    const minority = [...variants[name].values()].sort((a, b) => b.length - a.length).slice(1).flat();
    return [name, `\`${sel}\``, `${present} / ${publicPages.length}`, String(vCount), minority.length ? minority.map((x) => `\`${x}\``).join(', ') : 'brak'];
  });
  const anchorRows = anchorReport.map((a) => [`\`#${a.id}\``, a.label, String(a.pagesCount), a.existsOnHome ? 'TAK' : 'NIE (ZEPSUTA)']);

  await writeMd(outDir, 'regions.md', [
    '# Wspólne bloki (regiony) i kotwice mobilne',
    '',
    `Zmierzono na **${publicPages.length}** stronach publicznych (bez przekierowań i \`panel/index.html\`).`,
    '',
    '## Spójność wspólnych bloków (po normalizacji prefiksów ścieżek i stanu aktywnego)',
    '',
    mdTable(['Region', 'Selektor', 'Obecny na', 'Warianty', 'Pliki odbiegające od głównego wariantu'], regRows),
    '',
    '### Braki regionów na stronach publicznych',
    ...REGION_SELECTORS.map(([n]) => `- **${n}**: brak na ${missing[n].length} str.: ${missing[n].length <= 15 ? (missing[n].map((x) => `\`${x}\``).join(', ') || 'brak') : `${missing[n].length} stron (głównie podstrony bez tego regionu)`}`),
    '',
    '## Zasoby `<head>` i obliczanie ścieżek względnych',
    '- Głębokość 0 (`index.html`): prefiks pusty `""` (`assets/site.css`, `img/...`).',
    '- Głębokość 1 (`oferta/index.html`, `uslugi/index.html`, itd.): prefiks `../`.',
    '- Głębokość 2 (`kategorie/<slug>/index.html`, `produkty/<slug>/index.html`, `promocje/<slug>/index.html`): prefiks `../../`.',
    '- Głębokość 4 (`kategorie/aglomarmur/page/2/index.html` — przekierowanie): prefiks `../../../../`.',
    '',
    'Warianty `<head>` (CSS / JS / theme-color):',
    ...[...headAssets.entries()].map(([k, list]) => `- \`${k}\` — **${list.length}** stron${list.length <= 5 ? ` (${list.map((x) => `\`${x}\``).join(', ')})` : ''}`),
    '',
    '## Kotwice mobilne w menu (`data-mobile-home-href`)',
    '',
    mdTable(['Kotwica na `index.html`', 'Etykieta w menu', 'Liczba stron z atrybutem', 'Istnieje w `index.html`'], anchorRows),
  ]);

  await writeMd(outDir, 'breadcrumbs.md', [
    '# Okruszki (breadcrumbs) — wzorce i odchylenia',
    '',
    `Pełne dane: \`breadcrumbs.json\`. Stron publicznych: **${publicPages.length}**, odchyleń od wzorca: **${bcDeviations.length}**.`,
    '',
    '## Odchylenia od oczekiwanych wzorców',
    '',
    mdTable(['Strona', 'Typ', 'Wzorzec faktyczny', 'Href „Strona główna”'], bcDeviations.map((d) => [`\`${d.path}\``, d.type, d.pattern, `\`${d.homeHref || 'BRAK'}\``])),
  ]);

  return { anchorReport, bcDeviations };
}
