// Wiedza o stronie podawana AI w każdej wiadomości: AI wie od razu, jak strona jest zbudowana
// i jak wykonać zmianę, bez czytania plików. Generowana z prawdziwych stron, odświeżana po każdej operacji.

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

function kindOf(path, doc) {
  if (path === 'index.html') return 'strona główna';
  if (doc.querySelector('meta[http-equiv="refresh" i]')) return 'przekierowanie';
  const top = path.split('/')[0];
  const crumbs = doc.querySelectorAll('.breadcrumbs a[href]').length;
  if (top === 'produkty' || doc.querySelector('.product-gallery')) return 'produkt';
  if (top === 'kategorie') return crumbs >= 3 ? 'podkategoria' : 'kategoria';
  if (top === 'promocje') return 'promocja';
  return 'strona informacyjna';
}

function parentOf(path, doc) {
  return [...doc.querySelectorAll('.breadcrumbs a[href]')]
    .map((a) => resolve(a.getAttribute('href'), path))
    .filter((p) => p && p !== 'index.html' && p !== 'oferta/index.html' && p !== path)
    .at(-1) || '';
}

function container(doc) {
  const main = doc.querySelector('main') || doc.body;
  const wrap = main.querySelector(':scope > .wrap') || main;
  return wrap.querySelector('.subpage-content') || (main.querySelector(':scope > .wrap') ? wrap : main);
}

const firstClass = (el) => (el.getAttribute('class') || el.tagName.toLowerCase()).split(/\s+/)[0];

function blocksOf(doc) {
  return [...container(doc).children]
    .filter((el) => !['SCRIPT', 'STYLE'].includes(el.tagName) && !el.hasAttribute('data-cms-ui'))
    .map((el) => ({ el, cls: firstClass(el), title: (el.querySelector('h2, h3, summary')?.textContent || '').trim().slice(0, 40) }));
}

let cache = null;
let cacheAt = 0;
export function invalidateKnowledge() {
  cache = null;
}

export async function loadSite(ctx) {
  const pages = [];
  for (const p of ctx.listPages()) {
    const html = await ctx.readPage(p.path);
    if (!html) continue;
    const doc = ctx.parse(html);
    pages.push({ ...p, doc, kind: kindOf(p.path, doc), parent: parentOf(p.path, doc), label: (doc.querySelector('main h1')?.textContent || p.label || p.path).trim() });
  }
  return pages;
}

