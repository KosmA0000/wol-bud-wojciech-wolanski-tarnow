// Propozycja przed zmianą: AI niczego nie zmienia samo. Najpierw zaproponuj_zmiane → przebieg na sucho (nakładka ctx w pamięci)
// → karta dla klienta (gdzie / wzór / plan) → klient KLIKA → panel woła narzędzie z __approvedProposalId → verifyApplied.
import { checkConsistency } from './consistency.js?v=turbo25';

export const PROPOSE_TOOL = {
  name: 'zaproponuj_zmiane',
  description:
    'OBOWIĄZKOWY pierwszy krok przed KAŻDĄ zmianą na stronie (dodanie, zmiana tekstu, usunięcie). Podaj docelowe narzędzie i jego argumenty — panel wykona przebieg na sucho (nic nie zapisuje), przewinie podgląd do miejsca zmiany, pokaże klientowi kartę: GDZIE, CO, WZÓR (miniatura elementu, z którego skopiowany będzie wygląd) i PLAN wszystkich powiązanych zmian. Zmiana wykona się dopiero, gdy klient KLIKNIE kartę (napisanie „tak” nie jest zgodą). Warianty podawaj tylko przy realnej rozbieżności (np. dwa pasujące miejsca).',
  parameters: {
    type: 'object',
    properties: {
      tool: { type: 'string', description: 'Nazwa narzędzia, które ma wykonać zmianę (np. dodaj_pozycje_oferty, dodaj_kafelek, usun_blok, update_element_text).' },
      args: { type: 'object', description: 'Argumenty tego narzędzia (dokładnie takie, z jakimi ma być wywołane).' },
      opis: { type: 'string', description: 'Jedno zdanie po polsku dla klienta: co zostanie zrobione.' },
      warianty: {
        type: 'array',
        description: 'Tylko przy realnej rozbieżności: inne możliwe wykonania.',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Krótka nazwa wariantu dla klienta.' },
            tool: { type: 'string', description: 'Narzędzie wariantu (brak = to samo).' },
            args: { type: 'object', description: 'Argumenty wariantu.' },
          },
        },
      },
    },
    required: ['tool', 'args'],
  },
};

// Narzędzia odczytu (nie wymagają propozycji) i cofanie (zawsze dostępne — przywraca stan sprzed zmiany).
export const READ_ONLY_RECIPES = new Set(['sprawdz_powiazania', 'znajdz_analogiczne', 'zaproponuj_zmiane']);
export const UNDO_TOOLS = new Set(['cofnij_cala_operacje', 'undo_last_change']);

const MUTATING_PANEL_TOOLS = new Set([
  'update_element_text', 'update_element_link', 'update_element_image', 'update_review_stars', 'move_element',
  'toggle_element_visibility', 'duplicate_element', 'delete_element', 'add_section', 'add_item', 'add_text_block',
  'set_page_meta', 'create_page', 'update_globals', 'delete_page', 'update_section_id', 'reorder_element_to_index',
  'update_section_style', 'discard_page_draft', 'add_styled_button', 'clone_site_component', 'update_section_html',
  'insert_custom_section', 'sync_element_across_site', 'replace_text_across_site', 'write_file',
]);
export function isMutatingPanelTool(name) {
  return MUTATING_PANEL_TOOLS.has(String(name || ''));
}

// ---------- rejestr propozycji i bramka ----------
const registry = new Map(); // id -> { proposal, tool, argsKey, approved, used }
let seq = 0;

const stable = (v) => {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).filter((k) => k !== '__approvedProposalId' && v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
};
export const stripApproval = (args) => {
  const { __approvedProposalId, ...rest } = args || {};
  return rest;
};

function register(proposal) {
  const id = `prop_${Date.now().toString(36)}_${++seq}`;
  proposal.id = id;
  registry.set(id, { proposal, tool: proposal.tool, argsKey: stable(proposal.args), approved: false, used: false });
  if (registry.size > 100) registry.delete(registry.keys().next().value);
  return proposal;
}

