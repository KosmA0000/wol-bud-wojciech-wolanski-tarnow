// Części stron: usuń / przenieś blok, zmień wspólny blok na wszystkich stronach danego rodzaju.
import { clean, resolve, container, blocksOf, blockLabel, findBlocks, loadSite, fillBlock } from './knowledge.js?v=turbo27';
import { run as addOrdinaryBlock, tools as knowledgeTools } from './knowledge.js?v=turbo27';
import { addGroupMember, findRecipeGroups, groupOptions, recipeGroups } from './pages.js?v=turbo27';

const KINDS = ['strona główna', 'kategoria', 'podkategoria', 'produkt', 'promocja', 'strona informacyjna'];

export const tools = [
  ...knowledgeTools.filter((tool) => tool.name === 'dodaj_blok').map((tool) => ({
    ...tool,
    description: tool.description + ' Gdy część należy do grupy linków, podaj nagłówek lub cel, aby wykonać wszystkie powiązane zmiany.',
    parameters: {
      ...tool.parameters,
      properties: {
        ...tool.parameters.properties,
        grupa: { type: 'string', description: 'Opcjonalna nazwa lub selektor grupy, do której ma trafić element.' },
        link: { type: 'string', description: 'Ścieżka istniejącej strony do podpięcia w grupie, np. promocje/index.html.' },
        rodzic: { type: 'string', description: 'Opcjonalna kategoria nadrzędna nowej podstrony.' },
        zdjecie: { type: 'string', description: 'Opcjonalna ścieżka do zdjęcia.' },
      },
    },
  })),
  {
    name: 'usun_blok',
    description:
      'Usuwa blok (sekcję) ze strony. Gdy ten sam blok jest też na innych stronach tego rodzaju, zapyta: tylko tu czy na wszystkich (wtedy podaj wszedzie). Linki do kotwic w usuniętym bloku przepina na samą stronę.',
    parameters: {
      type: 'object',
      properties: {
        strona: { type: 'string', description: 'Ścieżka strony. Brak = bieżąca.' },
        blok: { type: 'string', description: 'Nazwa (klasa) bloku z WIEDZY O STRONIE, „klasa:N” albo fragment nagłówka bloku.' },
        wszedzie: { type: 'boolean', description: 'true = usuń z wszystkich stron tego rodzaju, false = tylko z tej strony.' },
      },
      required: ['blok'],
    },
  },
  {
    name: 'przenies_blok',
    description: 'Przesuwa blok na stronie: wyżej, niżej, na górę, na dół albo za / przed innym blokiem.',
    parameters: {
      type: 'object',
      properties: {
        strona: { type: 'string', description: 'Ścieżka strony. Brak = bieżąca.' },
        blok: { type: 'string', description: 'Blok do przesunięcia (klasa, „klasa:N” albo fragment nagłówka).' },
        pozycja: { type: 'string', description: 'wyzej | nizej | na-gore | na-dol | po:<blok> | przed:<blok>' },
      },
      required: ['blok'],
    },
  },
  {
    name: 'zmien_blok_wszedzie',
    description:
      'Zmienia nagłówek i/lub tekst tego samego wspólnego bloku (np. baner CTA „cta-banner-dark”) na WSZYSTKICH stronach danego rodzaju naraz.',
    parameters: {
      type: 'object',
      properties: {
        blok: { type: 'string', description: 'Nazwa (klasa) bloku, np. cta-banner-dark.' },
        rodzajStrony: { type: 'string', enum: KINDS, description: 'Rodzaj stron, na których zmienić blok.' },
        naglowek: { type: 'string', description: 'Nowy nagłówek od klienta.' },
        tekst: { type: 'string', description: 'Nowy tekst od klienta (akapity rozdziel pustą linią).' },
      },
      required: ['blok'],
    },
  },
];

const yes = (v) => v === true || /^(tak|true|wszedzie|wszystk|1)/i.test(String(v ?? ''));
const isSet = (v) => v !== undefined && v !== null && v !== '';

