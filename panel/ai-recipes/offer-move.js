// Przepisy AI: przenoszenie pozycji oferty (przenies_pozycje) i zmiana kolejności list (zmien_kolejnosc).
// Każdy przepis synchronizuje wszystkie powiązane miejsca naraz: kafelki, pigułki, menu, stopkę,
// pasek boczny, okruszki, nawigację produktów i ewentualne przekierowania.

const CONCURRENCY = 8;

const PROMOTE_KEYWORDS = new Set([
  'oferta',
  'oferta/index.html',
  'kategoria',
  'kategoria glowna',
  'glowna',
  'brak',
  'root',
  'strona glowna',
  'index.html',
]);

export const tools = [
  {
    name: 'przenies_pozycje',
    description:
      'Przenosi produkt do innej kategorii lub podkategorii albo przenosi podkategorię do innej kategorii głównej (bądź awansuje ją na kategorię główną w Ofercie). Przepina kafelki, okruszki, nawigację produktów, pigułki, sidebar oraz opcjonalnie zmienia adres URL z przekierowaniem ze starego adresu.',
    parameters: {
      type: 'object',
      properties: {
        strona: {
          type: 'string',
          description: 'Nazwa lub ścieżka produktu, podkategorii albo kategorii do przeniesienia.',
        },
        nowyRodzic: {
          type: 'string',
          description:
            'Nazwa lub ścieżka docelowej kategorii/podkategorii, albo „oferta” / „kategoria główna” przy awansie podkategorii.',
        },
        nowyAdres: {
          type: 'string',
          description:
            'Opcjonalny nowy adres URL lub slug (np. „bramy-aluminiowe”). Zostawia stronę przekierowania pod starym adresem.',
        },
      },
    },
  },
  {
    name: 'zmien_kolejnosc',
    description:
      'Zmienia kolejność pozycji w menu, kafelkach oferty (synchronizuje stronę główną, Ofertę, pasek kategorii i sidebar), podkategoriach lub produktach kategorii (razem z nawigacją Poprzedni/Następny).',
    parameters: {
      type: 'object',
      properties: {
        gdzie: {
          type: 'string',
          description:
            'Lista do uporządkowania: „menu”, „kafelki-oferty”, „podkategorie:<strona>” albo „produkty:<strona>”.',
        },
        kolejnosc: {
          type: 'array',
          items: { type: 'string' },
          description: 'Nazwy lub ścieżki elementów w nowej kolejności (pełna lista lub początek listy).',
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
  for (const m of doc.querySelectorAll('meta[http-equiv]')) {
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
  return (doc.querySelector('title')?.textContent || doc.title || '').replace(/\s+/g, ' ').trim();
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

function pageSlugFromPath(path) {
  const segs = normalizeRepoPath(path).split('/').filter(Boolean);
  if (!segs.length) return '';
  const last = segs[segs.length - 1];
  if (last.toLowerCase() === 'index.html') {
    return segs.length >= 2 ? segs[segs.length - 2] : 'index';
  }
  return last.replace(/\.html?$/i, '');
}

function stripTitleSuffix(title) {
  return String(title || '')
    .replace(/\s*\|\s*WOL-BUD.*$/i, '')
    .trim();
}

async function readAllPages(pages, ctx) {
  const htmlByPath = new Map();
  for (let i = 0; i < pages.length; i += CONCURRENCY) {
    const batch = pages.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((p) => ctx.readPage(p.path)));
    batch.forEach((p, idx) => {
      if (typeof results[idx] === 'string') {
        htmlByPath.set(p.path, results[idx]);
      }
    });
  }
  return htmlByPath;
}

function isCategoryQuickNav(navEl, fromPath) {
  if (!navEl) return false;
  for (const a of navEl.querySelectorAll('a[href]')) {
    const res = resolveHref(a.getAttribute('href'), fromPath);
    if (res && !res.hashOnly && res.path.startsWith('kategorie/')) return true;
  }
  return false;
}

function buildPageMap(pages, htmlByPath, ctx) {
  const nonPanel = pages.filter(
    (p) => p && p.path && p.path !== 'panel' && !p.path.startsWith('panel/')
  );
  const byPath = new Map();
  const subcatParent = new Map();
  const prodParent = new Map();
  const homeCatPaths = [];

  for (const p of nonPanel) {
    const html = htmlByPath.get(p.path);
    if (!html) continue;
    const doc = ctx.parse(html);
    if (isRedirectDoc(doc)) continue;

    const h1 = doc.querySelector('main h1') || doc.querySelector('h1');
    const h1Text =
      h1 && !h1.querySelector('.mask')
        ? h1.textContent.replace(/\s+/g, ' ').trim()
        : '';
    const label =
      h1Text ||
      (p.label && p.label !== p.path ? p.label : '') ||
      stripTitleSuffix(getDocTitle(doc)) ||
      p.path;

    byPath.set(p.path, {
      path: p.path,
      entry: p,
      doc,
      label,
      hasSubcatGrid: Boolean(doc.querySelector('.subcat-grid .subcat-card')),
      hasProdGrid: Boolean(doc.querySelector('.cat-products-grid .cat-prod-card')),
    });

    if (p.path === 'index.html') {
      for (const a of doc.querySelectorAll('.home-catalog-grid a.home-cat-card[href]')) {
        const res = resolveHref(a.getAttribute('href'), p.path);
        if (res && !res.hashOnly && !homeCatPaths.includes(res.path)) {
          homeCatPaths.push(res.path);
        }
      }
    }

    for (const card of doc.querySelectorAll('.subcat-grid .subcat-card[href]')) {
      const res = resolveHref(card.getAttribute('href'), p.path);
      if (res && !res.hashOnly && !subcatParent.has(res.path)) {
        subcatParent.set(res.path, p.path);
      }
    }

    for (const card of doc.querySelectorAll('.cat-products-grid .cat-prod-card')) {
      const a = card.querySelector('a[href]');
      if (!a) continue;
      const res = resolveHref(a.getAttribute('href'), p.path);
      if (res && !res.hashOnly && !prodParent.has(res.path)) {
        prodParent.set(res.path, p.path);
      }
    }
  }

  for (const info of byPath.values()) {
    if (
      prodParent.has(info.path) ||
      (info.path.startsWith('produkty/') && info.path !== 'produkty/index.html') ||
      info.doc.querySelector('.product-gallery')
    ) {
      info.kind = 'produkt';
      info.parent = prodParent.get(info.path) || '';
    } else if (subcatParent.has(info.path)) {
      info.kind = 'podkategoria';
      info.parent = subcatParent.get(info.path);
    } else if (info.path.startsWith('kategorie/') || homeCatPaths.includes(info.path)) {
      info.kind = 'kategoria';
      info.parent = 'oferta/index.html';
    } else {
      info.kind = 'inna';
      info.parent = '';
    }

    if (!info.parent && info.kind === 'produkt') {
      const crumbs = [...info.doc.querySelectorAll('.breadcrumbs a[href]')]
        .map((a) => resolveHref(a.getAttribute('href'), info.path)?.path)
        .filter((x) => x && x !== 'index.html' && x !== 'oferta/index.html' && x !== info.path);
      if (crumbs.length) info.parent = crumbs[crumbs.length - 1];
    }
  }

  return { byPath, homeCatPaths };
}

function resolveItem(query, pool) {
  const raw = String(query || '').trim();
  if (!raw) return null;
  const cleanPath = normalizeRepoPath(
    raw.replace(/^https?:\/\/[^/]+/i, '').replace(/[?#].*$/, '')
  ).replace(/\/+$/, '');
  const cleanNorm = normText(raw);

  const byExactPath = pool.filter((x) => x.path.toLowerCase() === cleanPath.toLowerCase());
  if (byExactPath.length === 1) return { item: byExactPath[0] };

  const byDirPath = pool.filter(
    (x) => x.path.toLowerCase() === `${cleanPath}/index.html`.toLowerCase()
  );
  if (byDirPath.length === 1) return { item: byDirPath[0] };

  const bySlug = pool.filter(
    (x) => pageSlugFromPath(x.path).toLowerCase() === cleanPath.toLowerCase()
  );
  if (bySlug.length === 1) return { item: bySlug[0] };

  const byExactLabel = pool.filter((x) => normText(x.label) === cleanNorm);
  if (byExactLabel.length === 1) return { item: byExactLabel[0] };
  if (byExactLabel.length > 1) return { ambiguous: byExactLabel };

  const byPartial = pool.filter(
    (x) => normText(x.label).includes(cleanNorm) || normText(x.path).includes(cleanNorm)
  );
  if (byPartial.length === 1) return { item: byPartial[0] };
  if (byPartial.length > 1) return { ambiguous: byPartial };

  return null;
}

function rebuildBreadcrumbs(doc, pagePath, trail, currentLabel) {
  const nav = doc.querySelector('nav.breadcrumbs');
  if (!nav) return false;
  nav.replaceChildren();
  trail.forEach((step, idx) => {
    const a = doc.createElement('a');
    a.setAttribute('href', toRelativeUrl(step.path, pagePath, '', step.hash || ''));
    if (step.homeLink) a.setAttribute('data-home-link', '');
    a.textContent = step.label;
    nav.appendChild(a);
    const sep = doc.createElement('span');
    sep.textContent = '/';
    nav.appendChild(sep);
  });
  const cur = doc.createElement('span');
  cur.setAttribute('aria-current', 'page');
  cur.textContent = currentLabel;
  nav.appendChild(cur);
  return true;
}

function buildTrailForParent(parentPath, byPath) {
  const trail = [
    { label: 'Strona główna', path: 'index.html', hash: '#oferta', homeLink: true },
    { label: 'Oferta', path: 'oferta/index.html' },
  ];
  const parent = byPath.get(parentPath);
  if (!parent) return trail;
  if (parent.kind === 'podkategoria' && parent.parent && byPath.get(parent.parent)) {
    const grand = byPath.get(parent.parent);
    trail.push({ label: grand.label, path: grand.path });
  }
  trail.push({ label: parent.label, path: parent.path });
  return trail;
}

function getCatContentBox(doc) {
  return doc.querySelector('.subpage-content') || doc.querySelector('main .wrap') || doc.querySelector('main');
}

function ensureGrid(doc, gridClass) {
  const box = getCatContentBox(doc);
  if (!box) return null;
  let grid = box.querySelector(`.${gridClass}`);
  if (grid) return grid;

  grid = doc.createElement('div');
  grid.setAttribute('class', gridClass);
  const feature = box.querySelector('.category-feature');
  if (feature) {
    feature.after(grid);
  } else if (box.firstElementChild) {
    box.insertBefore(grid, box.firstElementChild);
  } else {
    box.appendChild(grid);
  }
  return grid;
}

async function rebuildProductNavBars(categoryPath, categoryDoc, categoryLabel, byPath, ctx, touched) {
  const cards = [...categoryDoc.querySelectorAll('.cat-products-grid .cat-prod-card')];
  const orderedProducts = [];
  for (const card of cards) {
    const a = card.querySelector('a[href]');
    if (!a) continue;
    const res = resolveHref(a.getAttribute('href'), categoryPath);
    if (!res || res.hashOnly) continue;
    const prodInfo = byPath.get(res.path);
    if (!prodInfo) continue;
    const titleEl = card.querySelector('.cat-prod-title a, .cat-prod-title, h3 a, h3');
    const name = titleEl ? titleEl.textContent.replace(/\s+/g, ' ').trim() : prodInfo.label;
    orderedProducts.push({ path: res.path, name, info: prodInfo });
  }

  for (let i = 0; i < orderedProducts.length; i++) {
    const cur = orderedProducts[i];
    const doc = cur.info.doc;
    const nav = doc.querySelector('nav.product-nav-bar');
    if (!nav) continue;

    nav.replaceChildren();
    if (i > 0) {
      const prev = orderedProducts[i - 1];
      const aPrev = doc.createElement('a');
      aPrev.setAttribute('class', 'pnav-btn pnav-prev');
      aPrev.setAttribute('href', toRelativeUrl(prev.path, cur.path));
      const small = doc.createElement('small');
      small.textContent = '← Poprzedni produkt';
      const span = doc.createElement('span');
      span.textContent = prev.name;
      aPrev.appendChild(small);
      aPrev.appendChild(span);
      nav.appendChild(aPrev);
    }

    const aAll = doc.createElement('a');
    aAll.setAttribute('class', 'pnav-all');
    aAll.setAttribute('href', toRelativeUrl(categoryPath, cur.path));
    aAll.textContent = `Wszystkie z kategorii ${categoryLabel} ↗`;
    nav.appendChild(aAll);

    if (i < orderedProducts.length - 1) {
      const next = orderedProducts[i + 1];
      const aNext = doc.createElement('a');
      aNext.setAttribute('class', 'pnav-btn pnav-next');
      aNext.setAttribute('href', toRelativeUrl(next.path, cur.path));
      const small = doc.createElement('small');
      small.textContent = 'Następny produkt →';
      const span = doc.createElement('span');
      span.textContent = next.name;
      aNext.appendChild(small);
      aNext.appendChild(span);
      nav.appendChild(aNext);
    }

    await ctx.writePage(cur.path, ctx.serialize(doc), {
      label: cur.name,
      title: getDocTitle(doc),
      group: cur.info.entry.group,
    });
    touched.add(cur.path);
  }
}

function updateMoveLinksAcrossSite(byPath, oldPath, newPath, touched, ctx) {
  const updated = [];
  for (const info of byPath.values()) {
    if (info.path === oldPath || info.path === newPath) continue;
    let changed = false;
    const doc = info.doc;

    for (const a of doc.querySelectorAll('a[href]')) {
      const raw = a.getAttribute('href');
      const res = resolveHref(raw, info.path);
      if (res && !res.hashOnly && res.path === oldPath) {
        a.setAttribute('href', toRelativeUrl(newPath, info.path, res.query, res.hash));
        changed = true;
      }
      for (const attr of ['data-desktop-href', 'data-mobile-home-href']) {
        const dRaw = a.getAttribute(attr);
        if (!dRaw) continue;
        const dRes = resolveHref(dRaw, info.path);
        if (dRes && !dRes.hashOnly && dRes.path === oldPath) {
          a.setAttribute(attr, toRelativeUrl(newPath, info.path, dRes.query, dRes.hash));
          changed = true;
        }
      }
    }

    if (changed) {
      updated.push(info);
    }
  }
  return updated;
}

function extractRootImg(card, fromPath, fallbackDoc, fallbackPath) {
  const img = card?.querySelector('img[src]');
  if (img) {
    const res = resolveHref(img.getAttribute('src'), fromPath);
    if (res && !res.hashOnly) return res.path;
  }
  if (fallbackDoc) {
    const fImg =
      fallbackDoc.querySelector('.product-detail-visual img[src], .category-feature img[src], main img[src]');
    if (fImg) {
      const res = resolveHref(fImg.getAttribute('src'), fallbackPath);
      if (res && !res.hashOnly) return res.path;
    }
  }
  return 'img/products/okna-alu-przesuwne.webp';
}

function cloneSubcatCardTemplate(byPath) {
  for (const info of byPath.values()) {
    const card = info.doc.querySelector('.subcat-grid .subcat-card');
    if (card) return card.cloneNode(true);
  }
  return null;
}

function cloneProdCardTemplate(byPath, preferredDoc) {
  const local = preferredDoc?.querySelector('.cat-products-grid .cat-prod-card');
  if (local) return local.cloneNode(true);
  for (const info of byPath.values()) {
    const card = info.doc.querySelector('.cat-products-grid .cat-prod-card');
    if (card) return card.cloneNode(true);
  }
  return null;
}

function fillProdCard(card, { productPath, label, rootImgPath, hostPath }) {
  const relProd = toRelativeUrl(productPath, hostPath);
  const relImg = toRelativeUrl(rootImgPath, hostPath);
  card.querySelectorAll('a[href]').forEach((a) => a.setAttribute('href', relProd));
  const mediaLink = card.querySelector('a.cat-prod-media');
  if (mediaLink) mediaLink.setAttribute('aria-label', label);
  const img = card.querySelector('img');
  if (img) {
    img.setAttribute('src', relImg);
    img.setAttribute('alt', label);
  }
  const titleEl =
    card.querySelector('.cat-prod-title a') ||
    card.querySelector('h3 a') ||
    card.querySelector('.cat-prod-title, h3');
  if (titleEl) titleEl.textContent = label;
}

function fillSubcatCard(card, { targetPath, label, rootImgPath, hostPath }) {
  card.setAttribute('href', toRelativeUrl(targetPath, hostPath));
  const img = card.querySelector('img');
  if (img) {
    img.setAttribute('src', toRelativeUrl(rootImgPath, hostPath));
    img.setAttribute('alt', label);
  }
  const h = card.querySelector('h3, h2, h4');
  if (h) h.textContent = label;
}

function fillHomeCatCard(card, { targetPath, label, rootImgPath, hostPath }) {
  card.setAttribute('href', toRelativeUrl(targetPath, hostPath));
  const img = card.querySelector('img');
  if (img) {
    img.setAttribute('src', toRelativeUrl(rootImgPath, hostPath));
    img.setAttribute('alt', label);
  }
  const h = card.querySelector('h3, h2, h4');
  if (h) h.textContent = label;
}

function syncProductCardsInGrid(doc, hostPath, targetPath, mode, payload) {
  const grid = doc.querySelector('.cat-products-grid');
  if (mode === 'remove') {
    if (!grid) return null;
    for (const card of [...grid.querySelectorAll('.cat-prod-card')]) {
      const a = card.querySelector('a[href]');
      const res = a ? resolveHref(a.getAttribute('href'), hostPath) : null;
      if (res && !res.hashOnly && res.path === targetPath) {
        const cloned = card.cloneNode(true);
        card.remove();
        if (!grid.querySelector('.cat-prod-card')) grid.remove();
        return cloned;
      }
    }
    return null;
  }
  if (mode === 'add') {
    const destGrid = ensureGrid(doc, 'cat-products-grid');
    if (!destGrid) return false;
    for (const card of destGrid.querySelectorAll('.cat-prod-card')) {
      const a = card.querySelector('a[href]');
      const res = a ? resolveHref(a.getAttribute('href'), hostPath) : null;
      if (res && !res.hashOnly && res.path === targetPath) return false;
    }
    const imported = doc.importNode(payload, true);
    destGrid.appendChild(imported);
    return true;
  }
  return false;
}

function syncSubcatCardsInGrid(doc, hostPath, targetPath, mode, payload) {
  const grid = doc.querySelector('.subcat-grid');
  if (mode === 'remove') {
    if (!grid) return null;
    for (const card of [...grid.querySelectorAll('.subcat-card[href]')]) {
      const res = resolveHref(card.getAttribute('href'), hostPath);
      if (res && !res.hashOnly && res.path === targetPath) {
        const cloned = card.cloneNode(true);
        card.remove();
        if (!grid.querySelector('.subcat-card')) grid.remove();
        return cloned;
      }
    }
    return null;
  }
  if (mode === 'add') {
    const destGrid = ensureGrid(doc, 'subcat-grid');
    if (!destGrid) return false;
    for (const card of destGrid.querySelectorAll('.subcat-card[href]')) {
      const res = resolveHref(card.getAttribute('href'), hostPath);
      if (res && !res.hashOnly && res.path === targetPath) return false;
    }
    const imported = doc.importNode(payload, true);
    destGrid.appendChild(imported);
    return true;
  }
  return false;
}

function syncMainCategoryChrome(doc, pagePath, { targetPath, label, rootImgPath, action }) {
  let changed = false;

  // 1. home-catalog-grid (index.html, oferta/index.html)
  const homeGrid = doc.querySelector('.home-catalog-grid');
  if (homeGrid) {
    const existing = [...homeGrid.querySelectorAll('a.home-cat-card[href]')].find((a) => {
      const res = resolveHref(a.getAttribute('href'), pagePath);
      return res && !res.hashOnly && res.path === targetPath;
    });
    if (action === 'remove' && existing) {
      existing.remove();
      changed = true;
    } else if (action === 'add' && !existing) {
      const sample = homeGrid.querySelector('a.home-cat-card');
      if (sample) {
        const card = sample.cloneNode(true);
        fillHomeCatCard(card, { targetPath, label, rootImgPath, hostPath: pagePath });
        homeGrid.appendChild(card);
        changed = true;
      }
    }
  }

  // 2. Usuń ewentualną pigułkę .home-extra-category przy awansie
  if (action === 'add') {
    const extraWrap = doc.querySelector('.home-extra-categories');
    if (extraWrap) {
      for (const a of [...extraWrap.querySelectorAll('a.home-extra-category[href]')]) {
        const res = resolveHref(a.getAttribute('href'), pagePath);
        if (res && !res.hashOnly && res.path === targetPath) {
          a.remove();
          changed = true;
        }
      }
    }
  }

  // 3. Pasek .cat-quick-nav (wykluczając realizacje)
  const quickNav = doc.querySelector('.cat-quick-nav');
  if (quickNav && isCategoryQuickNav(quickNav, pagePath)) {
    const pillsWrap = quickNav.querySelector('.cat-quick-nav-pills') || quickNav;
    const pills = [...pillsWrap.querySelectorAll('a.cat-nav-pill[href]')];
    const existing = pills.find((a) => {
      const res = resolveHref(a.getAttribute('href'), pagePath);
      return res && !res.hashOnly && res.path === targetPath;
    });
    if (action === 'remove' && existing) {
      existing.remove();
      changed = true;
    } else if (action === 'add') {
      if (existing) {
        if (pagePath === targetPath && !existing.classList.contains('is-active')) {
          existing.classList.add('is-active');
          changed = true;
        }
      } else {
        const sample = pills.find((a) => !a.classList.contains('is-active')) || pills[0];
        if (sample) {
          const pill = sample.cloneNode(false);
          pill.setAttribute('class', pagePath === targetPath ? 'cat-nav-pill is-active' : 'cat-nav-pill');
          pill.setAttribute('href', toRelativeUrl(targetPath, pagePath));
          pill.textContent = label;
          const uslugiPill = pills.find((a) => {
            const res = resolveHref(a.getAttribute('href'), pagePath);
            return res && res.path === 'uslugi/index.html';
          });
          if (uslugiPill) uslugiPill.before(pill);
          else pillsWrap.appendChild(pill);
          changed = true;
        }
      }
    }
  }

  // 4. Pasek boczny aside.subpage-sidebar .sidebar-links
  const sidebarLinks = doc.querySelector('aside.subpage-sidebar .sidebar-links');
  if (sidebarLinks) {
    const items = [...sidebarLinks.querySelectorAll('li')];
    const existingLi = items.find((li) => {
      const a = li.querySelector('a[href]');
      const res = a ? resolveHref(a.getAttribute('href'), pagePath) : null;
      return res && !res.hashOnly && res.path === targetPath;
    });
    if (action === 'remove' && existingLi) {
      existingLi.remove();
      changed = true;
    } else if (action === 'add') {
      if (existingLi) {
        if (pagePath === targetPath) {
          const a = existingLi.querySelector('a');
          if (a && !a.getAttribute('style')) {
            a.setAttribute('style', 'font-weight:700; color:var(--highlight);');
            changed = true;
          }
        }
      } else {
        const sampleLi = items[0];
        if (sampleLi) {
          const li = doc.createElement('li');
          const a = doc.createElement('a');
          a.setAttribute('href', toRelativeUrl(targetPath, pagePath));
          if (pagePath === targetPath) {
            a.setAttribute('style', 'font-weight:700; color:var(--highlight);');
          }
          a.textContent = label;
          li.appendChild(a);
          const uslugiLi = items.find((x) => {
            const ax = x.querySelector('a[href]');
            const res = ax ? resolveHref(ax.getAttribute('href'), pagePath) : null;
            return res && res.path === 'uslugi/index.html';
          });
          if (uslugiLi) uslugiLi.before(li);
          else sidebarLinks.appendChild(li);
          changed = true;
        }
      }
    }
  }

  return changed;
}

async function runMoveItem(args, ctx) {
  const pages = ctx.listPages();
  const nonPanel = pages.filter(
    (p) => p && p.path && p.path !== 'panel' && !p.path.startsWith('panel/')
  );
  const htmlByPath = await readAllPages(nonPanel, ctx);
  const { byPath } = buildPageMap(nonPanel, htmlByPath, ctx);

  const movablePool = [...byPath.values()].filter((x) =>
    ['produkt', 'podkategoria', 'kategoria'].includes(x.kind)
  );
  const rawStrona = String(args.strona || '').trim();
  const rawNowyRodzic = String(args.nowyRodzic || '').trim();
  const rawNowyAdres = String(args.nowyAdres || '').trim();

  if (!rawStrona) {
    return {
      ok: false,
      needsAnswer: 'Którą pozycję oferty (produkt lub podkategorię) chcesz przenieść?',
      options: movablePool
        .filter((x) => x.kind !== 'kategoria')
        .map((x) => x.label),
    };
  }

  const foundItem = resolveItem(rawStrona, movablePool);
  if (!foundItem) {
    return { ok: false, error: `Nie znaleziono pozycji oferty „${rawStrona}”.` };
  }
  if (foundItem.ambiguous) {
    return {
      ok: false,
      needsAnswer: `Znalazłem kilka pozycji pasujących do „${rawStrona}”. Którą chcesz przenieść?`,
      options: foundItem.ambiguous.slice(0, 8).map((x) => `${x.label} (${x.path})`),
    };
  }

  const item = foundItem.item;
  const oldPath = item.path;
  const oldParentPath = item.parent;

  if (!rawNowyRodzic) {
    if (item.kind === 'produkt') {
      const prodParents = [...byPath.values()].filter(
        (x) =>
          x.path !== oldParentPath &&
          ((x.kind === 'kategoria' && !x.hasSubcatGrid) || x.kind === 'podkategoria')
      );
      return {
        ok: false,
        needsAnswer: `Do której kategorii lub podkategorii przenieść produkt „${item.label}”?`,
        options: prodParents.map((x) => x.label),
      };
    }
    const catParents = [...byPath.values()].filter(
      (x) => x.kind === 'kategoria' && x.path !== oldParentPath && x.path !== oldPath
    );
    const opts =
      item.kind === 'podkategoria'
        ? ['Kategoria główna (awans do oferty głównej)', ...catParents.map((x) => x.label)]
        : catParents.map((x) => x.label);
    return {
      ok: false,
      needsAnswer: `Gdzie przenieść „${item.label}”?`,
      options: opts,
    };
  }

  const normParentArg = normText(rawNowyRodzic);
  const wantsPromote =
    PROMOTE_KEYWORDS.has(normParentArg) || normParentArg.includes('awans');

  let newParent = null;
  if (!wantsPromote) {
    const parentPool = [...byPath.values()].filter(
      (x) =>
        (x.kind === 'kategoria' || x.kind === 'podkategoria') && x.path !== oldPath
    );
    const foundParent = resolveItem(rawNowyRodzic, parentPool);
    if (!foundParent) {
      return {
        ok: false,
        error: `Nie znaleziono docelowej kategorii „${rawNowyRodzic}”.`,
      };
    }
    if (foundParent.ambiguous) {
      return {
        ok: false,
        needsAnswer: `Którą kategorię docelową masz na myśli dla „${rawNowyRodzic}”?`,
        options: foundParent.ambiguous.slice(0, 8).map((x) => x.label),
      };
    }
    newParent = foundParent.item;

    // Produkt nie powinien trafić bezpośrednio do kategorii mającej tylko podkategorie
    if (item.kind === 'produkt' && newParent.hasSubcatGrid && !newParent.hasProdGrid) {
      const subcats = [...byPath.values()].filter(
        (x) => x.kind === 'podkategoria' && x.parent === newParent.path
      );
      if (subcats.length) {
        return {
          ok: false,
          needsAnswer: `Kategoria „${newParent.label}” dzieli się na podkategorie. Do której z nich dodać produkt „${item.label}”?`,
          options: subcats.map((x) => x.label),
        };
      }
    }
  } else if (item.kind === 'produkt') {
    return {
      ok: false,
      error: 'Produkt nie może zostać awansowany bezpośrednio na kategorię główną — wskaż kategorię lub podkategorię.',
    };
  }

  const targetParentPath = wantsPromote ? 'oferta/index.html' : newParent.path;
  if (targetParentPath === oldParentPath && !rawNowyAdres) {
    return {
      ok: true,
      pagePath: oldPath,
      oldPath,
      changedPages: [],
      summary: `Pozycja „${item.label}” już znajduje się w docelowym miejscu — nic nie zmieniono.`,
    };
  }

  // Opcjonalna zmiana adresu (z przekierowaniem)
  let finalPath = oldPath;
  if (rawNowyAdres) {
    finalPath = computeNewPath(rawNowyAdres, oldPath, ctx.slugify);
    if (!finalPath) {
      return { ok: false, error: `Nieprawidłowy nowy adres: „${rawNowyAdres}”.` };
    }
    if (finalPath !== oldPath) {
      const existingAtNew = byPath.get(finalPath);
      if (existingAtNew) {
        return {
          ok: false,
          error: `Pod adresem ${finalPath} istnieje już aktywna strona („${existingAtNew.label}”).`,
        };
      }
    }
  }

  const isAddressMove = finalPath !== oldPath;
  const touched = new Set();

  // Jeśli zmieniono adres, najpierw zaktualizuj samego siebie (rebase) i zostaw przekierowanie
  if (isAddressMove) {
    let rebasedHtml = ctx.rebaseUrls(ctx.serialize(item.doc), oldPath, finalPath);
    const rebasedDoc = ctx.parse(rebasedHtml);
    rebaseExtraAttrs(rebasedDoc, oldPath, finalPath);
    item.doc = rebasedDoc;
    item.path = finalPath;
    byPath.set(finalPath, item);
    byPath.delete(oldPath);

    // Przepnij istniejące linki i przekierowania na wszystkich stronach przed modyfikacją kart
    const linkUpdated = updateMoveLinksAcrossSite(byPath, oldPath, finalPath, touched, ctx);
    for (const u of linkUpdated) touched.add(u.path);

    // Przepnij istniejące strony przekierowań wskazujące na oldPath (bez łańcuchów)
    for (const [pPath, html] of htmlByPath) {
      const pDoc = ctx.parse(html);
      if (!isRedirectDoc(pDoc)) continue;
      const meta = getRefreshMeta(pDoc);
      const m = (meta?.getAttribute('content') || '').match(/^(\s*\d+\s*;\s*url\s*=\s*)(.+)$/i);
      if (!m) continue;
      const res = resolveHref(m[2].trim(), pPath);
      if (res && !res.hashOnly && res.path === oldPath) {
        const nextRel = toRelativeUrl(finalPath, pPath, res.query, res.hash);
        meta.setAttribute('content', `${m[1]}${nextRel}`);
        const can = pDoc.querySelector('link[rel="canonical"]');
        if (can) can.setAttribute('href', nextRel);
        for (const a of pDoc.querySelectorAll('body a[href]')) {
          a.setAttribute('href', nextRel);
        }
        await ctx.writePage(pPath, ctx.serialize(pDoc), {
          label: `Przekierowanie → ${finalPath}`,
          title: getDocTitle(pDoc),
        });
        touched.add(pPath);
      }
    }

    await ctx.writePage(oldPath, buildRedirectHtml(oldPath, finalPath), {
      label: `Przekierowanie → ${finalPath}`,
      title: 'Strona przeniesiona | WOL-BUD',
      group: item.entry.group,
    });
    touched.add(oldPath);
  }

  // PRZYPADEK A: Przeniesienie PRODUKTU
  if (item.kind === 'produkt') {
    const oldParentInfo = byPath.get(oldParentPath);
    let removedCard = null;
    if (oldParentInfo) {
      removedCard = syncProductCardsInGrid(
        oldParentInfo.doc,
        oldParentInfo.path,
        finalPath,
        'remove'
      );
      if (removedCard) touched.add(oldParentInfo.path);
    }

    const rootImgPath = extractRootImg(removedCard, oldParentPath || oldPath, item.doc, finalPath);
    const cardToAdd =
      cloneProdCardTemplate(byPath, newParent.doc) || removedCard;
    if (!cardToAdd) {
      return { ok: false, error: 'Brak wzorca karty produktu do sklonowania.' };
    }
    fillProdCard(cardToAdd, {
      productPath: finalPath,
      label: item.label,
      rootImgPath,
      hostPath: newParent.path,
    });
    if (syncProductCardsInGrid(newParent.doc, newParent.path, finalPath, 'add', cardToAdd)) {
      touched.add(newParent.path);
    }

    // Okruszki + eyebrow przenoszonego produktu
    const trail = buildTrailForParent(newParent.path, byPath);
    rebuildBreadcrumbs(item.doc, finalPath, trail, item.label);
    const eyebrow = item.doc.querySelector('header.subpage-head .eyebrow');
    if (eyebrow) eyebrow.textContent = newParent.label;
    touched.add(finalPath);

    // Zapisz zmodyfikowanych rodziców i produkt przed odbudową pnav
    if (oldParentInfo && touched.has(oldParentInfo.path)) {
      await ctx.writePage(oldParentInfo.path, ctx.serialize(oldParentInfo.doc), {
        label: oldParentInfo.label,
        title: getDocTitle(oldParentInfo.doc),
        group: oldParentInfo.entry.group,
      });
    }
    if (touched.has(newParent.path)) {
      await ctx.writePage(newParent.path, ctx.serialize(newParent.doc), {
        label: newParent.label,
        title: getDocTitle(newParent.doc),
        group: newParent.entry.group,
      });
    }
    await ctx.writePage(finalPath, ctx.serialize(item.doc), {
      label: item.label,
      title: getDocTitle(item.doc),
      group: item.entry.group,
    });

    if (oldParentInfo) {
      await rebuildProductNavBars(
        oldParentInfo.path,
        oldParentInfo.doc,
        oldParentInfo.label,
        byPath,
        ctx,
        touched
      );
    }
    await rebuildProductNavBars(
      newParent.path,
      newParent.doc,
      newParent.label,
      byPath,
      ctx,
      touched
    );
  }
  // PRZYPADEK B: Awans podkategorii na KATEGORIĘ GŁÓWNĄ
  else if (wantsPromote) {
    const oldParentInfo = byPath.get(oldParentPath);
    let removedCard = null;
    if (oldParentInfo) {
      removedCard = syncSubcatCardsInGrid(
        oldParentInfo.doc,
        oldParentInfo.path,
        finalPath,
        'remove'
      );
      if (removedCard) {
        await ctx.writePage(oldParentInfo.path, ctx.serialize(oldParentInfo.doc), {
          label: oldParentInfo.label,
          title: getDocTitle(oldParentInfo.doc),
          group: oldParentInfo.entry.group,
        });
        touched.add(oldParentInfo.path);
      }
    }

    const rootImgPath = extractRootImg(removedCard, oldParentPath || oldPath, item.doc, finalPath);
    item.kind = 'kategoria';
    item.parent = 'oferta/index.html';

    // Okruszki awansowanej kategorii
    rebuildBreadcrumbs(
      item.doc,
      finalPath,
      [
        { label: 'Strona główna', path: 'index.html', hash: '#oferta', homeLink: true },
        { label: 'Oferta', path: 'oferta/index.html' },
      ],
      item.label
    );
    touched.add(finalPath);

    // Zaktualizuj okruszki dzieci (produktów tej kategorii), żeby nie wskazywały starego dziadka
    for (const child of byPath.values()) {
      if (child.kind === 'produkt' && child.parent === finalPath) {
        const trail = buildTrailForParent(finalPath, byPath);
        if (rebuildBreadcrumbs(child.doc, child.path, trail, child.label)) {
          touched.add(child.path);
        }
      }
    }

    // Dodaj kafelek na home/oferta, pigułkę do cat-quick-nav i link do sidebar-links wszędzie
    for (const pageInfo of byPath.values()) {
      if (
        syncMainCategoryChrome(pageInfo.doc, pageInfo.path, {
          targetPath: finalPath,
          label: item.label,
          rootImgPath,
          action: 'add',
        })
      ) {
        touched.add(pageInfo.path);
      }
    }
  }
  // PRZYPADEK C: Przeniesienie podkategorii do innej kategorii (lub degradacja kategorii głównej)
  else {
    const oldParentInfo = byPath.get(oldParentPath);
    let removedCard = null;
    if (item.kind === 'podkategoria' && oldParentInfo) {
      removedCard = syncSubcatCardsInGrid(
        oldParentInfo.doc,
        oldParentInfo.path,
        finalPath,
        'remove'
      );
      if (removedCard) touched.add(oldParentInfo.path);
    } else if (item.kind === 'kategoria') {
      for (const pageInfo of byPath.values()) {
        if (
          syncMainCategoryChrome(pageInfo.doc, pageInfo.path, {
            targetPath: finalPath,
            label: item.label,
            rootImgPath: '',
            action: 'remove',
          })
        ) {
          touched.add(pageInfo.path);
        }
      }
    }

    const rootImgPath = extractRootImg(removedCard, oldParentPath || oldPath, item.doc, finalPath);
    const subcatCard = removedCard || cloneSubcatCardTemplate(byPath);
    if (!subcatCard) {
      return { ok: false, error: 'Brak wzorca karty podkategorii do sklonowania.' };
    }
    fillSubcatCard(subcatCard, {
      targetPath: finalPath,
      label: item.label,
      rootImgPath,
      hostPath: newParent.path,
    });
    if (syncSubcatCardsInGrid(newParent.doc, newParent.path, finalPath, 'add', subcatCard)) {
      touched.add(newParent.path);
    }

    item.kind = 'podkategoria';
    item.parent = newParent.path;

    // Okruszki przeniesionej podkategorii + jej produktów
    const subTrail = buildTrailForParent(newParent.path, byPath);
    rebuildBreadcrumbs(item.doc, finalPath, subTrail, item.label);
    touched.add(finalPath);

    for (const child of byPath.values()) {
      if (child.kind === 'produkt' && child.parent === finalPath) {
        const prodTrail = buildTrailForParent(finalPath, byPath);
        if (rebuildBreadcrumbs(child.doc, child.path, prodTrail, child.label)) {
          touched.add(child.path);
        }
      }
    }
  }

  // Zapisz wszystkie zmodyfikowane strony z pamięci (poza tymi zapisanymi jako przekierowanie pod oldPath)
  for (const tPath of touched) {
    if (isAddressMove && tPath === oldPath) continue;
    const tInfo = byPath.get(tPath);
    if (!tInfo) continue;
    await ctx.writePage(tPath, ctx.serialize(tInfo.doc), {
      label: tInfo.label,
      title: getDocTitle(tInfo.doc),
      group: tInfo.entry?.group,
    });
  }

  const changedPages = Array.from(touched);
  const targetDesc = wantsPromote
    ? 'kategorii głównych w Ofercie'
    : `„${newParent.label}”`;

  return {
    ok: true,
    pagePath: finalPath,
    oldPath,
    newParent: targetParentPath,
    changedPages,
    summary: `Gotowe: przeniosłem „${item.label}” do ${targetDesc}${isAddressMove ? ` i zmieniłem adres z ${oldPath} na ${finalPath} z przekierowaniem` : ''}. Zaktualizowałem ${changedPages.length} stron (kafelki, okruszki${item.kind === 'produkt' ? ', nawigację produktów' : ''}${wantsPromote ? ', pigułki i pasek boczny' : ''}). Polecenie „cofnij” przywraca całą operację.`,
  };
}

function reorderElementsInContainer(container, orderedNodes, tailNodes = []) {
  if (!container) return false;
  const before = orderedNodes.map((n) => n.outerHTML || n.textContent).join('|');
  for (const n of orderedNodes) n.remove();
  for (const t of tailNodes) t.remove();
  for (const n of orderedNodes) container.appendChild(n);
  for (const t of tailNodes) container.appendChild(t);
  return true;
}

function computeReorderedItems(currentItems, requestedOrder) {
  const remaining = [...currentItems];
  const ordered = [];
  const used = new Set();

  for (const q of requestedOrder) {
    const cleanQ = String(q || '').trim();
    if (!cleanQ) continue;
    const found = resolveItem(cleanQ, remaining);
    if (!found) {
      return {
        error: `Nie znalazłem pozycji „${cleanQ}” na tej liście.`,
      };
    }
    if (found.ambiguous) {
      return {
        error: `Nazwa „${cleanQ}” pasuje do kilku pozycji naraz (${found.ambiguous.map((x) => x.label).join(', ')}).`,
      };
    }
    if (!used.has(found.item.path)) {
      used.add(found.item.path);
      ordered.push(found.item);
    }
  }

  for (const item of remaining) {
    if (!used.has(item.path)) ordered.push(item);
  }
  return { ordered };
}

async function runChangeOrder(args, ctx) {
  const rawGdzie = String(args.gdzie || '').trim();
  const rawKolejnosc = Array.isArray(args.kolejnosc)
    ? args.kolejnosc.map((x) => String(x || '').trim()).filter(Boolean)
    : [];

  const pages = ctx.listPages();
  const nonPanel = pages.filter(
    (p) => p && p.path && p.path !== 'panel' && !p.path.startsWith('panel/')
  );
  const htmlByPath = await readAllPages(nonPanel, ctx);
  const { byPath } = buildPageMap(nonPanel, htmlByPath, ctx);

  if (!rawGdzie) {
    const subParents = [...byPath.values()].filter((x) => x.hasSubcatGrid);
    const prodParents = [...byPath.values()].filter((x) => x.hasProdGrid).slice(0, 3);
    return {
      ok: false,
      needsAnswer: 'Kolejność której listy chcesz zmienić?',
      options: [
        'menu',
        'kafelki-oferty',
        ...subParents.map((x) => `podkategorie:${x.label}`),
        ...prodParents.map((x) => `produkty:${x.label}`),
      ],
    };
  }

  const normGdzie = normText(rawGdzie);
  const touched = new Set();

  // 1. MENU
  if (normGdzie === 'menu' || normGdzie === 'nawigacja') {
    const homeInfo = byPath.get('index.html');
    if (!homeInfo) return { ok: false, error: 'Nie znaleziono index.html.' };

    const nav = homeInfo.doc.querySelector('#site-menu, nav.menu-panel');
    const menuItems = [...(nav?.querySelectorAll('a:not(.menu-phone)') || [])]
      .map((a) => {
        const res = resolveHref(
          a.getAttribute('data-desktop-href') || a.getAttribute('href'),
          'index.html'
        );
        return res
          ? {
              path: res.path,
              label: a.textContent.replace(/\s+/g, ' ').trim(),
              mobileHref: a.getAttribute('data-mobile-home-href') || '',
            }
          : null;
      })
      .filter(Boolean);

    if (!rawKolejnosc.length) {
      return {
        ok: false,
        needsAnswer: 'Jak ułożyć pozycje w menu? Podaj kolejność od pierwszej.',
        options: menuItems.map((x) => x.label),
      };
    }

    const resOrder = computeReorderedItems(menuItems, rawKolejnosc);
    if (resOrder.error) {
      return {
        ok: false,
        needsAnswer: `${resOrder.error} Dostępne pozycje menu:`,
        options: menuItems.map((x) => x.label),
      };
    }

    const orderedPaths = resOrder.ordered.map((x) => x.path);
    const rank = new Map(orderedPaths.map((p, idx) => [p, idx]));

    // Zaktualizuj globals.menu i globals.footerLinks
    const globals = ctx.getGlobals();
    const baseMenu =
      Array.isArray(globals.menu) && globals.menu.length
        ? globals.menu
        : menuItems.map((m) => ({
            label: m.label,
            href: m.path,
            mobileHref: m.mobileHref,
          }));
    globals.menu = [...baseMenu].sort(
      (a, b) =>
        (rank.get(normalizeRepoPath(a.href)) ?? 999) -
        (rank.get(normalizeRepoPath(b.href)) ?? 999)
    );
    if (Array.isArray(globals.footerLinks) && globals.footerLinks.length) {
      globals.footerLinks = [...globals.footerLinks].sort(
        (a, b) =>
          (rank.get(normalizeRepoPath(a.href)) ?? 999) -
          (rank.get(normalizeRepoPath(b.href)) ?? 999)
      );
    }
    await ctx.setGlobals(globals);

    // Zaktualizuj HTML menu i stopki na każdej aktywnej stronie
    for (const info of byPath.values()) {
      let pageChanged = false;
      const pNav = info.doc.querySelector('#site-menu, nav.menu-panel');
      if (pNav) {
        const closeBtn = pNav.querySelector('.menu-close');
        const phoneLink = pNav.querySelector('.menu-phone');
        const links = [...pNav.querySelectorAll('a:not(.menu-phone)')];
        const sortedLinks = [...links].sort((a, b) => {
          const rA = resolveHref(
            a.getAttribute('data-desktop-href') || a.getAttribute('href'),
            info.path
          )?.path;
          const rB = resolveHref(
            b.getAttribute('data-desktop-href') || b.getAttribute('href'),
            info.path
          )?.path;
          return (rank.get(rA) ?? 999) - (rank.get(rB) ?? 999);
        });
        if (closeBtn) closeBtn.remove();
        for (const l of links) l.remove();
        if (phoneLink) phoneLink.remove();
        if (closeBtn) pNav.appendChild(closeBtn);
        for (const l of sortedLinks) pNav.appendChild(l);
        if (phoneLink) pNav.appendChild(phoneLink);
        pageChanged = true;
      }

      const footerLinks = info.doc.querySelector('footer .footer-links');
      if (footerLinks) {
        const fLinks = [...footerLinks.querySelectorAll('a[href]')];
        const sortedFooter = [...fLinks].sort((a, b) => {
          const rA = resolveHref(a.getAttribute('href'), info.path)?.path;
          const rB = resolveHref(b.getAttribute('href'), info.path)?.path;
          return (rank.get(rA) ?? 999) - (rank.get(rB) ?? 999);
        });
        reorderElementsInContainer(footerLinks, sortedFooter);
        pageChanged = true;
      }

      if (pageChanged) {
        await ctx.writePage(info.path, ctx.serialize(info.doc), {
          label: info.label,
          title: getDocTitle(info.doc),
          group: info.entry.group,
        });
        touched.add(info.path);
      }
    }

    const labels = resOrder.ordered.map((x) => x.label);
    return {
      ok: true,
      order: labels,
      changedPages: Array.from(touched),
      summary: `Gotowe: zmieniłem kolejność menu i stopki na ${touched.size} stronach: ${labels.join(' → ')}. Polecenie „cofnij” przywraca całą operację.`,
    };
  }

  // 2. KAFELKI OFERTY (index, oferta, cat-quick-nav, sidebar-links)
  if (
    ['kafelki-oferty', 'kafelki oferty', 'kategorie', 'oferta', 'kafelki'].includes(
      normGdzie
    )
  ) {
    const homeInfo = byPath.get('index.html');
    const homeCards = [...(homeInfo?.doc.querySelectorAll('.home-catalog-grid a.home-cat-card[href]') || [])];
    const currentCats = homeCards
      .map((a) => {
        const res = resolveHref(a.getAttribute('href'), 'index.html');
        const label = (a.querySelector('h3, h2, h4')?.textContent || '').replace(/\s+/g, ' ').trim();
        return res ? { path: res.path, label: label || byPath.get(res.path)?.label || res.path } : null;
      })
      .filter(Boolean);

    if (!rawKolejnosc.length) {
      return {
        ok: false,
        needsAnswer: 'W jakiej kolejności ustawić główne kategorie oferty?',
        options: currentCats.map((x) => x.label),
      };
    }

    const resOrder = computeReorderedItems(currentCats, rawKolejnosc);
    if (resOrder.error) {
      return {
        ok: false,
        needsAnswer: `${resOrder.error} Główne kategorie oferty:`,
        options: currentCats.map((x) => x.label),
      };
    }

    const orderedPaths = resOrder.ordered.map((x) => x.path);
    const rank = new Map(orderedPaths.map((p, idx) => [p, idx]));

    const categoryWeight = (targetPath) => {
      if (targetPath === 'uslugi/index.html') return 9999;
      if (rank.has(targetPath)) return rank.get(targetPath) * 10;
      const pInfo = byPath.get(targetPath);
      if (pInfo?.parent && rank.has(pInfo.parent)) return rank.get(pInfo.parent) * 10 + 5;
      return 5000;
    };

    for (const info of byPath.values()) {
      let pageChanged = false;

      // a) home-catalog-grid (index.html, oferta/index.html)
      const catGrid = info.doc.querySelector('.home-catalog-grid');
      if (catGrid) {
        const cards = [...catGrid.querySelectorAll('a.home-cat-card[href]')];
        const sorted = [...cards].sort((a, b) => {
          const pA = resolveHref(a.getAttribute('href'), info.path)?.path;
          const pB = resolveHref(b.getAttribute('href'), info.path)?.path;
          return (rank.get(pA) ?? 999) - (rank.get(pB) ?? 999);
        });
        reorderElementsInContainer(catGrid, sorted);
        pageChanged = true;
      }

      // b) .cat-quick-nav-pills
      const quickNav = info.doc.querySelector('.cat-quick-nav');
      if (quickNav && isCategoryQuickNav(quickNav, info.path)) {
        const pillsWrap = quickNav.querySelector('.cat-quick-nav-pills') || quickNav;
        const pills = [...pillsWrap.querySelectorAll('a.cat-nav-pill[href]')];
        const sorted = [...pills].sort((a, b) => {
          const pA = resolveHref(a.getAttribute('href'), info.path)?.path || '';
          const pB = resolveHref(b.getAttribute('href'), info.path)?.path || '';
          return categoryWeight(pA) - categoryWeight(pB);
        });
        reorderElementsInContainer(pillsWrap, sorted);
        pageChanged = true;
      }

      // c) aside.subpage-sidebar .sidebar-links
      const sidebar = info.doc.querySelector('aside.subpage-sidebar .sidebar-links');
      if (sidebar) {
        const lis = [...sidebar.querySelectorAll('li')];
        const sorted = [...lis].sort((a, b) => {
          const pA =
            resolveHref(a.querySelector('a[href]')?.getAttribute('href'), info.path)?.path || '';
          const pB =
            resolveHref(b.querySelector('a[href]')?.getAttribute('href'), info.path)?.path || '';
          return categoryWeight(pA) - categoryWeight(pB);
        });
        reorderElementsInContainer(sidebar, sorted);
        pageChanged = true;
      }

      if (pageChanged) {
        await ctx.writePage(info.path, ctx.serialize(info.doc), {
          label: info.label,
          title: getDocTitle(info.doc),
          group: info.entry.group,
        });
        touched.add(info.path);
      }
    }

    const labels = resOrder.ordered.map((x) => x.label);
    return {
      ok: true,
      order: labels,
      changedPages: Array.from(touched),
      summary: `Gotowe: ustawiłem kolejność kategorii na stronie głównej, Ofercie, pasku kategorii i w panelu bocznym (${touched.size} stron): ${labels.join(' → ')}. Polecenie „cofnij” przywraca całą operację.`,
    };
  }

  // 3. PODKATEGORIE:<strona>
  if (normGdzie === 'podkategorie' || normGdzie.startsWith('podkategorie:')) {
    const targetQuery = rawGdzie.includes(':') ? rawGdzie.split(':').slice(1).join(':').trim() : '';
    const catsWithSubs = [...byPath.values()].filter((x) => x.hasSubcatGrid);
    if (!targetQuery) {
      return {
        ok: false,
        needsAnswer: 'Dla której kategorii chcesz zmienić kolejność podkategorii?',
        options: catsWithSubs.map((x) => x.label),
      };
    }

    const foundCat = resolveItem(targetQuery, catsWithSubs);
    if (!foundCat) {
      return {
        ok: false,
        error: `Kategoria „${targetQuery}” nie istnieje lub nie ma podkategorii.`,
      };
    }
    if (foundCat.ambiguous) {
      return {
        ok: false,
        needsAnswer: `Którą kategorię masz na myśli dla „${targetQuery}”?`,
        options: foundCat.ambiguous.map((x) => x.label),
      };
    }

    const catInfo = foundCat.item;
    const subGrid = catInfo.doc.querySelector('.subcat-grid');
    const subCards = [...subGrid.querySelectorAll('a.subcat-card[href]')];
    const currentSubs = subCards
      .map((a) => {
        const res = resolveHref(a.getAttribute('href'), catInfo.path);
        const label = (a.querySelector('h3, h2, h4')?.textContent || '').replace(/\s+/g, ' ').trim();
        return res ? { path: res.path, label: label || byPath.get(res.path)?.label || res.path } : null;
      })
      .filter(Boolean);

    if (!rawKolejnosc.length) {
      return {
        ok: false,
        needsAnswer: `W jakiej kolejności ustawić podkategorie w „${catInfo.label}”?`,
        options: currentSubs.map((x) => x.label),
      };
    }

    const resOrder = computeReorderedItems(currentSubs, rawKolejnosc);
    if (resOrder.error) {
      return {
        ok: false,
        needsAnswer: `${resOrder.error} Podkategorie w „${catInfo.label}”:`,
        options: currentSubs.map((x) => x.label),
      };
    }

    const orderedPaths = resOrder.ordered.map((x) => x.path);
    const rank = new Map(orderedPaths.map((p, idx) => [p, idx]));

    const sortedCards = [...subCards].sort((a, b) => {
      const pA = resolveHref(a.getAttribute('href'), catInfo.path)?.path;
      const pB = resolveHref(b.getAttribute('href'), catInfo.path)?.path;
      return (rank.get(pA) ?? 999) - (rank.get(pB) ?? 999);
    });
    reorderElementsInContainer(subGrid, sortedCards);
    await ctx.writePage(catInfo.path, ctx.serialize(catInfo.doc), {
      label: catInfo.label,
      title: getDocTitle(catInfo.doc),
      group: catInfo.entry.group,
    });
    touched.add(catInfo.path);

    // Zsynchronizuj pigułki .home-extra-categories na index.html (i oferta/index.html, jeśli istnieje)
    for (const hostPath of ['index.html', 'oferta/index.html']) {
      const hInfo = byPath.get(hostPath);
      const extraWrap = hInfo?.doc.querySelector('.home-extra-categories');
      if (!extraWrap) continue;
      const pills = [...extraWrap.querySelectorAll('a.home-extra-category[href]')];
      const relevant = pills.filter((a) =>
        rank.has(resolveHref(a.getAttribute('href'), hostPath)?.path)
      );
      if (relevant.length >= 2) {
        const sortedPills = [...pills].sort((a, b) => {
          const pA = resolveHref(a.getAttribute('href'), hostPath)?.path;
          const pB = resolveHref(b.getAttribute('href'), hostPath)?.path;
          const rA = rank.has(pA) ? rank.get(pA) : 1000 + pills.indexOf(a);
          const rB = rank.has(pB) ? rank.get(pB) : 1000 + pills.indexOf(b);
          return rA - rB;
        });
        reorderElementsInContainer(extraWrap, sortedPills);
        await ctx.writePage(hostPath, ctx.serialize(hInfo.doc), {
          label: hInfo.label,
          title: getDocTitle(hInfo.doc),
          group: hInfo.entry.group,
        });
        touched.add(hostPath);
      }
    }

    const labels = resOrder.ordered.map((x) => x.label);
    return {
      ok: true,
      order: labels,
      changedPages: Array.from(touched),
      summary: `Gotowe: zmieniłem kolejność podkategorii w „${catInfo.label}”${touched.has('index.html') ? ' i na stronie głównej' : ''}: ${labels.join(' → ')}. Polecenie „cofnij” przywraca całą operację.`,
    };
  }

  // 4. PRODUKTY:<strona>
  if (normGdzie === 'produkty' || normGdzie.startsWith('produkty:')) {
    const targetQuery = rawGdzie.includes(':') ? rawGdzie.split(':').slice(1).join(':').trim() : '';
    const catsWithProds = [...byPath.values()].filter((x) => x.hasProdGrid);
    if (!targetQuery) {
      return {
        ok: false,
        needsAnswer: 'Dla której kategorii chcesz zmienić kolejność produktów?',
        options: catsWithProds.map((x) => x.label),
      };
    }

    const foundCat = resolveItem(targetQuery, catsWithProds);
    if (!foundCat) {
      return {
        ok: false,
        error: `Kategoria „${targetQuery}” nie istnieje lub nie zawiera listy produktów.`,
      };
    }
    if (foundCat.ambiguous) {
      return {
        ok: false,
        needsAnswer: `Którą kategorię masz na myśli dla „${targetQuery}”?`,
        options: foundCat.ambiguous.map((x) => x.label),
      };
    }

    const catInfo = foundCat.item;
    const prodGrid = catInfo.doc.querySelector('.cat-products-grid');
    const prodCards = [...prodGrid.querySelectorAll('.cat-prod-card')];
    const currentProds = prodCards
      .map((card) => {
        const a = card.querySelector('a[href]');
        const res = a ? resolveHref(a.getAttribute('href'), catInfo.path) : null;
        const titleEl = card.querySelector('.cat-prod-title a, .cat-prod-title, h3 a, h3');
        const label = titleEl ? titleEl.textContent.replace(/\s+/g, ' ').trim() : '';
        return res
          ? { path: res.path, label: label || byPath.get(res.path)?.label || res.path }
          : null;
      })
      .filter(Boolean);

    if (!rawKolejnosc.length) {
      return {
        ok: false,
        needsAnswer: `W jakiej kolejności ustawić produkty w „${catInfo.label}”?`,
        options: currentProds.map((x) => x.label),
      };
    }

    const resOrder = computeReorderedItems(currentProds, rawKolejnosc);
    if (resOrder.error) {
      return {
        ok: false,
        needsAnswer: `${resOrder.error} Produkty w „${catInfo.label}”:`,
        options: currentProds.map((x) => x.label),
      };
    }

    const orderedPaths = resOrder.ordered.map((x) => x.path);
    const rank = new Map(orderedPaths.map((p, idx) => [p, idx]));

    const sortedCards = [...prodCards].sort((a, b) => {
      const pA = resolveHref(a.querySelector('a[href]')?.getAttribute('href'), catInfo.path)?.path;
      const pB = resolveHref(b.querySelector('a[href]')?.getAttribute('href'), catInfo.path)?.path;
      return (rank.get(pA) ?? 999) - (rank.get(pB) ?? 999);
    });
    reorderElementsInContainer(prodGrid, sortedCards);

    await ctx.writePage(catInfo.path, ctx.serialize(catInfo.doc), {
      label: catInfo.label,
      title: getDocTitle(catInfo.doc),
      group: catInfo.entry.group,
    });
    touched.add(catInfo.path);

    await rebuildProductNavBars(
      catInfo.path,
      catInfo.doc,
      catInfo.label,
      byPath,
      ctx,
      touched
    );

    const labels = resOrder.ordered.map((x) => x.label);
    return {
      ok: true,
      order: labels,
      changedPages: Array.from(touched),
      summary: `Gotowe: zmieniłem kolejność produktów w „${catInfo.label}” oraz zaktualizowałem przyciski „Poprzedni / Następny produkt” na ${touched.size} stronach: ${labels.join(' → ')}. Polecenie „cofnij” przywraca całą operację.`,
    };
  }

  return {
    ok: false,
    needsAnswer: `Nie rozpoznaję listy „${rawGdzie}”. Którą listę chcesz uporządkować?`,
    options: ['menu', 'kafelki-oferty', 'podkategorie:Osłony okienne', 'produkty:Okna PCV'],
  };
}

export async function run(name, args = {}, ctx) {
  if (name === 'przenies_pozycje') return runMoveItem(args, ctx);
  if (name === 'zmien_kolejnosc') return runChangeOrder(args, ctx);
  return { ok: false, error: `Nieznany przepis: ${name}` };
}