export function getProposal(id) {
  return registry.get(id)?.proposal || null;
}

// Wywołuje panel po KLIKNIĘCIU karty przez klienta. Zatwierdza tylko tę jedną propozycję (lub wariant).
export function approveProposal(id) {
  const e = registry.get(id);
  if (!e || e.used) return false;
  e.approved = true;
  return true;
}

// Bramka: jednorazowe zużycie zatwierdzenia dla tego samego narzędzia i tych samych argumentów.
export function consumeApproval(name, args) {
  const id = args?.__approvedProposalId;
  const e = id && registry.get(id);
  if (!e || !e.approved || e.used || e.tool !== name || e.argsKey !== stable(args)) return false;
  e.used = true;
  return true;
}

export const GATE_ERROR = 'Najpierw zaproponuj_zmiane; klient musi kliknąć kartę.';

// ---------- przebieg na sucho ----------
function overlayCtx(ctx) {
  const written = new Map();
  const deleted = new Set();
  let globals = null;
  const o = {
    ...ctx,
    readPage: async (p) => {
      p = String(p || '').replace(/^\.?\/+/, '');
      if (deleted.has(p)) return null;
      if (written.has(p)) return written.get(p);
      return ctx.readPage(p);
    },
    writePage: async (p, html) => {
      p = String(p || '').replace(/^\.?\/+/, '');
      deleted.delete(p);
      written.set(p, String(html ?? ''));
    },
    deletePage: async (p) => {
      p = String(p || '').replace(/^\.?\/+/, '');
      written.delete(p);
      deleted.add(p);
    },
    getGlobals: () => JSON.parse(JSON.stringify(globals || ctx.getGlobals())),
    setGlobals: async (g) => {
      globals = JSON.parse(JSON.stringify(g));
    },
    listPages: () => {
      const base = ctx.listPages().filter((p) => !deleted.has(p.path));
      const known = new Set(base.map((p) => p.path));
      for (const p of written.keys()) if (!known.has(p)) base.push({ path: p, label: p, title: '', group: p.split('/')[0] });
      return base;
    },
    wireOfferTiles: async () => [],
    reloadCurrent: async () => {},
  };
  o.__state = { written, deleted, get globals() { return globals; } };
  return o;
}

const txt = (el) => String(el?.textContent || '').replace(/\s+/g, ' ').trim();

function cssPath(el) {
  const parts = [];
  for (let n = el; n && n.tagName && n.tagName !== 'HTML'; n = n.parentElement) {
    if (n.id) {
      parts.unshift(`#${n.id}`);
      break;
    }
    const cls = (n.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean)[0];
    let part = n.tagName.toLowerCase() + (cls ? `.${cls}` : '');
    const same = n.parentElement ? [...n.parentElement.children].filter((c) => c.tagName === n.tagName && (c.getAttribute('class') || '').split(/\s+/)[0] === (cls || '')) : [];
    if (same.length > 1) part += `:nth-of-type(${[...n.parentElement.children].filter((c) => c.tagName === n.tagName).indexOf(n) + 1})`;
    parts.unshift(part);
    if (n.tagName === 'BODY' || n.tagName === 'MAIN') break;
  }
  return parts.join(' > ');
}

const sectionLabel = (el) => {
  const sec = el?.closest?.('section, aside, nav, footer, header, details, article, [class*="grid"], [class*="sidebar"]');
  return (txt(sec?.querySelector('h2, h3, .eyebrow, summary')) || sec?.getAttribute('aria-label') || '').slice(0, 60);
};
const sig = (el) => el.tagName + '.' + (el.getAttribute('class') || '').trim().split(/\s+/)[0];