export async function getSiteKnowledgeText(ctx) {
  if (cache && Date.now() - cacheAt < 120000) return cache;
  const pages = (await loadSite(ctx)).filter((p) => p.kind !== 'przekierowanie');
  const byPath = new Map(pages.map((p) => [p.path, p]));
  const lines = ['WIEDZA O STRONIE (aktualna, z prawdziwych stron — nie musisz jej odczytywać narzędziami):'];

  // 1. Drzewo oferty
  lines.push('', 'DRZEWO OFERTY (nazwa = ścieżka):');
  const children = (parent, kind) => pages.filter((p) => p.kind === kind && p.parent === parent);
  for (const cat of pages.filter((p) => p.kind === 'kategoria')) {
    lines.push(`- ${cat.label} = ${cat.path}`);
    for (const sub of children(cat.path, 'podkategoria')) {
      lines.push(`  - ${sub.label} = ${sub.path}`);
      for (const prod of children(sub.path, 'produkt')) lines.push(`    - ${prod.label} = ${prod.path}`);
    }
    for (const prod of children(cat.path, 'produkt')) lines.push(`  - (produkt) ${prod.label} = ${prod.path}`);
  }
  const others = pages.filter((p) => ['promocja', 'strona informacyjna'].includes(p.kind));
  if (others.length) lines.push('Inne strony: ' + others.map((p) => `${p.label} = ${p.path}`).join('; '));

  // 2. Układ każdego rodzaju strony (typowa kolejność bloków) + skąd prowadzą do niego linki
  lines.push('', 'JAK ZBUDOWANY JEST KAŻDY RODZAJ STRONY (bloki od góry, w nawiasie przykładowy nagłówek; „dodaj_blok” kopiuje blok z takiej strony):');
  const kinds = [...new Set(pages.map((p) => p.kind))];
  for (const kind of kinds) {
    const same = pages.filter((p) => p.kind === kind);
    const freq = new Map();
    for (const p of same) for (const b of new Set(blocksOf(p.doc).map((x) => x.cls))) freq.set(b, (freq.get(b) || 0) + 1);
    const model = same.map((p) => ({ p, n: blocksOf(p.doc).filter((b) => (freq.get(b.cls) || 0) * 2 >= same.length).length }))
      .sort((a, b) => b.n - a.n)[0]?.p;
    if (!model) continue;
    const seq = blocksOf(model.doc).map((b) => {
      const share = Math.round(((freq.get(b.cls) || 0) / same.length) * 100);
      return `${b.cls}${b.title ? ` („${b.title}”)` : ''}${share < 100 ? ` [${share}% stron]` : ''}`;
    });
    // skąd linkują
    const from = new Map();
    for (const host of pages) {
      for (const a of host.doc.querySelectorAll('main a[href], nav a[href], footer a[href]')) {
        const target = byPath.get(resolve(a.getAttribute('href'), host.path));
        if (!target || target.kind !== kind || target === host) continue;
        const block = a.closest('[class]');
        const where = `${host.kind}: ${block ? firstClass(block.closest('section, nav, footer, aside, [class*="grid"], [class*="pills"]') || block) : 'link'}`;
        from.set(where, (from.get(where) || 0) + 1);
      }
    }
    const fromTxt = [...from].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([w]) => w).join(', ');
    lines.push(`- ${kind} (${same.length} stron, wzór: ${model.path}): ${seq.join(' → ')}${fromTxt ? `. Linki do niej są w: ${fromTxt}` : ''}`);
  }

  lines.push(
    '',
    'JAK WYKONAĆ TYPOWE PROŚBY (od razu, jednym narzędziem):',
    '- „dodaj X do oferty” → dodaj_pozycje_oferty (zapyta: kategoria/podkategoria/produkt i rodzic; sam doda stronę, kafelki, pigułki, menu, okruszki).',
    '- „dodaj kafelek” → dodaj_kafelek. „dodaj sekcję / opis / galerię / FAQ / opinie jak na innych stronach” → dodaj_blok (blok = nazwa z listy wyżej).',
    '- „zmień nazwę / adres” → zmien_nazwe_wszedzie. „zmień telefon / e-mail / adres firmy” → zmien_dane_kontaktowe. „usuń X” → usun_pozycje_oferty.',
    '- zwykła poprawka tekstu/zdjęcia w jednym miejscu → narzędzia edycji panelu. „cofnij” → cofnij_cala_operacje.',
    'Ścieżki bierz z DRZEWA OFERTY. Narzędzi odczytu (sprawdz_powiazania, znajdz_analogiczne, read_file) używaj tylko, gdy tej wiedzy brakuje.'
  );

  cache = lines.join('\n');
  cacheAt = Date.now();
  return cache;
}

// dodaj_blok: kopiuje blok danego rodzaju z analogicznej strony na to samo miejsce na stronie docelowej.
export const tools = [
  {
    name: 'dodaj_blok',
    description:
      'Dodaje na stronę blok (sekcję) dokładnie taki jak na analogicznych stronach tego samego rodzaju — kopiuje go z wzorcowej strony i wstawia w tym samym miejscu kolejności. Nazwę bloku weź z WIEDZY O STRONIE (np. service-card, source-content-disclosure, product-gallery, cta-banner-dark). Podmienia nagłówek i tekst na podane przez klienta.',
    parameters: {
      type: 'object',
      properties: {
        strona: { type: 'string', description: 'Ścieżka strony docelowej. Brak = bieżąca.' },
        blok: { type: 'string', description: 'Nazwa (klasa) bloku z WIEDZY O STRONIE.' },
        naglowek: { type: 'string', description: 'Nagłówek bloku od klienta (jeśli blok ma nagłówek).' },
        tekst: { type: 'string', description: 'Treść bloku od klienta (jeśli blok ma tekst). Akapity rozdziel pustą linią.' },
        wzor: { type: 'string', description: 'Opcjonalnie: ścieżka strony, z której skopiować blok.' },
      },
      required: ['blok'],
    },
  },
];

