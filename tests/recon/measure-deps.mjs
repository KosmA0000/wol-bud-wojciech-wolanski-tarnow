import { REPO_ROOT } from './lib-html.mjs';
import { writeJson, writeMd, mdTable } from './lib-md.mjs';
import { measureUrlDeps } from './deps-urls.mjs';
import { measureNameDeps } from './deps-names.mjs';
import { measureCompanyData } from './deps-company.mjs';
import { measureAnchors } from './deps-anchors.mjs';
import { measureMedia } from './deps-media.mjs';
import { measureOrderAndOther } from './deps-order-other.mjs';

const exFiles = (arr) => arr.length <= 4 ? arr.map((x) => `\`${x}\``).join(', ') : `${arr.length} plików (${arr.slice(0, 3).map((x) => `\`${x}\``).join(', ')}…)`;
const fmtMap = (obj) => Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(', ');

function buildGapsVsSection7(urls, names, company, anchors, media, order) {
  const ph = company.inGlobals.find((x) => x.key === 'phoneMain');
  const mapsSum = company.candidates.filter((x) => x.key.startsWith('maps')).reduce((s, x) => s + x.totalHtml, 0);
  const nameDiffs = Object.values(names.pages).filter((p) => p.variantsDiffer).length;
  const descWithName = Object.values(names.pages).filter((p) => p.byPlace['meta:description']).length;
  return [
    ['utwórz stronę dowolnego typu', 'Brak reguły kolejności wpisu u rodzica (określa sąsiadów prev/next) oraz niespójności etykiet h1/titleCore/manifest.label', `${nameDiffs} stron ma różne h1 vs titleCore/manifest.label; product-nav-bar: ${order.prodNavExactLinear} liniowych + ${order.prodNavCyclic} cyklicznych / ${order.productsCount}`],
    ['zmień adres (slug, folder)', 'Brak osobnych atrybutów `data-mobile-home-href`, linków z `#kotwicą` w treści, `product-nav-bar` (`pnav-prev`/`next`/`all`) oraz `index.html` w `assets/site.js`', `atrybuty href + data-desktop-href + data-mobile-home-href, pnav na ${order.productsCount} produktach, site.js`],
    ['zmień nazwę / tytuł', 'Brak `meta[name="description"]`, etykiet sąsiadów w `product-nav-bar` oraz ostrzeżenia o odmianie fleksyjnej w treści (`brak danych:` bez lematyzatora)', `${descWithName} stron ma nazwę w meta description; sąsiedzi powtarzają nazwę produktu w pnav (${order.productsCount} str.)`],
    ['przenieś (zmień rodzica)', 'Brak przebudowy linku `pnav-all` („Wszystkie z kategorii …”) na przenoszonym produkcie i przeliczenia prefiksu głębokości w zasobach strony', `pnav-all obecne na wszystkich ${order.productsCount} produktach`],
    ['zmień kolejność', 'Sekcja 7 wymienia tylko produkty i `product-nav-bar`; pomija kolejność kategorii głównych (`homeGrid`/`ofertaGrid`/`quickNav`/`sidebar`), podkategorii, usług i salonów', `kategorie główne w 4 listach (${order.categoryOrders.homeGrid.length}/${order.categoryOrders.ofertaGrid.length}/${order.categoryOrders.quickNav.length}/${order.categoryOrders.sidebar.length}), salony w 4 miejscach`],
    ['ukryj', 'Brak sprzątania lub podmiany istniejących linków w treści (poza regionami) i aktualizacji `product-nav-bar` sąsiadów do ukrytej strony', `niezależne linki w treści i sąsiedzi product-nav-bar`],
    ['usuń stronę', 'Brak reguły czyszczenia osieroconych plików w `img/` i zewnętrznych odwołań `#id` do sekcji usuwanej strony', `${media.unusedFilesCount}/${media.totalFilesInImg} nieużywanych plików img/; ${anchors.crossPageLinks.length} celów linków #id z innych stron`],
    ['zmień id sekcji / usuń sekcję', 'Brak zakodowanych ID w `assets/site.js` (`getElementById` i `#start`), `assets/home-content.json`/`home-content.js` oraz `data-home-link` w okruszkach', `site.js ma ${anchors.scriptIds.siteJsGetElementById.length} twardych getElementById; home-content.json 3 sekcje`],
    ['zmień dane firmy', 'Brak `tel:` bez `+48`, 3 dodatkowych telefonów salonów, NIP, adresów/godzin/linków Google Maps spoza `site-globals.json`, roku `1995`/`31 lat`, oceny Google i domeny', `534 091 021: ${ph.totalHtml} HTML (${ph.byFormat['href:telBez48'] || 0} bez +48) + ${ph.totalNonHtml} JSON; Google Maps ${mapsSum}; ${company.candidates.length} grup spoza site-globals`],
    ['podmień / usuń zdjęcie', 'Brak `data-src`, `data-lightbox-src`, `data-palette-src`, `link[rel=icon]`, `css:url(...)` w `site.css`, wpisu w `cms-manifest.json` (`images[]`) i niespójnych `alt`', `${media.usedFilesCount}/${media.totalFilesInImg} użytych w HTML/CSS/globals; ${media.multiAltFiles.length} plików ma różne alt; manifest ma +${media.inImgNotInManifest.length}/-${media.inManifestNotInImg.length}`],
  ];
}

