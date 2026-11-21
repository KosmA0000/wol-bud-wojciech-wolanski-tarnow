// Biblioteka szablonów i narzędzi ścieżek CMS dla witryny WOL-BUD Tarnów

const DEFAULT_GLOBALS = {
  siteName: 'WOL-BUD Tarnów',
  companyName: 'WOL-BUD Wojciech Wolański',
  phoneDisplay: '534 091 021',
  phoneHref: 'tel:+48534091021',
  email: 'biuro@wol-bud.com.pl',
  facebookUrl: 'https://www.facebook.com/sklep.wol.bud.tarnow',
  facebookLabel: 'facebook.com/sklep.wol.bud.tarnow',
  footerText:
    'WOL-BUD Wojciech Wolański · Sprzedaż i profesjonalny montaż okien, drzwi i bram od 1995 roku · Tarnów, Radłów',
  siteCss: 'assets/site.css?v=a2d001b673',
  siteJs: 'assets/site.js?v=97fa1106ac',
  googleReviewsUrl:
    'https://www.google.com/maps/place/WOL-BUD+Wojciech+Wola%C5%84ski/@50.018426,20.948448,17z/data=!4m8!3m7!1s0x473d849d210e031b:0x4f5e253fc57bd81d!8m2!3d50.018426!4d20.948448!9m1!1b1!16s%2Fg%2F1pv5tkfkh?hl=pl',
  mapsTarnowUrl:
    'https://www.google.com/maps/dir/?api=1&destination=WOL-BUD+ul.+Gie%C5%82dowa+10,+33-100+Tarn%C3%B3w',
  mapsRadlowUrl:
    'https://www.google.com/maps/dir/?api=1&destination=ul.+Kolejowa+5,+33-130+Rad%C5%82%C3%B3w',
};

const SVG_MAIL =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/></svg>';

const SVG_PHONE =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 3.5h2.1l1.4 4-1.8 1.5a14 14 0 0 0 6.1 6.1l1.5-1.8 4 1.4v2.1c0 1.1-.9 2-2 2A15.5 15.5 0 0 1 5.2 5.5c0-1.1.9-2 2-2Z"/></svg>';

const SVG_FB =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.04C6.5 2.04 2 6.53 2 12.06c0 5 3.66 9.15 8.44 9.9v-7h-2.54v-2.9h2.54V9.85c0-2.51 1.49-3.89 3.78-3.89 1.09 0 2.23.19 2.23.19v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.9h-2.33v7A10 10 0 0 0 22 12.06C22 6.53 17.5 2.04 12 2.04Z"/></svg>';

const SVG_PIN =
  '<svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>';

const SVG_EXT_ARROW =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M17 7H8M17 7v9"></path></svg>';

const SIDEBAR_CATEGORIES = [
  { label: 'Okna PCV', path: 'kategorie/okna-pcv/index.html' },
  { label: 'Drzwi wejściowe', path: 'kategorie/drzwi-zewnetrzne/index.html' },
  { label: 'Drzwi wewnętrzne', path: 'kategorie/drzwi-wewnetrzne/index.html' },
  { label: 'Bramy garażowe', path: 'kategorie/bramy-garazowe/index.html' },
  { label: 'Stolarka aluminiowa', path: 'kategorie/stolarka-aluminiowa/index.html' },
  { label: 'Osłony okienne', path: 'kategorie/rolety/index.html' },
  { label: 'Żaluzje i plisy', path: 'kategorie/zaluzje-plisy/index.html' },
  { label: 'Parapety i blaty', path: 'kategorie/parapety-blaty/index.html' },
  { label: 'Moskitiery', path: 'kategorie/moskitiery/index.html' },
];

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function uniqueSectionId(base) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let suffix = '';
  for (let i = 0; i < 4; i += 1) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  const safeBase = slugifyPath(base) || 'blok';
  return `sekcja-${safeBase}-${suffix}`;
}

function normalizePagePath(pagePath) {
  if (!pagePath || typeof pagePath !== 'string') return '';
  const withoutHash = pagePath.split('#')[0].split('?')[0].trim();
  return withoutHash.replace(/\\/g, '/').replace(/^(\.\/|\/)+/, '');
}

/**
 * Zwraca prefiks względny względem katalogu głównego repozytorium.
 * Np. 'index.html' -> '', 'oferta/index.html' -> '../', 'kategorie/okna-pcv/index.html' -> '../../'.
 */
export function depthPrefix(pagePath) {
  const cleaned = normalizePagePath(pagePath);
  if (!cleaned) return '';
  const endsWithSlash = cleaned.endsWith('/');
  const segments = cleaned.split('/').filter(Boolean);
  const depth = endsWithSlash ? segments.length : Math.max(0, segments.length - 1);
  return '../'.repeat(depth);
}

/**
 * Zamienia ścieżkę względem katalogu głównego repozytorium na ścieżkę względną dla `pagePath`.
 */
export function toRelativeUrl(rootPath, pagePath = 'index.html') {
  if (rootPath == null) return '';
  const raw = String(rootPath).trim();
  if (!raw) return '';
  if (/^(https?:|\/\/|tel:|mailto:|data:|blob:|javascript:|#)/i.test(raw)) {
    return raw;
  }

  let pathPart = raw;
  let hashPart = '';
  const hashIdx = pathPart.indexOf('#');
  if (hashIdx !== -1) {
    hashPart = pathPart.slice(hashIdx);
    pathPart = pathPart.slice(0, hashIdx);
  }

  let queryPart = '';
  const queryIdx = pathPart.indexOf('?');
  if (queryIdx !== -1) {
    queryPart = pathPart.slice(queryIdx);
    pathPart = pathPart.slice(0, queryIdx);
  }

  const normalized = pathPart.replace(/\\/g, '/').replace(/^(\.\/|\/)+/, '');
  const prefix = depthPrefix(pagePath);
  return `${prefix}${normalized}${queryPart}${hashPart}`;
}

/**
 * Zamienia względny link lub ścieżkę obrazka z `pagePath` na ścieżkę względem katalogu głównego repo.
 * Dla linków zewnętrznych, tel:, mailto:, data:, blob:, javascript: zwraca null.
 */
export function toRootPath(href, pagePath = 'index.html') {
  if (href == null || typeof href !== 'string') return null;
  const raw = href.trim();
  if (!raw) return null;
  if (/^(https?:|\/\/|tel:|mailto:|data:|blob:|javascript:)/i.test(raw)) {
    return null;
  }

  let pathPart = raw;
  let hashPart = '';
  const hashIdx = pathPart.indexOf('#');
  if (hashIdx !== -1) {
    hashPart = pathPart.slice(hashIdx);
    pathPart = pathPart.slice(0, hashIdx);
  }

  let queryPart = '';
  const queryIdx = pathPart.indexOf('?');
  if (queryIdx !== -1) {
    queryPart = pathPart.slice(queryIdx);
    pathPart = pathPart.slice(0, queryIdx);
  }

  const cleanPage = normalizePagePath(pagePath) || 'index.html';
  const suffix = `${queryPart}${hashPart}`;

  if (!pathPart) {
    return `${cleanPage}${suffix}`;
  }

  const normalizedPath = pathPart.replace(/\\/g, '/');
  const trailingSlash = normalizedPath.endsWith('/');
  let baseParts = [];

  if (!normalizedPath.startsWith('/')) {
    baseParts = cleanPage.split('/').filter(Boolean);
    if (!cleanPage.endsWith('/') && baseParts.length > 0) {
      baseParts.pop();
    }
  }

  const relParts = normalizedPath.replace(/^\/+/, '').split('/');
  const stack = [...baseParts];

  for (const seg of relParts) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (stack.length > 0) stack.pop();
    } else {
      stack.push(seg);
    }
  }

  const resolved = stack.join('/');
  const finalPath = trailingSlash && resolved ? `${resolved}/` : resolved;
  return `${finalPath}${suffix}`;
}

/**
 * Tworzy czysty slug URL z transliteracją polskich znaków (UTF-8 -> [a-z0-9-]).
 */
export function slugifyPath(text) {
  if (text == null) return '';
  const polishMap = {
    ą: 'a',
    ć: 'c',
    ę: 'e',
    ł: 'l',
    ń: 'n',
    ó: 'o',
    ś: 's',
    ź: 'z',
    ż: 'z',
    Ą: 'a',
    Ć: 'c',
    Ę: 'e',
    Ł: 'l',
    Ń: 'n',
    Ó: 'o',
    Ś: 's',
    Ź: 'z',
    Ż: 'z',
    ü: 'u',
    Ü: 'u',
    ö: 'o',
    Ö: 'o',
    ä: 'a',
    Ä: 'a',
    ß: 'ss',
  };

  return String(text)
    .replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻüÜöÖäÄß]/g, (ch) => polishMap[ch] || ch)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function wrapSectionBody(innerHtml, inSubpage) {
  if (inSubpage) {
    return innerHtml;
  }
  return `  <div class="wrap">\n${innerHtml}\n  </div>`;
}

