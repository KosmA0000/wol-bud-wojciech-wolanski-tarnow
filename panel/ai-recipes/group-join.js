// Przepis AI: dołączanie istniejącej strony do wskazanej grupy elementów (kafelki Oferty, pasek kategorii,
// podkategorie, produkty, menu itd.) z pełną budową ramy strony i obecnością we wszystkich miejscach grupy.
// Korzysta z ./consistency.js (część A) gdy jest dostępny, a na samodzielnej gałęzi ma zgodny silnik reguł.

import { resolve, loadSite } from './knowledge.js?v=turbo26';

const RULE_SHARE = 0.75;
const BLOCK_SHARE = 0.5;
const SHARED_SIMILARITY = 0.6;

export const tools = [
  {
    name: 'dolacz_do_grupy',
    description:
      'Przerabia istniejącą stronę tak, aby spełniała wszystkie reguły wybranej grupy (np. kafelków Oferty, podkategorii, menu): kopiuje brakujące bloki ramy z siostrzanej strony (np. pasek „Kategorie” z własną aktywną pozycją, panel boczny), uzupełnia okruszki oraz dopisuje ją wszędzie tam, gdzie występują inni członkowie grupy (Oferta, strona główna, paski kategorii, lista w panelu bocznym, menu, stopka). Zachowuje całą dotychczasową treść strony.',
    parameters: {
      type: 'object',
      properties: {
        strona: {
          type: 'string',
          description: 'Nazwa lub ścieżka istniejącej strony (np. „Promocje” lub „promocje/index.html”).',
        },
        grupa: {
          type: 'string',
          description:
            'Identyfikator lub nazwa grupy (np. „div.home-catalog-grid > a.home-cat-card”, „Oferta”, „pasek kategorii”, „menu”).',
        },
        jakStrona: {
          type: 'string',
          description:
            'Nazwa, ścieżka lub rodzaj siostrzanej strony wzorcowej z tej grupy (np. „Stolarka aluminiowa”, „kategorie/stolarka-aluminiowa/index.html” albo „kategoria”).',
        },
        tytul: {
          type: 'string',
          description: 'Opcjonalna etykieta na kafelkach/pigułkach/listach (domyślnie nagłówek H1 strony).',
        },
        zdjecie: {
          type: 'string',
          description: 'Opcjonalna ścieżka zdjęcia na kafelek (np. „img/products/brama-segmentowa.webp”).',
        },
      },
    },
  },
];

function stripDiacritics(str) {
  return String(str || '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normText(str) {
  return stripDiacritics(str)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeRepoPath(raw) {
  const cleaned = String(raw || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.?\/+/, '');
  if (!cleaned) return '';
  const out = [];
  for (const part of cleaned.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (out.length) out.pop();
    } else {
      out.push(part);
    }
  }
  return out.join('/');
}

function depthPrefix(pagePath) {
  const norm = normalizeRepoPath(pagePath);
  if (!norm) return '';
  const depth = Math.max(0, norm.split('/').length - 1);
  return '../'.repeat(depth);
}

function toRelativeUrl(targetPath, fromPagePath, query = '', hash = '') {
  const target = normalizeRepoPath(targetPath) || 'index.html';
  return depthPrefix(fromPagePath) + target + query + hash;
}

function resolveHrefRaw(rawHref, fromPagePath) {
  if (typeof rawHref !== 'string') return null;
  const s = rawHref.trim();
  if (!s || /^(https?:|\/\/|tel:|mailto:|javascript:|data:|blob:)/i.test(s)) return null;
  let beforeHash = s;
  let hash = '';
  const hIdx = s.indexOf('#');
  if (hIdx >= 0) {
    beforeHash = s.slice(0, hIdx);
    hash = s.slice(hIdx);
  }
  let pathPart = beforeHash;
  let query = '';
  const qIdx = beforeHash.indexOf('?');
  if (qIdx >= 0) {
    pathPart = beforeHash.slice(0, qIdx);
    query = beforeHash.slice(qIdx);
  }
  const normFrom = normalizeRepoPath(fromPagePath) || 'index.html';
  if (!pathPart) return { path: normFrom, query, hash, hashOnly: true };
  const base = pathPart.startsWith('/') ? [] : normFrom.split('/').slice(0, -1);
  const segs = [...base];
  for (const seg of pathPart.replace(/^\/+/, '').split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (segs.length) segs.pop();
    } else segs.push(seg);
  }
  let p = segs.join('/');
  if (!p) p = 'index.html';
  else if (pathPart.endsWith('/')) p += '/index.html';
  return { path: p, query, hash, hashOnly: false };
}

function rebaseExtraAttrs(doc, fromPath, toPath) {
  if (depthPrefix(fromPath) === depthPrefix(toPath)) return;
  for (const attr of [
    'data-desktop-href',
    'data-mobile-home-href',
    'data-src',
    'data-lightbox-src',
    'data-palette-src',
  ]) {
    for (const el of doc.querySelectorAll(`[${attr}]`)) {
      const raw = el.getAttribute(attr);
      const r = resolveHrefRaw(raw, fromPath);
      if (!r || r.hashOnly) continue;
      el.setAttribute(attr, toRelativeUrl(r.path, toPath, r.query, r.hash));
    }
  }
}

const sigOf = (el) =>
  el.tagName.toLowerCase() +
  (el.getAttribute('class') ? '.' + el.getAttribute('class').trim().split(/\s+/)[0] : '');

const txt = (el) => String(el?.textContent || '').replace(/\s+/g, ' ').trim();

