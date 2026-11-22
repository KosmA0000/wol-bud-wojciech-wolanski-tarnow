// Przepis D1: usuń stronę oferty / kategorii / podkategorii / produktu wraz z powiązaniami.

function normPath(p) {
  let s = String(p || '').trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
  if (s.endsWith('/')) s += 'index.html';
  return s;
}

function normText(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveHref(rawHref, fromPath) {
  const s = String(rawHref || '').trim();
  if (!s || s.startsWith('#') || /^(?:mailto:|tel:|javascript:|data:|https?:)/i.test(s)) return null;
  const noHash = s.split('#')[0].split('?')[0].trim();
  if (!noHash) return null;
  try {
    const base = 'https://wolbud.local/' + normPath(fromPath);
    let out = new URL(noHash, base).pathname.replace(/^\/+/, '');
    if (!out || out.endsWith('/')) out += 'index.html';
    return out;
  } catch {
    return null;
  }
}

function toRel(targetRootPath, fromPagePath) {
  const fromParts = normPath(fromPagePath).split('/');
  fromParts.pop();
  const toParts = normPath(targetRootPath).split('/');
  let i = 0;
  while (i < fromParts.length && i < toParts.length - 1 && fromParts[i] === toParts[i]) i++;
  const ups = fromParts.length - i;
  return (ups > 0 ? '../'.repeat(ups) : '') + toParts.slice(i).join('/');
}

function isRedirectDoc(doc) {
  return Boolean(doc?.querySelector?.('meta[http-equiv="refresh" i]'));
}

function getPageTitleLabel(page, doc) {
  const h1 = doc?.querySelector?.('h1')?.textContent?.trim();
  if (h1) return h1;
  if (page?.label) return page.label;
  return String(page?.title || page?.path || '').split('|')[0].trim();
}

function resolveTargetPage(query, entries) {
  const qRaw = String(query || '').trim();
  if (!qRaw) return { error: 'Podaj nazwę lub ścieżkę strony do usunięcia.' };

  const qClean = normPath(qRaw.replace(/\/$/, ''));
  const pathCandidates = new Set([
    qClean,
    qClean.endsWith('.html') ? qClean : `${qClean}/index.html`,
    `kategorie/${qClean}/index.html`,
    `produkty/${qClean}/index.html`,
    `promocje/${qClean}/index.html`,
  ]);
  for (const e of entries) {
    if (pathCandidates.has(e.page.path)) return { match: e };
  }

  const qNorm = normText(qRaw);
  const exactLabel = entries.filter((e) => {
    const lbl = normText(e.label);
    const pLbl = normText(e.page.label);
    const tBase = normText(String(e.page.title || '').split('|')[0]);
    return lbl === qNorm || pLbl === qNorm || tBase === qNorm;
  });
  if (exactLabel.length === 1) return { match: exactLabel[0] };
  if (exactLabel.length > 1) return { ambiguous: exactLabel };

  const partial = entries.filter((e) => {
    const hay = `${normText(e.label)} ${normText(e.page.label)} ${normText(e.page.path)}`;
    return hay.includes(qNorm);
  });
  if (partial.length === 1) return { match: partial[0] };
  if (partial.length > 1) return { ambiguous: partial };

  return { error: `Nie znaleziono strony pasującej do „${qRaw}”.` };
}

function findDirectChildren(targetEntry, entriesByPath, allEntries) {
  const childPaths = [];
  const seen = new Set([targetEntry.page.path]);
  const addChild = (p) => {
    if (!p || seen.has(p) || p === 'index.html' || p === 'oferta/index.html') return;
    if (!entriesByPath.has(p)) return;
    seen.add(p);
    childPaths.push(p);
  };

  for (const a of targetEntry.doc.querySelectorAll('.subcat-grid a.subcat-card[href], .cat-products-grid .cat-prod-card a[href]')) {
    addChild(resolveHref(a.getAttribute('href'), targetEntry.page.path));
  }

  for (const e of allEntries) {
    if (seen.has(e.page.path)) continue;
    const pnavAll = e.doc.querySelector('.product-nav-bar a.pnav-all[href]');
    if (pnavAll && resolveHref(pnavAll.getAttribute('href'), e.page.path) === targetEntry.page.path) {
      addChild(e.page.path);
      continue;
    }
    const bcLinks = Array.from(e.doc.querySelectorAll('nav.breadcrumbs a[href]'));
    const lastBc = bcLinks[bcLinks.length - 1];
    if (lastBc && resolveHref(lastBc.getAttribute('href'), e.page.path) === targetEntry.page.path) {
      addChild(e.page.path);
    }
  }

  return childPaths.map((p) => entriesByPath.get(p));
}

function findParentPath(targetEntry, entriesByPath, allEntries) {
  const tPath = targetEntry.page.path;
  let hostFallback = null;
  for (const e of allEntries) {
    if (e.page.path === tPath) continue;
    const cards = e.doc.querySelectorAll('.subcat-grid a.subcat-card[href], .cat-products-grid .cat-prod-card a[href]');
    for (const a of cards) {
      if (resolveHref(a.getAttribute('href'), e.page.path) === tPath) {
        if (e.page.path.startsWith('kategorie/')) return e.page.path;
        hostFallback = e.page.path;
      }
    }
  }
  if (hostFallback) return hostFallback;

  const pnavAll = targetEntry.doc.querySelector('.product-nav-bar a.pnav-all[href]');
  if (pnavAll) {
    const p = resolveHref(pnavAll.getAttribute('href'), tPath);
    if (p && p !== tPath && entriesByPath.has(p)) return p;
  }

  const bcLinks = Array.from(targetEntry.doc.querySelectorAll('nav.breadcrumbs a[href]'));
  for (let i = bcLinks.length - 1; i >= 0; i--) {
    const p = resolveHref(bcLinks[i].getAttribute('href'), tPath);
    if (p && p !== tPath && entriesByPath.has(p)) return p;
  }

  if (tPath.startsWith('kategorie/') || tPath.startsWith('produkty/')) {
    if (entriesByPath.has('oferta/index.html')) return 'oferta/index.html';
  }
  if (tPath.startsWith('promocje/') && entriesByPath.has('promocje/index.html') && tPath !== 'promocje/index.html') {
    return 'promocje/index.html';
  }
  return 'index.html';
}

function parseChildrenDecision(raw) {
  const s = normText(raw);
  if (!s) return null;
  if (s === 'usun_wszystkie' || (s.includes('usun') && !s.includes('przenies'))) return 'usun_wszystkie';
  if (s === 'przenies_wyzej' || s.includes('przenies') || s.includes('wyzej')) return 'przenies_wyzej';
  return null;
}

function removeBreadcrumbSegment(doc, pagePath, removedSet) {
  const nav = doc.querySelector('nav.breadcrumbs');
  if (!nav) return false;
  let changed = false;
  const links = Array.from(nav.querySelectorAll('a[href]'));
  for (const a of links) {
    const target = resolveHref(a.getAttribute('href'), pagePath);
    if (target && removedSet.has(target)) {
      const next = a.nextElementSibling;
      const prev = a.previousElementSibling;
      if (next && next.tagName === 'SPAN' && next.textContent.trim() === '/') next.remove();
      else if (prev && prev.tagName === 'SPAN' && prev.textContent.trim() === '/') prev.remove();
      a.remove();
      changed = true;
    }
  }
  return changed;
}

function extractCardInfoFromDoc(sourceDoc, sourcePagePath, childPath, childLabel) {
  let imgSrcRoot = 'img/placeholder-photo.svg';
  let imgAlt = childLabel;
  for (const card of sourceDoc.querySelectorAll('.subcat-card, .cat-prod-card, .home-cat-card')) {
    const a = card.matches('a[href]') ? card : card.querySelector('a[href]');
    if (!a) continue;
    if (resolveHref(a.getAttribute('href'), sourcePagePath) === childPath) {
      const img = card.querySelector('img');
      const rawSrc = img?.getAttribute('src') || '';
      if (rawSrc && !/^(?:https?:|data:)/i.test(rawSrc)) {
        try {
          imgSrcRoot = new URL(rawSrc, 'https://wolbud.local/' + normPath(sourcePagePath)).pathname.replace(/^\/+/, '');
        } catch {
          // zachowaj placeholder
        }
      }
      if (img?.getAttribute('alt')) imgAlt = img.getAttribute('alt');
      break;
    }
  }
  return { imgSrcRoot, imgAlt };
}

function appendMovedChildCard(parentDoc, parentPath, childEntry, cardInfo, targetDoc, targetPath) {
  const relHref = toRel(childEntry.page.path, parentPath);
  const relImg = toRel(cardInfo.imgSrcRoot, parentPath);
  const already = Array.from(parentDoc.querySelectorAll('.home-cat-card[href], .subcat-card[href], .cat-prod-card a[href]')).some(
    (a) => resolveHref(a.getAttribute('href'), parentPath) === childEntry.page.path
  );
  if (already) return false;

  // 1) Próba klonowania istniejącej karty tego samego typu na stronie rodzica
  const isChildSubcat = childEntry.page.path.startsWith('kategorie/');
  const existingGrid =
    (parentPath === 'oferta/index.html' || parentPath === 'index.html')
      ? parentDoc.querySelector('.home-catalog-grid')
      : isChildSubcat
        ? parentDoc.querySelector('.subcat-grid') || parentDoc.querySelector('.cat-products-grid')
        : parentDoc.querySelector('.cat-products-grid') || parentDoc.querySelector('.subcat-grid');

  if (existingGrid && existingGrid.firstElementChild) {
    const clone = existingGrid.firstElementChild.cloneNode(true);
    if (clone.matches('a[href]')) clone.setAttribute('href', relHref);
    for (const a of clone.querySelectorAll('a[href]')) a.setAttribute('href', relHref);
    for (const a of clone.querySelectorAll('a[aria-label]')) a.setAttribute('aria-label', childEntry.label);
    const h = clone.querySelector('h3, h4, .cat-prod-title a, .cat-prod-title');
    if (h) h.textContent = childEntry.label;
    const img = clone.querySelector('img');
    if (img) {
      img.setAttribute('src', relImg);
      img.setAttribute('alt', cardInfo.imgAlt || childEntry.label);
    }
    existingGrid.appendChild(clone);
    return true;
  }

  // 2) Jeśli rodzic nie ma siatki (np. pusta kategoria), skopiuj siatkę z usuwanej strony z jedną kartą
  const srcGrid =
    targetDoc.querySelector(isChildSubcat ? '.subcat-grid' : '.cat-products-grid') ||
    targetDoc.querySelector('.cat-products-grid, .subcat-grid');
  const contentCol = parentDoc.querySelector('.subpage-content') || parentDoc.querySelector('main .wrap');
  if (srcGrid && contentCol) {
    const newGrid = parentDoc.importNode(srcGrid.cloneNode(false), true);
    const srcCard = srcGrid.firstElementChild;
    if (srcCard) {
      const clone = parentDoc.importNode(srcCard.cloneNode(true), true);
      if (clone.matches('a[href]')) clone.setAttribute('href', relHref);
      for (const a of clone.querySelectorAll('a[href]')) a.setAttribute('href', relHref);
      for (const a of clone.querySelectorAll('a[aria-label]')) a.setAttribute('aria-label', childEntry.label);
      const h = clone.querySelector('h3, h4, .cat-prod-title a, .cat-prod-title');
      if (h) h.textContent = childEntry.label;
      const img = clone.querySelector('img');
      if (img) {
        img.setAttribute('src', relImg);
        img.setAttribute('alt', cardInfo.imgAlt || childEntry.label);
      }
      newGrid.appendChild(clone);
      const anchorBefore = contentCol.querySelector('.source-content-disclosure, .cta-banner-dark');
      if (anchorBefore) contentCol.insertBefore(newGrid, anchorBefore);
      else contentCol.appendChild(newGrid);
      return true;
    }
  }
  return false;
}

export const tools = [
  {
    name: 'usun_pozycje_oferty',
    description:
      'Usuwa stronę kategorii, podkategorii, produktu lub inną podstronę wraz ze wszystkimi powiązaniami: kafelkami, pigułkami, wpisami w menu i stopce. Linki do niej na innych stronach przepina na stronę nadrzędną (rodzica), a sąsiednie produkty łączy ze sobą. Jeśli strona ma podstrony, pyta czy usunąć je razem czy przenieść wyżej.',
    parameters: {
      type: 'object',
      properties: {
        strona: {
          type: 'string',
          description: 'Nazwa lub ścieżka strony do usunięcia (np. „Aluprof – system adaptacyjny”, „produkty/adaptacyjne/index.html”).',
        },
        co_z_dziecmi: {
          type: 'string',
          enum: ['usun_wszystkie', 'przenies_wyzej'],
          description: 'Decyzja gdy strona ma podstrony/produkty: „usun_wszystkie” (usuń razem z dziećmi) albo „przenies_wyzej” (przepnij dzieci do rodzica).',
        },
      },
      required: ['strona'],
    },
  },
];

export async function run(name, args, ctx) {
  if (name !== 'usun_pozycje_oferty') {
    return { ok: false, error: `Nieznane narzędzie: ${name}` };
  }

  const pages = ctx.listPages();
  const entries = [];
  const entriesByPath = new Map();

  for (const p of pages) {
    const html = await ctx.readPage(p.path);
    if (!html) continue;
    const doc = ctx.parse(html);
    if (isRedirectDoc(doc)) continue;
    const entry = { page: p, html, doc, label: getPageTitleLabel(p, doc) };
    entries.push(entry);
    entriesByPath.set(p.path, entry);
  }

  const found = resolveTargetPage(args.strona, entries);
  if (found.error) return { ok: false, error: found.error };
  if (found.ambiguous) {
    return {
      ok: false,
      needsAnswer: `Znalazłem kilka stron pasujących do „${args.strona}”. Którą dokładnie usunąć?`,
      options: found.ambiguous.slice(0, 8).map((e) => `${e.label} (${e.page.path})`),
    };
  }

  const target = found.match;
  if (target.page.path === 'index.html' || target.page.path === 'oferta/index.html') {
    return { ok: false, error: `Strona „${target.label}” (${target.page.path}) jest stroną główną serwisu i nie może być usunięta.` };
  }

  const parentPath = findParentPath(target, entriesByPath, entries);
  const parentEntry = entriesByPath.get(parentPath);
  const parentLabel = parentEntry ? parentEntry.label : parentPath;

  const directChildren = findDirectChildren(target, entriesByPath, entries);
  const decision = parseChildrenDecision(args.co_z_dziecmi);

  if (directChildren.length > 0 && !decision) {
    const preview =
      directChildren
        .slice(0, 5)
        .map((c) => c.label)
        .join(', ') + (directChildren.length > 5 ? ` i ${directChildren.length - 5} innych` : '');
    return {
      ok: false,
      needsAnswer: `Strona „${target.label}” ma ${directChildren.length} podstron/produktów (${preview}). Usunąć też te ${directChildren.length} podstron czy przenieść je wyżej do „${parentLabel}”?`,
      options: [
        `Usuń wszystko (${directChildren.length} podstron razem z „${target.label}”)`,
        `Przenieś ${directChildren.length} podstron wyżej (do „${parentLabel}”)`,
      ],
    };
  }

  const toDeleteSet = new Set([target.page.path]);
  if (decision === 'usun_wszystkie') {
    const queue = [...directChildren];
    while (queue.length > 0) {
      const c = queue.shift();
      if (!c || toDeleteSet.has(c.page.path)) continue;
      toDeleteSet.add(c.page.path);
      for (const gc of findDirectChildren(c, entriesByPath, entries)) {
        if (!toDeleteSet.has(gc.page.path)) queue.push(gc);
      }
    }
  }

  const changedPages = [];
  const dirtyDocs = new Map();
  const markDirty = (e) => {
    dirtyDocs.set(e.page.path, e);
  };

  // Przeniesienie bezpośrednich dzieci wyżej, jeśli wybrano przenies_wyzej
  if (directChildren.length > 0 && decision === 'przenies_wyzej' && parentEntry) {
    for (const child of directChildren) {
      const cardInfo = extractCardInfoFromDoc(target.doc, target.page.path, child.page.path, child.label);
      if (appendMovedChildCard(parentEntry.doc, parentPath, child, cardInfo, target.doc, target.page.path)) {
        markDirty(parentEntry);
      }

      let childChanged = removeBreadcrumbSegment(child.doc, child.page.path, toDeleteSet);
      const bcNav = child.doc.querySelector('nav.breadcrumbs');
      if (bcNav && parentPath !== 'index.html') {
        const hasParentLink = Array.from(bcNav.querySelectorAll('a[href]')).some(
          (a) => resolveHref(a.getAttribute('href'), child.page.path) === parentPath
        );
        if (!hasParentLink) {
          const currentSpan = bcNav.querySelector('span[aria-current="page"]');
          if (currentSpan) {
            const a = child.doc.createElement('a');
            a.setAttribute('href', toRel(parentPath, child.page.path));
            a.textContent = parentLabel;
            const sep = child.doc.createElement('span');
            sep.textContent = '/';
            bcNav.insertBefore(a, currentSpan);
            bcNav.insertBefore(sep, currentSpan);
            childChanged = true;
          }
        }
      }

      const eyebrow = child.doc.querySelector('.subpage-head .eyebrow');
      if (eyebrow && normText(eyebrow.textContent) === normText(target.label)) {
        eyebrow.textContent = parentLabel;
        childChanged = true;
      }

      const pnavAll = child.doc.querySelector('.product-nav-bar a.pnav-all');
      if (pnavAll && resolveHref(pnavAll.getAttribute('href'), child.page.path) === target.page.path) {
        pnavAll.setAttribute('href', toRel(parentPath, child.page.path));
        pnavAll.textContent = `Wszystkie z kategorii ${parentLabel} ↗`;
        childChanged = true;
      }

      if (childChanged) markDirty(child);
    }
  }

  // Zapisz mapę oryginalnych sąsiadów produktów (zanim zmodyfikujemy DOM), aby spiąć pnav-prev / pnav-next
  const origPnavInfo = new Map();
  for (const e of entries) {
    const nav = e.doc.querySelector('nav.product-nav-bar');
    if (!nav) continue;
    const prevA = nav.querySelector('a.pnav-prev[href]');
    const nextA = nav.querySelector('a.pnav-next[href]');
    origPnavInfo.set(e.page.path, {
      prevPath: prevA ? resolveHref(prevA.getAttribute('href'), e.page.path) : null,
      nextPath: nextA ? resolveHref(nextA.getAttribute('href'), e.page.path) : null,
    });
  }

  const walkSurvivingNeighbor = (startPath, dir) => {
    const visited = new Set();
    let cur = startPath;
    while (cur && !visited.has(cur)) {
      visited.add(cur);
      if (!toDeleteSet.has(cur) && entriesByPath.has(cur)) return entriesByPath.get(cur);
      const info = origPnavInfo.get(cur);
      cur = info ? (dir === 'prev' ? info.prevPath : info.nextPath) : null;
    }
    return null;
  };

  // Sprzątanie wszystkich ocalałych stron
  for (const e of entries) {
    if (toDeleteSet.has(e.page.path)) continue;
    let changed = false;
    const doc = e.doc;
    const pagePath = e.page.path;

    // 1. Kafelki, karty i pigułki prowadzące do usuwanych stron
    const removableSelectors = [
      '.home-cat-card',
      '.home-extra-category',
      '.subcat-card',
      '.cat-prod-card',
      '.home-featured-product',
      '.realization-card',
      '.home-service-item',
      '.cat-nav-pill',
      'nav#site-menu a[href]',
      'footer .footer-links a[href]',
    ];
    for (const sel of removableSelectors) {
      for (const el of Array.from(doc.querySelectorAll(sel))) {
        const links = el.matches('a[href]') ? [el] : Array.from(el.querySelectorAll('a[href]'));
        const pointsDeleted = links.some((a) => toDeleteSet.has(resolveHref(a.getAttribute('href'), pagePath)));
        const desktopDeleted =
          el.hasAttribute('data-desktop-href') &&
          toDeleteSet.has(resolveHref(el.getAttribute('data-desktop-href'), pagePath));
        if (pointsDeleted || desktopDeleted) {
          el.remove();
          changed = true;
        }
      }
    }

    // Sidebar <li>
    for (const li of Array.from(doc.querySelectorAll('.sidebar-links li'))) {
      const a = li.querySelector('a[href]');
      if (a && toDeleteSet.has(resolveHref(a.getAttribute('href'), pagePath))) {
        li.remove();
        changed = true;
      }
    }

    // 2. Okruszki
    if (removeBreadcrumbSegment(doc, pagePath, toDeleteSet)) changed = true;

    // 3. Nawigacja sąsiednich produktów (product-nav-bar)
    const pnav = doc.querySelector('nav.product-nav-bar');
    if (pnav) {
      const prevA = pnav.querySelector('a.pnav-prev[href]');
      if (prevA && toDeleteSet.has(resolveHref(prevA.getAttribute('href'), pagePath))) {
        const info = origPnavInfo.get(pagePath);
        const targetNeighbor = walkSurvivingNeighbor(info?.prevPath, 'prev');
        if (targetNeighbor && targetNeighbor.page.path !== pagePath) {
          prevA.setAttribute('href', toRel(targetNeighbor.page.path, pagePath));
          const span = prevA.querySelector('span');
          if (span) span.textContent = targetNeighbor.label;
        } else {
          prevA.remove();
        }
        changed = true;
      }
      const nextA = pnav.querySelector('a.pnav-next[href]');
      if (nextA && toDeleteSet.has(resolveHref(nextA.getAttribute('href'), pagePath))) {
        const info = origPnavInfo.get(pagePath);
        const targetNeighbor = walkSurvivingNeighbor(info?.nextPath, 'next');
        if (targetNeighbor && targetNeighbor.page.path !== pagePath) {
          nextA.setAttribute('href', toRel(targetNeighbor.page.path, pagePath));
          const span = nextA.querySelector('span');
          if (span) span.textContent = targetNeighbor.label;
        } else {
          nextA.remove();
        }
        changed = true;
      }
      const allA = pnav.querySelector('a.pnav-all[href]');
      if (allA && toDeleteSet.has(resolveHref(allA.getAttribute('href'), pagePath))) {
        allA.setAttribute('href', toRel(parentPath, pagePath));
        allA.textContent = `Wszystkie z kategorii ${parentLabel} ↗`;
        changed = true;
      }
    }

    // 4. Pozostałe linki w treści kierujące do usuniętej strony → przepnij na rodzica
    for (const a of Array.from(doc.querySelectorAll('a[href]'))) {
      const targetHref = resolveHref(a.getAttribute('href'), pagePath);
      if (targetHref && toDeleteSet.has(targetHref)) {
        a.setAttribute('href', toRel(parentPath, pagePath));
        changed = true;
      }
    }

    if (changed) markDirty(e);
  }

  // Zapisz zmodyfikowane strony
  for (const [p, e] of dirtyDocs) {
    if (toDeleteSet.has(p)) continue;
    await ctx.writePage(p, ctx.serialize(e.doc));
    changedPages.push(p);
  }

  // Usuń wpis(y) z menu i stopki w globals
  const globals = ctx.getGlobals();
  let globalsChanged = false;
  const isDeletedGlobalHref = (h) => {
    const norm = normPath(String(h || '').split('#')[0].split('?')[0]);
    return toDeleteSet.has(norm);
  };
  const nextMenu = (globals.menu || []).filter((item) => {
    if (isDeletedGlobalHref(item.href)) {
      globalsChanged = true;
      return false;
    }
    return true;
  });
  const nextFooter = (globals.footerLinks || []).filter((item) => {
    if (isDeletedGlobalHref(item.href)) {
      globalsChanged = true;
      return false;
    }
    return true;
  });
  if (globalsChanged) {
    await ctx.setGlobals({ ...globals, menu: nextMenu, footerLinks: nextFooter });
  }

  // Usuń strony z projektu (szkice)
  const deletedPaths = [];
  for (const delPath of toDeleteSet) {
    const res = await ctx.deletePage(delPath);
    if (res && res.ok === false && res.blockedBySecurity) {
      return { ok: false, error: res.error || `Nie można usunąć chronionej strony ${delPath}.` };
    }
    deletedPaths.push(delPath);
  }

  const extraChildrenInfo =
    directChildren.length > 0
      ? decision === 'przenies_wyzej'
        ? ` Przeniesiono ${directChildren.length} podstron wyżej do „${parentLabel}”.`
        : ` Usunięto także ${deletedPaths.length - 1} podstron.`
      : '';

  return {
    ok: true,
    summary: `Usunięto „${target.label}” (${target.page.path})${extraChildrenInfo} Sprzątnięto kafelki, pigułki${globalsChanged ? ', menu/stopkę' : ''} i przepięto pozostałe linki na „${parentLabel}” (zaktualizowano stron: ${changedPages.length}).`,
    deletedPages: deletedPaths,
    changedPages,
    updatedMenuOrFooter: globalsChanged,
  };
}