// Najgłębszy kontener, w którym stara i nowa strona się różnią + dodane / usunięte dzieci.
function domDiff(oldDoc, newDoc) {
  let a = oldDoc.body;
  let b = newDoc.body;
  if (!a || !b) return null;
  for (let guard = 0; guard < 60; guard++) {
    const ca = [...a.children];
    const cb = [...b.children];
    if (ca.length === cb.length) {
      const diff = ca.map((x, i) => (x.outerHTML !== cb[i].outerHTML && sig(x) === sig(cb[i]) ? i : x.outerHTML !== cb[i].outerHTML ? -2 : -1)).filter((i) => i !== -1);
      if (diff.length === 1 && diff[0] >= 0) {
        a = ca[diff[0]];
        b = cb[diff[0]];
        continue;
      }
    }
    break;
  }
  const oldSet = new Set([...a.children].map((c) => c.outerHTML));
  const newSet = new Set([...b.children].map((c) => c.outerHTML));
  const added = [...b.children].filter((c) => !oldSet.has(c.outerHTML));
  const removed = [...a.children].filter((c) => !newSet.has(c.outerHTML));
  return { oldBox: a, box: b, added, removed };
}

const PAGE_NAMES = (doc, path) => txt(doc?.querySelector('main h1')) || txt(doc?.querySelector('title')) || path;

async function dryRun(tool, args, ctx, getOwner) {
  const mod = getOwner(tool);
  if (!mod) return { error: `Nieznane narzędzie: ${tool}` };
  const o = overlayCtx(ctx);
  let result;
  try {
    result = await mod.run(tool, stripApproval(args), o);
  } catch (e) {
    return { error: e?.message || String(e) };
  }
  return { result, o };
}

