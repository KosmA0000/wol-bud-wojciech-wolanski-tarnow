// Przepis „sprawdz_powiazania” — tylko odczyt. Gdzie dana strona / tekst występuje na całej witrynie.
export const tools = [
  {
    name: 'sprawdz_powiazania',
    description:
      'Sprawdza, z czym łączy się strona albo tekst, ZANIM cokolwiek zmienisz. Podaj nazwę strony (np. „Okna PCV”, „rolety”), ścieżkę (np. kategorie/okna-pcv/) albo dowolny tekst. Zwraca: typ strony (kategoria / podkategoria / produkt / …), rodzica, dzieci, wszystkie miejsca, które do niej prowadzą (kafelki ze stroną i sekcją, pigułki, menu, stopka, okruszki, nawigacja produktów, sidebar, linki w treści) oraz gdzie występuje jej nazwa (title, h1). Dla tekstu: na których stronach i w jakich miejscach występuje. Niczego nie zmienia.',
    parameters: {
      type: 'object',
      properties: {
        cel: { type: 'string', description: 'Nazwa strony, ścieżka strony albo tekst do znalezienia.' },
      },
      required: ['cel'],
    },
  },
];

const MAX_ITEMS = 120;

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/\s+/g, ' ')
    .trim();

function cleanPath(p) {
  let s = String(p || '').trim().replace(/^https?:\/\/[^/]+\//i, '').replace(/^\.?\/+/, '');
  s = s.split('#')[0].split('?')[0];
  if (!s) return 'index.html';
  if (s.endsWith('/')) return `${s}index.html`;
  if (!/\.[a-z0-9]+$/i.test(s)) return `${s}/index.html`;
  return s;
}

function resolveHref(fromPath, href) {
  const h = String(href || '').trim();
  if (!h || h.startsWith('#') || /^(tel:|mailto:|javascript:|data:)/i.test(h)) return null;
  if (/^https?:\/\//i.test(h) && !/wol-bud/i.test(h)) return null;
  try {
    const u = new URL(h, `https://site.local/${fromPath}`);
    let p = decodeURIComponent(u.pathname).replace(/^\/+/, '');
    if (!p || p.endsWith('/')) p += 'index.html';
    if (!/\.[a-z0-9]+$/i.test(p)) p += '/index.html';
    // GitHub Pages: /<repo>/ prefiks
    p = p.replace(/^wol-bud-wojciech-wolanski-tarnow\//, '');
    return p;
  } catch {
    return null;
  }
}

function sectionLabel(el) {
  const sec = el.closest('section, article, aside, header, footer, nav, main');
  if (!sec) return '';
  const h = sec.querySelector('h1, h2, h3, .section-title, .eyebrow');
  const head = h ? h.textContent.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
  const id = sec.id ? `#${sec.id}` : '';
  return [head, id].filter(Boolean).join(' ') || sec.tagName.toLowerCase();
}

// Jakie to miejsce na stronie
function placeOf(el) {
  const rules = [
    ['menu', 'nav#site-menu, #site-menu, header.bar nav'],
    ['stopka', 'footer'],
    ['okruszki', '.page-nav-bar .breadcrumbs, .page-nav-bar nav, .breadcrumbs, [aria-label*="okruszk" i], [aria-label*="breadcrumb" i]'],
    ['przycisk wstecz', '.btn-back'],
    ['nawigacja produktów', 'nav.product-nav-bar, .product-nav-bar'],
    ['pigułka (pasek kategorii)', '.cat-quick-nav, .cat-nav-pill'],
    ['sidebar', 'aside.subpage-sidebar, aside'],
    ['kafelek kategorii', '.home-cat-card'],
    ['karta podkategorii', '.subcat-card'],
    ['karta produktu', '.cat-prod-card'],
    ['kafelek usługi', '.home-service-item, .service-card'],
    ['kafelek', '[class*="card"], [class*="tile"], [class*="item"]'],
    ['baner', '.cta-banner-dark, [class*="banner"]'],
  ];
  for (const [name, sel] of rules) {
    let hit = null;
    try {
      hit = el.closest(sel);
    } catch {
      hit = null;
    }
    if (hit) return { miejsce: name, el: hit };
  }
  return { miejsce: 'link w treści', el };
}

function text(el) {
  return String(el?.textContent || '').replace(/\s+/g, ' ').trim();
}

function breadcrumbsOf(doc, path) {
  const bc = doc.querySelector('.page-nav-bar .breadcrumbs, .breadcrumbs, .page-nav-bar nav, nav[aria-label*="okruszk" i]');
  if (!bc) return [];
  return Array.from(bc.querySelectorAll('a, [aria-current="page"]')).map((a) => ({
    label: text(a),
    path: a.tagName === 'A' ? resolveHref(path, a.getAttribute('href')) : path,
    current: a.getAttribute('aria-current') === 'page',
  }));
}

function pageType(path, doc) {
  if (doc?.querySelector('meta[http-equiv="refresh" i]')) return 'przekierowanie';
  if (path === 'index.html') return 'strona główna';
  if (path === 'oferta/index.html') return 'oferta (lista kategorii)';
  if (path.startsWith('produkty/')) return 'produkt';
  if (path.startsWith('promocje/')) return path === 'promocje/index.html' ? 'lista promocji' : 'promocja';
  if (path.startsWith('uslugi/')) return 'usługi';
  if (path.startsWith('kategorie/')) {
    const crumbs = doc ? breadcrumbsOf(doc, path) : [];
    const middle = crumbs.filter(
      (c) => !c.current && c.path && c.path !== 'index.html' && c.path !== 'oferta/index.html'
    );
    return middle.length ? 'podkategoria' : 'kategoria';
  }
  if (path.split('/').length === 2) return 'strona główna działu';
  return 'własna';
}

function parentOf(path, doc) {
  const crumbs = breadcrumbsOf(doc, path).filter((c) => !c.current && c.path && c.path !== path);
  const last = crumbs[crumbs.length - 1];
  return last ? { path: last.path, nazwa: last.label } : null;
}

export async function run(name, args, ctx) {
  if (name !== 'sprawdz_powiazania') return { ok: false, error: `Nieznany przepis: ${name}` };
  const cel = String(args.cel || '').trim();
  if (!cel) return { ok: false, error: 'Podaj cel: nazwę strony, ścieżkę albo tekst.' };

  const pages = ctx.listPages();
  const docs = new Map();
  for (const p of pages) {
    const html = await ctx.readPage(p.path);
    if (html) docs.set(p.path, ctx.parse(html));
  }

  // 1. Czy cel to strona?
  const want = norm(cel);
  const asPath = cleanPath(cel);
  let target = pages.find((p) => p.path === asPath);
  if (!target) {
    const scored = [];
    for (const p of pages) {
      const doc = docs.get(p.path);
      if (doc && pageType(p.path, doc) === 'przekierowanie') continue;
      const names = [p.label, p.title, doc ? text(doc.querySelector('h1')) : '', p.path.split('/').slice(-2, -1)[0]]
        .map(norm)
        .filter(Boolean);
      const slug = norm(ctx.slugify ? ctx.slugify(cel) : cel);
      let score = 0;
      for (const n of names) {
        if (n === want || n === slug) score = Math.max(score, 3);
        else if (n.startsWith(want) || n.split(' | ')[0] === want) score = Math.max(score, 2);
        else if (want.length >= 4 && n.includes(want)) score = Math.max(score, 1);
      }
      if (score) scored.push({ p, score });
    }
    scored.sort((a, b) => b.score - a.score || a.p.path.length - b.p.path.length);
    if (scored.length && (scored[0].score >= 2 || scored.length === 1)) target = scored[0].p;
    else if (scored.length > 1) {
      return {
        ok: false,
        needsAnswer: `Którą stronę masz na myśli, mówiąc „${cel}”?`,
        options: scored.slice(0, 8).map((s) => `${s.p.label || s.p.title} (${s.p.path})`),
      };
    }
  }

  const g = ctx.getGlobals?.() || {};

  if (target) {
    const tPath = target.path;
    const tDoc = docs.get(tPath);
    const links = [];
    const kafelki = [];
    const children = [];
    for (const [path, doc] of docs) {
      if (path === tPath) continue;
      const isRedirect = pageType(path, doc) === 'przekierowanie';
      for (const a of doc.querySelectorAll('a[href]')) {
        const hrefs = [a.getAttribute('href'), a.getAttribute('data-desktop-href')].filter(Boolean);
        if (!hrefs.some((h) => resolveHref(path, h) === tPath)) continue;
        const { miejsce, el } = placeOf(a);
        const entry = {
          strona: path,
          miejsce: isRedirect ? 'przekierowanie' : miejsce,
          sekcja: sectionLabel(el),
          tekst: text(a).slice(0, 80),
        };
        links.push(entry);
        if (/kafel|karta/.test(entry.miejsce)) kafelki.push(entry);
      }
      if (!isRedirect) {
        const par = parentOf(path, doc);
        if (par?.path === tPath) children.push({ path, nazwa: text(doc.querySelector('h1')) || path, typ: pageType(path, doc) });
      }
    }
    const byPlace = {};
    for (const l of links) byPlace[l.miejsce] = (byPlace[l.miejsce] || 0) + 1;
    const menu = (g.menu || []).filter((m) => resolveHref('index.html', m.href) === tPath || resolveHref('index.html', m.mobileHref) === tPath);
    const footer = (g.footerLinks || []).filter((m) => resolveHref('index.html', m.href) === tPath);
    const name = text(tDoc?.querySelector('h1')) || target.label;
    const nameHits = [];
    if (name && name.length >= 3) {
      const n = norm(name);
      for (const [path, doc] of docs) {
        if (path === tPath) continue;
        const t = norm(doc.title);
        const h1 = norm(text(doc.querySelector('h1')));
        if (t.includes(n) || h1.includes(n)) nameHits.push({ strona: path, title: doc.title, h1: text(doc.querySelector('h1')) });
      }
    }
    return {
      ok: true,
      rodzaj: 'strona',
      strona: {
        path: tPath,
        nazwa: name,
        title: tDoc?.title || target.title || '',
        h1: text(tDoc?.querySelector('h1')),
        typ: pageType(tPath, tDoc),
        rodzic: tDoc ? parentOf(tPath, tDoc) : null,
        okruszki: tDoc ? breadcrumbsOf(tDoc, tPath).map((c) => c.label) : [],
        dzieci: children,
      },
      podsumowanie: {
        stronLinkujacych: new Set(links.map((l) => l.strona)).size,
        miejsca: byPlace,
        wMenuGlobalnym: menu.length > 0,
        wStopceGlobalnej: footer.length > 0,
      },
      kafelki: kafelki.slice(0, MAX_ITEMS),
      wszystkieOdwolania: links.slice(0, MAX_ITEMS),
      obcietoOdwolan: Math.max(0, links.length - MAX_ITEMS),
      menu,
      stopka: footer,
      nazwaWTytulachInnychStron: nameHits.slice(0, 40),
      summary: `„${name}” (${pageType(tPath, tDoc)}): prowadzi do niej ${links.length} odwołań z ${new Set(links.map((l) => l.strona)).size} stron; dzieci: ${children.length}.`,
    };
  }

  // 2. Cel to tekst — gdzie występuje
  const hits = [];
  let total = 0;
  for (const [path, doc] of docs) {
    if (pageType(path, doc) === 'przekierowanie') continue;
    const places = {};
    if (norm(doc.title).includes(want)) places.title = (places.title || 0) + 1;
    const walker = doc.createTreeWalker(doc.body || doc.documentElement, 4);
    let node;
    while ((node = walker.nextNode())) {
      if (!norm(node.nodeValue).includes(want)) continue;
      const el = node.parentElement;
      if (!el || el.closest('script, style, noscript')) continue;
      const where = el.closest('h1') ? 'h1' : placeOf(el).miejsce;
      places[where] = (places[where] || 0) + 1;
    }
    for (const el of doc.querySelectorAll('[alt], [aria-label], [title], meta[name="description"], a[href]')) {
      for (const attr of ['alt', 'aria-label', 'title', 'content', 'href']) {
        const v = el.getAttribute(attr);
        if (v && norm(v).includes(want)) places[`atrybut ${attr}`] = (places[`atrybut ${attr}`] || 0) + 1;
      }
    }
    const n = Object.values(places).reduce((a, b) => a + b, 0);
    if (n) {
      total += n;
      hits.push({ strona: path, wystapien: n, miejsca: places });
    }
  }
  const inGlobals = Object.entries(g)
    .filter(([, v]) => norm(JSON.stringify(v)).includes(want))
    .map(([k]) => k);
  return {
    ok: true,
    rodzaj: 'tekst',
    tekst: cel,
    stron: hits.length,
    wystapien: total,
    wDanychGlobalnych: inGlobals,
    strony: hits.slice(0, MAX_ITEMS),
    summary: hits.length
      ? `Tekst „${cel}” występuje ${total} razy na ${hits.length} stronach${inGlobals.length ? ` i w ustawieniach: ${inGlobals.join(', ')}` : ''}.`
      : `Nie znalazłem „${cel}” na żadnej stronie.`,
  };
}