function resolveGlobals(globals = {}) {
  const g = globals && typeof globals === 'object' ? globals : {};
  const phoneDisplay = String(
    g.phoneDisplay || g.phone || g.telDisplay || DEFAULT_GLOBALS.phoneDisplay
  ).trim();
  const rawTel = String(g.phoneHref || g.telHref || '').trim();
  let phoneHref = rawTel;
  if (!phoneHref) {
    const digits = phoneDisplay.replace(/[^\d+]/g, '');
    if (digits.startsWith('+')) {
      phoneHref = `tel:${digits}`;
    } else if (digits.length === 9) {
      phoneHref = `tel:+48${digits}`;
    } else if (digits) {
      phoneHref = `tel:${digits}`;
    } else {
      phoneHref = DEFAULT_GLOBALS.phoneHref;
    }
  } else if (!phoneHref.startsWith('tel:')) {
    phoneHref = `tel:${phoneHref.replace(/[^\d+]/g, '')}`;
  }

  const email = String(g.email || g.mail || DEFAULT_GLOBALS.email).trim();
  const facebookUrl = String(
    g.facebookUrl || g.facebook || DEFAULT_GLOBALS.facebookUrl
  ).trim();
  const facebookLabel = String(
    g.facebookLabel ||
      facebookUrl.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '') ||
      DEFAULT_GLOBALS.facebookLabel
  ).trim();

  return {
    siteName: String(g.siteName || DEFAULT_GLOBALS.siteName).trim(),
    companyName: String(g.companyName || DEFAULT_GLOBALS.companyName).trim(),
    phoneDisplay,
    phoneHref,
    email,
    facebookUrl,
    facebookLabel,
    footerText: String(g.footerText || g.footerCopy || DEFAULT_GLOBALS.footerText).trim(),
    siteCss: String(g.siteCss || DEFAULT_GLOBALS.siteCss).trim(),
    siteJs: String(g.siteJs || DEFAULT_GLOBALS.siteJs).trim(),
  };
}

function makeSectionTemplate({ id, name, category, description, icon, render }) {
  const createHtml = (pagePath = 'index.html', inSubpage = false) =>
    render(pagePath, Boolean(inSubpage));
  return {
    id,
    name,
    category,
    description,
    icon,
    createHtml,
    createSubpageHtml: (pagePath = 'index.html') => createHtml(pagePath, true),
  };
}

/**
 * 10 pełnych sekcji WOL-BUD gotowych do wstawienia na stronę główną lub podstronę.
 */