async function describe(tool, args, ctx, run, opis) {
  const { result, o } = run;
  const { written, deleted } = o.__state;
  const changed = [];
  const created = [];
  const hosts = [];
  for (const [p, html] of written) {
    const before = await ctx.readPage(p);
    if (before === html) continue;
    changed.push(p);
    if (!before) {
      created.push(p);
      continue;
    }
    const d = domDiff(ctx.parse(before), ctx.parse(html));
    if (d) hosts.push({ page: p, ...d, newDoc: d.box.ownerDocument });
  }
  for (const p of deleted) if (await ctx.readPage(p)) changed.push(p);
  const globalsChanged = Boolean(o.__state.globals) && stable(o.__state.globals) !== stable(ctx.getGlobals());

  // GDZIE: strona wskazana w argumentach, potem strona główna, Oferta, pierwsza zmieniona istniejąca strona
  const argPages = Object.values(stripApproval(args)).filter((v) => typeof v === 'string').map((v) => v.replace(/^\.?\/+/, ''));
  const pick =
    hosts.find((h) => argPages.includes(h.page) && (h.added.length || h.removed.length)) ||
    hosts.find((h) => h.page === 'index.html' && h.added.length) ||
    hosts.find((h) => h.page === 'oferta/index.html' && h.added.length) ||
    hosts.find((h) => h.added.length || h.removed.length) ||
    hosts[0];
  let gdzie = null;
  let wzor = null;
  if (pick) {
    const el = pick.added[0] || pick.box;
    gdzie = { page: pick.page, selector: cssPath(pick.box), label: sectionLabel(pick.added[0] || pick.box) || PAGE_NAMES(pick.newDoc, pick.page) };
    // WZÓR: istniejący element tego samego rodzaju obok dodanego (z niego przepis klonuje wygląd)
    if (pick.added[0]) {
      const same = [...pick.box.children].filter((c) => !pick.added.includes(c) && sig(c) === sig(el));
      const ref = same.reverse().find((c) => c.compareDocumentPosition(el) & 4) || same[0];
      if (ref) wzor = { page: pick.page, selector: cssPath(ref), label: txt(ref.querySelector('h2, h3, h4, strong, summary, span')) || txt(ref).slice(0, 60) };
    }
  } else if (created.length) {
    gdzie = { page: created[0], selector: 'main', label: 'nowa strona' };
  } else if (deleted.size) {
    const p = [...deleted][0];
    gdzie = { page: p, selector: 'main', label: 'strona do usunięcia' };
  }
  // Nowa strona bez kontenera-wzoru: wzorem jest strona, z której ją skopiowano (ten sam szkielet)
  if (!wzor && created.length) {
    const nd = ctx.parse(written.get(created[0]));
    const all = ctx.listPages().map((p) => p.path);
    const twin = all.find((p) => p.split('/')[0] === created[0].split('/')[0] && p !== created[0]);
    if (twin) wzor = { page: twin, selector: 'main', label: `strona „${PAGE_NAMES(ctx.parse(await ctx.readPage(twin)), twin)}” (układ nowej strony „${PAGE_NAMES(nd, created[0])}”)` };
  }

  // PLAN po polsku: zmiany pogrupowane po rodzaju miejsca
  const plan = [];
  for (const p of created) plan.push(`Nowa strona „${PAGE_NAMES(ctx.parse(written.get(p)), p)}” (${p}).`);
  const groups = new Map();
  for (const h of hosts) {
    const key = `${sig(h.box)}|${h.added.length ? '+' : ''}${h.removed.length ? '-' : ''}`;
    if (!groups.has(key)) groups.set(key, { h, pages: [] });
    groups.get(key).pages.push(h.page);
  }
  for (const { h, pages } of groups.values()) {
    const where = sectionLabel(h.added[0] || h.removed[0] || h.box) || (h.box.getAttribute('class') || h.box.tagName.toLowerCase()).split(/\s+/)[0];
    const what = h.added.length
      ? `dodam „${txt(h.added[0].querySelector('h2, h3, h4, strong, summary, span')) || txt(h.added[0]).slice(0, 40)}”`
      : h.removed.length
        ? `usunę „${txt(h.removed[0].querySelector('h2, h3, h4, strong, summary, span')) || txt(h.removed[0]).slice(0, 40)}”`
        : 'zmienię treść';
    const on = pages.length === 1 ? `na stronie „${PAGE_NAMES(ctx.parse(written.get(pages[0])), pages[0])}”` : `na ${pages.length} stronach (np. „${PAGE_NAMES(ctx.parse(written.get(pages[0])), pages[0])}”)`;
    plan.push(`${what[0].toUpperCase()}${what.slice(1)} w „${where}” ${on}.`);
  }
  for (const p of deleted) plan.push(`Usunę stronę ${p} (linki do niej zostaną przepięte).`);
  if (globalsChanged) plan.push('Zmienię menu / dane firmy wspólne dla całej witryny.');
  if (!plan.length) plan.push('Nic się nie zmieni — strona już tak wygląda.');

  const niespojnosci = changed.length ? await checkConsistency(o, { pages: changed }).catch(() => []) : [];
  const oczekiwane = {
    created,
    deleted: [...deleted],
    hosts: hosts.map((h) => ({
      page: h.page,
      selector: cssPath(h.box),
      added: h.added.map((e) => txt(e).slice(0, 80)).filter(Boolean),
      removed: h.removed.map((e) => txt(e).slice(0, 80)).filter((t) => t && !h.added.some((e) => txt(e).slice(0, 80) === t)),
    })),
  };
  return {
    tool,
    args: stripApproval(args),
    opis: opis || String(result?.summary || '').replace(/^Dodałem/, 'Dodam').replace(/^Usunąłem/, 'Usunę').replace(/^Zmieniłem/, 'Zmienię').replace(/^Przeniosłem/, 'Przeniosę'),
    gdzie,
    wzor,
    plan,
    changedPages: changed,
    niespojnosci,
    oczekiwane,
    przebiegNaSucho: true,
  };
}