function matchesSig(el, sig) {
  if (!el || el.nodeType !== 1 || !sig) return false;
  const dot = sig.indexOf('.');
  if (dot < 0) {
    return el.tagName.toLowerCase() === sig && !(el.getAttribute('class') || '').trim();
  }
  const tag = sig.slice(0, dot);
  const cls = sig.slice(dot + 1);
  const firstCls = (el.getAttribute('class') || '').trim().split(/\s+/)[0];
  return el.tagName.toLowerCase() === tag && firstCls === cls;
}

function frameOf(doc) {
  const main = doc.querySelector('main') || doc.body;
  const wrap = main.querySelector(':scope > .wrap') || main;
  const out = new Set();
  for (const el of wrap.children) {
    if (['SCRIPT', 'STYLE'].includes(el.tagName)) continue;
    out.add(sigOf(el).split('.').pop());
    if (el.querySelector(':scope > aside, :scope > [class*="sidebar"]')) {
      for (const c of el.children) {
        if (c.tagName === 'ASIDE' || /sidebar/.test(c.getAttribute('class') || '')) {
          out.add(sigOf(c).split('.').pop());
        }
      }
    }
  }
  return out;
}

// --- Lokalny fallback consistency (identyczny kontrakt jak consistency.js z części A) ---
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
const isTrail = (box) =>
  /okruszk|breadcrumb/i.test(box.getAttribute('aria-label') || '') ||
  box.querySelector(':scope > [aria-current="page"]');

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
      by.get(s).push({
        el: c,
        a,
        target,
        title: txt(c.querySelector('h2, h3, h4, strong, .title, span')) || txt(a),
      });
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

function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return A.size + B.size - inter ? inter / (A.size + B.size - inter) : 1;
}

async function buildModelFallback(ctx) {
  const all = await loadSite(ctx);
  const pages = all.filter((p) => p.kind !== 'przekierowanie');
  const byPath = new Map(all.map((p) => [p.path, p]));
  const frame = new Map(pages.map((p) => [p.path, frameOf(p.doc)]));

  const instances = [];
  for (const p of pages) for (const l of listsOn(p)) instances.push({ ...l, host: p });
  const lists = new Map();
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
    L.checked = L.hosts;
    if (L.shared && L.hosts.length >= 3) {
      const freq = new Map();
      for (const set of L.members.values()) for (const t of set) freq.set(t, (freq.get(t) || 0) + 1);
      const core = [...freq].filter(([, n]) => n >= L.hosts.length - 1).map(([t]) => t);
      L.checked = L.hosts.filter((h) => core.every((t) => L.members.get(h).has(t)));
      if (L.checked.length < 2) L.checked = L.hosts;
    }
    L.everywhere = new Set(
      [...(L.members.get(L.checked[0]) || [])].filter((t) =>
        L.checked.every((h) => L.members.get(h).has(t))
      )
    );
  }
  const inList = (key, target) => [...lists.get(key).members.values()].some((s) => s.has(target));
  return { pages, byPath, frame, instances, lists, inList };
}

function isEstablishedFallback(model, key, target, targetKind, majorityKind) {
  const L = model.lists.get(key);
  return targetKind !== majorityKind && L.shared && L.hosts.length >= 3 && L.everywhere.has(target);
}