export const SECTION_TEMPLATES = [
  makeSectionTemplate({
    id: 'catalog-grid',
    name: 'Siatka kafelków oferty',
    category: 'Oferta',
    description: 'Nagłówek oferty i siatka 3 kafelków kategorii ze zdjęciami i linkami.',
    icon: '⊞',
    render(pagePath, inSubpage) {
      const secId = uniqueSectionId('catalog-grid');
      const rel = (p) => toRelativeUrl(p, pagePath);
      const inner = `    <div class="offer-head">
      <div>
        <span class="eyebrow">Katalog produktów</span>
        <h2>Sprawdź naszą ofertę</h2>
      </div>
      <p>Wybierz kategorię stolarki otworowej dopasowaną do Twojego domu lub inwestycji.</p>
    </div>
    <div class="home-catalog-grid">
      <a class="home-cat-card" href="${rel('kategorie/okna-pcv/index.html')}">
        <div class="home-cat-thumb">
          <img src="${rel('img/products/okno-infinity-passive-83md.webp')}" alt="Okna PCV" loading="lazy" decoding="async">
        </div>
        <div class="home-cat-body">
          <h3>Okna PCV</h3>
          <div class="home-cat-cta">Zobacz ofertę <span>↗</span></div>
        </div>
      </a>
      <a class="home-cat-card" href="${rel('kategorie/drzwi-zewnetrzne/index.html')}">
        <div class="home-cat-thumb">
          <img src="${rel('img/products/drzwi-zewnetrzne-stalowe.webp')}" alt="Drzwi wejściowe" loading="lazy" decoding="async">
        </div>
        <div class="home-cat-body">
          <h3>Drzwi wejściowe</h3>
          <div class="home-cat-cta">Zobacz ofertę <span>↗</span></div>
        </div>
      </a>
      <a class="home-cat-card" href="${rel('kategorie/bramy-garazowe/index.html')}">
        <div class="home-cat-thumb">
          <img src="${rel('img/products/brama-segmentowa.webp')}" alt="Bramy garażowe" loading="lazy" decoding="async">
        </div>
        <div class="home-cat-body">
          <h3>Bramy garażowe</h3>
          <div class="home-cat-cta">Zobacz ofertę <span>↗</span></div>
        </div>
      </a>
    </div>`;
      return `<section class="offer" id="${secId}">\n${wrapSectionBody(inner, inSubpage)}\n</section>`;
    },
  }),

  makeSectionTemplate({
    id: 'services-grid',
    name: 'Sekcja usług (kafelki)',
    category: 'Usługi',
    description: 'Ciemny boks usług z 3 rozwijanymi kafelkami doradztwa, montażu i serwisu.',
    icon: '🛠',
    render(pagePath, inSubpage) {
      const secId = uniqueSectionId('services-grid');
      const rel = (p) => toRelativeUrl(p, pagePath);
      const inner = `    <div class="home-services-box">
      <div class="home-services-head">
        <div>
          <span class="eyebrow eyebrow--highlight">Kompleksowa obsługa</span>
          <h3>Usługi montażowe i serwisowe</h3>
        </div>
        <a href="${rel('uslugi/index.html')}">Zobacz wszystkie usługi ↗</a>
      </div>
      <div class="home-services-grid">
        <details class="home-service-item" open data-responsive-disclosure>
          <summary><h4>Pomiar, doradztwo i wycena</h4></summary>
          <div class="home-service-item-body">
            <p class="home-service-item-teaser">Zapewniamy bezpłatny i niewiążący pomiar, doradztwo i wycenę na miejscu budowy lub w naszych salonach sprzedaży.</p>
            <a class="arr" href="${rel('uslugi/index.html#pomiar-doradztwo-i-wycena')}" aria-label="Dowiedz się więcej: Pomiar, doradztwo i wycena">Dowiedz się więcej ↗</a>
          </div>
        </details>
        <details class="home-service-item" open data-responsive-disclosure>
          <summary><h4>Prawidłowy – szczelny montaż</h4></summary>
          <div class="home-service-item-body">
            <p class="home-service-item-teaser">Wykonujemy ciepły montaż warstwowy okien i drzwi z użyciem folii, taśm rozprężnych oraz termoparapetów.</p>
            <a class="arr" href="${rel('promocje/cieply-montaz-warstwowy-okien-drzwi/index.html#pelny-opis-montazu')}" aria-label="Dowiedz się więcej: Prawidłowy – szczelny montaż">Dowiedz się więcej ↗</a>
          </div>
        </details>
        <details class="home-service-item" open data-responsive-disclosure>
          <summary><h4>Serwis okien i drzwi</h4></summary>
          <div class="home-service-item-body">
            <p class="home-service-item-teaser">Prowadzimy pełny serwis stolarki: regulację, wymianę okuć, uszczelek oraz pakietów szybowych.</p>
            <a class="arr" href="${rel('uslugi/index.html#serwis')}" aria-label="Dowiedz się więcej: Serwis okien i drzwi">Dowiedz się więcej ↗</a>
          </div>
        </details>
      </div>
    </div>`;
      return `<section class="offer" id="${secId}">\n${wrapSectionBody(inner, inSubpage)}\n</section>`;
    },
  }),

  makeSectionTemplate({
    id: 'featured-products',
    name: 'Polecane produkty',
    category: 'Oferta',
    description: 'Wyróżniona sekcja z 2 kartami polecanych produktów ze zdjęciem i opisem.',
    icon: '★',
    render(pagePath, inSubpage) {
      const secId = uniqueSectionId('featured-products');
      const headingId = `${secId}-title`;
      const rel = (p) => toRelativeUrl(p, pagePath);
      const inner = `    <section class="home-featured-section" aria-labelledby="${headingId}">
      <div class="home-featured-heading">
        <span class="eyebrow eyebrow--highlight">Polecane produkty</span>
        <h3 id="${headingId}">Warto sprawdzić</h3>
      </div>
      <div class="home-featured-grid">
        <a class="home-featured-product" href="${rel('produkty/okna-drzwi-alu/index.html')}">
          <div class="home-featured-media">
            <img src="${rel('img/products/okna-alu-przesuwne.webp')}" alt="Okna i drzwi aluminiowe" loading="lazy" decoding="async">
          </div>
          <div class="home-featured-copy">
            <h4>Okna i drzwi aluminiowe</h4>
            <p>Bezkompromisowa wytrzymałość i minimalistyczny design stworzony z myślą o nowoczesnej architekturze.</p>
            <span>Zobacz produkt ↗</span>
          </div>
        </a>
        <a class="home-featured-product" href="${rel('produkty/fasady/index.html')}">
          <div class="home-featured-media">
            <img src="${rel('img/products/fasada-dom-szczytowy.webp')}" alt="Fasady aluminiowe" loading="lazy" decoding="async">
          </div>
          <div class="home-featured-copy">
            <h4>Fasady aluminiowe</h4>
            <p>Wielkogabarytowe przeszklenia i ciepłe systemy fasadowe dla domów jednorodzinnych oraz obiektów komercyjnych.</p>
            <span>Zobacz produkt ↗</span>
          </div>
        </a>
      </div>
    </section>`;
      return `<section class="offer" id="${secId}">\n${wrapSectionBody(inner, inSubpage)}\n</section>`;
    },
  }),

  makeSectionTemplate({
    id: 'trust-about',
    name: 'Sekcja O firmie / Tekst + CTA',
    category: 'Treść',
    description: 'Ciemna sekcja wizerunkowa z nagłówkiem, opisem firmy i dwoma przyciskami CTA.',
    icon: '🏛',
    render(pagePath, inSubpage) {
      const secId = uniqueSectionId('trust-about');
      const rel = (p) => toRelativeUrl(p, pagePath);
      const inner = `    <div class="trust-compact">
      <div>
        <span class="eyebrow">Od 1995 roku</span>
        <h2>WOL-BUD Wojciech Wolański</h2>
        <p>Od ponad 30 lat doradzamy, sprzedajemy i montujemy stolarkę okienną, drzwiową oraz bramy garażowe dla inwestorów indywidualnych i instytucji w regionie tarnowskim.</p>
      </div>
      <div class="trust-compact-actions">
        <a class="trust-about-link" href="${rel('o-firmie/index.html')}">Poznaj firmę ↗</a>
        <a class="tc-tel" href="${DEFAULT_GLOBALS.phoneHref}">Zadzwoń: ${DEFAULT_GLOBALS.phoneDisplay}</a>
      </div>
    </div>`;
      return `<section class="trust" id="${secId}">\n${wrapSectionBody(inner, inSubpage)}\n</section>`;
    },
  }),

  makeSectionTemplate({
    id: 'cta-banner',
    name: 'Baner promocyjny / CTA',
    category: 'Konwersja',
    description: 'Wyrazisty ciemny baner zachęcający do kontaktu telefonicznego lub e-mailowego.',
    icon: '📣',
    render(_pagePath, inSubpage) {
      const secId = uniqueSectionId('cta-banner');
      const inner = `    <div class="cta-banner-dark">
      <span class="eyebrow eyebrow--highlight">Potrzebujesz wyceny lub doradztwa?</span>
      <h3>Zamów bezpłatny pomiar i wycenę</h3>
      <p>Pomożemy dobrać okna, drzwi, rolety i bramy dopasowane do Twojego projektu — na budowie lub w naszych salonach sprzedaży.</p>
      <div class="cta-actions">
        <a class="tc-tel" href="${DEFAULT_GLOBALS.phoneHref}">Zadzwoń: ${DEFAULT_GLOBALS.phoneDisplay}</a>
        <a class="tc-mail" href="mailto:${DEFAULT_GLOBALS.email}">${SVG_MAIL}${DEFAULT_GLOBALS.email}</a>
      </div>
    </div>`;
      return `<section class="cms-text-section" id="${secId}">\n${wrapSectionBody(inner, inSubpage)}\n</section>`;
    },
  }),

  makeSectionTemplate({
    id: 'realizations',
    name: 'Galeria realizacji',
    category: 'Portfolio',
    description: 'Sekcja 3 kart realizacji ze zdjęciami montaży oraz przyciskiem do pełnej galerii.',
    icon: '📷',
    render(pagePath, inSubpage) {
      const secId = uniqueSectionId('realizations');
      const rel = (p) => toRelativeUrl(p, pagePath);
      const inner = `    <div class="offer-head">
      <div>
        <span class="eyebrow eyebrow--highlight">Zdjęcia z naszych montaży</span>
        <h2>Realizacje</h2>
      </div>
    </div>
    <div class="realization-cards">
      <a class="realization-card" href="${rel('realizacje/index.html#okna')}">
        <div class="realization-card-media" style="--ar: 0.7500"><img src="${rel('img/realizacje/miniatury/fasada-dom-szczytowy.webp')}" alt="Okna – realizacja WOL-BUD" width="480" height="640" loading="lazy" decoding="async"></div>
        <div class="realization-card-body">
          <h3>Okna</h3>
          <span>36 zdjęć ↗</span>
        </div>
      </a>
      <a class="realization-card" href="${rel('realizacje/index.html#bramy')}">
        <div class="realization-card-media" style="--ar: 0.7500"><img src="${rel('img/realizacje/miniatury/okna-nad-brama-garazowa-01.webp')}" alt="Bramy – realizacja WOL-BUD" width="480" height="640" loading="lazy" decoding="async"></div>
        <div class="realization-card-body">
          <h3>Bramy</h3>
          <span>2 zdjęcia ↗</span>
        </div>
      </a>
      <a class="realization-card" href="${rel('realizacje/index.html#drzwi')}">
        <div class="realization-card-media" style="--ar: 0.7500"><img src="${rel('img/realizacje/miniatury/drzwi-wejsciowe-01.webp')}" alt="Drzwi – realizacja WOL-BUD" width="480" height="640" loading="lazy" decoding="async"></div>
        <div class="realization-card-body">
          <h3>Drzwi</h3>
          <span>3 zdjęcia ↗</span>
        </div>
      </a>
    </div>
    <a class="realizations-more" href="${rel('realizacje/index.html')}">Zobacz wszystkie realizacje ↗</a>`;
      return `<section class="realizations-home" id="${secId}">\n${wrapSectionBody(inner, inSubpage)}\n</section>`;
    },
  }),

  makeSectionTemplate({
    id: 'partners',
    name: 'Pasek partnerów / logotypy',
    category: 'Zaufanie',
    description: 'Wyśrodkowana sekcja dostawców z 4 logotypami sprawdzonych producentów.',
    icon: '🤝',
    render(pagePath, inSubpage) {
      const secId = uniqueSectionId('partners');
      const rel = (p) => toRelativeUrl(p, pagePath);
      const inner = `    <div class="section-head-center">
      <span class="eyebrow">Dostawcy</span>
      <h2>Partnerzy</h2>
    </div>
    <div class="partner-row">
      <div class="partner-logo"><img src="${rel('img/partners/partner-domel.webp')}" alt="DOMEL" loading="lazy" decoding="async"></div>
      <div class="partner-logo"><img src="${rel('img/partners/partner-wiked.webp')}" alt="WIKĘD" loading="lazy" decoding="async"></div>
      <div class="partner-logo"><img src="${rel('img/partners/partner-erkado.webp')}" alt="ERKADO" loading="lazy" decoding="async"></div>
      <div class="partner-logo partner-logo--stacked"><img src="${rel('img/partners/partner-wisniowski.webp')}" alt="WIŚNIOWSKI" loading="lazy" decoding="async"></div>
    </div>`;
      return `<section class="partners-section" id="${secId}">\n${wrapSectionBody(inner, inSubpage)}\n</section>`;
    },
  }),

  makeSectionTemplate({
    id: 'reviews',
    name: 'Opinie klientów',
    category: 'Zaufanie',
    description: 'Sekcja opinii Google z oceną, gwiazdkami, 3 kartami opinii i notą prawną.',
    icon: '💬',
    render(_pagePath, inSubpage) {
      const secId = uniqueSectionId('reviews');
      const trackId = `${secId}-track`;
      const inner = `    <div class="reviews-head">
      <div>
        <span class="eyebrow">Opinie Google</span>
        <h2>Co mówią Klienci</h2>
      </div>
      <div class="reviews-score">
        <span class="score-value">4,4</span>
        <div>
          <div class="stars" aria-hidden="true">★★★★★</div>
          <p class="score-meta">Średnia ocen w&nbsp;Google<br>z 48 opinii</p>
          <a class="reviews-link" href="${DEFAULT_GLOBALS.googleReviewsUrl}" target="_blank" rel="noopener noreferrer">Zobacz opinie w Google${SVG_EXT_ARROW}</a>
        </div>
      </div>
    </div>
    <ul class="reviews-track" id="${trackId}">
      <li class="review">
        <div class="stars" role="img" aria-label="Ocena 5 na 5">★★★★★</div>
        <blockquote>Szczerze polecam. Wymiana okien i parapetów przebiegła bezproblemowo. Estetyczne wykończenie, ekipa montująca profesjonalna i przyjazna!</blockquote>
        <div class="review-source">Opinia z Google</div>
      </li>
      <li class="review">
        <div class="stars" role="img" aria-label="Ocena 5 na 5">★★★★★</div>
        <blockquote>Zdecydowanie polecamy — miło, fachowo i czysto w trakcie pracy jak i po jej zakończeniu. Terminy zawsze na czas, kontakt bezproblemowy.</blockquote>
        <div class="review-source">Opinia z Google</div>
      </li>
      <li class="review">
        <div class="stars" role="img" aria-label="Ocena 5 na 5">★★★★★</div>
        <blockquote>Fachowcy z najwyższej półki, rzetelna obsługa i doradztwo, a towar w pełni zgodny z zamówieniem. Szczerze polecam!</blockquote>
        <div class="review-source">Opinia z Google</div>
      </li>
    </ul>
    <p class="reviews-note">Wybrane opinie z naszego profilu w Google. Wszystkie opinie znajdziesz w Google.</p>`;
      return `<section class="reviews" id="${secId}">\n${wrapSectionBody(inner, inSubpage)}\n</section>`;
    },
  }),

  makeSectionTemplate({
    id: 'text-article',
    name: 'Sekcja tekstowa / Artykuł',
    category: 'Treść',
    description: 'Karta tekstowa z nagłówkiem, leadem, listą kluczowych korzyści i przyciskiem CTA.',
    icon: '📄',
    render(_pagePath, inSubpage) {
      const secId = uniqueSectionId('text-article');
      const inner = `    <article class="service-card">
      <h2>Nagłówek sekcji informacyjnej</h2>
      <p class="service-card-teaser">Wprowadzenie do tematu – krótki, konkretny akapit wyjaśniający korzyści oferty lub szczegóły rozwiązania.</p>
      <p>W tej sekcji możesz przedstawić najważniejsze informacje techniczne, warunki promocji albo przebieg realizacji zamówienia krok po kroku.</p>
      <ul class="source-list">
        <li>Bezpłatny pomiar i profesjonalne doradztwo techniczne na budowie</li>
        <li>Sprawdzone systemy okienne, drzwiowe i osłonowe renomowanych producentów</li>
        <li>Własne, doświadczone ekipy montażowe z ponad 30-letnią praktyką</li>
      </ul>
      <div class="cta-actions">
        <a class="tc-tel" href="${DEFAULT_GLOBALS.phoneHref}">Zadzwoń: ${DEFAULT_GLOBALS.phoneDisplay}</a>
      </div>
    </article>`;
      return `<section class="cms-text-section" id="${secId}">\n${wrapSectionBody(inner, inSubpage)}\n</section>`;
    },
  }),

  makeSectionTemplate({
    id: 'faq-accordion',
    name: 'Pytania i odpowiedzi (FAQ)',
    category: 'Treść',
    description: 'Sekcja FAQ z nagłówkiem i 3 rozwijanymi pytaniami oraz odpowiedziami.',
    icon: '❓',
    render(_pagePath, inSubpage) {
      const secId = uniqueSectionId('faq-accordion');
      const inner = `    <div class="offer-head">
      <div>
        <span class="eyebrow">Najczęstsze pytania</span>
        <h2>Pytania i odpowiedzi</h2>
      </div>
      <p>Sprawdź odpowiedzi na najczęstsze pytania dotyczące pomiaru, wyceny i montażu stolarki.</p>
    </div>
    <div class="home-services-grid">
      <details class="home-service-item" open data-responsive-disclosure>
        <summary><h4>Czy pomiar i wycena są bezpłatne?</h4></summary>
        <div class="home-service-item-body">
          <p class="home-service-item-teaser">Tak, zapewniamy bezpłatny i niezobowiązujący pomiar oraz wycenę wielowariantową — zarówno na budowie, jak i w naszych salonach w Tarnowie i Radłowie.</p>
        </div>
      </details>
      <details class="home-service-item" open data-responsive-disclosure>
        <summary><h4>Czy wykonujecie ciepły montaż warstwowy?</h4></summary>
        <div class="home-service-item-body">
          <p class="home-service-item-teaser">Tak, realizujemy szczelny montaż warstwowy z zastosowaniem folii paroszczelnych i paroprzepuszczalnych, taśm rozprężnych oraz termoparapetów.</p>
        </div>
      </details>
      <details class="home-service-item" open data-responsive-disclosure>
        <summary><h4>Jaki jest czas oczekiwania na realizację?</h4></summary>
        <div class="home-service-item-body">
          <p class="home-service-item-teaser">Termin realizacji zależy od wybranego systemu, koloru okleiny oraz zakresu prac. Dokładny harmonogram określamy zawsze przed podpisaniem umowy.</p>
        </div>
      </details>
    </div>`;
      return `<section class="cms-faq-section" id="${secId}">\n${wrapSectionBody(inner, inSubpage)}\n</section>`;
    },
  }),

  makeSectionTemplate({
    id: 'single-photo',
    name: 'Pojedyncze zdjęcie / Baner',
    category: 'Zdjęcia',
    description: 'Duże zdjęcie lub grafika promocyjna z powiększaniem po kliknięciu. Kliknij „Zmień zdjęcie”, aby wgrać własne z komputera.',
    icon: '🖼',
    render(pagePath, inSubpage) {
      const rel = (p) => toRelativeUrl(p, pagePath);
      const secId = uniqueSectionId('zdjecie');
      const img = rel('img/placeholder-photo.svg');
      const figureHtml = `<figure class="category-feature" id="${secId}">
  <img src="${img}" alt="Dodaj własne zdjęcie" data-lightbox-trigger data-lightbox-src="${img}" data-lightbox-group="${secId}" loading="lazy" decoding="async">
</figure>`;
      if (inSubpage) return figureHtml;
      return `<section class="cms-text-section" id="${secId}-wrap">\n  <div class="wrap">\n${figureHtml}\n  </div>\n</section>`;
    },
  }),

  makeSectionTemplate({
    id: 'photo-gallery',
    name: 'Galeria zdjęć (z powiększaniem)',
    category: 'Zdjęcia',
    description: 'Siatka samych zdjęć otwieranych na pełny ekran (Lightbox). Dodawaj dowolną liczbę zdjęć przyciskiem „+ Dodaj”.',
    icon: '📷',
    render(pagePath, inSubpage) {
      const rel = (p) => toRelativeUrl(p, pagePath);
      const secId = uniqueSectionId('galeria');
      const photos = [
        ['img/realizacje/dom-nowoczesna-stodola-04.webp', 'img/realizacje/miniatury/dom-nowoczesna-stodola-04.webp', 'Zdjęcie 1 – WOL-BUD'],
        ['img/realizacje/dom-nowoczesna-stodola-06.webp', 'img/realizacje/miniatury/dom-nowoczesna-stodola-06.webp', 'Zdjęcie 2 – WOL-BUD'],
        ['img/realizacje/dom-pietrowy-duze-przeszklenia-01.webp', 'img/realizacje/miniatury/dom-pietrowy-duze-przeszklenia-01.webp', 'Zdjęcie 3 – WOL-BUD'],
      ];
      const itemsHtml = photos
        .map(
          ([full, thumb, alt]) => `<figure class="realization-photo" style="--ar: 1.3333">
        <a href="${rel(full)}" data-lightbox-trigger data-lightbox-src="${rel(full)}" data-lightbox-group="${secId}" aria-label="Powiększ zdjęcie: ${alt}">
          <img src="${rel(thumb)}" alt="${alt}" width="640" height="480" loading="lazy" decoding="async">
        </a>
      </figure>`
        )
        .join('');
      const galleryHtml = `<section class="realization-group" id="${secId}" aria-labelledby="${secId}-title">
  <div class="realization-group-head">
    <h2 id="${secId}-title">Galeria zdjęć</h2>
    <span class="realization-count">3 zdjęcia</span>
  </div>
  <div class="photo-strip" data-scroll-gallery aria-label="Galeria zdjęć">
    <button type="button" class="photo-strip-arrow" data-scroll-prev aria-label="Poprzednie zdjęcie" aria-disabled="true">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
    </button>
    <div class="realization-grid" data-scroll-track tabindex="0" role="region" aria-label="Galeria zdjęć">${itemsHtml}</div>
    <button type="button" class="photo-strip-arrow" data-scroll-next aria-label="Następne zdjęcie" aria-disabled="false">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
    </button>
  </div>
</section>`;
      if (inSubpage) return galleryHtml;
      return `<section class="cms-text-section" id="${secId}-wrap">\n  <div class="wrap">\n${galleryHtml}\n  </div>\n</section>`;
    },
  }),
];

