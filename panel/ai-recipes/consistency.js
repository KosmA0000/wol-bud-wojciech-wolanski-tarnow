// Silnik reguł grup: każda grupa elementów (siatka kafelków, pigułki, menu, lista w panelu bocznym…) ma reguły
// wyprowadzone z obecnych członków. Nowy lub zmieniony członek musi je spełniać:
//   1. rodzaj celu (dokąd prowadzą elementy), 2. budowa celu (szkielet strony-celu), 3. obecność celu (gdzie jeszcze jest wymieniony).
// Nic nie jest wpisane na sztywno: grupy i reguły liczone są z tego, jak strona jest zbudowana.
import { resolve, loadSite } from './knowledge.js?v=turbo15';

const RULE_SHARE = 0.75; // reguła = cecha co najmniej 3/4 członków (pewna większość)
const BLOCK_SHARE = 0.5; // blok szkieletu, który ma co najmniej połowa celów
const SHARED_SIMILARITY = 0.6; // lista „wspólna” = na każdej stronie prawie ci sami członkowie

const sigOf = (el) => el.tagName.toLowerCase() + (el.getAttribute('class') ? '.' + el.getAttribute('class').trim().split(/\s+/)[0] : '');
const txt = (el) => String(el?.textContent || '').replace(/\s+/g, ' ').trim();

// Ludzkie nazwy części strony (tylko do komunikatów; reguły nie zależą od tej listy).
const HUMAN = {
  'cat-quick-nav': 'pasek „Kategorie” z własną pozycją',
  'cat-quick-nav-pills': 'pasek „Kategorie”',
  'subpage-sidebar': 'panel boczny (wycena, salony, kategorie)',
  'sidebar-links': 'lista kategorii w panelu bocznym',
  'page-nav-bar': 'pasek „Wróć” z okruszkami',
  'subpage-head': 'nagłówek strony',
  'subpage-grid': 'układ treść + panel boczny',
  'home-catalog-grid': 'kafelki oferty',
  'menu-panel': 'menu',
  'footer-links': 'stopka',
  'subcat-grid': 'karty podkategorii',
  'cat-products-grid': 'karty produktów',
  'product-nav-bar': 'nawigacja „poprzedni / następny produkt”',
};
const human = (key) => {
  const cls = String(key).split(' > ')[0].split('.').pop();
  return HUMAN[cls] || cls;
};
const pageName = (p) => p?.label || p?.path || '';

// Czy kontener to okruszki (ścieżka strony, nie lista elementów) — po znaczeniu, nie po klasie.
const isTrail = (box) => /okruszk|breadcrumb/i.test(box.getAttribute('aria-label') || '') || box.querySelector(':scope > [aria-current="page"]');

// Wszystkie listy linków na stronie: kontener z ≥2 dziećmi tego samego rodzaju, z których każde prowadzi do strony witryny.
function listsOn(page) {
  const out = [];
  for (const box of page.doc.querySelectorAll('body *')) {
    if (box.closest('script, template, [data-cms-ui]') || isTrail(box)) continue;
    const by = new Map();
    for (const c of box.children) {
      const a = c.matches('a[href]') ? c : c.querySelector('a[href]');
      if (!a) continue;
      const target = resolve(a.getAttribute('href'), page.path);
      if (!target.endsWith('.html')) continue;
      const s = sigOf(c);
      if (!by.has(s)) by.set(s, []);
      by.get(s).push({ el: c, a, target, title: txt(c.querySelector('h2, h3, h4, strong, .title, span')) || txt(a) });
    }
    for (const [s, items] of by) {
      if (items.length < 2) continue;
      const sec = box.closest('section, aside, nav, footer, header, details, [class*="sidebar"]');
      const label = txt(sec?.querySelector('h2, h3, .eyebrow, summary')) || box.getAttribute('aria-label') || '';
      out.push({ key: `${sigOf(box)} > ${s}`, box, items, label: label.slice(0, 50) });
    }
  }
  return out;
}

// Szkielet strony: bloki ramy (dzieci .wrap i układu treść/panel boczny), bez bloków treści.
function frameOf(doc) {
  const main = doc.querySelector('main') || doc.body;
  const wrap = main.querySelector(':scope > .wrap') || main;
  const out = new Set();
  for (const el of wrap.children) {
    if (['SCRIPT', 'STYLE'].includes(el.tagName)) continue;
    out.add(sigOf(el).split('.').pop());
    if (el.querySelector(':scope > aside, :scope > [class*="sidebar"]')) {
      for (const c of el.children) if (c.tagName === 'ASIDE' || /sidebar/.test(c.getAttribute('class') || '')) out.add(sigOf(c).split('.').pop());
    }
  }
  return out;
}

function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return A.size + B.size - inter ? inter / (A.size + B.size - inter) : 1;
}