function normKind(v) {
  const s = String(v || '').toLowerCase();
  if (!s) return '';
  if (/pod ?kat/.test(s)) return 'podkategoria';
  if (/kateg/.test(s)) return 'kategoria';
  if (/produkt/.test(s)) return 'produkt';
  if (/promoc/.test(s)) return 'promocja';
  if (/g[lł][oó]wn/.test(s)) return 'strona główna';
  if (/inform|inne|stron/.test(s)) return 'strona informacyjna';
  return KINDS.includes(s) ? s : '';
}

async function pickBlock(ctx, args) {
  const path = clean(args.strona) || ctx.currentPage;
  const html = await ctx.readPage(path);
  if (!html) return { err: { ok: false, error: `Nie znaleziono strony „${path}”.` } };
  const doc = ctx.parse(html);
  const { all, matches } = findBlocks(doc, args.blok);
  if (!matches.length) {
    return { err: { ok: false, needsAnswer: `Którą część strony mam ${args._verb || 'zmienić'}? Na tej stronie są:`, options: all.map(blockLabel) } };
  }
  if (matches.length > 1) {
    return {
      err: {
        ok: false,
        needsAnswer: `Na stronie jest kilka takich części. Którą?`,
        options: matches.map((b, i) => `${b.cls}:${i + 1}${b.title ? ` („${b.title}”)` : ''}`),
      },
    };
  }
  return { path, doc, block: matches[0], all };
}

// Linki „strona#id” do kotwic z usuniętego bloku → „strona”
async function unlinkAnchors(ctx, pages, targetPath, ids) {
  if (!ids.length) return [];
  const changed = [];
  for (const p of pages) {
    const doc = p.path === targetPath ? null : p.doc;
    if (!doc) continue;
    let touched = false;
    for (const a of doc.querySelectorAll('a[href*="#"]')) {
      const href = a.getAttribute('href');
      const hash = href.slice(href.indexOf('#') + 1);
      if (!ids.includes(hash) || resolve(href, p.path) !== targetPath) continue;
      a.setAttribute('href', href.slice(0, href.indexOf('#')));
      touched = true;
    }
    if (touched) {
      await ctx.writePage(p.path, ctx.serialize(doc));
      changed.push(p.path);
    }
  }
  return changed;
}

async function removeBlock(ctx, args) {
  const picked = await pickBlock(ctx, { ...args, _verb: 'usunąć' });
  if (picked.err) return picked.err;
  const { path, doc, block } = picked;
  const pages = await loadSite(ctx);
  const me = pages.find((p) => p.path === path);
  const others = pages.filter((p) => p.path !== path && p.kind === me?.kind && blocksOf(p.doc).some((b) => b.cls === block.cls));

  if (others.length && !isSet(args.wszedzie)) {
    return {
      ok: false,
      needsAnswer: `Ta część („${blockLabel(block)}”) jest też na ${others.length} innych stronach rodzaju „${me.kind}”. Usunąć ją tylko tutaj czy na wszystkich stronach tego rodzaju?`,
      options: ['tylko na tej stronie', `na wszystkich stronach tego rodzaju (${others.length + 1})`],
    };
  }
  const targets = [{ path, doc, el: block.el }];
  if (others.length && yes(args.wszedzie)) {
    for (const o of others) {
      const same = blocksOf(o.doc).filter((b) => b.cls === block.cls);
      const el = (same.find((b) => b.title === block.title) || (same.length === 1 ? same[0] : null))?.el;
      if (el) targets.push({ path: o.path, doc: o.doc, el });
    }
  }
  const changed = [];
  const anchorFix = [];
  for (const t of targets) {
    const ids = [t.el.id, ...[...t.el.querySelectorAll('[id]')].map((e) => e.id)].filter(Boolean);
    t.el.remove();
    await ctx.writePage(t.path, ctx.serialize(t.doc));
    changed.push(t.path);
    const site = pages.map((p) => (p.path === t.path ? { ...p, doc: t.doc } : p));
    anchorFix.push(...(await unlinkAnchors(ctx, site, t.path, ids)));
  }
  return {
    ok: true,
    summary:
      `Usunąłem część „${blockLabel(block)}” ${targets.length > 1 ? `na ${targets.length} stronach rodzaju „${me.kind}”` : `ze strony „${me?.label || path}”`}.` +
      (anchorFix.length ? ` Poprawiłem linki do niej na ${new Set(anchorFix).size} stronach.` : ''),
    changedPages: [...new Set([...changed, ...anchorFix])],
  };
}