/**
 * Szablony pojedynczych elementów/kafelków dodawanych do istniejących kontenerów.
 */
export const ITEM_TEMPLATES = {
  'cat-card': {
    label: 'Kafelek kategorii',
    createHtml(pagePath = 'index.html') {
      const rel = (p) => toRelativeUrl(p, pagePath);
      return `<a class="home-cat-card" href="${rel('oferta/index.html')}">
  <div class="home-cat-thumb">
    <img src="${rel('img/placeholder-photo.svg')}" alt="Dodaj własne zdjęcie" loading="lazy" decoding="async">
  </div>
  <div class="home-cat-body">
    <h3>Nowa kategoria</h3>
    <div class="home-cat-cta">Zobacz ofertę <span>↗</span></div>
  </div>
</a>`;
    },
  },

  'extra-category': {
    label: 'Dodatkowa kategoria (link)',
    createHtml(pagePath = 'index.html') {
      const rel = (p) => toRelativeUrl(p, pagePath);
      return `<a class="home-extra-category" href="${rel('oferta/index.html')}">Nowa kategoria <span aria-hidden="true">↗</span></a>`;
    },
  },

  'featured-product': {
    label: 'Karta polecanego produktu',
    createHtml(pagePath = 'index.html') {
      const rel = (p) => toRelativeUrl(p, pagePath);
      return `<a class="home-featured-product" href="${rel('oferta/index.html')}">
  <div class="home-featured-media"><img src="${rel('img/placeholder-photo.svg')}" alt="Dodaj własne zdjęcie" loading="lazy" decoding="async"></div>
  <div class="home-featured-copy">
    <h4>Polecany produkt</h4>
    <p>Krótki opis polecanego rozwiązania.</p>
    <span>Zobacz produkt ↗</span>
  </div>
</a>`;
    },
  },

  'home-service': {
    label: 'Kafelek usługi (strona główna)',
    createHtml(pagePath = 'index.html') {
      const rel = (p) => toRelativeUrl(p, pagePath);
      return `<details class="home-service-item" open data-responsive-disclosure>
  <summary><h4>Nowa usługa</h4></summary>
  <div class="home-service-item-body">
    <p class="home-service-item-teaser">Krótki opis usługi montażowej, doradczej lub serwisowej świadczonej przez zespół WOL-BUD.</p>
    <a class="arr" href="${rel('uslugi/index.html')}" aria-label="Dowiedz się więcej: Nowa usługa">Dowiedz się więcej ↗</a>
  </div>
</details>`;
    },
  },

  'subpage-service': {
    label: 'Karta usługi (podstrona)',
    createHtml() {
      const cardId = uniqueSectionId('usluga');
      return `<article class="service-card" id="${cardId}">
  <h2>Nowa usługa</h2>
  <p class="service-card-teaser">Krótkie podsumowanie usługi widoczne na górze karty.</p>
  <details class="mobile-details" open data-responsive-disclosure>
    <summary>Opis usługi</summary>
    <div class="mobile-details-body source-content-body"><p>Szczegółowy opis zakresu prac, stosowanych materiałów oraz korzyści dla inwestora.</p></div>
  </details>
</article>`;
    },
  },

  'realization-card': {
    label: 'Karta realizacji',
    createHtml(pagePath = 'index.html') {
      const rel = (p) => toRelativeUrl(p, pagePath);
      return `<a class="realization-card" href="${rel('realizacje/index.html')}">
  <div class="realization-card-media" style="--ar: 0.7500"><img src="${rel('img/realizacje/miniatury/fasada-dom-szczytowy.webp')}" alt="Realizacja WOL-BUD" width="480" height="640" loading="lazy" decoding="async"></div>
  <div class="realization-card-body">
    <h3>Nowa realizacja</h3>
    <span>Zobacz zdjęcia ↗</span>
  </div>
</a>`;
    },
  },

  'realization-photo': {
    label: 'Zdjęcie w galerii realizacji',
    createHtml(pagePath = 'realizacje/index.html') {
      const rel = (p) => toRelativeUrl(p, pagePath);
      const fullImg = rel('img/realizacje/dom-nowoczesna-stodola-04.webp');
      const thumbImg = rel('img/realizacje/miniatury/dom-nowoczesna-stodola-04.webp');
      return `<figure class="realization-photo" style="--ar: 0.7500">
  <a href="${fullImg}" data-lightbox-trigger data-lightbox-src="${fullImg}" data-lightbox-group="realizacja-okna" aria-label="Powiększ zdjęcie: Realizacja WOL-BUD">
    <img src="${thumbImg}" alt="Realizacja WOL-BUD" width="480" height="640" loading="lazy" decoding="async">
  </a>
</figure>`;
    },
  },

  'gallery-thumb': {
    label: 'Miniatura galerii produktu',
    createHtml(pagePath = 'produkty/okna-drzwi-alu/index.html') {
      const rel = (p) => toRelativeUrl(p, pagePath);
      return `<button type="button" class="product-gallery-thumb" data-index="0" data-src="${rel('img/products/okna-alu-przesuwne.webp')}" data-ratio="1.33445" style="--gallery-ratio: 1.33445;" aria-label="Pokaż zdjęcie produktu" aria-current="false">
  <img src="${rel('img/realizacje/miniatury/okna-alu-przesuwne.webp')}" alt="Zdjęcie produktu" loading="lazy" decoding="async">
</button>`;
    },
  },

  'partner-logo': {
    label: 'Logo partnera',
    createHtml(pagePath = 'index.html') {
      const rel = (p) => toRelativeUrl(p, pagePath);
      return `<div class="partner-logo"><img src="${rel('img/partners/partner-domel.webp')}" alt="Partner WOL-BUD" loading="lazy" decoding="async"></div>`;
    },
  },

  'review-card': {
    label: 'Opinia klienta',
    createHtml() {
      return `<li class="review"><div class="stars" role="img" aria-label="Ocena 5 na 5">★★★★★</div><blockquote>Profesjonalne doradztwo, terminowy montaż i wysoka jakość stolarki. Zdecydowanie polecamy firmę WOL-BUD!</blockquote><div class="review-source">Opinia z Google</div></li>`;
    },
  },

  'store-item': {
    label: 'Salon sprzedaży (kontakt)',
    createHtml(pagePath = 'index.html') {
      const rel = (p) => toRelativeUrl(p, pagePath);
      return `<div class="kt-store-item">
  <div class="kt-store-title">Salon sprzedaży WOL-BUD</div>
  <div class="kt-store-addr">ul. Giełdowa 10 (przy placu targowym), 33-100 Tarnów</div>
  <div class="kt-store-phone">Tel. 14 626 80 32 · Kom. ${DEFAULT_GLOBALS.phoneDisplay}</div>
  <a class="store-nav-btn" href="${DEFAULT_GLOBALS.mapsTarnowUrl}" target="_blank" rel="noopener noreferrer"><i>${SVG_PIN}</i>Nawiguj w Google Maps ↗</a>
  <figure class="kt-salon-photo"><img src="${rel('img/stores/salon-tarnow-gieldowa.webp')}" alt="Salon sprzedaży WOL-BUD" width="1200" height="834" loading="lazy" decoding="async"></figure>
</div>`;
    },
  },

  'location-card': {
    label: 'Karta salonu (Nasze sklepy)',
    createHtml(pagePath = 'nasze-sklepy/index.html') {
      const rel = (p) => toRelativeUrl(p, pagePath);
      return `<article class="location-card">
  <div class="location-card__photo"><img src="${rel('img/stores/salon-tarnow-gieldowa.webp')}" alt="Salon sprzedaży WOL-BUD" loading="lazy" decoding="async"></div>
  <div class="location-card__body">
    <h2>Nowy salon sprzedaży</h2>
    <address>ul. Giełdowa 10, 33-100 Tarnów</address>
    <div class="location-card__links">
      <a href="${DEFAULT_GLOBALS.phoneHref}">Kom. ${DEFAULT_GLOBALS.phoneDisplay}</a>
      <a href="tel:146268032">Tel. 14 626 80 32</a>
    </div>
    <p class="location-card__hours">Pn–Pt 8–16 · Sb 9–12 · niedz. zamknięte</p>
    <a class="store-nav-btn" href="${DEFAULT_GLOBALS.mapsTarnowUrl}" target="_blank" rel="noopener noreferrer"><i>${SVG_PIN}</i>Nawiguj w Google Maps ↗</a>
  </div>
</article>`;
    },
  },

  'profile-row': {
    label: 'Wiersz profilu okiennego',
    createHtml(pagePath = 'kategorie/okna-pcv/index.html') {
      const rel = (p) => toRelativeUrl(p, pagePath);
      const profileId = uniqueSectionId('profil');
      const img = rel('img/profiles/pcv-energetic.webp');
      return `<article class="profile-row" id="${profileId}">
  <figure class="profile-row__media">
    <img src="${img}" alt="Nowy profil – przekrój profilu" data-lightbox-trigger data-lightbox-src="${img}" data-lightbox-group="profile" loading="lazy" decoding="async">
  </figure>
  <div class="profile-row__body">
    <span class="profile-row__kicker">System profili energooszczędnych</span>
    <h2>Nowy profil</h2>
    <details class="mobile-details profile-row__details" open data-responsive-disclosure>
      <summary>Opis i parametry profilu</summary>
      <div class="mobile-details-body"><h3>Najważniejsze zalety</h3><p>Opis systemu profili, izolacyjności termicznej, szczelności oraz zastosowania w nowoczesnym budownictwie.</p><h3>Profil</h3><ul class="source-list"><li>Wielokomorowa konstrukcja ramy i skrzydła</li><li>Trzy poziomy uszczelnienia chroniące przed zimnem i hałasem</li><li>Solidne wzmocnienia stalowe oraz szeroka paleta kolorów</li></ul></div>
    </details>
  </div>
</article>`;
    },
  },

  'subcat-card': {
    label: 'Karta podkategorii',
    createHtml(pagePath = 'kategorie/rolety/index.html') {
      const rel = (p) => toRelativeUrl(p, pagePath);
      return `<a class="subcat-card" href="${rel('oferta/index.html')}">
  <div class="subcat-card-media">
    <img src="${rel('img/products/rolety-zewnetrzne.webp')}" alt="Nowa podkategoria" loading="lazy" decoding="async">
  </div>
  <div class="subcat-card-body">
    <h3>Nowa podkategoria</h3>
    <span class="cat-prod-btn">Przejdź do oferty <span>↗</span></span>
  </div>
</a>`;
    },
  },

  'cat-prod-card': {
    label: 'Karta produktu w kategorii',
    createHtml(pagePath = 'kategorie/stolarka-aluminiowa/index.html') {
      const rel = (p) => toRelativeUrl(p, pagePath);
      const href = rel('produkty/okna-drzwi-alu/index.html');
      return `<article class="cat-prod-card">
  <a class="cat-prod-media" href="${href}" aria-label="Nowy produkt">
    <img src="${rel('img/products/okna-alu-przesuwne.webp')}" alt="Nowy produkt" loading="lazy" decoding="async">
  </a>
  <div class="cat-prod-body">
    <span class="cat-prod-tag">WOL-BUD Tarnów</span>
    <h3 class="cat-prod-title"><a href="${href}">Nowy produkt</a></h3>
    <a class="cat-prod-btn" href="${href}">Zobacz parametry <span>↗</span></a>
  </div>
</article>`;
    },
  },

  'brand-chip': {
    label: 'Link katalogu producenta',
    createHtml() {
      return `<li><a href="https://wol-bud.com.pl" target="_blank" rel="noopener noreferrer">Nowy producent – katalog <span aria-hidden="true">↗</span></a></li>`;
    },
  },

  'nav-pill': {
    label: 'Pigułka szybkiej nawigacji',
    createHtml(pagePath = 'kategorie/okna-pcv/index.html') {
      const rel = (p) => toRelativeUrl(p, pagePath);
      return `<a href="${rel('oferta/index.html')}" class="cat-nav-pill">Nowa kategoria</a>`;
    },
  },

  'list-item': {
    label: 'Pozycja listy',
    createHtml() {
      return `<li>Nowa pozycja listy – kliknij, aby edytować treść.</li>`;
    },
  },

  paragraph: {
    label: 'Akapit tekstu',
    createHtml() {
      return `<p>Nowy akapit treści – kliknij, aby wpisać własny opis.</p>`;
    },
  },
};