async function buildModel(ctx) {
  const all = await loadSite(ctx);
  const pages = all.filter((p) => p.kind !== 'przekierowanie');
  const byPath = new Map(all.map((p) => [p.path, p]));
  const frame = new Map(pages.map((p) => [p.path, frameOf(p.doc)]));

  // Instancje list na wszystkich stronach + katalog list po kluczu
  const instances = [];
  for (const p of pages) for (const l of listsOn(p)) instances.push({ ...l, host: p });
  const lists = new Map(); // key -> { key, hosts: [path], members: Map(path -> Set(target)), shared }
  for (const inst of instances) {
    if (!lists.has(inst.key)) lists.set(inst.key, { key: inst.key, hosts: [], members: new Map() });
    const L = lists.get(inst.key);
    L.hosts.push(inst.host.path);
    L.members.set(inst.host.path, new Set(inst.items.map((i) => i.target)));
  }
  for (const L of lists.values()) {
    const sets = [...L.members.values()].map((s) => [...s]);
    const ref = sets[0] || [];
    L.shared = sets.length >= 2 && sets.every((s) => jaccard(s, ref) >= SHARED_SIMILARITY);
    // Odstające wystąpienie wspólnej listy (np. strona testowa z innym menu): brakuje mu elementu,
    // który mają wszystkie pozostałe wystąpienia. Nie jest wzorcem i nie jest sprawdzane.
    L.checked = L.hosts;
    if (L.shared && L.hosts.length >= 3) {
      const freq = new Map();
      for (const set of L.members.values()) for (const t of set) freq.set(t, (freq.get(t) || 0) + 1);
      const core = [...freq].filter(([, n]) => n >= L.hosts.length - 1).map(([t]) => t);
      L.checked = L.hosts.filter((h) => core.every((t) => L.members.get(h).has(t)));
      if (L.checked.length < 2) L.checked = L.hosts;
    }
    L.everywhere = new Set([...(L.members.get(L.checked[0]) || [])].filter((t) => L.checked.every((h) => L.members.get(h).has(t))));
  }
  const inList = (key, target) => [...lists.get(key).members.values()].some((s) => s.has(target));
  return { pages, byPath, frame, instances, lists, inList };
}

// Stały wyjątek: element innego rodzaju niż reszta, obecny w każdym wystąpieniu wspólnej listy na ≥3 stronach
// (np. „Usługi” w pasku kategorii — tak zbudowana jest cała witryna).
function isEstablished(model, key, target, targetKind, majorityKind) {
  const L = model.lists.get(key);
  return targetKind !== majorityKind && L.shared && L.hosts.length >= 3 && L.everywhere.has(target);
}

function deriveRules(model, inst) {
  const kinds = new Map();
  const seenT = new Set();
  const members = inst.items
    .map((i) => ({ title: i.title, href: i.a.getAttribute('href'), target: i.target, page: model.byPath.get(i.target) }))
    .filter((m) => m.page && m.page.kind !== 'przekierowanie' && m.target !== inst.host.path && !seenT.has(m.target) && seenT.add(m.target));
  for (const m of members) kinds.set(m.page.kind, (kinds.get(m.page.kind) || 0) + 1);
  const [targetKind, n] = [...kinds].sort((a, b) => b[1] - a[1])[0] || ['', 0];
  const regular = members.filter((m) => !isEstablished(model, inst.key, m.target, m.page.kind, targetKind));
  const rules = { targetKind: n / Math.max(1, members.length) >= 0.5 ? targetKind : '', targetBlocks: [], presence: [] };
  if (regular.length < 2) return { members, regular, rules };

  // 2. budowa celu — bloki szkieletu wspólne dla celów
  const count = new Map();
  for (const m of regular) for (const b of model.frame.get(m.target) || []) count.set(b, (count.get(b) || 0) + 1);
  rules.targetBlocks = [...count].filter(([, c]) => c / regular.length >= Math.max(BLOCK_SHARE, RULE_SHARE)).map(([b]) => b);

  // 3. obecność celu — listy, w których jest większość celów
  for (const L of model.lists.values()) {
    const share = regular.filter((m) => model.inList(L.key, m.target)).length / regular.length;
    if (share < RULE_SHARE) continue;
    const hostKinds = [...new Set(L.hosts.map((h) => model.byPath.get(h)?.kind))];
    rules.presence.push(
      L.shared
        ? { kind: hostKinds, pages: L.checked, where: L.key, scope: 'all' }
        : { kind: hostKinds, where: L.key, scope: 'some' }
    );
  }
  return { members, regular, rules };
}

export async function analyzeGroups(ctx, model = null) {
  const m = model || (await buildModel(ctx));
  return m.instances.map((inst) => {
    const { members, rules } = deriveRules(m, inst);
    return {
      hostPage: inst.host.path,
      selector: inst.key,
      label: inst.label,
      members: members.map(({ title, href, target }) => ({ title, href, target })),
      rules,
    };
  });
}