async function moveBlock(ctx, args) {
  const picked = await pickBlock(ctx, { ...args, _verb: 'przesunąć' });
  if (picked.err) return picked.err;
  const { path, doc, block, all } = picked;
  const i = all.indexOf(block);
  const poz = String(args.pozycja || '').trim();
  const opts = [];
  if (i > 0) opts.push('wyzej', 'na-gore');
  if (i < all.length - 1) opts.push('nizej', 'na-dol');
  for (const b of all) if (b !== block) opts.push(`po:${b.cls}`);
  if (!poz) return { ok: false, needsAnswer: `Gdzie przesunąć „${blockLabel(block)}”?`, options: opts };

  const box = block.el.parentElement;
  let ref = null;
  let mode = '';
  const rel = poz.match(/^(po|za|pod|przed|nad):\s*(.+)$/i);
  if (/^(wyzej|wyżej|w gore|w górę|up)$/i.test(poz)) {
    if (i === 0) return { ok: false, error: 'Ta część jest już na samej górze.' };
    ref = all[i - 1].el;
    mode = 'before';
  } else if (/^(nizej|niżej|w dol|w dół|down)$/i.test(poz)) {
    if (i === all.length - 1) return { ok: false, error: 'Ta część jest już na samym dole.' };
    ref = all[i + 1].el;
    mode = 'after';
  } else if (/^(na-gore|na górę|na gore|top)$/i.test(poz)) {
    ref = all[0].el;
    mode = 'before';
  } else if (/^(na-dol|na dół|na dol|bottom)$/i.test(poz)) {
    ref = all.at(-1).el;
    mode = 'after';
  } else if (rel) {
    const found = findBlocks(doc, rel[2]).matches.filter((b) => b !== block);
    if (!found.length) return { ok: false, needsAnswer: `Nie znalazłem części „${rel[2]}”. Za którą przesunąć?`, options: opts };
    ref = found[0].el;
    mode = /^(przed|nad)$/i.test(rel[1]) ? 'before' : 'after';
  } else {
    return { ok: false, needsAnswer: `Nie rozumiem „${poz}”. Gdzie przesunąć „${blockLabel(block)}”?`, options: opts };
  }
  if (ref === block.el) return { ok: true, summary: 'Ta część już jest w tym miejscu — nic nie zmieniłem.', changedPages: [] };
  if (mode === 'before') ref.before(block.el);
  else ref.after(block.el);
  if (block.el.parentElement !== box) box.append(block.el);
  await ctx.writePage(path, ctx.serialize(doc));
  const order = blocksOf(doc).map((b) => b.cls).join(' → ');
  return { ok: true, summary: `Przesunąłem „${blockLabel(block)}” na stronie. Kolejność teraz: ${order}.`, changedPages: [path] };
}