function renderHeader(pagePath, g) {
  const rel = (p) => toRelativeUrl(p, pagePath);
  const homeUrl = rel('index.html');
  const isHome = normalizePagePath(pagePath) === 'index.html';
  const mobileHref = (hash) => (isHome ? `#${hash}` : `${homeUrl}#${hash}`);
  const telHref = escapeHtml(g.phoneHref);
  const telText = escapeHtml(g.phoneDisplay);

  return `<header class="bar"><div class="bar-in"><div class="menu" id="menu"><button class="pill" id="menuButton" aria-expanded="false" aria-controls="site-menu" data-menu-toggle>Menu</button><nav class="menu-panel" id="site-menu" data-menu-panel hidden aria-label="Menu główne"><button class="menu-close" type="button" data-menu-close aria-label="Zamknij menu">×</button><a href="${homeUrl}" data-desktop-href="${homeUrl}" data-mobile-home-href="${mobileHref('start')}">Strona główna</a><a href="${rel('oferta/index.html')}" data-desktop-href="${rel('oferta/index.html')}" data-mobile-home-href="${mobileHref('oferta')}">Oferta</a><a href="${rel('uslugi/index.html')}" data-desktop-href="${rel('uslugi/index.html')}" data-mobile-home-href="${mobileHref('uslugi')}">Usługi</a><a href="${rel('realizacje/index.html')}" data-desktop-href="${rel('realizacje/index.html')}" data-mobile-home-href="${mobileHref('realizacje')}">Realizacje</a><a href="${rel('o-firmie/index.html')}" data-desktop-href="${rel('o-firmie/index.html')}" data-mobile-home-href="${mobileHref('ofirmie')}">O firmie</a><a href="${rel('nasze-sklepy/index.html')}" data-desktop-href="${rel('nasze-sklepy/index.html')}" data-mobile-home-href="${mobileHref('nasze-sklepy')}">Nasze sklepy</a><a href="${rel('kontakt/index.html')}" data-desktop-href="${rel('kontakt/index.html')}" data-mobile-home-href="${mobileHref('kontakt')}">Kontakt</a><a class="menu-phone" href="${telHref}"><i></i>${telText}</a></nav></div><a class="brand" href="${homeUrl}" aria-label="WOL-BUD – strona główna"><img src="${rel('img/wolbud-logo.webp')}" alt="WOL-BUD – okna, drzwi, rolety, bramy" width="363" height="96"></a><a class="pill phone" href="${telHref}"><i></i>${telText}</a></div></header>`;
}

