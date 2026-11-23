// Przepis AI: zmiana nazwy i/lub adresu strony w całym serwisie WOL-BUD.
// Aktualizuje h1, title, meta description, kafelki, pigułki, menu, stopkę, sidebar,
// okruszki, nawigację produktów, przenosi stronę (z ewentualnymi podstronami ścieżkowymi),
// przepina linki i istniejące przekierowania (bez łańcuchów) oraz tworzy stronę przekierowania.

const CONCURRENCY = 8;

export const tools = [
  {
    name: 'zmien_nazwe_wszedzie',
    description:
      'Zmienia nazwę i/lub adres URL wybranej strony w całym serwisie: H1, <title>, meta description, kafelki, pigułki kategorii, menu, stopkę, pasek boczny, okruszki oraz nawigację produktów. Gdy podano nowyAdres, przenosi stronę (wraz z ewentualnymi zagnieżdżonymi podstronami), aktualizuje wszystkie linki i istniejące przekierowania oraz zostawia pod starym adresem stronę przekierowania (meta refresh + canonical).',
    parameters: {
      type: 'object',
      properties: {
        strona: {
          type: 'string',
          description:
            'Obecna nazwa lub ścieżka strony do zmiany, np. „Okna PCV” albo „kategorie/okna-pcv/index.html”.',
        },
        nowaNazwa: {
          type: 'string',
          description: 'Nowa nazwa strony widoczna dla klientów (opcjonalna, jeśli zmieniasz tylko adres).',
        },
        nowyAdres: {
          type: 'string',
          description:
            'Opcjonalny nowy adres lub slug, np. „okna-plastikowe” albo „kategorie/okna-plastikowe/index.html”.',
        },
      },
      required: ['strona'],
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

function escapeRegExp(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function resolveHref(rawHref, fromPagePath) {
  if (typeof rawHref !== 'string') return null;
  const s = rawHref.trim();
  if (!s) return null;
  if (/^(https?:|\/\/|tel:|mailto:|javascript:|data:|blob:)/i.test(s)) return null;

  let beforeHash = s;
  let hash = '';
  const hashIdx = s.indexOf('#');
  if (hashIdx >= 0) {
    beforeHash = s.slice(0, hashIdx);
    hash = s.slice(hashIdx);
  }

  let pathPart = beforeHash;
  let query = '';
  const queryIdx = beforeHash.indexOf('?');
  if (queryIdx >= 0) {
    pathPart = beforeHash.slice(0, queryIdx);
    query = beforeHash.slice(queryIdx);
  }

  const normalizedFrom = normalizeRepoPath(fromPagePath) || 'index.html';
  if (!pathPart) {
    return { path: normalizedFrom, query, hash, hashOnly: true };
  }

  const baseSegs = pathPart.startsWith('/')
    ? []
    : normalizedFrom.split('/').slice(0, -1);

  const relSegs = pathPart.replace(/^\/+/, '').split('/');
  const combined = [...baseSegs];
  for (const seg of relSegs) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (combined.length) combined.pop();
    } else {
      combined.push(seg);
    }
  }

  let resolvedPath = combined.join('/');
  if (!resolvedPath) {
    resolvedPath = 'index.html';
  } else if (pathPart.endsWith('/')) {
    resolvedPath = `${resolvedPath}/index.html`;
  }

  return { path: resolvedPath, query, hash, hashOnly: false };
}

function getRefreshMeta(doc) {
  const metas = doc.querySelectorAll('meta[http-equiv]');
  for (const m of metas) {
    if (String(m.getAttribute('http-equiv') || '').trim().toLowerCase() === 'refresh') {
      return m;
    }
  }
  return null;
}

function isRedirectDoc(doc) {
  return Boolean(getRefreshMeta(doc));
}

function getDocTitle(doc) {
  const titleEl = doc.querySelector('title');
  return (titleEl?.textContent || doc.title || '').replace(/\s+/g, ' ').trim();
}

function setDocTitle(doc, nextTitle) {
  const titleEl = doc.querySelector('title');
  if (titleEl) {
    titleEl.textContent = nextTitle;
  } else {
    doc.title = nextTitle;
  }
}

function buildRedirectHtml(fromPath, toPath) {
  const rel = toRelativeUrl(toPath, fromPath);
  return (
    '<!doctype html>\n' +
    '<html lang="pl"><head><meta charset="utf-8"><meta name="robots" content="noindex">\n' +
    `<meta http-equiv="refresh" content="0; url=${rel}">\n` +
    `<link rel="canonical" href="${rel}">\n` +
    '<title>Strona przeniesiona | WOL-BUD</title></head>\n' +
    `<body><p>Ta strona została przeniesiona: <a href="${rel}">przejdź dalej</a>.</p></body></html>`
  );
}

function rebaseExtraAttrs(doc, fromPath, toPath) {
  if (depthPrefix(fromPath) === depthPrefix(toPath)) return false;
  let changed = false;
  const attrs = [
    'data-desktop-href',
    'data-mobile-home-href',
    'data-src',
    'data-lightbox-src',
    'data-palette-src',
  ];
  for (const attr of attrs) {
    doc.querySelectorAll(`[${attr}]`).forEach((el) => {
      const raw = el.getAttribute(attr);
      const resolved = resolveHref(raw, fromPath);
      if (!resolved || resolved.hashOnly) return;
      const next = toRelativeUrl(resolved.path, toPath, resolved.query, resolved.hash);
      if (next !== raw) {
        el.setAttribute(attr, next);
        changed = true;
      }
    });
  }
  return changed;
}

function computeNewPath(rawNewAddr, oldPath, ctxSlugify) {
  let clean = String(rawNewAddr || '')
    .trim()
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/[?#].*$/, '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');

  if (!clean) return '';

  const slugifyFn =
    typeof ctxSlugify === 'function'
      ? ctxSlugify
      : (t) =>
          normText(t)
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

  const normOld = normalizeRepoPath(oldPath);

  if (!clean.includes('/')) {
    const slug = slugifyFn(clean);
    if (!slug) return '';
    const segs = normOld.split('/');
    if (segs.length >= 2 && segs[segs.length - 1].toLowerCase() === 'index.html') {
      const parentSegs = segs.slice(0, -2);
      return normalizeRepoPath([...parentSegs, slug, 'index.html'].join('/'));
    }
    const parentSegs = segs.slice(0, -1);
    return normalizeRepoPath([...parentSegs, slug, 'index.html'].join('/'));
  }

  const parts = clean.split('/').filter(Boolean);
  if (!parts.length) return '';

  const last = parts[parts.length - 1];
  let normalizedSegs;
  if (/\.html?$/i.test(last)) {
    const baseName = last.replace(/\.html?$/i, '');
    const slugLast = baseName.toLowerCase() === 'index' ? 'index' : slugifyFn(baseName);
    if (!slugLast) return '';
    normalizedSegs = [
      ...parts.slice(0, -1).map((s) => slugifyFn(s)).filter(Boolean),
      `${slugLast}.html`,
    ];
  } else {
    normalizedSegs = [...parts.map((s) => slugifyFn(s)).filter(Boolean), 'index.html'];
  }

  const result = normalizeRepoPath(normalizedSegs.join('/'));
  if (!result || result === 'index.html' || result === 'panel' || result.startsWith('panel/')) {
    return '';
  }
  return result;
}

function stripTitleSuffix(title) {
  return String(title || '')
    .replace(/\s*\|\s*WOL-BUD.*$/i, '')
    .trim();
}

function pageSlugFromPath(path) {
  const segs = normalizeRepoPath(path).split('/').filter(Boolean);
  if (!segs.length) return '';
  const last = segs[segs.length - 1];
  if (last.toLowerCase() === 'index.html') {
    return segs.length >= 2 ? segs[segs.length - 2] : 'index';
  }
  return last.replace(/\.html?$/i, '');
}

function extractDocName(doc, pageEntry) {
  const h1 = doc.querySelector('main h1') || doc.querySelector('h1');
  const h1Text =
    h1 && !h1.querySelector('.mask')
      ? h1.textContent.replace(/\s+/g, ' ').trim()
      : '';
  return (
    h1Text ||
    stripTitleSuffix(getDocTitle(doc)) ||
    (pageEntry?.label && pageEntry.label !== pageEntry.path ? pageEntry.label : '') ||
    pageEntry?.path ||
    ''
  );
}

function replaceCaseInsensitive(text, oldStr, newStr) {
  if (!oldStr || typeof text !== 'string') return text;
  const re = new RegExp(escapeRegExp(oldStr), 'gi');
  return text.replace(re, () => newStr);
}

function replaceTextPreservingChildren(el, newText, trailingSpaceIfHasChild = false) {
  if (!el) return false;
  const hasChildElements = el.children && el.children.length > 0;
  if (!hasChildElements) {
    if (el.textContent === newText) return false;
    el.textContent = newText;
    return true;
  }

  for (const node of el.childNodes) {
    if (node.nodeType === 3 && node.nodeValue && node.nodeValue.trim()) {
      const lead = node.nodeValue.match(/^\s*/)?.[0] || '';
      const trail =
        node.nodeValue.match(/\s*$/)?.[0] || (trailingSpaceIfHasChild ? ' ' : '');
      const nextVal = `${lead}${newText}${trail}`;
      if (node.nodeValue === nextVal) return false;
      node.nodeValue = nextVal;
      return true;
    }
  }

  const doc = el.ownerDocument;
  const prefix = trailingSpaceIfHasChild ? `${newText} ` : newText;
  el.insertBefore(doc.createTextNode(prefix), el.firstChild);
  return true;
}

async function readAllPages(pages, ctx, existingMap = null) {
  const htmlByPath = existingMap ? new Map(existingMap) : new Map();
  const toRead = pages.filter((p) => p && p.path && !htmlByPath.has(p.path));
  for (let i = 0; i < toRead.length; i += CONCURRENCY) {
    const batch = toRead.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((p) => ctx.readPage(p.path)));
    batch.forEach((p, idx) => {
      if (typeof results[idx] === 'string') {
        htmlByPath.set(p.path, results[idx]);
      }
    });
  }
  return htmlByPath;
}

async function resolveTargetPage(query, pages, ctx) {
  const candidatesAll = pages.filter(
    (p) => p && p.path && p.path !== 'panel' && !p.path.startsWith('panel/')
  );

  const raw = String(query || '').trim();
  if (!raw) {
    const htmlByPath = await readAllPages(candidatesAll, ctx);
    const activeLabels = [];
    for (const p of candidatesAll) {
      const html = htmlByPath.get(p.path);
      if (!html) continue;
      const doc = ctx.parse(html);
      if (isRedirectDoc(doc)) continue;
      const name = extractDocName(doc, p);
      if (name && !activeLabels.includes(name)) activeLabels.push(name);
    }
    return {
      needsAnswer: 'Którą stronę chcesz zmienić?',
      options: activeLabels,
    };
  }

  const cleanPath = normalizeRepoPath(
    raw.replace(/^https?:\/\/[^/]+/i, '').replace(/[?#].*$/, '')
  ).replace(/\/+$/, '');
  const cleanNorm = normText(raw);

  // 1. Dokładna ścieżka
  let matches = candidatesAll.filter(
    (p) => p.path.toLowerCase() === cleanPath.toLowerCase()
  );
  // 2. Ścieżka katalogu bez /index.html
  if (!matches.length && cleanPath) {
    const withIndex = `${cleanPath}/index.html`.toLowerCase();
    matches = candidatesAll.filter((p) => p.path.toLowerCase() === withIndex);
  }
  // 3. Slug katalogu / pliku (odfiltruj od razu strony przekierowań)
  let htmlByPath = new Map();
  if (!matches.length && cleanPath) {
    const cleanSlug = cleanPath.toLowerCase();
    const slugMatches = candidatesAll.filter(
      (p) => pageSlugFromPath(p.path).toLowerCase() === cleanSlug
    );
    if (slugMatches.length) {
      htmlByPath = await readAllPages(slugMatches, ctx, htmlByPath);
      matches = slugMatches.filter((p) => {
        const html = htmlByPath.get(p.path);
        return !html || !isRedirectDoc(ctx.parse(html));
      });
    }
  }
  // 4. Dokładna etykieta lub tytuł z metadanych
  if (!matches.length && cleanNorm) {
    matches = candidatesAll.filter(
      (p) =>
        (p.label && p.label !== p.path && normText(p.label) === cleanNorm) ||
        (p.title && normText(stripTitleSuffix(p.title)) === cleanNorm)
    );
  }

  // 5. Fallback przez odczyt HTML (<h1> i <title>), gdy metadane listPages nie mają nazw lub trafiły tylko przekierowania
  if (!matches.length && cleanNorm) {
    htmlByPath = await readAllPages(candidatesAll, ctx, htmlByPath);
    const parsedActive = [];
    for (const p of candidatesAll) {
      const html = htmlByPath.get(p.path);
      if (!html) continue;
      const doc = ctx.parse(html);
      if (isRedirectDoc(doc)) continue;
      const h1El = doc.querySelector('main h1') || doc.querySelector('h1');
      const h1 =
        h1El && !h1El.querySelector('.mask')
          ? h1El.textContent.replace(/\s+/g, ' ').trim()
          : '';
      const ttl = stripTitleSuffix(getDocTitle(doc));
      parsedActive.push({ p, h1, ttl });
    }

    // 5a. Dokładne dopasowanie po <h1> lub <title>
    const exactHtml = parsedActive.filter(
      (x) => normText(x.h1) === cleanNorm || normText(x.ttl) === cleanNorm
    );
    if (exactHtml.length) {
      matches = exactHtml.map((x) => x.p);
    } else {
      // 5b. Dopasowanie częściowe po ścieżce, <h1>, <title> lub etykiecie
      const partialHtml = parsedActive.filter(
        (x) =>
          normText(x.h1).includes(cleanNorm) ||
          normText(x.ttl).includes(cleanNorm) ||
          normText(x.p.path).includes(cleanNorm) ||
          normText(x.p.label).includes(cleanNorm)
      );
      matches = partialHtml.map((x) => x.p);
    }
  }

  if (!matches.length) {
    return { error: `Nie znaleziono strony pasującej do „${raw}”.` };
  }
  if (matches.length === 1) {
    return { page: matches[0], htmlByPath };
  }

  // Odrzuć strony przekierowania przy wieloznaczności
  htmlByPath = await readAllPages(matches, ctx, htmlByPath);
  const parsedPool = matches.map((p) => {
    const html = htmlByPath.get(p.path);
    const doc = html ? ctx.parse(html) : null;
    return { p, doc, isRedir: doc ? isRedirectDoc(doc) : false };
  });
  const active = parsedPool.filter((x) => !x.isRedir);

  if (active.length === 1) {
    return { page: active[0].p, htmlByPath };
  }

  const pool = active.length ? active : parsedPool;
  return {
    needsAnswer: `Znaleziono kilka stron pasujących do „${raw}”. Którą dokładnie chcesz zmienić?`,
    options: pool.slice(0, 8).map(({ p, doc }) => {
      const name = doc ? extractDocName(doc, p) : p.label || p.path;
      return name && name !== p.path ? `${name} (${p.path})` : p.path;
    }),
  };
}

function updateAttrsContainingName(doc, oldName, newName) {
  let changed = false;
  if (!oldName || !newName || oldName === newName) return false;
  const oldNorm = normText(oldName);

  doc.querySelectorAll('img[alt]').forEach((img) => {
    const alt = img.getAttribute('alt') || '';
    if (normText(alt).includes(oldNorm)) {
      const next = replaceCaseInsensitive(alt, oldName, newName);
      if (next !== alt) {
        img.setAttribute('alt', next);
        changed = true;
      }
    }
  });

  doc.querySelectorAll('[aria-label]').forEach((el) => {
    const lbl = el.getAttribute('aria-label') || '';
    if (normText(lbl).includes(oldNorm)) {
      const next = replaceCaseInsensitive(lbl, oldName, newName);
      if (next !== lbl) {
        el.setAttribute('aria-label', next);
        changed = true;
      }
    }
  });

  return changed;
}

function updateDocReferences(doc, pagePath, opts) {
  const { moveMap, oldPath, newPath, oldName, newName, isMove, isRename } = opts;
  let changed = false;
  const oldNorm = normText(oldName);
  const targetPaths = new Set([oldPath]);
  if (newPath) targetPaths.add(newPath);

  const mapPath = (resolvedPath) => {
    if (!resolvedPath) return null;
    if (isMove && moveMap.has(resolvedPath)) {
      return moveMap.get(resolvedPath);
    }
    return null;
  };

  doc.querySelectorAll('a').forEach((a) => {
    const rawHref = a.getAttribute('href');
    const resolved = resolveHref(rawHref, pagePath);
    let pointsToTarget = false;

    if (resolved && !resolved.hashOnly) {
      if (targetPaths.has(resolved.path)) {
        pointsToTarget = true;
      }
      const mapped = mapPath(resolved.path);
      if (mapped) {
        pointsToTarget = true;
        const nextHref = toRelativeUrl(mapped, pagePath, resolved.query, resolved.hash);
        if (nextHref !== rawHref) {
          a.setAttribute('href', nextHref);
          changed = true;
        }
      }
    }

    for (const dataAttr of ['data-desktop-href', 'data-mobile-home-href']) {
      const rawData = a.getAttribute(dataAttr);
      if (!rawData) continue;
      const resData = resolveHref(rawData, pagePath);
      if (!resData || resData.hashOnly) continue;
      if (targetPaths.has(resData.path)) {
        pointsToTarget = true;
      }
      const mappedData = mapPath(resData.path);
      if (mappedData) {
        pointsToTarget = true;
        const nextData = toRelativeUrl(
          mappedData,
          pagePath,
          resData.query,
          resData.hash
        );
        if (nextData !== rawData) {
          a.setAttribute(dataAttr, nextData);
          changed = true;
        }
      }
    }

    if (!isRename || !pointsToTarget) return;

    // 1. Menu główne / stopka / pigułki kategorii / pasek boczny
    if (
      a.closest(
        'nav#site-menu, nav.menu-panel, footer .footer-links, .cat-quick-nav, aside.subpage-sidebar .sidebar-links'
      ) ||
      a.classList.contains('cat-nav-pill')
    ) {
      if (replaceTextPreservingChildren(a, newName)) changed = true;
    }
    // 2. Okruszki + ewentualny eyebrow na stronach potomnych
    else if (a.closest('nav.breadcrumbs')) {
      if (replaceTextPreservingChildren(a, newName)) changed = true;
      const eyebrow = doc.querySelector('header.subpage-head .eyebrow');
      if (eyebrow && normText(eyebrow.textContent) === oldNorm) {
        if (eyebrow.textContent.trim() !== newName) {
          eyebrow.textContent = newName;
          changed = true;
        }
      }
    }
    // 3. Pigułka dodatkowej kategorii na stronie głównej (zachowuje <span>↗</span>)
    else if (a.classList.contains('home-extra-category')) {
      if (replaceTextPreservingChildren(a, newName, true)) changed = true;
    }
    // 4. Nawigacja między produktami
    else if (a.closest('nav.product-nav-bar')) {
      if (a.classList.contains('pnav-prev') || a.classList.contains('pnav-next')) {
        const span = a.querySelector('span');
        if (span && span.textContent.trim() !== newName) {
          span.textContent = newName;
          changed = true;
        }
      } else if (a.classList.contains('pnav-all')) {
        const cur = a.textContent || '';
        let next = replaceCaseInsensitive(cur, oldName, newName);
        if (next === cur && /^wszystkie z kategorii/i.test(cur.trim())) {
          next = `Wszystkie z kategorii ${newName} ↗`;
        }
        if (next !== cur) {
          a.textContent = next;
          changed = true;
        }
      }
    }
    // 5. Kafelki i karty oferty/kategorii/produktów (zachowaj <a href> w .cat-prod-title!)
    else {
      const card = a.closest(
        '.home-cat-card, .cat-prod-card, .subcat-card, .home-featured-product'
      );
      if (card) {
        const titleEl = card.querySelector(
          'h2, h3, h4, .cat-prod-title, .subcat-title'
        );
        const targetTitleEl = titleEl?.querySelector('a') || titleEl;
        if (targetTitleEl && targetTitleEl.textContent.trim() !== newName) {
          targetTitleEl.textContent = newName;
          changed = true;
        }
        card.querySelectorAll('img[alt]').forEach((img) => {
          const alt = img.getAttribute('alt') || '';
          if (normText(alt) === oldNorm || normText(alt).includes(oldNorm)) {
            const nextAlt = replaceCaseInsensitive(alt, oldName, newName);
            if (nextAlt !== alt) {
              img.setAttribute('alt', nextAlt);
              changed = true;
            }
          }
        });
      } else if (!a.children.length && normText(a.textContent) === oldNorm) {
        if (a.textContent.trim() !== newName) {
          a.textContent = newName;
          changed = true;
        }
      }
    }

    const aria = a.getAttribute('aria-label');
    if (aria && normText(aria).includes(oldNorm)) {
      const nextAria = replaceCaseInsensitive(aria, oldName, newName);
      if (nextAria !== aria) {
        a.setAttribute('aria-label', nextAria);
        changed = true;
      }
    }
  });

  // Nagłówki grup w spisie produktów („Nasze produkty”: .product-group-box > h3/h4) nie są linkami —
  // zmieniamy je po nazwie (testy na żywo: po zmianie nazwy „Moskitiery” nagłówek grupy zostawał stary).
  if (isRename && oldNorm) {
    doc.querySelectorAll('.product-group-box > h3, .product-group-box > h4').forEach((h) => {
      if (normText(h.textContent) === oldNorm && h.textContent.trim() !== newName) {
        h.textContent = newName;
        changed = true;
      }
    });
  }

  if (isMove) {
    const canonical = doc.querySelector('link[rel="canonical"]');
    if (canonical) {
      const rawCan = canonical.getAttribute('href');
      const resCan = resolveHref(rawCan, pagePath);
      if (resCan && !resCan.hashOnly) {
        const mappedCan = mapPath(resCan.path);
        if (mappedCan) {
          const nextCan = toRelativeUrl(
            mappedCan,
            pagePath,
            resCan.query,
            resCan.hash
          );
          if (nextCan !== rawCan) {
            canonical.setAttribute('href', nextCan);
            changed = true;
          }
        }
      }
    }
  }

  return changed;
}

function updateRedirectDoc(doc, pagePath, moveMap) {
  let changed = false;
  const refreshMeta = getRefreshMeta(doc);
  if (!refreshMeta) return false;

  const content = refreshMeta.getAttribute('content') || '';
  const match = content.match(/^(\s*\d+\s*;\s*url\s*=\s*)(.+)$/i);
  if (match) {
    const resolved = resolveHref(match[2].trim(), pagePath);
    if (resolved && !resolved.hashOnly && moveMap.has(resolved.path)) {
      const dest = moveMap.get(resolved.path);
      const nextRel = toRelativeUrl(dest, pagePath, resolved.query, resolved.hash);
      const nextContent = `${match[1]}${nextRel}`;
      if (nextContent !== content) {
        refreshMeta.setAttribute('content', nextContent);
        changed = true;
      }

      const canonical = doc.querySelector('link[rel="canonical"]');
      if (canonical && canonical.getAttribute('href') !== nextRel) {
        canonical.setAttribute('href', nextRel);
        changed = true;
      }

      doc.querySelectorAll('body a[href]').forEach((a) => {
        const resA = resolveHref(a.getAttribute('href'), pagePath);
        if (resA && !resA.hashOnly && moveMap.has(resA.path)) {
          const nextA = toRelativeUrl(
            moveMap.get(resA.path),
            pagePath,
            resA.query,
            resA.hash
          );
          if (nextA !== a.getAttribute('href')) {
            a.setAttribute('href', nextA);
            changed = true;
          }
        }
      });
    }
  }

  return changed;
}

export async function run(name, args = {}, ctx) {
  if (name !== 'zmien_nazwe_wszedzie') {
    return { ok: false, error: `Nieznany przepis: ${name}` };
  }

  const strona = String(args.strona || '').trim();
  const nowaNazwaArg = String(args.nowaNazwa || '').trim();
  const nowyAdresArg = String(args.nowyAdres || '').trim();

  const pages = ctx.listPages();
  const resolvedTarget = await resolveTargetPage(strona, pages, ctx);
  if (resolvedTarget.error || resolvedTarget.needsAnswer) {
    return { ok: false, ...resolvedTarget };
  }

  const target = resolvedTarget.page;
  const oldPath = target.path;
  let preloadedMap = resolvedTarget.htmlByPath || new Map();

  const targetHtml = preloadedMap.get(oldPath) || (await ctx.readPage(oldPath));
  if (!targetHtml) {
    return { ok: false, error: `Nie udało się odczytać strony ${oldPath}.` };
  }
  preloadedMap.set(oldPath, targetHtml);

  const targetDoc = ctx.parse(targetHtml);
  if (isRedirectDoc(targetDoc)) {
    return {
      ok: false,
      error: `Strona ${oldPath} jest stroną przekierowania — wskaż stronę docelową zamiast przekierowania.`,
    };
  }

  const oldName = extractDocName(targetDoc, target);
  if (!nowaNazwaArg && !nowyAdresArg) {
    return {
      ok: false,
      needsAnswer: `Co chcesz zmienić dla strony „${oldName}”?`,
      options: ['Zmień nazwę', 'Zmień adres (URL)', 'Zmień nazwę i adres'],
    };
  }

  const newName = nowaNazwaArg || oldName;
  const isRename = newName !== oldName;

  let newPath = oldPath;
  let isMove = false;
  if (nowyAdresArg) {
    if (oldPath === 'index.html') {
      return {
        ok: false,
        error: 'Nie można przenieść ani zmienić adresu strony głównej (index.html).',
      };
    }
    newPath = computeNewPath(nowyAdresArg, oldPath, ctx.slugify);
    if (!newPath) {
      return { ok: false, error: `Nieprawidłowy nowy adres: „${nowyAdresArg}”.` };
    }
    isMove = newPath !== oldPath;

    if (isMove) {
      const conflict = pages.find((p) => p.path === newPath);
      if (conflict) {
        const conflictHtml =
          preloadedMap.get(conflict.path) || (await ctx.readPage(conflict.path));
        const conflictDoc = conflictHtml ? ctx.parse(conflictHtml) : null;
        if (!conflictDoc || !isRedirectDoc(conflictDoc)) {
          return {
            ok: false,
            error: `Pod adresem ${newPath} istnieje już aktywna strona.`,
          };
        }
      }
    }
  }

  if (!isRename && !isMove) {
    return {
      ok: true,
      oldPath,
      pagePath: oldPath,
      summary: `Strona „${oldName}” ma już tę nazwę i adres — nic nie zmieniono.`,
      changedPages: [],
    };
  }

  // Mapa przeniesień: strona docelowa + ewentualne zagnieżdżone podstrony w jej folderze
  const moveMap = new Map();
  const entryByPath = new Map(pages.map((p) => [p.path, p]));

  if (isMove) {
    moveMap.set(oldPath, newPath);
    if (oldPath.endsWith('/index.html') && newPath.endsWith('/index.html')) {
      const oldDir = oldPath.slice(0, -'index.html'.length);
      const newDir = newPath.slice(0, -'index.html'.length);
      for (const p of pages) {
        if (p.path !== oldPath && oldDir && p.path.startsWith(oldDir)) {
          moveMap.set(p.path, newDir + p.path.slice(oldDir.length));
        }
      }
    }
  }

  const allNonPanel = pages.filter(
    (p) => p.path && p.path !== 'panel' && !p.path.startsWith('panel/')
  );
  const htmlByPath = await readAllPages(allNonPanel, ctx, preloadedMap);
  const changedPages = [];

  // 1. Zapis strony docelowej i jej zagnieżdżonych podstron + przekierowania pod starym adresem
  const selfEntries = isMove ? Array.from(moveMap.entries()) : [[oldPath, oldPath]];
  for (const [srcPath, dstPath] of selfEntries) {
    let html = htmlByPath.get(srcPath);
    if (!html) continue;

    const entry = entryByPath.get(srcPath) || {};
    if (srcPath !== dstPath) {
      html = ctx.rebaseUrls(html, srcPath, dstPath);
    }

    const doc = ctx.parse(html);
    if (srcPath !== dstPath) {
      rebaseExtraAttrs(doc, srcPath, dstPath);
    }

    updateDocReferences(doc, dstPath, {
      moveMap,
      oldPath,
      newPath,
      oldName,
      newName,
      isMove,
      isRename,
    });

    if (srcPath === oldPath && isRename) {
      const h1 = doc.querySelector('main h1') || doc.querySelector('h1');
      if (h1 && !h1.querySelector('.mask')) {
        h1.textContent = newName;
      }

      const rawTitle = getDocTitle(doc);
      let nextTitle;
      if (normText(rawTitle).includes(normText(oldName))) {
        nextTitle = replaceCaseInsensitive(rawTitle, oldName, newName);
      } else if (rawTitle.includes(' | ')) {
        nextTitle = `${newName} | ${rawTitle.split(' | ').slice(1).join(' | ')}`;
      } else {
        nextTitle = `${newName} | WOL-BUD Tarnów`;
      }
      setDocTitle(doc, nextTitle);

      const metaDesc = doc.querySelector('meta[name="description"]');
      if (metaDesc) {
        const desc = metaDesc.getAttribute('content') || '';
        if (normText(desc).includes(normText(oldName))) {
          metaDesc.setAttribute(
            'content',
            replaceCaseInsensitive(desc, oldName, newName)
          );
        }
      }

      const currentCrumb = doc.querySelector('nav.breadcrumbs [aria-current="page"]');
      if (currentCrumb) {
        currentCrumb.textContent = newName;
      }

      updateAttrsContainingName(doc, oldName, newName);
    }

    const finalTitle = getDocTitle(doc);
    const metaDescVal =
      doc.querySelector('meta[name="description"]')?.getAttribute('content') || '';

    await ctx.writePage(dstPath, ctx.serialize(doc), {
      label: srcPath === oldPath ? newName : entry.label,
      title: finalTitle,
      description: metaDescVal,
      group: entry.group,
    });
    changedPages.push(dstPath);

    if (srcPath !== dstPath) {
      await ctx.writePage(srcPath, buildRedirectHtml(srcPath, dstPath), {
        label: `Przekierowanie → ${dstPath}`,
        title: 'Strona przeniesiona | WOL-BUD',
        group: entry.group,
      });
      changedPages.push(srcPath);
    }
  }

  // 2. Aktualizacja wszystkich pozostałych stron (linki, kafelki, pigułki, menu, stopka, okruszki, przekierowania)
  const handledSrc = new Set(selfEntries.map(([src]) => src));
  const handledDst = new Set(selfEntries.map(([, dst]) => dst));

  for (const p of allNonPanel) {
    if (handledSrc.has(p.path) || handledDst.has(p.path)) continue;
    const html = htmlByPath.get(p.path);
    if (!html) continue;

    const doc = ctx.parse(html);
    let pageChanged = false;

    if (isRedirectDoc(doc)) {
      if (isMove) {
        pageChanged = updateRedirectDoc(doc, p.path, moveMap);
      }
    } else {
      pageChanged = updateDocReferences(doc, p.path, {
        moveMap,
        oldPath,
        newPath,
        oldName,
        newName,
        isMove,
        isRename,
      });
    }

    if (pageChanged) {
      await ctx.writePage(p.path, ctx.serialize(doc), {
        label: p.label,
        title: getDocTitle(doc),
        group: p.group,
      });
      changedPages.push(p.path);
    }
  }

  // 3. Aktualizacja globals (menu + stopka)
  const globals = ctx.getGlobals();
  let globalsChanged = false;

  if (Array.isArray(globals.menu)) {
    globals.menu = globals.menu.map((item) => {
      const normHref = normalizeRepoPath(item.href);
      const next = { ...item };
      if (isMove && moveMap.has(normHref)) {
        next.href = moveMap.get(normHref);
        globalsChanged = true;
      }
      if (isRename && normHref === oldPath && next.label !== newName) {
        next.label = newName;
        globalsChanged = true;
      }
      return next;
    });
  }

  if (Array.isArray(globals.footerLinks)) {
    globals.footerLinks = globals.footerLinks.map((item) => {
      const normHref = normalizeRepoPath(item.href);
      const next = { ...item };
      if (isMove && moveMap.has(normHref)) {
        next.href = moveMap.get(normHref);
        globalsChanged = true;
      }
      if (isRename && normHref === oldPath && next.label !== newName) {
        next.label = newName;
        globalsChanged = true;
      }
      return next;
    });
  }

  if (globalsChanged) {
    await ctx.setGlobals(globals);
  }

  const actions = [];
  if (isRename) actions.push(`zmieniłem nazwę „${oldName}” na „${newName}”`);
  if (isMove) {
    actions.push(
      `przeniosłem adres z ${oldPath} na ${newPath} i zostawiłem przekierowanie pod starym adresem`
    );
  }
  const uniqueChanged = Array.from(new Set(changedPages));

  return {
    ok: true,
    oldPath,
    pagePath: newPath,
    changedPages: uniqueChanged,
    summary: `Gotowe: ${actions.join(' oraz ')}. Zaktualizowałem łącznie ${uniqueChanged.length} stron (nagłówki, okruszki, kafelki, pigułki, pasek boczny, nawigację produktów${globalsChanged ? ' oraz menu/stopkę' : ''}). Polecenie „cofnij” przywraca całą operację.`,
  };
}
