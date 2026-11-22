// znajdz_analogiczne: zanim AI coś doda lub zmieni wygląd, sprawdza, jak to samo miejsce wygląda
// na stronach tego samego rodzaju (siostrzanych). Tylko odczyt, bez myślenia modelu: czysty przegląd HTML.

export const tools = [
  {
    name: 'znajdz_analogiczne',
    description:
      'Pokazuje strony tego samego rodzaju co wskazana (np. inne podkategorie tej samej kategorii, inne produkty, inne promocje) i ich bloki po kolei (klasa, nagłówek). Mówi, których bloków wskazanej stronie brakuje albo które ma inne niż reszta. Użyj ZAWSZE przed dodaniem sekcji, kafelka, strony albo zmianą układu, a potem skopiuj blok z analogicznej strony (clone_site_component, sourcePage + sectionIndex z list_site_components).',
    parameters: {
      type: 'object',
      properties: {
        strona: { type: 'string', description: 'Ścieżka strony, np. kategorie/okna-pcv/index.html. Brak = bieżąca strona w edytorze.' },
      },
    },
  },
];

const clean = (p) => String(p || '').trim().replace(/^\.?\/+/, '');

function resolve(href, from) {
  if (!href || /^(https?:|mailto:|tel:|#|javascript:)/i.test(href)) return '';
  try {
    const u = new URL(href, 'https://x.local/' + from);
    let p = decodeURIComponent(u.pathname).replace(/^\/+/, '');
    if (!p || p.endsWith('/')) p += 'index.html';
    return p;
  } catch {
    return '';
  }
}

function pageKind(path, doc) {
  if (path === 'index.html') return 'strona główna';
  const crumbs = [...doc.querySelectorAll('.breadcrumbs a[href]')].length;
  const top = path.split('/')[0];
  if (doc.querySelector('meta[http-equiv="refresh" i]')) return 'przekierowanie';
  if (top === 'produkty' || doc.querySelector('.product-gallery')) return 'produkt';
  if (top === 'kategorie') return crumbs >= 3 ? 'podkategoria' : 'kategoria';
  return top.includes('.html') ? 'strona informacyjna' : top;
}

function parentOf(path, doc) {
  const links = [...doc.querySelectorAll('.breadcrumbs a[href]')].map((a) => resolve(a.getAttribute('href'), path));
  return links.filter((p) => p && p !== 'index.html' && p !== path).at(-1) || '';
}

function blocks(doc) {
  const main = doc.querySelector('main') || doc.body;
  const wrap = main.querySelector(':scope > .wrap') || main;
  const content = wrap.querySelector('.subpage-content');
  const list = content ? [...content.children] : [...(main.querySelector('.wrap') ? wrap.children : main.children)];
  return list
    .filter((el) => !['SCRIPT', 'STYLE'].includes(el.tagName) && !el.hasAttribute('data-cms-ui'))
    .map((el, i) => {
      const cls = (el.getAttribute('class') || el.tagName.toLowerCase()).split(/\s+/)[0];
      const h = el.querySelector('h2, h3, summary');
      return { nr: i, klasa: cls, naglowek: h ? h.textContent.trim().slice(0, 60) : '' };
    });
}

export async function run(name, args, ctx) {
  const path = clean(args.strona) || ctx.currentPage || 'index.html';
  const html = await ctx.readPage(path);
  if (!html) return { ok: false, error: `Nie znaleziono strony „${path}”.` };
  const doc = ctx.parse(html);
  const kind = pageKind(path, doc);
  const parent = parentOf(path, doc);
  const top = path.split('/')[0];

  const candidates = ctx.listPages().filter((p) => p.path !== path && p.path.split('/')[0] === top);
  const analog = [];
  for (const p of candidates) {
    if (analog.length >= 4) break;
    const h = await ctx.readPage(p.path);
    if (!h) continue;
    const d = ctx.parse(h);
    if (pageKind(p.path, d) !== kind) continue;
    analog.push({ path: p.path, label: p.label, sameParent: parentOf(p.path, d) === parent, blocks: blocks(d) });
  }
  analog.sort((a, b) => Number(b.sameParent) - Number(a.sameParent));

  const mine = blocks(doc);
  const mineClasses = new Set(mine.map((b) => b.klasa));
  const counts = new Map();
  for (const a of analog) for (const c of new Set(a.blocks.map((b) => b.klasa))) counts.set(c, (counts.get(c) || 0) + 1);
  const half = Math.max(1, Math.ceil(analog.length / 2));
  const missing = [...counts].filter(([c, n]) => n >= half && !mineClasses.has(c)).map(([c]) => c);
  const foreign = mine.filter((b) => analog.length && !counts.has(b.klasa)).map((b) => b.klasa);

  return {
    ok: true,
    strona: path,
    rodzaj: kind,
    rodzic: parent || null,
    blokiTejStrony: mine,
    analogiczneStrony: analog,
    brakujeWzgledemAnalogicznych: missing,
    obceBloki_nieWystepujaNaAnalogicznych: foreign,
    wskazowka:
      'Nowe bloki kopiuj tylko z analogicznych stron (clone_site_component). Obce bloki to prawdopodobnie wymyślony układ — zaproponuj klientowi zamianę na blok z analogicznej strony.',
  };
}