function renderSidebar(pagePath, g) {
  const rel = (p) => toRelativeUrl(p, pagePath);
  const currentNorm = normalizePagePath(pagePath);
  const telHref = escapeHtml(g.phoneHref);
  const telText = escapeHtml(g.phoneDisplay);

  const catLinks = SIDEBAR_CATEGORIES.map((cat) => {
    const activeStyle =
      cat.path === currentNorm ? ' style="font-weight:700; color:var(--highlight);"' : '';
    return `<li><a href="${rel(cat.path)}"${activeStyle}>${escapeHtml(cat.label)}</a></li>`;
  }).join('');

  return `<aside class="subpage-sidebar">
  <div class="sidebar-box sidebar-box--dark">
    <span class="eyebrow eyebrow--highlight">Potrzebujesz wyceny?</span>
    <a class="sidebar-tel" href="${telHref}">${telText}</a>
    <p>Zadzwoń do nas. Pomiar, doradztwo techniczne i bezpłatna wycena na budowie.</p>
    <a class="tc-tel" href="${telHref}">Zadzwoń teraz</a>
  </div>

  <div class="sidebar-box">
    <span class="eyebrow">Salony sprzedaży</span>
    <div class="sidebar-store">
      <p><strong>Tarnów:</strong> ul. Giełdowa 10</p>
      <a class="sidebar-map-link" href="${DEFAULT_GLOBALS.mapsTarnowUrl}" target="_blank" rel="noopener noreferrer">Nawiguj w Google Maps ↗</a>
    </div>
    <div class="sidebar-store">
      <p><strong>Radłów:</strong> ul. Kolejowa 5</p>
      <a class="sidebar-map-link" href="${DEFAULT_GLOBALS.mapsRadlowUrl}" target="_blank" rel="noopener noreferrer">Nawiguj w Google Maps ↗</a>
    </div>
    <a class="sidebar-link" href="${rel('nasze-sklepy/index.html')}">Zobacz godziny i ekspozycje ↗</a>
  </div>

  <div class="sidebar-box">
    <span class="eyebrow">Kategorie produktów</span>
    <ul class="sidebar-links">
      ${catLinks}
      <li><a href="${rel('uslugi/index.html')}">Szczelny montaż i usługi</a></li>
    </ul>
  </div>
</aside>`;
}

function renderCtaBanner(g, { eyebrow, heading, text }) {
  const telHref = escapeHtml(g.phoneHref);
  const telText = escapeHtml(g.phoneDisplay);
  const mail = escapeHtml(g.email);
  return `<div class="cta-banner-dark">
          <span class="eyebrow eyebrow--highlight">${escapeHtml(eyebrow)}</span>
          <h3>${escapeHtml(heading)}</h3>
          <p>${escapeHtml(text)}</p>
          <div class="cta-actions">
            <a class="tc-tel" href="${telHref}">Zadzwoń: ${telText}</a>
            <a class="tc-mail" href="mailto:${mail}">${SVG_MAIL}${mail}</a>
          </div>
        </div>`;
}

function renderFooterAndChrome(pagePath, g) {
  const rel = (p) => toRelativeUrl(p, pagePath);
  const telHref = escapeHtml(g.phoneHref);
  const telText = escapeHtml(g.phoneDisplay);
  const mail = escapeHtml(g.email);
  const fbUrl = escapeHtml(g.facebookUrl);
  const fbLabel = escapeHtml(g.facebookLabel);
  const footerText = escapeHtml(g.footerText);

  return `<footer><div class="wrap"><div class="footer-links"><a href="${rel('oferta/index.html')}">Oferta</a><a href="${rel('uslugi/index.html')}">Usługi</a><a href="${rel('realizacje/index.html')}">Realizacje</a><a href="${rel('o-firmie/index.html')}">O firmie</a><a href="${rel('nasze-sklepy/index.html')}">Nasze sklepy</a><a href="${rel('kontakt/index.html')}">Kontakt</a></div><div class="footer-social"><a href="${fbUrl}" target="_blank" rel="noopener noreferrer" aria-label="WOL-BUD na Facebooku (otwiera się w nowej karcie)">${SVG_FB}Facebook</a></div><p class="footer-copy">${footerText} · <a href="${telHref}">${telText}</a></p></div></footer>


<div class="lightbox-modal" id="lightboxModal" role="dialog" aria-modal="true" aria-label="Powiększone zdjęcie" hidden>
  <div class="lightbox-backdrop" data-lightbox-close></div>
  <div class="lightbox-dialog">
    <button type="button" class="lightbox-close" data-lightbox-close aria-label="Zamknij (Esc)">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </button>
    <button type="button" class="lightbox-arrow lightbox-prev" data-lightbox-prev aria-label="Poprzednie zdjęcie (Strzałka w lewo)">
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
    </button>
    <div class="lightbox-media-wrap">
      <img src="" alt="" id="lightboxImg" class="lightbox-img">
      <div class="lightbox-caption-bar">
        <span class="lightbox-caption" id="lightboxCaption"></span>
        <span class="lightbox-counter" id="lightboxCounter">1 / 1</span>
      </div>
    </div>
    <button type="button" class="lightbox-arrow lightbox-next" data-lightbox-next aria-label="Następne zdjęcie (Strzałka w prawo)">
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
    </button>
  </div>
</div>


<button type="button" class="scroll-top-btn" id="scrollTopBtn" aria-label="Przewiń do góry" title="Do góry">
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"></polyline></svg>
  <span>Do góry</span>
</button>

<nav class="contact-bubbles" aria-label="Szybki kontakt">
  <a class="contact-bubble contact-bubble--fb" href="${fbUrl}" target="_blank" rel="noopener noreferrer" aria-label="Facebook: ${fbLabel} (otwiera się w nowej karcie)"><span class="contact-bubble__text">${fbLabel}</span><span class="contact-bubble__icon">${SVG_FB}</span></a>
  <a class="contact-bubble contact-bubble--mail" href="mailto:${mail}" aria-label="E-mail: ${mail}"><span class="contact-bubble__text">${mail}</span><span class="contact-bubble__icon">${SVG_MAIL}</span></a>
  <a class="contact-bubble contact-bubble--tel" href="${telHref}" aria-label="Zadzwoń: ${telText}"><span class="contact-bubble__text">${telText}</span><span class="contact-bubble__icon">${SVG_PHONE}</span></a>
</nav>`;
}