export async function measureDeps(outDir, pagesData, root = REPO_ROOT) {
  const [urls, names, company, anchors, media, { order, other }] = await Promise.all([
    measureUrlDeps(pagesData, root),
    measureNameDeps(pagesData, root),
    measureCompanyData(pagesData, root),
    measureAnchors(pagesData, root),
    measureMedia(pagesData, root),
    measureOrderAndOther(pagesData, root),
  ]);
  const gapsVsSection7 = buildGapsVsSection7(urls, names, company, anchors, media, order);
  const ph = company.inGlobals.find((x) => x.key === 'phoneMain');
  const rol = names.pages['kategorie/zewnetrzne/index.html'];
  const adapt = urls.byTarget['produkty/adaptacyjne/index.html'];

  const data = {
    meta: { totalPagesMeasured: Object.keys(urls.byTarget).length, publicPagesMeasured: urls.publicPagesCount, redirectsMeasured: urls.redirectsCount, phoneMainHtml: ph.totalHtml, phoneMainTotal: ph.totalAll },
    urls, names, company, anchors, media, order, other,
    gapsVsSection7: gapsVsSection7.map(([operation, missingInSection7, measuredEvidence]) => ({ operation, missingInSection7, measuredEvidence })),
  };
  await writeJson(outDir, 'zaleznosci.json', data);

  const urlRows = Object.entries(urls.byTarget).sort((a, b) => b[1].total - a[1].total).slice(0, 25)
    .map(([p, v]) => [`\`${p}\` (${v.type})`, String(v.total), fmtMap(v.byPlaceKind), `${v.filesCount} źródeł`]);
  const nameRows = Object.entries(names.pages).sort((a, b) => b[1].total - a[1].total).slice(0, 25)
    .map(([p, v]) => [`\`${v.h1 || v.titleCore}\` (\`${p}\`)`, `${v.total} (dokł. ${v.exact}, wielk. lit. ${v.caseVariant})`, fmtMap(v.byPlace), exFiles(v.files)]);
  const compRows = [...company.inGlobals, ...company.candidates]
    .map((c) => [`${c.label}${c.inGlobals ? ' *(site-globals)*' : ' *(kandydat)*'}`, `${c.totalAll} (${c.totalHtml} HTML + ${c.totalNonHtml} inne)`, `${fmtMap(c.byPlace)} | fmt: ${fmtMap(c.byFormat)}`, `${c.htmlFilesCount} HTML + ${c.nonHtmlFiles.length} inne`]);
  const anchorRows = [
    ...anchors.crossPageLinks.slice(0, 15).map((a) => [`\`${a.key}\``, String(a.count), `link cross-page (${a.hasDataHomeLink ? 'data-home-link' : 'treść/karta'}), cel=${a.targetExists ? 'OK' : 'BRAK'}`, `${a.sourcesCount} plików`]),
    ...anchors.mobileAnchors.map((m) => [`\`#${m.id}\` (mobilna: ${m.label})`, String(m.count), 'menu data-mobile-home-href + site-globals', `${m.filesCount} plików`]),
  ];
  const mediaRows = media.topUsed.slice(0, 15).map((m) => [`\`${m.path}\``, String(m.usesCount), `HTML/CSS/globals (manifest=${m.inManifest ? 'TAK' : 'NIE'})`, `${m.filesCount} plików`]);

  await writeMd(outDir, 'zaleznosci.md', [
    '# Pełna mapa zależności „zmień wszędzie” (Z-006)',
    '',
    'Pełne surowe dane ze skryptów `tests/recon/`: `zaleznosci.json`.',
    '',
    '## Kluczowe liczby (pomiar automatyczny)',
    `- Stron w mapie adresów: **${Object.keys(urls.byTarget).length}** (${urls.publicPagesCount} publiczne + ${urls.redirectsCount} przekierowań); inne atrybuty \`.html\`: **${urls.extraAttrs.length}**`,
    `- Telefon \`534 091 021\`: **${ph.totalHtml}** wystąpień w **${ph.htmlFilesCount}** plikach HTML (${fmtMap(ph.byFormat)}) + **${ph.totalNonHtml}** poza HTML = **${ph.totalAll}** łącznie`,
    `- Nazwa „${rol?.h1}”: **${rol?.exact}** dopasowań dokładnych (+ **${rol?.caseVariant}** wariantów wielkości liter = **${rol?.total}**) w **${rol?.filesCount}** plikach`,
    `- Adres \`produkty/adaptacyjne/index.html\`: **${adapt?.total || 0}** odwołań (${fmtMap(adapt?.byPlaceKind)})`,
    `- Pliki w \`img/\`: **${media.totalFilesInImg}** łącznie, **${media.usedFilesCount}** użytych w HTML/CSS/site-globals, **${media.unusedFilesCount}** nieużywanych, **${media.multiAltFiles.length}** plików z różnymi \`alt\``,
    `- Nawigacja \`product-nav-bar\`: **${order.prodNavExactLinear}/${order.productsCount}** dokładnie liniowo wg kolejności kart kategorii (cykliczne: **${order.prodNavCyclic}**, anomalie: **${order.prodNavAnomalies.length}**)`,
    '',
    '## 1. Adresy stron (TOP 25 wg liczby odwołań; całość w `zaleznosci.json`)',
    mdTable(['Wartość (cel)', 'Liczba wystąpień', 'Rodzaje miejsc', 'Pliki'], urlRows),
    '',
    '## 2. Nazwy stron (TOP 25 wg wystąpień; odmiana fleksyjna: `brak danych:`)',
    mdTable(['Wartość (nazwa)', 'Liczba wystąpień', 'Rodzaje miejsc', 'Pliki'], nameRows),
    '',
    '## 3. Dane firmy z `site-globals.json` i kandydaci spoza niego',
    mdTable(['Wartość', 'Liczba wystąpień', 'Rodzaje miejsc i formaty', 'Pliki'], compRows),
    '',
    `## 4. ID sekcji (linki z innych stron + kotwice mobilne; \`site.js\` ma ${anchors.scriptIds.siteJsGetElementById.length} twardych \`getElementById\`)`,
    mdTable(['Wartość (#id)', 'Liczba wystąpień', 'Rodzaj miejsca', 'Pliki'], anchorRows),
    '',
    '## 5. Zdjęcia z `img/` (TOP 15 użyć + statystyki nieużywanych i `alt`)',
    `- Użycia wg atrybutu: ${fmtMap(media.byAttrCounts)} · brakujący \`alt\`: **${media.missingAltUsages.length}** · rozbieżne z \`cms-manifest\`: +${media.inImgNotInManifest.length}/-${media.inManifestNotInImg.length}`,
    mdTable(['Wartość (plik img/)', 'Liczba wystąpień', 'Rodzaje miejsc', 'Pliki'], mediaRows),
    '',
    '## 6. Kolejność elementów',
    mdTable(['Powiązanie kolejności', 'Wynik pomiaru'], [
      ['Karty w kategorii ↔ `product-nav-bar`', `${order.prodNavExactLinear}/${order.productsCount} liniowo (${order.prodNavCyclic} cyklicznych), anomalie: ${order.prodNavAnomalies.length}`],
      ['Kategorie główne (home / Oferta / pasek / sidebar)', `home=${order.categoryOrders.homeGrid.length}, oferta=${order.categoryOrders.ofertaGrid.length}, pasek=${order.categoryOrders.quickNav.length}, sidebar=${order.categoryOrders.sidebar.length}`],
      ['Podkategorie (home pigułki vs `subcat-grid`)', `home=${order.subcatOrders.homeExtraPills.length}, rolety=${order.subcatOrders.roletySubcats.length}, parapety=${order.subcatOrders.parapetySubcats.length}`],
      ['Usługi (home `.home-services-grid` vs `uslugi/index.html`)', `home=${order.servicesOrder.home.length}, uslugi=${order.servicesOrder.uslugiIds.length}`],
      ['Menu desktop vs `site-globals.json` / stopka', `menu=${order.menuMatchesGlobals ? 'ZGODNE' : 'RÓŻNE'}, stopka=${order.footerMatchesGlobals ? 'ZGODNE' : 'RÓŻNE'}`],
      ['Salony (Nasze sklepy)', `${order.storesOrder.naszeSklepy.join(', ')}`],
    ]),
    '',
    '## 7. Inne powtarzające się elementy',
    `- Ceny kwotowe w HTML: **${other.prices.numericPricesCount}** (frazy „bezpłatna wycena”: **${other.prices.freeQuotePhraseCount}**); katalogi PDF: **${other.pdfs.count}** linków na **${other.pdfs.pagesCount}** stronach`,
    `- Marki/producenci o >=1 użyciu: **${other.brands.length}** (top: ${other.brands.slice(0, 6).map((b) => `${b.name} (${b.hits})`).join(', ')})`,
    `- Powtarzalne CTA: ${other.repeatedCtas.slice(0, 4).map((c) => `„${c.text}” (${c.count}×)`).join(', ')}`,
    `- Meta/SEO/zasoby: JSON-LD **${other.metaAndAssets.jsonLd}**, og: **${other.metaAndAssets.ogTags}**, canonical **${other.metaAndAssets.canonical}**, Figtree **${other.metaAndAssets.googleFontsFigtree}**, CSS: ${fmtMap(other.metaAndAssets.cssVersions)}, JS: ${fmtMap(other.metaAndAssets.jsVersions)}, \`robots.txt\`: ${urls.robotsDirectives.join(' | ')}`,
    '',
    '## Różnice i braki względem tabeli z sekcji 7 `docs/site-conventions.md`',
    mdTable(['Operacja z sekcji 7', 'Czego brakuje w tabeli sekcji 7', 'Dowód z pomiaru'], gapsVsSection7),
  ]);

  return { urlsCount: Object.keys(urls.byTarget).length, phoneMainAll: ph.totalAll, unusedImages: media.unusedFilesCount, gapsCount: gapsVsSection7.length };
}