export async function run(name, args, ctx) {
  const path = clean(args.strona) || ctx.currentPage;
  const cls = String(args.blok || '').trim().replace(/^\./, '');
  const targetHtml = await ctx.readPage(path);
  if (!targetHtml) return { ok: false, error: `Nie znaleziono strony „${path}”.` };
  const target = ctx.parse(targetHtml);
  const kind = kindOf(path, target);
  const parent = parentOf(path, target);

  const pages = await loadSite(ctx);
  const sources = pages
    .filter((p) => p.path !== path && (args.wzor ? p.path === clean(args.wzor) : p.kind === kind))
    .filter((p) => blocksOf(p.doc).some((b) => b.cls === cls))
    .sort((a, b) => Number(b.parent === parent) - Number(a.parent === parent));
  const src = sources[0];
  if (!src) {
    const avail = [...new Set(pages.filter((p) => p.kind === kind).flatMap((p) => blocksOf(p.doc).map((b) => b.cls)))];
    return { ok: false, needsAnswer: `Na stronach tego rodzaju nie ma bloku „${cls}”. Który blok dodać?`, options: avail };
  }

  const rebased = ctx.parse(ctx.rebaseUrls(await ctx.readPage(src.path), src.path, path));
  const srcBlocks = blocksOf(rebased);
  const idx = srcBlocks.findIndex((b) => b.cls === cls);
  const block = srcBlocks[idx].el.cloneNode(true);
  block.removeAttribute('id');
  block.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));

  const heading = block.querySelector('h2, h3');
  const paras = [...block.querySelectorAll('p')];
  if ((heading && !args.naglowek) || (paras.length && !args.tekst)) {
    return {
      ok: false,
      needsAnswer: `Jaki ${heading && !args.naglowek ? 'nagłówek' : ''}${heading && !args.naglowek && paras.length && !args.tekst ? ' i ' : ''}${paras.length && !args.tekst ? 'tekst' : ''} ma mieć nowy blok? (Nie wymyślam treści.)`,
    };
  }
  if (heading) heading.textContent = args.naglowek;
  if (paras.length) {
    const chunks = String(args.tekst).split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
    const host = paras[0].parentElement;
    paras.forEach((p, i) => (i < chunks.length ? (p.textContent = chunks[i]) : p.remove()));
    for (let i = paras.length; i < chunks.length; i++) {
      const p = paras[0].cloneNode(false);
      p.textContent = chunks[i];
      host.append(p);
    }
    const summary = block.querySelector('summary');
    if (summary && heading === null && args.naglowek) summary.textContent = args.naglowek;
  }

  // to samo miejsce: po bloku, który na wzorze stoi przed nim
  const tBlocks = blocksOf(target);
  const prevCls = srcBlocks.slice(0, idx).reverse().map((b) => b.cls).find((c) => tBlocks.some((t) => t.cls === c));
  const anchor = prevCls ? tBlocks.filter((t) => t.cls === prevCls).at(-1).el : null;
  const box = container(target);
  const node = target.importNode(block, true);
  if (anchor) anchor.after(node);
  else if (idx === 0 && box.firstElementChild) box.firstElementChild.before(node);
  else box.append(node);

  await ctx.writePage(path, ctx.serialize(target));
  return { ok: true, summary: `Dodałem blok „${cls}” skopiowany z „${src.label}” w tym samym miejscu co na analogicznych stronach.`, changedPages: [path] };
}