function buildSubpageDocument({
  path = 'nowa-strona/index.html',
  title,
  description,
  heading,
  eyebrow,
  lead,
  breadcrumbsHtml,
  quickNavHtml = '',
  contentClass = 'subpage-content',
  contentHtml,
  globals,
}) {
  const g = resolveGlobals(globals);
  const rel = (p) => toRelativeUrl(p, path);
  const safeHeading = escapeHtml(heading || title || 'Nowa strona');
  const safeTitle = escapeHtml(
    title
      ? title.includes('WOL-BUD')
        ? title
        : `${title} | ${g.siteName}`
      : `${heading || 'Nowa strona'} | ${g.siteName}`
  );
  const safeDescription = escapeHtml(
    description || `${heading || title || 'Oferta'} — sprzedaż i profesjonalny montaż w WOL-BUD Tarnów.`
  );
  const safeEyebrow = escapeHtml(eyebrow || 'WOL-BUD Tarnów');
  const leadBlock = lead
    ? `\n      <p class="subpage-lead">${escapeHtml(lead)}</p>`
    : '';

  return `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#2c4d19"><meta name="description" content="${safeDescription}">
<title>${safeTitle}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="icon" type="image/png" href="${rel('img/favicon.png')}"><link rel="apple-touch-icon" href="${rel('img/favicon.png')}"><link rel="stylesheet" href="${rel(g.siteCss)}"><script defer src="${rel(g.siteJs)}"></script></head>
<body>
${renderHeader(path, g)}
<main id="main" class="page-main">
  <div class="wrap">
    <div class="page-nav-bar">
      <button type="button" class="btn-back" data-history-back aria-label="Wróć do poprzedniej strony">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
        <span>Wróć</span>
      </button>
      <nav class="breadcrumbs" aria-label="Okruszki">${breadcrumbsHtml}</nav>
    </div>
    <header class="subpage-head">
      <span class="eyebrow">${safeEyebrow}</span>
      <h1>${safeHeading}</h1>${leadBlock}
    </header>${quickNavHtml ? `\n    ${quickNavHtml}` : ''}
    <div class="subpage-grid">
      <div class="${contentClass}">
        ${contentHtml}
      </div>
      ${renderSidebar(path, g)}
    </div>
  </div>
</main>
${renderFooterAndChrome(path, g)}

</body></html>`;
}

function renderCategoryQuickNav(pagePath) {
  const rel = (p) => toRelativeUrl(p, pagePath);
  const currentNorm = normalizePagePath(pagePath);
  const pills = [
    ...SIDEBAR_CATEGORIES,
    { label: 'Usługi montażowe', path: 'uslugi/index.html' },
  ]
    .map((item) => {
      const cls =
        item.path === currentNorm ? 'cat-nav-pill is-active' : 'cat-nav-pill';
      return `<a href="${rel(item.path)}" class="${cls}">${escapeHtml(item.label)}</a>`;
    })
    .join('');

  return `<div class="cat-quick-nav" aria-label="Szybka nawigacja po kategoriach">
      <span class="cat-quick-nav-label">Kategorie:</span>
      <div class="cat-quick-nav-pills">${pills}</div>
    </div>`;
}

/**
 * 5 kompletnych szablonów nowych podstron HTML zgodnych z architekturą WOL-BUD.
 */