export async function checkConsistency(ctx, { pages: only } = {}) {
  const model = await buildModel(ctx);
  const focus = only && only.length ? new Set(only.map((p) => String(p).replace(/^\.?\/+/, ''))) : null;
  const problems = new Map(); // dedupe po kodzie+celu+miejscu

  for (const inst of model.instances) {
    const groupInFocus = !focus || focus.has(inst.host.path);
    const { members, regular, rules } = deriveRules(model, inst);
    if (regular.length < 2) continue;
    const ok = regular.filter((m) => {
      const f = model.frame.get(m.target);
      return rules.targetBlocks.every((b) => f?.has(b));
    });
    const sibling = ok[0]?.target || '';
    const where = `${inst.label ? `„${inst.label}” ` : ''}(${human(inst.key)}) na stronie „${pageName(inst.host)}”`;

    for (const item of inst.items) {
      const tPage = model.byPath.get(item.target);
      if (tPage?.kind === 'przekierowanie') continue;
      if (focus && !groupInFocus && !focus.has(item.target)) continue;
      const fix = { tool: 'dolacz_do_grupy', args: { strona: item.target, jakStrona: sibling, grupa: inst.key } };
      const add = (code, message, page) => {
        const id = `${code}|${item.target}|${page}|${message}`;
        if (!problems.has(id)) problems.set(id, { code, message, page, member: { title: item.title, target: item.target, group: inst.key, hostPage: inst.host.path }, fix });
      };
      if (!tPage) {
        add('cel-nie-istnieje', `Element „${item.title}” w ${where} prowadzi do strony, której nie ma.`, inst.host.path);
        continue;
      }
      if (!regular.some((m) => m.target === item.target)) continue; // stały wyjątek witryny
      if (!sibling || (sibling === item.target && ok.length < 2)) continue;

      // 2. budowa celu
      const f = model.frame.get(item.target) || new Set();
      const missing = rules.targetBlocks.filter((b) => !f.has(b));
      if (missing.length) {
        add(
          'brak-budowy',
          `„${item.title || pageName(tPage)}” jest w ${where}, ale jej strona nie jest zbudowana jak inne strony z tej grupy (np. „${pageName(model.byPath.get(sibling))}”): brakuje ${missing.map(human).join(', ')}.`,
          item.target
        );
      }
      // 3. obecność celu
      for (const pr of rules.presence) {
        if (pr.scope === 'some') {
          // „u rodzica” zależy od rodzaju strony — dotyczy tylko członków rodzaju większości grupy
          if (tPage.kind === rules.targetKind && !model.inList(pr.where, item.target)) {
            add('brak-obecnosci', `„${item.title || pageName(tPage)}” nie występuje w żadnym miejscu typu ${human(pr.where)}, choć inne elementy grupy ${where} tam są.`, item.target);
          }
          continue;
        }
        const L = model.lists.get(pr.where);
        const lacking = L.checked.filter((h) => h !== item.target && !L.members.get(h).has(item.target));
        if (lacking.length) {
          add(
            'brak-obecnosci',
            `„${item.title || pageName(tPage)}” brakuje w ${human(pr.where)} na ${lacking.length} ${lacking.length === 1 ? 'stronie' : 'stronach'} (np. „${pageName(model.byPath.get(lacking[0]))}”), a inne elementy grupy ${where} tam są.`,
            lacking[0]
          );
        }
      }
    }
  }
  return [...problems.values()];
}

// Opis reguł do wiedzy o stronie: jedna linia na rodzaj grupy (klucz listy).
export async function groupRulesText(ctx) {
  const model = await buildModel(ctx);
  const seen = new Map();
  for (const inst of model.instances) {
    if (seen.has(inst.key)) {
      seen.get(inst.key).hosts.add(inst.host.path);
      continue;
    }
    const { regular, rules } = deriveRules(model, inst);
    if (regular.length < 2 || (!rules.targetBlocks.length && !rules.presence.length)) continue;
    seen.set(inst.key, { inst, rules, hosts: new Set([inst.host.path]) });
  }
  const lines = [
    'REGUŁY GRUP (wyliczone z obecnych elementów; każdy NOWY element grupy musi spełnić wszystkie — przepis po zmianie sam to sprawdza i zwraca „niespojnosci”):',
  ];
  for (const { inst, rules, hosts } of seen.values()) {
    const at = hosts.size > 2 ? `${hosts.size} stron` : [...hosts].join(', ');
    const pres = rules.presence
      .filter((p) => p.where !== inst.key || p.scope === 'all')
      .map((p) => `${human(p.where)}${p.scope === 'all' ? ` (na wszystkich ${p.pages.length} stronach, gdzie jest)` : ' (u rodzica)'}`);
    lines.push(
      `- ${inst.label ? `„${inst.label}” ` : ''}${human(inst.key)} [${inst.key}] — ${at}: prowadzi do: ${rules.targetKind || 'różne'}` +
        `${rules.targetBlocks.length ? `; strona-cel ma: ${rules.targetBlocks.map(human).join(', ')}` : ''}` +
        `${pres.length ? `; cel jest też w: ${pres.join(', ')}` : ''}.`
    );
  }
  lines.push(
    'Przykład: kafelek w „Czego szukasz?” prowadzi do strony zbudowanej jak kategoria (pasek „Kategorie” z własną pozycją, panel boczny) i ta strona musi być też w Ofercie, w pasku „Kategorie” na każdej kategorii i w panelu bocznym. Gołego kafelka do zwykłej strony nie wolno zostawić.'
  );
  return lines.join('\n');
}