async function changeEverywhere(ctx, args) {
  const cls = String(args.blok || '').trim().replace(/^\./, '');
  const pages = (await loadSite(ctx)).filter((p) => p.kind !== 'przekierowanie');
  const has = (p) => (cls ? findBlocks(p.doc, cls).matches.length > 0 : false);
  const kindsWith = KINDS.map((k) => ({ k, n: pages.filter((p) => p.kind === k && has(p)).length })).filter((x) => x.n);
  if (!cls || !kindsWith.length) {
    const common = [...new Set(pages.flatMap((p) => blocksOf(p.doc).map((b) => b.cls)))].filter((c) => c.includes('cta') || c.includes('banner'));
    return { ok: false, needsAnswer: cls ? `Nie znalazłem bloku „${cls}” na żadnej stronie. Który blok zmienić?` : 'Który wspólny blok zmienić?', options: common };
  }
  const kind = normKind(args.rodzajStrony);
  if (!kind) {
    return {
      ok: false,
      needsAnswer: `Na jakich stronach zmienić „${cls}”?`,
      options: kindsWith.map((x) => `${x.k} (${x.n} stron)`),
    };
  }
  if (!isSet(args.naglowek) && !isSet(args.tekst)) {
    return { ok: false, needsAnswer: `Co ma być w „${cls}” na stronach rodzaju „${kind}”? Podaj nowy nagłówek i/lub tekst (nie wymyślam treści).`, options: [] };
  }
  const targets = pages.filter((p) => p.kind === kind && has(p));
  if (!targets.length) {
    return { ok: false, needsAnswer: `Na stronach rodzaju „${kind}” nie ma „${cls}”. Na jakich stronach go zmienić?`, options: kindsWith.map((x) => `${x.k} (${x.n} stron)`) };
  }
  const changed = [];
  for (const p of targets) {
    for (const b of findBlocks(p.doc, cls).matches) {
      if (isSet(args.tekst)) fillBlock(b.el, { naglowek: args.naglowek, tekst: args.tekst });
      else {
        const h = b.el.querySelector('h2, h3') || b.el.querySelector('summary');
        if (h) h.textContent = args.naglowek;
      }
    }
    await ctx.writePage(p.path, ctx.serialize(p.doc));
    changed.push(p.path);
  }
  const what = [isSet(args.naglowek) && 'nagłówek', isSet(args.tekst) && 'tekst'].filter(Boolean).join(' i ');
  return {
    ok: true,
    summary: `Zmieniłem ${what} w „${cls}” na wszystkich ${changed.length} stronach rodzaju „${kind}”.`,
    changedPages: changed,
  };
}

async function addBlock(ctx, args) {
  const host = clean(args.strona) || ctx.currentPage;
  const query = args.grupa || args.blok;
  if (!host || !query) return addOrdinaryBlock('dodaj_blok', args, ctx);
  const html = await ctx.readPage(host);
  if (!html) return addOrdinaryBlock('dodaj_blok', args, ctx);
  const doc = ctx.parse(html);
  const groups = await recipeGroups(ctx);
  const matches = findRecipeGroups(groups, { host, query, doc, block: true });
  if (!matches.length && !args.grupa) return addOrdinaryBlock('dodaj_blok', args, ctx);
  if (matches.length !== 1) {
    return { ok: false, needsAnswer: 'Do której grupy dodać ten element?', options: groupOptions(matches.length ? matches : findRecipeGroups(groups, { host })) };
  }
  const group = matches[0];
  const target = args.link ? resolve(args.link, 'index.html') : '';
  if (args.link && (!target || !ctx.listPages().some((page) => page.path === target))) {
    return { ok: false, needsAnswer: 'Podaj ścieżkę istniejącej strony lub nagłówek nowej strony.', options: group.members.map((member) => member.target).filter(Boolean) };
  }
  const title = String(args.naglowek || '').trim();
  if (!target && !title) {
    return { ok: false, needsAnswer: `Co dodać do grupy „${group.label}”? Podaj nazwę nowej podstrony lub wskaż istniejącą.`, options: group.members.map((member) => member.target).filter(Boolean) };
  }
  return addGroupMember(ctx, group, { ...args, target, nazwa: title || target, opis: args.tekst }, groups);
}

export async function run(name, args, ctx) {
  if (name === 'dodaj_blok') return addBlock(ctx, args);
  if (name === 'usun_blok') return removeBlock(ctx, args);
  if (name === 'przenies_blok') return moveBlock(ctx, args);
  if (name === 'zmien_blok_wszedzie') return changeEverywhere(ctx, args);
  return { ok: false, error: `Nieznany przepis: ${name}` };
}

export { container };
