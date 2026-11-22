import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { REPO_ROOT, loadHtml, cleanText } from './lib-html.mjs';
import { writeJson, writeMd, mdTable } from './lib-md.mjs';

const COMPONENTS = [
  ['hero', 'section.hero', 'Baner główny (Hero) z paralaksą i CTA'],
  ['trust', 'section.trust', 'Sekcja zaufania „O firmie” na stronie głównej'],
  ['home-catalog-grid', '.home-catalog-grid > .home-cat-card', 'Kafelek głównej kategorii (zdjęcie + tytuł + CTA)'],
  ['home-extra-category', '.home-extra-categories > .home-extra-category', 'Pigułka dodatkowej kategorii pod siatką'],
  ['home-featured-product', '.home-featured-product', 'Karta polecanego produktu na home'],
  ['home-service-item', '.home-service-item', 'Karta usługi (details/summary) na home'],
  ['reviews', 'section.reviews .review', 'Karta opinii Google w karuzeli'],
  ['realization-card', '.realization-card', 'Karta grupy realizacji na home'],
  ['partner-logo', '.partner-logo', 'Logo partnera w sekcji Dostawcy'],
  ['store-item-home', '.kt-store-item', 'Karta salonu sprzedaży w sekcji Kontakt'],
  ['subpage-head', 'header.subpage-head', 'Nagłówek podstrony (eyebrow, h1, lead)'],
  ['cat-quick-nav', '.cat-quick-nav', 'Pasek szybkiej nawigacji po kategoriach'],
  ['cat-prod-card', '.cat-prod-card', 'Karta produktu w siatce kategorii'],
  ['profile-row', '.profile-row', 'Wiersz profilu/systemu (przekrój + lightbox + opis)'],
  ['product-gallery', '.product-gallery', 'Galeria produktu ze sceną i paskiem miniatur'],
  ['photo-strip', '.photo-strip', 'Przewijany poziomy pasek zdjęć (galeria/montaż/realizacje)'],
  ['mobile-details', 'details.mobile-details', 'Rozwijany blok treści (`data-responsive-disclosure`)'],
  ['service-card', 'article.service-card', 'Karta usługi na podstronie Usługi'],
  ['service-feature-box', '.service-feature-box', 'Wyróżniony boks z linkiem (np. fotoreportaż montażu)'],
  ['montage-step-card', '.montage-step-card', 'Karta kroku montażu z miniaturą i podpisem'],
  ['product-nav-bar', 'nav.product-nav-bar', 'Nawigacja Poprzedni / Wszystkie z kategorii / Następny'],
  ['cta-banner-dark', '.cta-banner-dark', 'Ciemny baner CTA na końcu treści podstrony'],
  ['sidebar-box', 'aside.subpage-sidebar .sidebar-box', 'Boks w panelu bocznym (wycena / salony / kategorie)'],
  ['directory-list-grid', '.product-group-box', 'Grupa linków w spisie produktów (`produkty/index.html`)'],
  ['subcat-card', '.subcat-grid > .subcat-card', 'Karta podkategorii (np. Parapety i blaty, Osłony okienne)'],
  ['brand-box', '.brand-box', 'Boks z katalogami producentów (`.brand-chips`)'],
  ['category-feature', 'figure.category-feature', 'Zdjęcie główne kategorii (drzwi)'],
  ['product-specs-box', 'details.product-specs-box', 'Rozwijana specyfikacja techniczna produktu'],
  ['palette-box', 'section.palette-box', 'Próbnik kolorystyki z przełączaniem zdjęć (parapety)'],
  ['product-downloads-box', '.product-downloads-box', 'Boks plików do pobrania / kart technicznych'],
  ['sill-producer-logo', '.sill-producer-logo', 'Logo producenta parapetu'],
  ['realization-group', 'section.realization-group', 'Grupa galerii realizacji (`#okna`, `#bramy`, `#drzwi`)'],
  ['location-card', '.location-grid > .location-card', 'Karta salonu sprzedaży na podstronie Nasze sklepy'],
];

