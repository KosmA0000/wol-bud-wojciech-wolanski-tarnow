// Wiedza o stronie podawana AI w każdej wiadomości: AI wie od razu, jak strona jest zbudowana
// i jak wykonać zmianę, bez czytania plików. Generowana z prawdziwych stron, odświeżana po każdej operacji.
// Eksportuje też wspólne pomocniki bloków (używa ich blocks.js).
import { groupRulesText } from './consistency.js?v=turbo29';

export const clean = (p) => String(p || '').trim().replace(/^\.?\/+/, '');

export function resolve(href, from) {
  if (!href || /^(https?:|mailto:|tel:|#|javascript:|data:)/i.test(href)) return '';
  try {
    const u = new URL(href, 'https://x.local/' + from);
    let p = decodeURIComponent(u.pathname).replace(/^\/+/, '');
    if (!p || p.endsWith('/')) p += 'index.html';
    return p;
  } catch {
    return '';
  }
}

export function kindOf(path, doc) {
  if (path === 'index.html') return 'strona główna';
  if (doc.querySelector('meta[http-equiv="refresh" i]')) return 'przekierowanie';
  const top = path.split('/')[0];
  const crumbs = doc.querySelectorAll('.breadcrumbs a[href]').length;
  if (top === 'produkty' || doc.querySelector('.product-gallery')) return 'produkt';
  if (top === 'kategorie') return crumbs >= 3 ? 'podkategoria' : 'kategoria';
  if (top === 'promocje' && path !== 'promocje/index.html') return 'promocja';
  return 'strona informacyjna';
}

export function parentOf(path, doc) {
  return [...doc.querySelectorAll('.breadcrumbs a[href]')]
    .map((a) => resolve(a.getAttribute('href'), path))
    .filter((p) => p && p !== 'index.html' && p !== 'oferta/index.html' && p !== path)
    .at(-1) || '';
}

export function container(doc) {
  const main = doc.querySelector('main') || doc.body;
  const wrap = main.querySelector(':scope > .wrap') || main;
  return wrap.querySelector('.subpage-content') || (main.querySelector(':scope > .wrap') ? wrap : main);
}

export const firstClass = (el) => (el.getAttribute('class') || el.tagName.toLowerCase()).split(/\s+/)[0];

const blockTitle = (el) =>
  (el.querySelector('h2, h3, summary')?.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 40);

export function blocksOf(doc) {
  return [...container(doc).children]
    .filter((el) => !['SCRIPT', 'STYLE'].includes(el.tagName) && !el.hasAttribute('data-cms-ui'))
    .map((el) => ({ el, cls: firstClass(el), title: blockTitle(el) }));
}

export const blockLabel = (b) => `${b.cls}${b.title ? ` („${b.title}”)` : ''}`;

const normTxt = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/\s+/g, ' ')
    .trim();

// Znajduje bloki na stronie po: klasie (dowolnej z klas), „klasa:N” (N-ty, od 1) albo fragmencie nagłówka.
export function findBlocks(doc, blok) {
  const all = blocksOf(doc);
  let q = String(blok || '').trim().replace(/^\./, '');
  if (!q) return { all, matches: [] };
  const nth = q.match(/^(.+?):(\d+)$/);
  if (nth) {
    const same = all.filter((b) => b.el.classList.contains(nth[1]) || b.cls === nth[1]);
    return { all, matches: same[Number(nth[2]) - 1] ? [same[Number(nth[2]) - 1]] : [] };
  }
  let matches = all.filter((b) => b.cls === q);
  if (!matches.length) matches = all.filter((b) => b.el.classList.contains(q));
  if (!matches.length) {
    const nq = normTxt(q.replace(/^.*?„|”.*$/g, ''));
    matches = all.filter((b) => nq && normTxt(b.title).includes(nq));
  }
  return { all, matches };
}

// Rodzaj strony z całej witryny: podkategoria = strona kategorie/, do której prowadzi .subcat-card z innej kategorii.
export function classify(pages) {
  const byPath = new Map(pages.map((p) => [p.path, p]));
  for (const host of pages) {
    if (!host.path.startsWith('kategorie/') || host.kind === 'przekierowanie') continue;
    for (const a of host.doc.querySelectorAll('.subcat-card[href], .subcat-card a[href]')) {
      const t = byPath.get(resolve(a.getAttribute('href'), host.path));
      if (t && t !== host && t.path.startsWith('kategorie/') && t.kind !== 'przekierowanie') {
        t.kind = 'podkategoria';
        t.parent = host.path;
      }
    }
  }
  return pages;
}

export async function loadSite(ctx) {
  const pages = [];
  for (const p of ctx.listPages()) {
    const html = await ctx.readPage(p.path);
    if (!html) continue;
    const doc = ctx.parse(html);
    pages.push({ ...p, doc, kind: kindOf(p.path, doc), parent: parentOf(p.path, doc), label: (doc.querySelector('main h1')?.textContent || p.label || p.path).replace(/\s+/g, ' ').trim() });
  }
  return classify(pages);
}

// Ściągawka: prośba klienta → narzędzie (wszystkie przepisy A–D).
export const HOW_TO = [
  'JAK WYKONAĆ (od razu, JEDNYM narzędziem; przepis sam robi cały łańcuch zmian i pyta, gdy czegoś brakuje):',
  'Oferta i podstrony:',
  '- „dodaj X do oferty” (kategoria / podkategoria / produkt) → dodaj_pozycje_oferty (zapyta o rodzaj i rodzica; strona z kopii analogicznej, kafelki, pigułki, menu, okruszki, nawigacja produktów).',
  '- „dodaj stronę / promocję / podstronę informacyjną” → dodaj_podstrone (kopia analogicznej strony tego rodzaju, linki tam, gdzie do analogicznych).',
  '- „zrób taką samą stronę jak X” → duplikuj_strone.',
  '- „zmień nazwę / adres strony” → zmien_nazwe_wszedzie. „przenieś produkt / podkategorię do innej kategorii” → przenies_pozycje.',
  '- „zmień kolejność” (menu, kafelki oferty, podkategorie, produkty) → zmien_kolejnosc (ta sama kolejność wszędzie, gdzie lista występuje).',
  '- „usuń X z oferty / usuń stronę” → usun_pozycje_oferty. „schowaj / pokaż X” (bez usuwania) → ukryj_pozycje.',
  'Kafelki:',
  '- „dodaj kafelek” → dodaj_kafelek. „zmień kafelek (tytuł, opis, zdjęcie)” → zmien_kafelek (wszędzie, gdzie prowadzi do tej strony).',
  '- „usuń kafelek” (strona zostaje) → usun_kafelek.',
  'Części stron (bloki — nazwy z listy „JAK ZBUDOWANY…” wyżej):',
  '- „dodaj sekcję / opis / galerię / baner jak na innych stronach” → dodaj_blok.',
  '- „usuń sekcję / blok” → usun_blok (zapyta: tylko tu czy na wszystkich stronach tego rodzaju).',
  '- „przesuń sekcję wyżej / niżej / pod X” → przenies_blok.',
  '- „zmień baner / wspólny blok na wszystkich stronach kategorii / produktów” → zmien_blok_wszedzie.',
  'Dane firmy i inne:',
  '- „zmień telefon / e-mail / adres firmy” → zmien_dane_kontaktowe.',
  '- zwykła poprawka tekstu / zdjęcia / linku w jednym miejscu → narzędzia edycji panelu (update_element_text, update_element_image, update_element_link).',
  '- „cofnij”, „nie tak”, „przywróć” → cofnij_cala_operacje (cofa całą ostatnią operację naraz).',
  '- tylko gdy czegoś brakuje w tej wiedzy: sprawdz_powiazania (gdzie coś występuje), znajdz_analogiczne (jak zbudowane są strony tego rodzaju), read_file.',
  'Spójność: po każdym przepisie sprawdź pole „niespojnosci” w wyniku; niepuste → wykonaj ich „fix” (najczęściej dolacz_do_grupy) albo napraw_spojnosc, i dopiero wtedy kończ.',
  'Ścieżki bierz z DRZEWA OFERTY. Treść (teksty, ceny, opinie, zdjęcia) tylko od klienta — nic nie wymyślaj.',
];

let cache = null;
let cacheAt = 0;
export function invalidateKnowledge() {
  cache = null;
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
      lines.push(`  - (podkategoria) ${sub.label} = ${sub.path}`);
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
      return `${blockLabel(b)}${share < 100 ? ` [${share}% stron]` : ''}`;
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

  // 3. Katalog wszystkich sekcji witryny: AI od razu wie, jaka sekcja istnieje i gdzie (bez szukania narzędziami)
  const catalog = new Map();
  for (const p of pages) {
    for (const b of blocksOf(p.doc)) {
      if (!catalog.has(b.cls)) catalog.set(b.cls, { label: blockLabel(b), pages: [] });
      const entry = catalog.get(b.cls);
      if (!entry.pages.includes(p.path)) entry.pages.push(p.path);
    }
  }
  lines.push('', 'KATALOG SEKCJI CAŁEJ WITRYNY (nazwa („nagłówek”) — gdzie jest). Gdy klient chce „sekcję X”, znajdź ją tu i od razu dodaj_blok { blok: nazwa, wzor: strona z listy }; gdy pasuje kilka — zapytaj krótko, którą, podając nagłówki:');
  for (const [, e] of [...catalog].sort((a, b) => b[1].pages.length - a[1].pages.length).slice(0, 70)) {
    const where = e.pages.slice(0, 3).join(', ') + (e.pages.length > 3 ? ` (+${e.pages.length - 3})` : '');
    lines.push(`- ${e.label} — ${where}`);
  }

  // 4. Reguły grup: czego wymaga każda grupa od nowego elementu (z consistency.js)
  try {
    lines.push('', await groupRulesText(ctx));
  } catch {}

  lines.push('', ...HOW_TO);

  cache = lines.join('\n');
  cacheAt = Date.now();
  return cache;
}

// Tekst bloku na wielu stronach taki sam = blok wspólny (baner CTA itp.) — kopiujemy go 1:1.
export function isSharedBlock(blocks) {
  const seen = new Map();
  for (const b of blocks) {
    const t = normTxt(b.el.textContent);
    if (!t) continue;
    seen.set(t, (seen.get(t) || 0) + 1);
  }
  return [...seen.values()].some((n) => n >= 2);
}

// Wstawia treść klienta w klon bloku: nagłówek + akapity; usuwa cały tekst skopiowany ze strony-wzoru.
export function fillBlock(block, { naglowek, tekst }) {
  const doc = block.ownerDocument;
  const heading = block.querySelector('h2, h3') || block.querySelector('summary');
  if (heading && naglowek) heading.textContent = naglowek;
  const textEls = [...block.querySelectorAll('p, ul, ol, table, blockquote, h3, h4, dl')].filter(
    (el) => el !== heading && !el.closest('a, button, .btn, [class*="btn"]') && !el.querySelector('a[href^="tel:"], a[href^="mailto:"]')
  );
  const top = textEls.filter((el) => !textEls.some((o) => o !== el && o.contains(el)));
  const firstP = top.find((el) => el.tagName === 'P') || null;
  const host = firstP?.parentElement || top[0]?.parentElement || block.querySelector('.mobile-details-body, .source-content-body') || block;
  const proto = firstP ? firstP.cloneNode(false) : doc.createElement('p');
  const before = firstP || top[0] || null;
  const chunks = String(tekst || '').split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  for (const c of chunks) {
    const p = proto.cloneNode(false);
    p.textContent = c;
    if (before && before.parentElement === host) host.insertBefore(p, before);
    else host.append(p);
  }
  for (const el of top) el.remove();
  return { heading: Boolean(heading), hadText: top.length > 0 };
}

// dodaj_blok: kopiuje blok danego rodzaju z analogicznej strony na to samo miejsce na stronie docelowej.
export const tools = [
  {
    name: 'dodaj_blok',
    description:
      'Dodaje na stronę blok (sekcję) dokładnie taki jak na analogicznych stronach tego samego rodzaju — kopiuje go z wzorcowej strony i wstawia w tym samym miejscu kolejności. Nazwę bloku weź z WIEDZY O STRONIE (np. mobile-details, product-gallery, cta-banner-dark). Wspólne bloki (np. baner CTA) kopiuje 1:1; w blokach z treścią wstawia TYLKO nagłówek i tekst od klienta (bez treści ze strony-wzoru).',
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
  const pages = await loadSite(ctx);
  const me = pages.find((p) => p.path === path);
  const target = ctx.parse(targetHtml);
  const kind = me?.kind || kindOf(path, target);
  const parent = me?.parent || parentOf(path, target);
  const sameKind = pages.filter((p) => p.path !== path && p.kind === kind);

  if (!cls) {
    const avail = [...new Set(sameKind.flatMap((p) => blocksOf(p.doc).map((b) => b.cls)))];
    return { ok: false, needsAnswer: 'Jaki blok dodać? (taki jak na innych stronach tego rodzaju)', options: avail };
  }

  let sources = pages
    .filter((p) => p.path !== path && (args.wzor ? p.path === clean(args.wzor) : p.kind === kind))
    .filter((p) => findBlocks(p.doc, cls).matches.length)
    .sort((a, b) => Number(b.parent === parent) - Number(a.parent === parent));
  if (!sources.length) {
    // Nie ma go na stronach tego rodzaju (albo we wskazanym wzorze) — weź tę samą sekcję z dowolnej strony witryny
    sources = pages.filter((p) => p.path !== path && findBlocks(p.doc, cls).matches.length);
  }
  const src = sources[0];
  if (!src) {
    const avail = [...new Set(pages.flatMap((p) => blocksOf(p.doc).map((b) => blockLabel(b))))].slice(0, 40);
    return { ok: false, needsAnswer: `Na stronie nie ma sekcji „${cls}”. Którą sekcję dodać?`, options: avail };
  }

  const rebased = ctx.parse(ctx.rebaseUrls(await ctx.readPage(src.path), src.path, path));
  const srcBlocks = blocksOf(rebased);
  const srcCls = findBlocks(rebased, cls).matches[0]?.cls || cls;
  const idx = srcBlocks.findIndex((b) => b.cls === srcCls);
  const block = srcBlocks[idx].el.cloneNode(true);
  block.removeAttribute('id');
  block.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));

  const shared = isSharedBlock(sources.map((s) => findBlocks(s.doc, srcCls).matches[0]).filter(Boolean));
  let note = 'skopiowany 1:1 (ten sam blok jest na innych stronach tego rodzaju)';
  if (!shared) {
    const heading = block.querySelector('h2, h3') || block.querySelector('summary');
    const hasText = block.querySelector('p, ul, ol, table');
    const imgs = [...block.querySelectorAll('img')];
    const cards = [...block.querySelectorAll('a[href]')].filter((a) => resolve(a.getAttribute('href'), path).endsWith('.html'));
    const needH = heading && !args.naglowek && !hasText;
    const needT = hasText && !args.tekst;
    if (needH || needT || (heading && hasText && !args.naglowek && !args.tekst)) {
      return {
        ok: false,
        needsAnswer: `Jaki ${needT ? 'tekst' : 'nagłówek'} ma mieć nowy blok „${blockLabel(srcBlocks[idx])}”? (Nie wymyślam treści — podaj ją, a ja wstawię ją w takim samym bloku jak na stronie „${src.label}”.)`,
        options: [],
      };
    }
    if (!hasText && !heading && (imgs.length || cards.length)) {
      return {
        ok: false,
        needsAnswer: `Blok „${srcCls}” to ${imgs.length ? 'zdjęcia' : 'lista kafelków'} — nie skopiuję cudzej zawartości. ${imgs.length ? 'Podaj zdjęcia (wgraj je w bibliotece) albo wybierz inny blok.' : 'Dodaj kafelki przez „dodaj kafelek”.'}`,
        options: ['inny blok', 'anuluj'],
      };
    }
    fillBlock(block, { naglowek: args.naglowek, tekst: args.tekst });
    note = `z Twoją treścią, w takim samym bloku jak na „${src.label}”`;
  }

  // to samo miejsce: po bloku, który na wzorze stoi przed nim
  const tBlocks = blocksOf(target);
  const prevCls = srcBlocks.slice(0, idx).reverse().map((b) => b.cls).find((c) => tBlocks.some((t) => t.cls === c));
  const nextCls = srcBlocks.slice(idx + 1).map((b) => b.cls).find((c) => tBlocks.some((t) => t.cls === c));
  const anchor = prevCls ? tBlocks.filter((t) => t.cls === prevCls).at(-1).el : null;
  const box = container(target);
  const node = target.importNode(block, true);
  if (anchor) anchor.after(node);
  else if (nextCls) tBlocks.find((t) => t.cls === nextCls).el.before(node);
  else if (idx === 0 && box.firstElementChild) box.firstElementChild.before(node);
  else box.append(node);

  await ctx.writePage(path, ctx.serialize(target));
  return {
    ok: true,
    summary: `Dodałem blok „${srcCls}” na stronie „${me?.label || path}” — ${note}, w tym samym miejscu kolejności co na analogicznych stronach.`,
    changedPages: [path],
  };
}