function deriveRulesFallback(model, inst) {
  const kinds = new Map();
  const seenT = new Set();
  const members = inst.items
    .map((i) => ({
      title: i.title,
      href: i.a.getAttribute('href'),
      target: i.target,
      page: model.byPath.get(i.target),
    }))
    .filter(
      (m) =>
        m.page &&
        m.page.kind !== 'przekierowanie' &&
        m.target !== inst.host.path &&
        !seenT.has(m.target) &&
        seenT.add(m.target)
    );
  for (const m of members) kinds.set(m.page.kind, (kinds.get(m.page.kind) || 0) + 1);
  const [targetKind, n] = [...kinds].sort((a, b) => b[1] - a[1])[0] || ['', 0];
  const regular = members.filter(
    (m) => !isEstablishedFallback(model, inst.key, m.target, m.page.kind, targetKind)
  );
  const rules = {
    targetKind: n / Math.max(1, members.length) >= 0.5 ? targetKind : '',
    targetBlocks: [],
    presence: [],
  };
  if (regular.length < 2) return { members, regular, rules };

  const count = new Map();
  for (const m of regular) {
    for (const b of model.frame.get(m.target) || []) count.set(b, (count.get(b) || 0) + 1);
  }
  rules.targetBlocks = [...count]
    .filter(([, c]) => c / regular.length >= Math.max(BLOCK_SHARE, RULE_SHARE))
    .map(([b]) => b);

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

async function analyzeGroupsFallback(ctx) {
  const m = await buildModelFallback(ctx);
  return m.instances.map((inst) => {
    const { members, rules } = deriveRulesFallback(m, inst);
    return {
      hostPage: inst.host.path,
      selector: inst.key,
      label: inst.label,
      members: members.map(({ title, href, target }) => ({ title, href, target })),
      rules,
    };
  });
}

async function checkConsistencyFallback(ctx, { pages: only } = {}) {
  const model = await buildModelFallback(ctx);
  const focus =
    only && only.length ? new Set(only.map((p) => String(p).replace(/^\.?\/+/, ''))) : null;
  const problems = new Map();

  for (const inst of model.instances) {
    const groupInFocus = !focus || focus.has(inst.host.path);
    const { regular, rules } = deriveRulesFallback(model, inst);
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
      const fix = {
        tool: 'dolacz_do_grupy',
        args: { strona: item.target, jakStrona: sibling, grupa: inst.key },
      };
      const add = (code, message, page) => {
        const id = `${code}|${item.target}|${page}|${message}`;
        if (!problems.has(id)) {
          problems.set(id, {
            code,
            message,
            page,
            member: { title: item.title, target: item.target, group: inst.key, hostPage: inst.host.path },
            fix,
          });
        }
      };
      if (!tPage) {
        add('cel-nie-istnieje', `Element „${item.title}” w ${where} prowadzi do strony, której nie ma.`, inst.host.path);
        continue;
      }
      if (!regular.some((m) => m.target === item.target)) continue;
      if (!sibling || (sibling === item.target && ok.length < 2)) continue;

      const f = model.frame.get(item.target) || new Set();
      const missing = rules.targetBlocks.filter((b) => !f.has(b));
      if (missing.length) {
        add(
          'brak-budowy',
          `„${item.title || pageName(tPage)}” jest w ${where}, ale jej strona nie jest zbudowana jak inne strony z tej grupy (np. „${pageName(model.byPath.get(sibling))}”): brakuje ${missing.map(human).join(', ')}.`,
          item.target
        );
      }
      for (const pr of rules.presence) {
        if (pr.scope === 'some') {
          if (tPage.kind === rules.targetKind && !model.inList(pr.where, item.target)) {
            add(
              'brak-obecnosci',
              `„${item.title || pageName(tPage)}” nie występuje w żadnym miejscu typu ${human(pr.where)}, choć inne elementy grupy ${where} tam są.`,
              item.target
            );
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

export async function getConsistency() {
  for (const spec of ['./consistency.js?v=turbo15', './consistency.js']) {
    try {
      const mod = await import(spec);
      if (typeof mod.analyzeGroups === 'function' && typeof mod.checkConsistency === 'function') {
        return {
          analyzeGroups: mod.analyzeGroups,
          checkConsistency: mod.checkConsistency,
          source: 'consistency.js',
        };
      }
    } catch {}
  }
  return {
    analyzeGroups: analyzeGroupsFallback,
    checkConsistency: checkConsistencyFallback,
    source: 'fallback',
  };
}

// --- Pomocniki rozwiązywania strony, grupy i wstawiania elementów ---

function pageSlug(p) {
  const segs = normalizeRepoPath(p).split('/').filter(Boolean);
  if (!segs.length) return '';
  const last = segs[segs.length - 1];
  if (last.toLowerCase() === 'index.html') return segs.length >= 2 ? segs[segs.length - 2] : 'index';
  return last.replace(/\.html?$/i, '');
}

export function resolvePageInList(query, activePages) {
  const q = String(query || '').trim();
  if (!q) return null;
  const cleanP = normalizeRepoPath(q.replace(/^https?:\/\/[^/]+/i, '').replace(/[?#].*$/, '')).replace(
    /\/+$/,
    ''
  );
  const qNorm = normText(q);

  let m = activePages.filter((p) => p.path.toLowerCase() === cleanP.toLowerCase());
  if (m.length === 1) return { page: m[0] };
  if (!m.length && cleanP) {
    m = activePages.filter((p) => p.path.toLowerCase() === `${cleanP}/index.html`.toLowerCase());
    if (m.length === 1) return { page: m[0] };
  }
  if (!m.length && cleanP) {
    m = activePages.filter((p) => pageSlug(p.path).toLowerCase() === cleanP.toLowerCase());
    if (m.length === 1) return { page: m[0] };
  }
  if (!m.length && qNorm) {
    m = activePages.filter((p) => normText(p.label) === qNorm);
    if (m.length === 1) return { page: m[0] };
  }
  if (!m.length && qNorm) {
    m = activePages.filter(
      (p) => normText(p.label).includes(qNorm) || normText(p.path).includes(qNorm)
    );
  }
  if (m.length === 1) return { page: m[0] };
  if (m.length > 1) return { ambiguous: m };
  return null;
}

function groupDisplayLabel(g, byPath) {
  const host = byPath.get(g.hostPage);
  const hName = host?.label || g.hostPage;
  const base = human(g.selector);
  return g.label ? `${g.label} (${base}, ${hName})` : `${base} (${hName})`;
}

function dedupeGroupOptions(groups, byPath) {
  const seen = new Set();
  const opts = [];
  for (const g of groups) {
    if (!g.rules.targetBlocks.length && !g.rules.presence.length) continue;
    if (seen.has(g.selector)) continue;
    seen.add(g.selector);
    opts.push(`${human(g.selector)}${g.label ? ` — ${g.label}` : ''} (${g.selector})`);
  }
  return opts;
}

function groupScore(g) {
  return (g.rules?.presence?.length || 0) * 3 + (g.rules?.targetBlocks?.length || 0) * 2 + (g.members?.length || 0);
}

function selectGroupAndSibling({ grupaArg, jakArg, target, groups, byPath }) {
  const parenSel = String(grupaArg || '').match(/\(([^()]+>[^()]+)\)\s*$/)?.[1]?.trim();
  const grupaClean = parenSel || String(grupaArg || '').trim();
  const grupaNorm = normText(grupaClean);

  let sibCandidate = null;
  let wantedKind = '';
  if (jakArg) {
    const cleanJak = normText(jakArg);
    if (['kategoria', 'podkategoria', 'produkt', 'promocja', 'strona informacyjna'].includes(cleanJak)) {
      wantedKind = cleanJak;
    } else {
      const resJak = resolvePageInList(jakArg, [...byPath.values()]);
      if (resJak?.page) sibCandidate = resJak.page;
    }
  }

  let matchedGroups = [];
  if (grupaClean) {
    matchedGroups = groups.filter((g) => g.selector === grupaClean);
    if (!matchedGroups.length) {
      matchedGroups = groups.filter(
        (g) =>
          normText(g.selector) === grupaNorm ||
          normText(g.label) === grupaNorm ||
          normText(human(g.selector)) === grupaNorm
      );
    }
    if (!matchedGroups.length) {
      matchedGroups = groups.filter(
        (g) =>
          normText(g.selector).includes(grupaNorm) ||
          normText(g.label).includes(grupaNorm) ||
          normText(human(g.selector)).includes(grupaNorm)
      );
    }
    if (!matchedGroups.length) {
      return {
        error: `Nie znalazłem grupy „${grupaArg}”.`,
      };
    }
  } else if (sibCandidate || wantedKind) {
    matchedGroups = groups.filter((g) => {
      if (sibCandidate && g.members.some((m) => m.target === sibCandidate.path)) return true;
      if (wantedKind && g.rules.targetKind === wantedKind) return true;
      return false;
    });
  }

  if (!matchedGroups.length) return { error: 'Nie udało się dopasować grupy dla podanych danych.' };

  // Preferuj grupę z hostem zgodnym z wzorcem/najbogatszymi regułami (np. Oferta ponad menu)
  matchedGroups.sort((a, b) => {
    const aHasSib = sibCandidate && a.members.some((m) => m.target === sibCandidate.path) ? 1 : 0;
    const bHasSib = sibCandidate && b.members.some((m) => m.target === sibCandidate.path) ? 1 : 0;
    if (aHasSib !== bHasSib) return bHasSib - aHasSib;
    const aHome = a.hostPage === 'index.html' ? 1 : 0;
    const bHome = b.hostPage === 'index.html' ? 1 : 0;
    const diff = groupScore(b) - groupScore(a);
    if (diff !== 0) return diff;
    return bHome - aHome;
  });

  const group = matchedGroups[0];
  let sibling = null;

  if (sibCandidate && sibCandidate.path !== target.path) {
    const sibFrame = frameOf(sibCandidate.doc);
    if (
      group.members.some((m) => m.target === sibCandidate.path) ||
      group.rules.targetBlocks.every((b) => sibFrame.has(b))
    ) {
      sibling = sibCandidate;
    }
  }

  if (!sibling) {
    for (const m of group.members) {
      if (m.target === target.path) continue;
      const cand = byPath.get(m.target);
      if (!cand) continue;
      const f = frameOf(cand.doc);
      if (
        (!group.rules.targetKind || cand.kind === group.rules.targetKind) &&
        group.rules.targetBlocks.every((b) => f.has(b))
      ) {
        sibling = cand;
        break;
      }
    }
  }
  if (!sibling) {
    for (const m of group.members) {
      if (m.target === target.path) continue;
      const cand = byPath.get(m.target);
      if (cand && group.rules.targetBlocks.every((b) => frameOf(cand.doc).has(b))) {
        sibling = cand;
        break;
      }
    }
  }
  if (!sibling && sibCandidate && sibCandidate.path !== target.path) sibling = sibCandidate;

  return { group, sibling };
}

function findRootImage(target, groups, explicitImg) {
  if (explicitImg) {
    return normalizeRepoPath(explicitImg);
  }
  // 1. Sprawdź czy w jakiejś grupie istnieje już kafelek ze zdjęciem wskazującym na target.path
  for (const g of groups) {
    for (const m of g.members) {
      if (m.target !== target.path) continue;
      // Odczytamy obraz bezpośrednio w pętli po stronach poniżej jeśli tutaj brak
    }
  }
  // 2. Z samej strony docelowej (main img)
  for (const img of target.doc.querySelectorAll('main img[src]')) {
    const src = img.getAttribute('src') || '';
    if (!src || /wolbud-logo|favicon/i.test(src)) continue;
    const r = resolveHrefRaw(src, target.path);
    if (r && !r.hashOnly) return r.path;
  }
  return '';
}

function findExistingTileImageOnPages(targetPath, byPath) {
  for (const p of byPath.values()) {
    for (const a of p.doc.querySelectorAll('a[href]')) {
      const r = resolveHrefRaw(a.getAttribute('href'), p.path);
      if (!r || r.hashOnly || r.path !== targetPath) continue;
      const card = a.closest('a, article, div, li');
      const img = card?.querySelector('img[src]');
      if (img) {
        const ir = resolveHrefRaw(img.getAttribute('src'), p.path);
        if (ir && !ir.hashOnly) return ir.path;
      }
    }
  }
  return '';
}

function replaceTextPreservingChildren(el, newText) {
  if (!el) return false;
  if (!el.children || el.children.length === 0) {
    if (el.textContent === newText) return false;
    el.textContent = newText;
    return true;
  }
  for (const node of el.childNodes) {
    if (node.nodeType === 3 && node.nodeValue && node.nodeValue.trim()) {
      const lead = node.nodeValue.match(/^\s*/)?.[0] || '';
      const trail = node.nodeValue.match(/\s*$/)?.[0] || '';
      node.nodeValue = `${lead}${newText}${trail}`;
      return true;
    }
  }
  el.insertBefore(el.ownerDocument.createTextNode(`${newText} `), el.firstChild);
  return true;
}

function clearActiveMarkers(el) {
  for (const node of [el, ...el.querySelectorAll('*')]) {
    if (node.classList?.contains('is-active')) node.classList.remove('is-active');
    if (node.hasAttribute?.('aria-current')) node.removeAttribute('aria-current');
    if (node.hasAttribute?.('style') && /font-weight|highlight/i.test(node.getAttribute('style') || '')) {
      node.removeAttribute('style');
    }
  }
}

function buildTargetFrame(target, sibling, group, title, ctx) {
  const doc = target.doc;
  const sibRawHtml = ctx.serialize(sibling.doc);
  const rebasedHtml = ctx.rebaseUrls(sibRawHtml, sibling.path, target.path);
  const sibDoc = ctx.parse(rebasedHtml);
  rebaseExtraAttrs(sibDoc, sibling.path, target.path);

  const main = doc.querySelector('main') || doc.body;
  const wrap = main.querySelector(':scope > .wrap') || main;
  const sibMain = sibDoc.querySelector('main') || sibDoc.body;
  const sibWrap = sibMain.querySelector(':scope > .wrap') || sibMain;

  const missing = group.rules.targetBlocks.filter((b) => !frameOf(doc).has(b));
  const addedBlocks = [];

  // 1. Zapewnij .subpage-grid + .subpage-sidebar jeśli wymagane
  const needsGrid = missing.includes('subpage-grid') || missing.some((b) => /sidebar/.test(b));
  if (needsGrid && !wrap.querySelector('.subpage-grid')) {
    const grid = doc.createElement('div');
    grid.setAttribute('class', 'subpage-grid');
    const content = doc.createElement('div');
    content.setAttribute('class', 'subpage-content');
    const frameKeep = new Set(['page-nav-bar', 'subpage-head', 'cat-quick-nav']);
    const contentNodes = [...wrap.children].filter((el) => {
      if (['SCRIPT', 'STYLE'].includes(el.tagName)) return true;
      const cls = sigOf(el).split('.').pop();
      return !frameKeep.has(cls);
    });
    for (const node of contentNodes) {
      content.appendChild(node);
    }
    grid.appendChild(content);
    wrap.appendChild(grid);
    addedBlocks.push('subpage-grid');
  }

  if (missing.some((b) => /sidebar/.test(b))) {
    const grid = wrap.querySelector('.subpage-grid');
    const sibSidebar = sibWrap.querySelector(':scope > .subpage-grid aside, :scope > .subpage-grid [class*="sidebar"]');
    if (grid && sibSidebar && !grid.querySelector('aside, [class*="sidebar"]')) {
      const cloned = doc.importNode(sibSidebar, true);
      clearActiveMarkers(cloned);
      grid.appendChild(cloned);
      addedBlocks.push(sigOf(sibSidebar).split('.').pop());
    }
  }

  // 2. Dodaj pozostałe brakujące bloki dzieci .wrap w kolejności ze strony wzorcowej
  const sibWrapChildren = [...sibWrap.children].filter((e) => !['SCRIPT', 'STYLE'].includes(e.tagName));
  for (let i = 0; i < sibWrapChildren.length; i++) {
    const sibEl = sibWrapChildren[i];
    const cls = sigOf(sibEl).split('.').pop();
    if (!missing.includes(cls) || cls === 'subpage-grid') continue;
    if (frameOf(doc).has(cls)) continue;

    const imported = doc.importNode(sibEl, true);
    clearActiveMarkers(imported);

    // Wstaw po ostatnim wcześniejszym bloku ze wzorca, który już istnieje w wrap
    let anchor = null;
    for (let j = i - 1; j >= 0; j--) {
      const prevCls = sigOf(sibWrapChildren[j]).split('.').pop();
      const found = [...wrap.children].find((c) => sigOf(c).split('.').pop() === prevCls);
      if (found) {
        anchor = found;
        break;
      }
    }
    if (anchor) {
      anchor.after(imported);
    } else {
      let nextAnchor = null;
      for (let j = i + 1; j < sibWrapChildren.length; j++) {
        const nextCls = sigOf(sibWrapChildren[j]).split('.').pop();
        const found = [...wrap.children].find((c) => sigOf(c).split('.').pop() === nextCls);
        if (found) {
          nextAnchor = found;
          break;
        }
      }
      if (nextAnchor) wrap.insertBefore(imported, nextAnchor);
      else wrap.appendChild(imported);
    }
    addedBlocks.push(cls);
  }

  // 3. Okruszki zgodne z grupą (zachowując bieżącą nazwę strony na końcu)
  let crumbsChanged = false;
  const sibCrumbs = sibDoc.querySelector('nav.breadcrumbs');
  const curCrumbs = doc.querySelector('nav.breadcrumbs');
  if (sibCrumbs && curCrumbs) {
    const sibLinks = [...sibCrumbs.querySelectorAll('a[href]')];
    const curLinks = [...curCrumbs.querySelectorAll('a[href]')];
    const sibPaths = sibLinks.map((a) => resolveHrefRaw(a.getAttribute('href'), target.path)?.path || '');
    const curPaths = curLinks.map((a) => resolveHrefRaw(a.getAttribute('href'), target.path)?.path || '');
    if (sibPaths.length > curPaths.length || sibPaths.some((p, idx) => p !== curPaths[idx])) {
      curCrumbs.replaceChildren();
      for (const a of sibLinks) {
        curCrumbs.appendChild(doc.importNode(a, true));
        const sep = doc.createElement('span');
        sep.textContent = '/';
        curCrumbs.appendChild(sep);
      }
      const span = doc.createElement('span');
      span.setAttribute('aria-current', 'page');
      span.textContent = title;
      curCrumbs.appendChild(span);
      crumbsChanged = true;
    }
  }

  // 4. Nadtytuł .eyebrow w .subpage-head jeśli wzorzec ma, a cel nie ma
  const sibHead = sibDoc.querySelector('header.subpage-head');
  const curHead = doc.querySelector('header.subpage-head');
  if (sibHead && curHead && !curHead.querySelector('.eyebrow')) {
    const sibEyebrow = sibHead.querySelector('.eyebrow');
    if (sibEyebrow) {
      const clonedEyebrow = doc.importNode(sibEyebrow, true);
      const h1 = curHead.querySelector('h1');
      if (h1) curHead.insertBefore(clonedEyebrow, h1);
      else curHead.prepend(clonedEyebrow);
      crumbsChanged = true;
    }
  }

  return { changed: addedBlocks.length > 0 || crumbsChanged, addedBlocks };
}

function findMatchingBox(doc, hostPath, boxSig, itemSig, matchTargets) {
  const candidates = [];
  for (const el of doc.querySelectorAll('*')) {
    if (el.closest('script, template, [data-cms-ui]') || isTrail(el)) continue;
    if (!matchesSig(el, boxSig)) continue;
    const matchedChildren = [...el.children].filter((c) => {
      if (!matchesSig(c, itemSig)) return false;
      const a = c.matches('a[href]') ? c : c.querySelector('a[href]');
      const t = a ? resolve(a.getAttribute('href'), hostPath) : '';
      return t.endsWith('.html');
    });
    if (!matchedChildren.length) continue;
    const overlap = matchedChildren.filter((c) => {
      const a = c.matches('a[href]') ? c : c.querySelector('a[href]');
      const t = resolve(a.getAttribute('href'), hostPath);
      return matchTargets.has(t);
    }).length;
    candidates.push({ box: el, children: matchedChildren, overlap });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.overlap - a.overlap || b.children.length - a.children.length);
  return candidates[0];
}

function insertIntoGroupBox(
  hostDoc,
  hostPath,
  whereKey,
  { targetPath, targetKind, targetTitle, siblingPath, rootImgPath, memberTargets, majorityKind, byPath }
) {
  const [boxSig, itemSig] = String(whereKey || '').split(' > ');
  if (!boxSig || !itemSig) return false;

  const matchSet = new Set([siblingPath, ...memberTargets]);
  const found = findMatchingBox(hostDoc, hostPath, boxSig, itemSig, matchSet);
  if (!found) return false;

  const { box, children } = found;

  // Sprawdź, czy cel już jest w tym kontenerze
  const existing = children.find((c) => {
    const a = c.matches('a[href]') ? c : c.querySelector('a[href]');
    return a && resolve(a.getAttribute('href'), hostPath) === targetPath;
  });

  // Wykryj wzorzec stylu aktywnej pozycji w tej grupie (np. is-active na pigułce, style w sidebarze)
  const selfChild = children.find((c) => {
    const a = c.matches('a[href]') ? c : c.querySelector('a[href]');
    return a && resolve(a.getAttribute('href'), hostPath) === hostPath;
  });
  const hostLink = selfChild ? (selfChild.matches('a[href]') ? selfChild : selfChild.querySelector('a[href]')) : null;
  const activeClass = hostLink?.classList?.contains('is-active')
    ? 'is-active'
    : selfChild?.classList?.contains('is-active')
      ? 'is-active'
      : '';
  const activeStyle =
    !activeClass && hostLink?.getAttribute('style')
      ? hostLink.getAttribute('style')
      : '';

  if (existing) {
    if (hostPath === targetPath) {
      const exLink = existing.matches('a[href]') ? existing : existing.querySelector('a[href]');
      if (activeClass && exLink && !exLink.classList.contains(activeClass)) {
        exLink.classList.add(activeClass);
        return true;
      }
      if (
        !activeClass &&
        exLink &&
        /sidebar-links/.test(boxSig) &&
        !(exLink.getAttribute('style') || '').trim()
      ) {
        exLink.setAttribute('style', activeStyle || 'font-weight:700; color:var(--highlight);');
        return true;
      }
    }
    return false;
  }

  // Wybierz sąsiednie dziecko do sklonowania (najpierw siblingPath, potem regularny członek, nigdy self/wyjątek)
  const isRegularChild = (c) => {
    const a = c.matches('a[href]') ? c : c.querySelector('a[href]');
    const t = a ? resolve(a.getAttribute('href'), hostPath) : '';
    const p = byPath.get(t);
    return p && (!majorityKind || p.kind === majorityKind);
  };
  const template =
    children.find((c) => {
      const a = c.matches('a[href]') ? c : c.querySelector('a[href]');
      return a && resolve(a.getAttribute('href'), hostPath) === siblingPath;
    }) ||
    children.find((c) => {
      const a = c.matches('a[href]') ? c : c.querySelector('a[href]');
      const t = a ? resolve(a.getAttribute('href'), hostPath) : '';
      return t !== hostPath && isRegularChild(c);
    }) ||
    children.find((c) => isRegularChild(c)) ||
    children[0];

  if (!template) return false;

  const tmplLink = template.matches('a[href]') ? template : template.querySelector('a[href]');
  const oldTarget = tmplLink ? resolve(tmplLink.getAttribute('href'), hostPath) : '';
  const oldTitle =
    txt(template.querySelector('h2, h3, h4, .cat-prod-title a, .cat-prod-title, strong, span')) ||
    txt(tmplLink);

  const clone = template.cloneNode(true);
  clearActiveMarkers(clone);

  const newHref = toRelativeUrl(targetPath, hostPath);
  for (const a of clone.matches('a[href]') ? [clone] : [...clone.querySelectorAll('a[href]')]) {
    if (!oldTarget || resolve(a.getAttribute('href'), hostPath) === oldTarget) {
      a.setAttribute('href', newHref);
      if (a.hasAttribute('data-desktop-href')) a.setAttribute('data-desktop-href', newHref);
      if (a.hasAttribute('data-mobile-home-href')) a.removeAttribute('data-mobile-home-href');
    }
    const aria = a.getAttribute('aria-label');
    if (aria && oldTitle && aria.includes(oldTitle)) {
      a.setAttribute('aria-label', aria.replace(oldTitle, targetTitle));
    }
  }

  // Jeśli wstawiamy element na samej stronie docelowej i inne strony oznaczają aktywną stronę — oznacz ją
  if (hostPath === targetPath) {
    const cloneLink = clone.matches('a[href]') ? clone : clone.querySelector('a[href]');
    if (/cat-nav-pill/.test(itemSig)) {
      cloneLink?.classList?.add('is-active');
    } else if (/sidebar-links/.test(boxSig) && cloneLink) {
      cloneLink.setAttribute('style', activeStyle || 'font-weight:700; color:var(--highlight);');
    }
  }

  // Podmień tytuł / napis bez psucia <a> w .cat-prod-title ani <span>↗</span> w linkach
  const titleEl =
    clone.querySelector('.cat-prod-title a') ||
    clone.querySelector('h3 a') ||
    clone.querySelector('h2, h3, h4, .cat-prod-title, .subcat-title');
  if (titleEl) {
    titleEl.textContent = targetTitle;
  } else {
    const mainA = clone.matches('a[href]') ? clone : clone.querySelector('a[href]');
    if (mainA) replaceTextPreservingChildren(mainA, targetTitle);
  }

  // Podmień zdjęcie jeśli jest na karcie i mamy rootImgPath
  const img = clone.querySelector('img');
  if (img) {
    if (rootImgPath) img.setAttribute('src', toRelativeUrl(rootImgPath, hostPath));
    img.setAttribute('alt', targetTitle);
  }

  // Wstaw przed stałymi wyjątkami na końcu listy (np. „Usługi” w pasku kategorii i sidebarze)
  let tailException = null;
  for (let i = children.length - 1; i >= 0; i--) {
    const c = children[i];
    const a = c.matches('a[href]') ? c : c.querySelector('a[href]');
    const t = a ? resolve(a.getAttribute('href'), hostPath) : '';
    const tPage = byPath.get(t);
    if (tPage && majorityKind && tPage.kind !== majorityKind && t !== targetPath) {
      tailException = c;
    } else {
      break;
    }
  }

  if (tailException) {
    tailException.before(clone);
  } else {
    const lastMatch = children[children.length - 1];
    lastMatch.after(clone);
  }

  return true;
}

export async function run(name, args = {}, ctx) {
  if (name !== 'dolacz_do_grupy') {
    return { ok: false, error: `Nieznany przepis: ${name}` };
  }

  const { analyzeGroups } = await getConsistency();
  const allPages = (await loadSite(ctx)).filter(
    (p) => p.kind !== 'przekierowanie' && !p.path.startsWith('panel/')
  );
  const byPath = new Map(allPages.map((p) => [p.path, p]));
  const groups = await analyzeGroups(ctx);

  const rawStrona = String(args.strona || '').trim();
  if (!rawStrona) {
    return {
      ok: false,
      needsAnswer: 'Którą istniejącą stronę chcesz dołączyć do grupy?',
      options: allPages.filter((p) => p.path !== 'index.html').map((p) => p.label),
    };
  }

  const foundTarget = resolvePageInList(rawStrona, allPages);
  if (!foundTarget) {
    return { ok: false, error: `Nie znaleziono strony „${rawStrona}”.` };
  }
  if (foundTarget.ambiguous) {
    return {
      ok: false,
      needsAnswer: `Znalazłem kilka stron pasujących do „${rawStrona}”. Którą masz na myśli?`,
      options: foundTarget.ambiguous.map((p) => `${p.label} (${p.path})`),
    };
  }
  const target = foundTarget.page;

  const rawGrupa = String(args.grupa || '').trim();
  const rawJak = String(args.jakStrona || '').trim();

  if (!rawGrupa && !rawJak) {
    return {
      ok: false,
      needsAnswer: `Do której grupy chcesz dołączyć stronę „${target.label}”?`,
      options: dedupeGroupOptions(groups, byPath),
    };
  }

  const selected = selectGroupAndSibling({
    grupaArg: rawGrupa,
    jakArg: rawJak,
    target,
    groups,
    byPath,
  });

  if (selected.error || !selected.group) {
    return {
      ok: false,
      needsAnswer: `${selected.error || 'Wybierz grupę dla strony.'} Dostępne grupy:`,
      options: dedupeGroupOptions(groups, byPath),
    };
  }

  const { group, sibling } = selected;
  if (!sibling) {
    return {
      ok: false,
      error: `Grupa „${groupDisplayLabel(group, byPath)}” nie ma siostrzanej strony wzorcowej do skopiowania.`,
    };
  }

  const targetTitle = String(args.tytul || '').trim() || target.label || target.path;
  const rootImgPath =
    (args.zdjecie ? normalizeRepoPath(args.zdjecie) : '') ||
    findExistingTileImageOnPages(target.path, byPath) ||
    findRootImage(target, groups, '');

  const touched = new Set();

  // ETAP 1: Budowa strony docelowej zgodnie z rules.targetBlocks
  const frameRes = buildTargetFrame(target, sibling, group, targetTitle, ctx);
  if (frameRes.changed) {
    touched.add(target.path);
  }

  // ETAP 2: Obecność strony docelowej we WSZYSTKICH wykrytych miejscach grupy
  const presenceList = [...(group.rules.presence || [])];
  if (!presenceList.some((pr) => pr.where === group.selector)) {
    presenceList.unshift({
      where: group.selector,
      scope: 'some',
      pages: [group.hostPage],
    });
  }

  const memberTargets = group.members.map((m) => m.target);
  const majorityKind = group.rules.targetKind || sibling.kind;
  const addedPlaces = [];

  for (const pr of presenceList) {
    const [boxSig, itemSig] = String(pr.where || '').split(' > ');
    if (!boxSig || !itemSig) continue;

    let hostPaths = [];
    if (pr.scope === 'all') {
      const set = new Set([...(pr.pages || []), target.path]);
      // Dopisz też każdą inną stronę, na której w identycznym kontenerze jest strona wzorcowa
      for (const p of allPages) {
        if (set.has(p.path)) continue;
        const boxFound = findMatchingBox(p.doc, p.path, boxSig, itemSig, new Set([sibling.path]));
        if (boxFound && boxFound.overlap > 0) set.add(p.path);
      }
      hostPaths = [...set];
    } else {
      // Zakres lokalny ('some'): jeśli docelowa strona już występuje na którejś z tych stron (albo na hostPage grupy), dopisz brakujące hosty
      const preferred = pr.where === group.selector ? [group.hostPage] : [];
      const hostsWithGroup = allPages.filter((p) => {
        const boxFound = findMatchingBox(
          p.doc,
          p.path,
          boxSig,
          itemSig,
          new Set([sibling.path, ...memberTargets])
        );
        return boxFound && boxFound.overlap > 0;
      });
      const alreadyPresent = hostsWithGroup.some((p) => {
        const boxFound = findMatchingBox(p.doc, p.path, boxSig, itemSig, new Set([target.path]));
        return boxFound && boxFound.overlap > 0;
      });
      if (!alreadyPresent) {
        if (preferred.length && hostsWithGroup.some((h) => h.path === preferred[0])) {
          hostPaths = preferred;
        } else if (hostsWithGroup.length) {
          hostPaths = [hostsWithGroup[0].path];
        }
      }
    }

    let countForWhere = 0;
    for (const hPath of hostPaths) {
      const hPage = byPath.get(hPath);
      if (!hPage) continue;
      const inserted = insertIntoGroupBox(hPage.doc, hPath, pr.where, {
        targetPath: target.path,
        targetKind: target.kind,
        targetTitle,
        siblingPath: sibling.path,
        rootImgPath,
        memberTargets,
        majorityKind,
        byPath,
      });
      if (inserted) {
        touched.add(hPath);
        countForWhere++;
      }
    }

    if (countForWhere > 0) {
      addedPlaces.push(`${human(pr.where)} (${countForWhere})`);
    }

    // Jeśli zmodyfikowano menu główne lub stopkę, zsynchronizuj też globals
    if (/menu-panel/.test(boxSig) || /footer-links/.test(boxSig)) {
      const g = ctx.getGlobals();
      let gChanged = false;
      if (/menu-panel/.test(boxSig) && Array.isArray(g.menu)) {
        if (!g.menu.some((m) => normalizeRepoPath(m.href) === target.path)) {
          g.menu.push({ label: targetTitle, href: target.path, mobileHref: '' });
          gChanged = true;
        }
      }
      if (/footer-links/.test(boxSig) && Array.isArray(g.footerLinks)) {
        if (!g.footerLinks.some((m) => normalizeRepoPath(m.href) === target.path)) {
          g.footerLinks.push({ label: targetTitle, href: target.path });
          gChanged = true;
        }
      }
      if (gChanged) await ctx.setGlobals(g);
    }
  }

  // Zapisz wszystkie zmodyfikowane strony
  for (const pPath of touched) {
    const pInfo = byPath.get(pPath);
    if (!pInfo) continue;
    await ctx.writePage(pPath, ctx.serialize(pInfo.doc), {
      label: pInfo.label,
      title: pInfo.doc.querySelector('title')?.textContent || pInfo.doc.title || pInfo.label,
      group: pInfo.entry?.group,
    });
  }

  const changedPages = Array.from(touched);
  const parts = [];
  if (frameRes.addedBlocks.length) {
    parts.push(`dodałem brakujące bloki (${frameRes.addedBlocks.map(human).join(', ')})`);
  }
  if (addedPlaces.length) {
    parts.push(`dopisałem stronę w: ${addedPlaces.join(', ')}`);
  }
  if (!parts.length) {
    return {
      ok: true,
      pagePath: target.path,
      group: group.selector,
      siblingPath: sibling.path,
      changedPages: [],
      summary: `Strona „${targetTitle}” spełnia już wszystkie reguły grupy „${human(group.selector)}” — nic nie trzeba było zmieniać.`,
    };
  }

  return {
    ok: true,
    pagePath: target.path,
    group: group.selector,
    siblingPath: sibling.path,
    changedPages,
    summary: `Gotowe: dołączyłem „${targetTitle}” na wzór „${sibling.label}” — ${parts.join(' oraz ')} (łącznie ${changedPages.length} stron). Polecenie „cofnij” przywraca całą operację.`,
  };
}