function summarizeChildren(el) {
  if (!el) return [];
  return el.childNodes
    .filter((n) => n.nodeType === 1)
    .map((c) => {
      const tag = c.rawTagName.toLowerCase();
      const cls = (c.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).join('.');
      const id = c.getAttribute('id') ? `#${c.getAttribute('id')}` : '';
      const h = cleanText(c.querySelector('h1,h2,h3')?.text || '').slice(0, 60);
      return { sig: `${tag}${id}${cls ? '.' + cls : ''}`, heading: h || null };
    });
}

export async function measureSections(outDir, pagesData, root = REPO_ROOT) {
  const publicPages = pagesData.pages.filter((p) => p.type !== 'przekierowanie' && p.type !== 'panel');
  const siteCss = await readFile(join(root, 'assets', 'site.css'), 'utf8');
  const byType = {};
  const perPage = [];
  const compStats = new Map(COMPONENTS.map(([id, sel, desc]) => [id, { id, selector: sel, description: desc, totalInstances: 0, pages: [], cssFound: false }]));

  for (const [id, sel] of COMPONENTS) {
    const classToken = sel.match(/\.([a-zA-Z0-9_-]+)/g)?.pop() || '';
    compStats.get(id).cssFound = classToken ? siteCss.includes(classToken) : false;
  }

  for (const p of publicPages) {
    const { dom } = await loadHtml(p.path, root);
    const main = dom.querySelector('main');
    const wrap = dom.querySelector('main > .wrap');
    const content = dom.querySelector('.subpage-content');
    const topBlocks = p.type === 'home' ? summarizeChildren(main) : summarizeChildren(wrap);
    const contentBlocks = summarizeChildren(content);
    const seqKey = topBlocks.map((b) => b.sig).join(' -> ') + (content ? ' || ' + contentBlocks.map((b) => b.sig).join(' -> ') : '');
    perPage.push({ path: p.path, type: p.type, topBlocks, contentBlocks, sequenceKey: seqKey });

    if (!byType[p.type]) byType[p.type] = [];
    byType[p.type].push({ path: p.path, sequenceKey: seqKey });

    for (const [id, sel] of COMPONENTS) {
      const hits = dom.querySelectorAll(sel);
      if (hits.length > 0) {
        const st = compStats.get(id);
        st.totalInstances += hits.length;
        st.pages.push({ path: p.path, count: hits.length });
      }
    }
  }

  const components = [...compStats.values()].map((c) => ({ ...c, pagesCount: c.pages.length }));
  await writeJson(outDir, 'sections.json', { publicCount: publicPages.length, components, byType, perPage });

  const typeLines = ['# Umiejscowienie i kolejność sekcji według typu strony', '', 'Pełne dane w `sections.json`.', ''];
  for (const [type, list] of Object.entries(byType)) {
    const grouped = new Map();
    for (const it of list) {
      if (!grouped.has(it.sequenceKey)) grouped.set(it.sequenceKey, []);
      grouped.get(it.sequenceKey).push(it.path);
    }
    typeLines.push(`## Typ: \`${type}\` (${list.length} stron)`);
    for (const [seq, paths] of [...grouped.entries()].sort((a, b) => b[1].length - a[1].length)) {
      typeLines.push(`- **${paths.length} str.** (\`${paths.slice(0, 4).join('`, `')}${paths.length > 4 ? `\` +${paths.length - 4}` : '`'}` + `): \`${seq}\``);
    }
    typeLines.push('');
  }
  await writeMd(outDir, 'umiejscowienie.md', typeLines);

  const compRows = components.map((c) => [
    c.id, `\`${c.selector}\``, c.cssFound ? 'TAK' : 'NIE', String(c.pagesCount), String(c.totalInstances), c.description,
  ]);
  await writeMd(outDir, 'katalog-komponentow.md', [
    '# Katalog powtarzalnych komponentów strony WOL-BUD',
    '',
    'Zmierzono na wszystkich stronach publicznych z weryfikacją obecności klas w `assets/site.css`. Pełna lista wystąpień: `sections.json`.',
    '',
    mdTable(['Komponent', 'Selektor HTML', 'W `site.css`', 'Liczba stron', 'Instancje', 'Opis'], compRows),
  ]);

  return { components, byType };
}