export const PAGE_TEMPLATES = [
  {
    id: 'blank',
    name: 'Pusta strona (od zera)',
    description:
      'Zaczyna czysto: tylko nagłówek strony i wolna przestrzeń do układania własnych sekcji i kafelków z zakładki „Dodaj blok”.',
    defaultFolder: 'promocje',
    createPageHtml({
      path = 'promocje/nowa-strona/index.html',
      title,
      description,
      heading = 'Nowa podstrona',
      eyebrow = 'WOL-BUD Tarnów',
      lead = 'Kliknij ten tekst, aby go zmienić, a potem dodaj wybrane sekcje (kafelki, usługi, galerię, FAQ) z zakładki „Dodaj blok”.',
      globals,
    } = {}) {
      const g = resolveGlobals(globals);
      const rel = (p) => toRelativeUrl(p, path);
      const safeHeading = escapeHtml(heading);
      const breadcrumbsHtml = `<a href="${rel('index.html')}" data-home-link>Strona główna</a><span>/</span><span aria-current="page">${safeHeading}</span>`;

      const contentHtml = `<article class="service-card" id="${uniqueSectionId('tresc')}">
          <h2>Zacznij budować tę stronę</h2>
          <p>Kliknij w dowolny tekst, aby go edytować, albo usuń ten blok i dodaj własne sekcje z zakładki „Dodaj blok” po lewej stronie (siatkę kafelków, usługi, galerię, baner CTA lub FAQ).</p>
        </article>`;

      return buildSubpageDocument({
        path,
        title: title || heading,
        description,
        heading,
        eyebrow,
        lead,
        breadcrumbsHtml,
        contentHtml,
        globals: g,
      });
    },
  },

  {
    id: 'category',
    name: 'Strona kategorii',
    description:
      'Katalog produktów z szybką nawigacją kategorii, kartami produktów, opisem i panelem bocznym.',
    defaultFolder: 'kategorie',
    createPageHtml({
      path = 'kategorie/nowa-kategoria/index.html',
      title,
      description,
      heading = 'Nowa kategoria',
      eyebrow = 'Kategoria oferty',
      lead = 'Kompleksowa oferta stolarki otworowej ze sprzedażą, doradztwem i profesjonalnym montażem w WOL-BUD Tarnów.',
      globals,
    } = {}) {
      const g = resolveGlobals(globals);
      const rel = (p) => toRelativeUrl(p, path);
      const safeHeading = escapeHtml(heading);
      const breadcrumbsHtml = `<a href="${rel('index.html#oferta')}" data-home-link>Strona główna</a><span>/</span><a href="${rel('oferta/index.html')}">Oferta</a><span>/</span><span aria-current="page">${safeHeading}</span>`;

      const contentHtml = `<div class="cat-products-grid">
          <article class="cat-prod-card">
            <a class="cat-prod-media" href="${rel('produkty/okna-drzwi-alu/index.html')}" aria-label="Produkt 1">
              <img src="${rel('img/products/okno-infinity-passive-83md.webp')}" alt="${safeHeading} – model 1" loading="lazy" decoding="async">
            </a>
            <div class="cat-prod-body">
              <span class="cat-prod-tag">WOL-BUD Tarnów</span>
              <h3 class="cat-prod-title"><a href="${rel('produkty/okna-drzwi-alu/index.html')}">Przykładowy model 1</a></h3>
              <a class="cat-prod-btn" href="${rel('produkty/okna-drzwi-alu/index.html')}">Zobacz parametry <span>↗</span></a>
            </div>
          </article>
          <article class="cat-prod-card">
            <a class="cat-prod-media" href="${rel('produkty/fasady/index.html')}" aria-label="Produkt 2">
              <img src="${rel('img/products/drzwi-zewnetrzne-stalowe.webp')}" alt="${safeHeading} – model 2" loading="lazy" decoding="async">
            </a>
            <div class="cat-prod-body">
              <span class="cat-prod-tag">WOL-BUD Tarnów</span>
              <h3 class="cat-prod-title"><a href="${rel('produkty/fasady/index.html')}">Przykładowy model 2</a></h3>
              <a class="cat-prod-btn" href="${rel('produkty/fasady/index.html')}">Zobacz parametry <span>↗</span></a>
            </div>
          </article>
        </div>
        <details class="mobile-details source-content-disclosure" open data-responsive-disclosure>
          <summary>Pełny opis kategorii</summary>
          <div class="mobile-details-body source-content-body">
            <p>W naszej ofercie znajdziesz starannie wyselekcjonowane rozwiązania od renomowanych polskich i europejskich producentów. Pomagamy w doborze parametrów, kolorystyki oraz odpowiedniej techniki montażu.</p>
            <ul class="source-list">
              <li>Bezpłatny pomiar i wycena wielowariantowa</li>
              <li>Wysoka izolacyjność termiczna i akustyczna</li>
              <li>Profesjonalny montaż przez własne ekipy WOL-BUD</li>
            </ul>
          </div>
        </details>
        ${renderCtaBanner(g, {
          eyebrow: 'Zainteresowała Cię nasza oferta?',
          heading: 'Zamów bezpłatny pomiar i wycenę',
          text: 'Doradzimy odpowiednie rozwiązanie i przygotujemy niezobowiązującą kalkulację cenową.',
        })}`;

      return buildSubpageDocument({
        path,
        title: title || heading,
        description,
        heading,
        eyebrow,
        lead,
        breadcrumbsHtml,
        quickNavHtml: renderCategoryQuickNav(path),
        contentHtml,
        globals: g,
      });
    },
  },

  {
    id: 'product',
    name: 'Karta produktu',
    description:
      'Szczegółowa strona produktu z galerią zdjęć, opisem zalet, kartą profilu i nawigacją.',
    defaultFolder: 'produkty',
    createPageHtml({
      path = 'produkty/nowy-produkt/index.html',
      title,
      description,
      heading = 'Nowy produkt',
      eyebrow = 'Produkt z oferty',
      lead = 'Nowoczesne rozwiązanie z oferty WOL-BUD Tarnów — trwałość, estetyka i profesjonalny montaż.',
      globals,
    } = {}) {
      const g = resolveGlobals(globals);
      const rel = (p) => toRelativeUrl(p, path);
      const safeHeading = escapeHtml(heading);
      const breadcrumbsHtml = `<a href="${rel('index.html#oferta')}" data-home-link>Strona główna</a><span>/</span><a href="${rel('oferta/index.html')}">Oferta</a><span>/</span><span aria-current="page">${safeHeading}</span>`;

      const img1 = rel('img/products/okna-alu-przesuwne.webp');
      const thumb1 = rel('img/realizacje/miniatury/okna-alu-przesuwne.webp');
      const img2 = rel('img/realizacje/dom-nowoczesna-stodola-04.webp');
      const thumb2 = rel('img/realizacje/miniatury/dom-nowoczesna-stodola-04.webp');
      const img3 = rel('img/realizacje/dom-nowoczesna-stodola-02.webp');
      const thumb3 = rel('img/realizacje/miniatury/dom-nowoczesna-stodola-02.webp');
      const profileImg = rel('img/profiles/pcv-energetic.webp');

      const contentHtml = `<div class="product-gallery product-gallery--door" data-gallery>
          <div class="product-gallery-stage">
            <button type="button" class="gallery-nav-arrow gallery-prev" data-gallery-prev aria-label="Poprzednie zdjęcie">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <button type="button" class="product-detail-visual" data-gallery-trigger aria-haspopup="dialog" aria-label="Powiększ zdjęcie produktu: ${safeHeading}">
              <img src="${img1}" alt="${safeHeading}" id="mainGalleryImg" data-gallery-main decoding="async">
              <div class="gallery-zoom-badge">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
                <span>Powiększ</span>
              </div>
              <div class="gallery-counter"><span data-gallery-curr>1</span> / <span>3</span></div>
            </button>
            <button type="button" class="gallery-nav-arrow gallery-next" data-gallery-next aria-label="Następne zdjęcie">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
          </div>
          <div class="photo-strip" data-scroll-gallery aria-label="Galeria zdjęć: ${safeHeading}">
            <button type="button" class="photo-strip-arrow" data-scroll-prev aria-label="Poprzednie zdjęcie" aria-disabled="true">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <div class="product-gallery-row" data-scroll-track tabindex="0" role="region" aria-label="Galeria zdjęć: ${safeHeading}" data-gallery-thumbs>
              <button type="button" class="product-gallery-thumb is-active" data-index="0" data-src="${img1}" data-ratio="1.33445" style="--gallery-ratio: 1.33445;" aria-label="Pokaż zdjęcie 1 z 3: ${safeHeading}" aria-current="true">
                <img src="${thumb1}" alt="${safeHeading}" loading="lazy" decoding="async">
              </button>
              <button type="button" class="product-gallery-thumb" data-index="1" data-src="${img2}" data-ratio="0.75000" style="--gallery-ratio: 0.75000;" aria-label="Pokaż zdjęcie 2 z 3: ${safeHeading}" aria-current="false">
                <img src="${thumb2}" alt="${safeHeading}" loading="lazy" decoding="async">
              </button>
              <button type="button" class="product-gallery-thumb" data-index="2" data-src="${img3}" data-ratio="0.75000" style="--gallery-ratio: 0.75000;" aria-label="Pokaż zdjęcie 3 z 3: ${safeHeading}" aria-current="false">
                <img src="${thumb3}" alt="${safeHeading}" loading="lazy" decoding="async">
              </button>
            </div>
            <button type="button" class="photo-strip-arrow" data-scroll-next aria-label="Następne zdjęcie" aria-disabled="false">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
          </div>
        </div>
        <details class="mobile-details source-content-disclosure" open data-responsive-disclosure>
          <summary>Opis, zalety i parametry produktu</summary>
          <div class="mobile-details-body source-content-body">
            <div class="article-copy">
              <p>Szczegółowy opis produktu – przedstaw najważniejsze cechy konstrukcyjne, zastosowanie oraz dostępne opcje wykończenia.</p>
              <ul class="source-list">
                <li>Wysokie parametry izolacyjności cieplnej i akustycznej</li>
                <li>Trwałe okucia, uszczelki oraz bogata paleta kolorów</li>
                <li>Możliwość zamówienia wraz z ciepłym montażem warstwowym</li>
              </ul>
            </div>
          </div>
        </details>
        <section class="profile-list" aria-label="Parametry: ${safeHeading}">
          <article class="profile-row" id="${uniqueSectionId('system')}">
            <figure class="profile-row__media">
              <img src="${profileImg}" alt="${safeHeading} – przekrój systemu" data-lightbox-trigger data-lightbox-src="${profileImg}" data-lightbox-group="profile" loading="lazy" decoding="async">
            </figure>
            <div class="profile-row__body">
              <span class="profile-row__kicker">Specyfikacja techniczna</span>
              <h2>Wariant podstawowy</h2>
              <details class="mobile-details profile-row__details" open data-responsive-disclosure>
                <summary>Opis i parametry</summary>
                <div class="mobile-details-body">
                  <p>Opis kluczowych parametrów technicznych, głębokości zabudowy, pakietu szybowego oraz wariantów wyposażenia dodatkowego.</p>
                </div>
              </details>
            </div>
          </article>
        </section>
        <nav class="product-nav-bar" aria-label="Nawigacja między produktami">
          <span></span>
          <a class="pnav-all" href="${rel('oferta/index.html')}">Wróć do pełnej oferty ↗</a>
          <span></span>
        </nav>
        ${renderCtaBanner(g, {
          eyebrow: 'Zainteresował Cię ten produkt?',
          heading: 'Zamów wycenę lub bezpłatny pomiar',
          text: 'Bezpłatny i niewiążący pomiar, doradztwo i wycena są dostępne na budowie lub w naszych salonach sprzedaży.',
        })}`;

      return buildSubpageDocument({
        path,
        title: title || heading,
        description,
        heading,
        eyebrow,
        lead,
        breadcrumbsHtml,
        contentHtml,
        globals: g,
      });
    },
  },

  {
    id: 'promo',
    name: 'Promocja / Oferta specjalna',
    description:
      'Czysta strona promocji z opisem oferty specjalnej i wezwaniem do kontaktu — bez zbędnych zdjęć, gotowa do rozbudowy własnymi blokami.',
    defaultFolder: 'promocje',
    createPageHtml({
      path = 'promocje/nowa-promocja/index.html',
      title,
      description,
      heading = 'Promocja sezonowa WOL-BUD',
      eyebrow = 'Oferta specjalna',
      lead = 'Skorzystaj ze specjalnych warunków zakupu stolarki otworowej z profesjonalnym montażem w Tarnowie i Radłowie.',
      globals,
    } = {}) {
      const g = resolveGlobals(globals);
      const rel = (p) => toRelativeUrl(p, path);
      const safeHeading = escapeHtml(heading);
      const breadcrumbsHtml = `<a href="${rel('index.html#oferta')}" data-home-link>Strona główna</a><span>/</span><a href="${rel('oferta/index.html')}">Oferta</a><span>/</span><span aria-current="page">${safeHeading}</span>`;

      const contentHtml = `<article class="service-card" id="${uniqueSectionId('promocja')}">
          <h2>Szczegóły promocji</h2>
          <p>Opisz tutaj warunki promocji, objęte produkty, termin obowiązywania oraz korzyści dla klientów.</p>
          <ul class="source-list">
            <li>Atrakcyjne warunki cenowe na wybrane systemy okienne i drzwiowe</li>
            <li>Bezpłatny pomiar i profesjonalne doradztwo techniczne na budowie</li>
            <li>Możliwość zamówienia z profesjonalnym montażem przez ekipę WOL-BUD</li>
          </ul>
        </article>
        ${renderCtaBanner(g, {
          eyebrow: 'Oferta ograniczona czasowo',
          heading: 'Zapytaj o szczegóły promocji',
          text: 'Zadzwoń lub napisz do nas, a przygotujemy indywidualną wycenę dopasowaną do Twojej inwestycji.',
        })}`;

      return buildSubpageDocument({
        path,
        title: title || heading,
        description,
        heading,
        eyebrow,
        lead,
        breadcrumbsHtml,
        contentHtml,
        globals: g,
      });
    },
  },

  {
    id: 'info',
    name: 'Strona informacyjna / Poradnik',
    description:
      'Przejrzysta podstrona tekstowa na poradnik, stronę informacyjną, politykę lub aktualność.',
    defaultFolder: '',
    createPageHtml({
      path = 'informacje/index.html',
      title,
      description,
      heading = 'Strona informacyjna',
      eyebrow = 'WOL-BUD Tarnów',
      lead = 'Najważniejsze informacje, porady techniczne oraz odpowiedzi na pytania inwestorów.',
      globals,
    } = {}) {
      const g = resolveGlobals(globals);
      const rel = (p) => toRelativeUrl(p, path);
      const safeHeading = escapeHtml(heading);
      const breadcrumbsHtml = `<a href="${rel('index.html')}" data-home-link>Strona główna</a><span>/</span><span aria-current="page">${safeHeading}</span>`;

      const contentHtml = `<details class="mobile-details source-content-disclosure" open data-responsive-disclosure>
          <summary>Treść strony</summary>
          <div class="mobile-details-body source-content-body">
            <p>Wprowadź tutaj główną treść swojej podstrony. Możesz swobodnie dodawać nagłówki, akapity oraz listy wypunktowane, aby tekst był przejrzysty i wygodny w odbiorze.</p>
            <h3>Najważniejsze informacje</h3>
            <ul class="source-list">
              <li>Pierwszy kluczowy punkt lub zalecenie techniczne</li>
              <li>Drugi istotny szczegół dotyczący oferty lub realizacji</li>
              <li>Trzeci element podsumowujący korzyści dla klienta</li>
            </ul>
            <p>Masz dodatkowe pytania? Zapraszamy do kontaktu telefonicznego albo odwiedzenia naszych salonów w Tarnowie i Radłowie.</p>
          </div>
        </details>
        <article class="service-card" id="${uniqueSectionId('info')}">
          <h2>Dodatkowe wskazówki</h2>
          <p class="service-card-teaser">Dodatkowa karta na wyróżnione informacje, harmonogram lub podsumowanie poradnika.</p>
          <p>Kliknij w dowolny tekst w trybie edycji wizualnej, aby szybko dopasować treść do potrzeb Twojej strony.</p>
        </article>
        ${renderCtaBanner(g, {
          eyebrow: 'Porozmawiajmy o Twojej inwestycji',
          heading: 'Odwiedź nasz salon lub zadzwoń',
          text: 'Chętnie odpowiemy na pytania i umówimy bezpłatny pomiar w dogodnym terminie.',
        })}`;

      return buildSubpageDocument({
        path,
        title: title || heading,
        description,
        heading,
        eyebrow,
        lead,
        breadcrumbsHtml,
        contentClass: 'subpage-content article-copy',
        contentHtml,
        globals: g,
      });
    },
  },
];