// Opcje pytania przepisu jako warianty: podstaw opcję w miejsce argumentu tekstowego i sprawdź na sucho.
async function variantsFromQuestion(tool, args, ctx, getOwner, question) {
  const out = [];
  const opts = (question.options || []).slice(0, 6);
  const keys = Object.keys(stripApproval(args)).filter((k) => typeof args[k] === 'string' && args[k]);
  for (const opt of opts) {
    const value = String(opt).replace(/\s*\(„.*$/, '').replace(/\s*\(\d+ stron\)$/, '').trim();
    for (const k of keys) {
      if (!value || value === args[k]) continue;
      const vArgs = { ...stripApproval(args), [k]: value };
      const run = await dryRun(tool, vArgs, ctx, getOwner);
      if (run.error || !run.result?.ok) continue;
      out.push({ label: String(opt), run, vArgs });
      break;
    }
  }
  return out;
}

export async function propose(pargs, ctx, getOwner) {
  const tool = String(pargs?.tool || '').trim();
  const args = pargs?.args && typeof pargs.args === 'object' ? pargs.args : {};
  if (!tool) return { ok: false, error: 'Podaj narzędzie (tool), którym ma zostać wykonana zmiana.' };
  if (READ_ONLY_RECIPES.has(tool) || UNDO_TOOLS.has(tool)) return { ok: false, error: `„${tool}” niczego nie zmienia na stronie — wywołaj je bezpośrednio, bez propozycji.` };

  // Narzędzia panelu (nie-przepisy): bez przebiegu na sucho — miejsce z argumentów
  if (!getOwner(tool)) {
    if (!isMutatingPanelTool(tool)) return { ok: false, error: `Nieznane narzędzie: ${tool}` };
    const page = String(args.pagePath || args.page || ctx.currentPage || '').replace(/^\.?\/+/, '');
    const p = register({
      tool,
      args: stripApproval(args),
      opis: pargs.opis || `Zmiana narzędziem panelu (${tool}).`,
      gdzie: { page, selector: args.uid ? `[data-cms-uid="${args.uid}"]` : args.selector || 'main', label: args.label || '' },
      wzor: args.sourcePage ? { page: args.sourcePage, selector: args.sourceSelector || 'main', label: 'wzór' } : null,
      plan: [pargs.opis || `Zmienię element na stronie ${page}.`],
      changedPages: page ? [page] : [],
      niespojnosci: [],
      oczekiwane: null,
      przebiegNaSucho: false,
    });
    return { ok: true, proposal: p, summary: 'Propozycja gotowa — czekam, aż klient kliknie kartę.' };
  }

  const run = await dryRun(tool, args, ctx, getOwner);
  if (run.error) return { ok: false, error: run.error };
  const r = run.result || {};
  let main = null;
  let variants = [];
  if (r.ok === false && r.needsAnswer) {
    variants = await variantsFromQuestion(tool, args, ctx, getOwner, r);
    if (variants.length === 0) return { ok: false, needsAnswer: r.needsAnswer, options: r.options || [] };
    main = variants[0];
    if (variants.length === 1) variants = [];
  } else if (r.ok === false) {
    return { ok: false, error: r.error || 'Przebieg na sucho się nie udał.' };
  }

  // Warianty podane przez AI (tylko gdy realnie różne miejsce lub wzór)
  for (const w of Array.isArray(pargs.warianty) ? pargs.warianty.slice(0, 4) : []) {
    const wt = w?.tool || tool;
    const wa = w?.args && typeof w.args === 'object' ? w.args : null;
    if (!wa || !getOwner(wt)) continue;
    const vr = await dryRun(wt, wa, ctx, getOwner);
    if (vr.error || vr.result?.ok === false) continue;
    variants.push({ label: w.label || wt, run: vr, vArgs: wa, tool: wt });
  }

  const base = main ? await describe(tool, main.vArgs, ctx, main.run, pargs.opis) : await describe(tool, args, ctx, run, pargs.opis);
  const described = [];
  for (const v of variants) {
    const d = await describe(v.tool || tool, v.vArgs, ctx, v.run, null);
    described.push({ label: v.label, ...d });
  }
  // Rozbieżność = warianty różnią się miejscem albo wzorem; inaczej pokazujemy jedną propozycję
  // (miejsce, wzór, zmienione strony i to, CO dokładnie przybywa / znika)
  const key = (d) => `${d.gdzie?.page}|${d.gdzie?.selector}|${d.wzor?.selector || ''}|${d.changedPages.join(',')}|${stable(d.oczekiwane?.hosts || [])}`;
  const distinct = [...new Map([base, ...described].map((d) => [key(d), d])).values()];
  const proposal = register(base);
  if (distinct.length >= 2) {
    proposal.warianty = described.map((d) => {
      const reg = register({ ...d });
      return { id: reg.id, label: d.label, tool: d.tool, args: d.args, gdzie: d.gdzie, wzor: d.wzor, plan: d.plan, changedPages: d.changedPages };
    });
  }
  return {
    ok: true,
    proposal,
    summary: proposal.warianty
      ? `Widzę ${proposal.warianty.length} możliwości — klient wybiera kliknięciem jedną kartę.`
      : 'Propozycja gotowa — czekam, aż klient kliknie kartę.',
  };
}

// ---------- weryfikacja po wykonaniu ----------
export async function verifyApplied(ctx, proposal, result) {
  const checks = [];
  const problems = [];
  if (!proposal) return { ok: false, checks, problems: ['Brak propozycji do sprawdzenia.'] };
  if (!result || result.ok === false) {
    problems.push(`Zmiana się nie wykonała: ${result?.error || result?.needsAnswer || 'brak wyniku'}.`);
    return { ok: false, checks, problems };
  }
  const exp = proposal.oczekiwane;
  if (exp) {
    for (const p of exp.created) {
      if (await ctx.readPage(p)) checks.push(`Nowa strona istnieje: ${p}.`);
      else problems.push(`Nie ma nowej strony ${p}.`);
    }
    for (const p of exp.deleted) {
      if (!(await ctx.readPage(p))) checks.push(`Strona ${p} usunięta.`);
      else problems.push(`Strona ${p} nadal istnieje.`);
    }
    for (const h of exp.hosts) {
      const html = await ctx.readPage(h.page);
      if (!html) {
        problems.push(`Nie ma strony ${h.page}.`);
        continue;
      }
      const doc = ctx.parse(html);
      let box = null;
      try {
        box = doc.querySelector(h.selector);
      } catch {}
      const scope = txt(box || doc.body);
      const miss = h.added.filter((t) => !scope.includes(t));
      const still = h.removed.filter((t) => scope.includes(t));
      if (miss.length) problems.push(`Na stronie ${h.page} brakuje dodanego elementu „${miss[0].slice(0, 50)}”.`);
      if (still.length) problems.push(`Na stronie ${h.page} nadal jest „${still[0].slice(0, 50)}”.`);
      if (!miss.length && !still.length && (h.added.length || h.removed.length)) {
        checks.push(`${h.added.length ? `Dodane „${h.added[0].slice(0, 40)}”` : `Usunięte „${h.removed[0].slice(0, 40)}”`} na stronie ${h.page}.`);
      }
    }
    // Zbiorczo dla wielu stron jednego rodzaju (np. 49 list w panelu bocznym) — krótszy raport
    if (checks.length > 8) {
      const n = checks.length;
      checks.splice(6, n - 6, `… i ${n - 6} kolejnych miejsc sprawdzonych.`);
    }
  }
  const pages = proposal.changedPages || [];
  const niespojnosci = pages.length ? await checkConsistency(ctx, { pages }).catch((e) => [{ message: `Nie udało się sprawdzić spójności: ${e?.message || e}` }]) : [];
  if (niespojnosci.length) problems.push(...niespojnosci.slice(0, 5).map((p) => p.message));
  else if (pages.length) checks.push('Spójność z regułami strony: bez zastrzeżeń.');
  return { ok: problems.length === 0, checks, problems };
}
