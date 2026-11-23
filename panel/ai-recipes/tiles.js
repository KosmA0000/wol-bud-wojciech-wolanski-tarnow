// Przepis D3: operacje na kafelkach i widoczności pozycji (zmien_kafelek, usun_kafelek, ukryj_pozycje).
import { run as runRemove } from './remove.js?v=turbo30';

const TILE_SELECTOR =
  '.home-cat-card, .home-extra-category, .subcat-card, .cat-prod-card, .home-featured-product, .realization-card, .home-service-item';

const HIDEABLE_BLOCK_SELECTORS = [
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

function normPath(p) {
  let s = String(p || '').trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
  if (s.endsWith('/')) s += 'index.html';
  return s;
}

function normText(s) {
  return String(s || '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isRedirectDoc(doc) {
  if (!doc) return false;
  for (const m of doc.querySelectorAll('meta[http-equiv]')) {
    if (String(m.getAttribute('http-equiv') || '').trim().toLowerCase() === 'refresh') return true;
  }
  return false;
}

function resolveHref(rawHref, fromPath) {
  const s = String(rawHref || '').trim();
  if (!s || s.startsWith('#') || /^(?:mailto:|tel:|javascript:|data:|https?:)/i.test(s)) return null;
  const noHash = s.split('#')[0].split('?')[0].trim();
  if (!noHash) return null;
  try {
    const base = 'https://wolbud.local/' + normPath(fromPath);
    let out = decodeURIComponent(new URL(noHash, base).pathname).replace(/^\/+/, '');
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

function getPageLabel(page, doc) {
  const h1 = doc?.querySelector?.('main h1, h1')?.textContent?.trim();
  if (h1) return h1;
  if (page?.label && page.label !== page.path) return page.label;
  return String(doc?.title || page?.title || page?.path || '').split('|')[0].trim();
}

async function loadEntries(ctx) {
  const pages = ctx.listPages();
  const entries = [];
  const byPath = new Map();
  for (const p of pages) {
    const html = await ctx.readPage(p.path);
    if (!html) continue;
    const doc = ctx.parse(html);
    if (isRedirectDoc(doc)) continue;
    const entry = { page: p, html, doc, label: getPageLabel(p, doc) };
    entries.push(entry);
    byPath.set(p.path, entry);
  }
  return { entries, byPath };
}

function resolveEntry(query, entries) {
  const qRaw = String(query || '').trim();
  if (!qRaw) return { missing: true };
  const qNorm = normText(qRaw);

  if (qNorm === 'home' || qNorm === 'strona glowna' || qNorm === 'glowna' || qRaw === '/') {
    const home = entries.find((e) => e.page.path === 'index.html');
    if (home) return { match: home };
  }

  const parenMatch = qRaw.match(/\(([^()]+\.html)\)\s*$/i);
  const qClean = normPath((parenMatch ? parenMatch[1] : qRaw).replace(/\/$/, ''));
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

  const exact = entries.filter((e) => {
    const tBase = normText(String(e.doc?.title || e.page.title || '').split('|')[0]);
    return normText(e.label) === qNorm || normText(e.page.label) === qNorm || tBase === qNorm;
  });
  if (exact.length === 1) return { match: exact[0] };
  if (exact.length > 1) return { ambiguous: exact };

  const partial = entries.filter((e) => {
    const hay = `${normText(e.label)} ${normText(e.page.label)} ${normText(e.page.path)}`;
    return hay.includes(qNorm);
  });
  if (partial.length === 1) return { match: partial[0] };
  if (partial.length > 1) return { ambiguous: partial };

  return { notFound: true };
}

function getTileTitle(tileEl) {
  if (tileEl.classList.contains('home-extra-category')) {
    const clone = tileEl.cloneNode(true);
    clone.querySelectorAll('[aria-hidden="true"]').forEach((el) => el.remove());
    return clone.textContent.replace(/↗/g, '').trim();
  }
  const titleEl =
    tileEl.querySelector('.cat-prod-title a') ||
    tileEl.querySelector('.cat-prod-title') ||
    tileEl.querySelector('summary h4') ||
    tileEl.querySelector('h3, h4, h2');
  return (titleEl?.textContent || tileEl.textContent || '').trim();
}

function getTileTargetPath(tileEl, hostPath) {
  const a = tileEl.matches('a[href]') ? tileEl : tileEl.querySelector('a[href]');
  if (!a) return null;
  return resolveHref(a.getAttribute('href'), hostPath);
}

function setTileFields(tileEl, hostPath, { tytul, opis, zdjecie }) {
  const currentTitle = getTileTitle(tileEl);
  const finalTitle = tytul !== undefined && String(tytul).trim() !== '' ? String(tytul).trim() : currentTitle;

  if (tytul !== undefined && String(tytul).trim() !== '') {
    if (tileEl.classList.contains('home-extra-category')) {
      const spans = tileEl.querySelectorAll('span');
      if (spans.length >= 2) {
        spans[0].textContent = finalTitle;
      } else {
        const arrow = tileEl.querySelector('span[aria-hidden="true"]');
        tileEl.textContent = '';
        tileEl.append(tileEl.ownerDocument.createTextNode(`${finalTitle} `));
        if (arrow) tileEl.append(arrow);
        else {
          const sp = tileEl.ownerDocument.createElement('span');
          sp.setAttribute('aria-hidden', 'true');
          sp.textContent = '↗';
          tileEl.append(sp);
        }
      }
    } else {
      const titleEl =
        tileEl.querySelector('.cat-prod-title a') ||
        tileEl.querySelector('.cat-prod-title') ||
        tileEl.querySelector('summary h4') ||
        tileEl.querySelector('h3, h4, h2');
      if (titleEl) titleEl.textContent = finalTitle;
    }
    for (const a of tileEl.matches('a[aria-label]') ? [tileEl] : tileEl.querySelectorAll('a[aria-label]')) {
      a.setAttribute('aria-label', a.classList.contains('arr') ? `Dowiedz się więcej: ${finalTitle}` : finalTitle);
    }
  }

  if (opis !== undefined && !tileEl.classList.contains('home-extra-category') && !tileEl.classList.contains('realization-card')) {
    const cleanOpis = String(opis ?? '').trim();
    const descEl = tileEl.querySelector('.home-service-item-teaser, .home-featured-copy p, p');
    if (!cleanOpis) {
      if (descEl) descEl.remove();
    } else if (descEl) {
      descEl.textContent = cleanOpis;
    } else {
      const body =
        tileEl.querySelector('.home-cat-body, .subcat-card-body, .cat-prod-body, .home-featured-copy, .home-service-item-body') ||
        tileEl;
      const p = tileEl.ownerDocument.createElement('p');
      p.textContent = cleanOpis;
      const cta = body.querySelector('.home-cat-cta, .cat-prod-btn, .arr');
      if (cta) body.insertBefore(p, cta);
      else body.appendChild(p);
    }
  }

  const img = tileEl.querySelector('img');
  if (img) {
    if (zdjecie !== undefined && String(zdjecie).trim() !== '') {
      const rawImg = String(zdjecie).trim();
      const relImg = /^(?:https?:|data:)/i.test(rawImg) ? rawImg : toRel(normPath(rawImg), hostPath);
      img.setAttribute('src', relImg);
      for (const attr of ['data-src', 'data-lightbox-src']) {
        if (img.hasAttribute(attr)) img.setAttribute(attr, relImg);
      }
      img.removeAttribute('srcset');
      img.removeAttribute('sizes');
      img.removeAttribute('width');
      img.removeAttribute('height');
      img.closest('picture')?.querySelectorAll('source').forEach((s) => s.remove());
    }
    if (tytul !== undefined && String(tytul).trim() !== '') {
      img.setAttribute('alt', finalTitle);
    }
  }
}

const encodeSafe = (s) => encodeURIComponent(String(s || '')).replace(/-/g, '%2D');
const decodeSafe = (s) => decodeURIComponent(String(s || '').replace(/%2D/gi, '-'));

function parseFragment(doc, htmlSnippet) {
  const wrapped = doc.defaultView
    ? null
    : null;
  const parsed = doc.implementation
    ? null
    : null;
  void wrapped;
  void parsed;
  const p = doc.createElement('div');
  p.innerHTML = htmlSnippet;
  return p.firstElementChild;
}

function collectCommentNodes(root, out = []) {
  for (const child of Array.from(root.childNodes || [])) {
    if (child.nodeType === 8) out.push(child);
    else if (child.nodeType === 1) collectCommentNodes(child, out);
  }
  return out;
}

// ---------- 1. zmien_kafelek ----------
async function handleZmienKafelek(args, ctx) {
  const { entries } = await loadEntries(ctx);

  if (!args.cel || !String(args.cel).trim()) {
    const homeEntry = entries.find((e) => e.page.path === 'index.html');
    const opts = homeEntry
      ? Array.from(homeEntry.doc.querySelectorAll('.home-cat-card')).map((el) => getTileTitle(el)).filter(Boolean)
      : [];
    return {
      ok: false,
      needsAnswer: 'Który kafelek chcesz zmienić? Podaj nazwę kafelka albo nazwę/ścieżkę strony, do której prowadzi.',
      options: opts.slice(0, 10),
    };
  }

  const hasTytul = args.tytul !== undefined && String(args.tytul).trim() !== '';
  const hasOpis = args.opis !== undefined;
  const hasZdjecie = args.zdjecie !== undefined && String(args.zdjecie).trim() !== '';
  if (!hasTytul && !hasOpis && !hasZdjecie) {
    return {
      ok: false,
      needsAnswer: `Co dokładnie zmienić na kafelku „${args.cel}” (nowy tytuł, opis czy zdjęcie)?`,
      options: ['Zmień tytuł kafelka', 'Zmień opis na kafelku', 'Zmień zdjęcie na kafelku'],
    };
  }

  const resolvedTarget = resolveEntry(args.cel, entries);
  if (resolvedTarget.ambiguous) {
    return {
      ok: false,
      needsAnswer: `Znalazłem kilka stron pasujących do „${args.cel}”. Który kafelek zmienić?`,
      options: resolvedTarget.ambiguous.slice(0, 8).map((e) => `${e.label} (${e.page.path})`),
    };
  }

  const targetPath = resolvedTarget.match ? resolvedTarget.match.page.path : null;
  const celNorm = normText(args.cel);
  const changedPages = [];
  let updatedCount = 0;

  for (const e of entries) {
    let pageChanged = false;
    for (const tile of Array.from(e.doc.querySelectorAll(TILE_SELECTOR))) {
      const linkTarget = getTileTargetPath(tile, e.page.path);
      const tileTitleNorm = normText(getTileTitle(tile));
      const matches = targetPath ? linkTarget === targetPath : tileTitleNorm === celNorm;
      if (!matches) continue;
      setTileFields(tile, e.page.path, {
        tytul: args.tytul,
        opis: args.opis,
        zdjecie: args.zdjecie,
      });
      pageChanged = true;
      updatedCount++;
    }
    if (pageChanged) {
      await ctx.writePage(e.page.path, ctx.serialize(e.doc));
      changedPages.push(e.page.path);
    }
  }

  if (updatedCount === 0) {
    return { ok: false, error: `Nie znaleziono żadnego kafelka pasującego do „${args.cel}”.` };
  }

  const what = [
    hasTytul ? `tytuł na „${String(args.tytul).trim()}”` : '',
    hasOpis ? (String(args.opis).trim() ? 'opis' : 'usunięto opis') : '',
    hasZdjecie ? 'zdjęcie' : '',
  ]
    .filter(Boolean)
    .join(', ');

  return {
    ok: true,
    summary: `Zmieniono kafelek „${resolvedTarget.match ? resolvedTarget.match.label : args.cel}” (${what}) w ${updatedCount} miejscach na stronach: ${changedPages.join(', ')}.`,
    changedPages,
    updatedTilesCount: updatedCount,
  };
}

// ---------- 2. usun_kafelek ----------
function parseUsunStroneDecision(raw) {
  if (typeof raw === 'boolean') return raw;
  const s = normText(raw);
  if (!s) return undefined;
  if (s === 'true' || s === 'usun_strone' || (s.includes('usun') && s.includes('stron'))) return true;
  if (s === 'false' || s === 'tylko_kafelek' || s.includes('tylko kafelek') || s.includes('zostaw')) return false;
  return undefined;
}

async function handleUsunKafelek(args, ctx) {
  const { entries, byPath } = await loadEntries(ctx);

  if (!args.strona || !String(args.strona).trim()) {
    return {
      ok: false,
      needsAnswer: 'Z której strony chcesz usunąć kafelek?',
      options: [
        'Strona główna (index.html)',
        'Oferta (oferta/index.html)',
        ...entries.filter((e) => e.page.path.startsWith('kategorie/')).slice(0, 6).map((e) => `${e.label} (${e.page.path})`),
      ],
    };
  }

  const hostRes = resolveEntry(args.strona, entries);
  if (hostRes.notFound) return { ok: false, error: `Nie znaleziono strony „${args.strona}”.` };
  if (hostRes.ambiguous) {
    return {
      ok: false,
      needsAnswer: `Znalazłem kilka stron pasujących do „${args.strona}”. Z której usunąć kafelek?`,
      options: hostRes.ambiguous.slice(0, 8).map((e) => `${e.label} (${e.page.path})`),
    };
  }

  const host = hostRes.match;
  const tiles = Array.from(host.doc.querySelectorAll(TILE_SELECTOR)).map((el) => ({
    el,
    title: getTileTitle(el),
    targetPath: getTileTargetPath(el, host.page.path),
  }));

  if (tiles.length === 0) {
    return { ok: false, error: `Na stronie „${host.label}” (${host.page.path}) nie ma żadnych kafelków.` };
  }

  if (!args.kafelek || !String(args.kafelek).trim()) {
    return {
      ok: false,
      needsAnswer: `Który kafelek ze strony „${host.label}” chcesz usunąć?`,
      options: tiles.map((t) => t.title).filter(Boolean).slice(0, 12),
    };
  }

  const qNorm = normText(args.kafelek);
  const qPath = normPath(String(args.kafelek).replace(/\/$/, ''));
  let matches = tiles.filter(
    (t) =>
      normText(t.title) === qNorm ||
      (t.targetPath && (t.targetPath === qPath || t.targetPath === `${qPath}/index.html`))
  );
  if (matches.length === 0) {
    matches = tiles.filter((t) => normText(t.title).includes(qNorm) || (t.targetPath && normText(t.targetPath).includes(qNorm)));
  }

  if (matches.length === 0) {
    return { ok: false, error: `Na stronie „${host.label}” nie znaleziono kafelka „${args.kafelek}”.` };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      needsAnswer: `Na stronie „${host.label}” pasuje kilka kafelków do „${args.kafelek}”. Który usunąć?`,
      options: matches.map((t) => t.title),
    };
  }

  const tile = matches[0];
  const targetEntry = tile.targetPath ? byPath.get(tile.targetPath) : null;
  const canDeleteTargetPage =
    targetEntry &&
    targetEntry.page.path !== 'index.html' &&
    targetEntry.page.path !== 'oferta/index.html' &&
    targetEntry.page.path !== host.page.path;

  const decision = parseUsunStroneDecision(args.usun_strone);
  if (canDeleteTargetPage && decision === undefined) {
    return {
      ok: false,
      needsAnswer: `Kafelek „${tile.title}” prowadzi do strony „${targetEntry.label}” (${targetEntry.page.path}). Usunąć tylko sam kafelek na „${host.label}”, czy usunąć też całą stronę wraz z wszystkimi jej kafelkami i linkami?`,
      options: [
        `Usuń tylko kafelek na „${host.label}” (strona zostaje)`,
        `Usuń też całą stronę „${targetEntry.label}”`,
      ],
    };
  }

  if (canDeleteTargetPage && decision === true) {
    return runRemove('usun_pozycje_oferty', { strona: targetEntry.page.path, co_z_dziecmi: args.co_z_dziecmi }, ctx);
  }

  tile.el.remove();
  await ctx.writePage(host.page.path, ctx.serialize(host.doc));

  return {
    ok: true,
    summary: `Usunięto kafelek „${tile.title}” ze strony „${host.label}” (${host.page.path}).${targetEntry ? ` Sama strona „${targetEntry.label}” (${targetEntry.page.path}) została zachowana.` : ''}`,
    changedPages: [host.page.path],
  };
}

// ---------- 3. ukryj_pozycje ----------
function parseUkryjFlag(raw) {
  if (typeof raw === 'boolean') return raw;
  const s = normText(raw);
  if (!s) return undefined;
  if (s === 'true' || s.includes('ukryj') || s.includes('schowaj')) return true;
  if (s === 'false' || s.includes('pokaz') || s.includes('przywroc') || s.includes('odkryj')) return false;
  return undefined;
}

async function handleUkryjPozycje(args, ctx) {
  const { entries, byPath } = await loadEntries(ctx);

  if (!args.strona || !String(args.strona).trim()) {
    return {
      ok: false,
      needsAnswer: 'Którą pozycję (stronę) chcesz ukryć lub ponownie pokazać?',
      options: entries
        .filter((e) => e.page.path !== 'index.html' && e.page.path !== 'oferta/index.html')
        .slice(0, 10)
        .map((e) => `${e.label} (${e.page.path})`),
    };
  }

  const found = resolveEntry(args.strona, entries);
  if (found.notFound) return { ok: false, error: `Nie znaleziono strony „${args.strona}”.` };
  if (found.ambiguous) {
    return {
      ok: false,
      needsAnswer: `Znalazłem kilka stron pasujących do „${args.strona}”. O którą chodzi?`,
      options: found.ambiguous.slice(0, 8).map((e) => `${e.label} (${e.page.path})`),
    };
  }

  const target = found.match;
  const targetPath = target.page.path;
  if (targetPath === 'index.html' || targetPath === 'oferta/index.html') {
    return { ok: false, error: `Nie można ukryć głównej strony „${target.label}” (${targetPath}).` };
  }

  const ukryj = parseUkryjFlag(args.ukryj);
  if (ukryj === undefined) {
    return {
      ok: false,
      needsAnswer: `Czy ukryć pozycję „${target.label}” wszędzie na stronie, czy ją z powrotem pokazać?`,
      options: ['Ukryj wszędzie (schowaj przed klientami)', 'Pokaż wszędzie (przywróć)'],
    };
  }

  const changedPages = [];
  const globals = ctx.getGlobals();
  let globalsChanged = false;

  if (ukryj) {
    // Mapa pnav sąsiadów, aby ominąć ukryty produkt
    const pnavMap = new Map();
    for (const e of entries) {
      const nav = e.doc.querySelector('nav.product-nav-bar');
      if (!nav) continue;
      const prevA = nav.querySelector('a.pnav-prev[href]');
      const nextA = nav.querySelector('a.pnav-next[href]');
      pnavMap.set(e.page.path, {
        prevPath: prevA ? resolveHref(prevA.getAttribute('href'), e.page.path) : null,
        nextPath: nextA ? resolveHref(nextA.getAttribute('href'), e.page.path) : null,
      });
    }
    const targetPnav = pnavMap.get(targetPath);

    let hiddenPlaces = 0;

    for (const e of entries) {
      let pageChanged = false;
      const doc = e.doc;
      const pagePath = e.page.path;

      // 1. Kafelki, pigułki, menu, stopka
      for (const sel of HIDEABLE_BLOCK_SELECTORS) {
        for (const el of Array.from(doc.querySelectorAll(sel))) {
          const links = el.matches('a[href]') ? [el] : Array.from(el.querySelectorAll('a[href]'));
          const pointsHere = links.some((a) => resolveHref(a.getAttribute('href'), pagePath) === targetPath);
          const desktopHere =
            el.hasAttribute('data-desktop-href') &&
            resolveHref(el.getAttribute('data-desktop-href'), pagePath) === targetPath;
          if (!pointsHere && !desktopHere) continue;
          const comment = doc.createComment(`wolbud-hidden:${targetPath}|${encodeSafe(el.outerHTML)}`);
          el.parentNode.replaceChild(comment, el);
          pageChanged = true;
          hiddenPlaces++;
        }
      }

      // 2. Sidebar <li>
      for (const li of Array.from(doc.querySelectorAll('.sidebar-links li'))) {
        const a = li.querySelector('a[href]');
        if (a && resolveHref(a.getAttribute('href'), pagePath) === targetPath) {
          const comment = doc.createComment(`wolbud-hidden:${targetPath}|${encodeSafe(li.outerHTML)}`);
          li.parentNode.replaceChild(comment, li);
          pageChanged = true;
          hiddenPlaces++;
        }
      }

      // 3. Nawigacja sąsiednich produktów (product-nav-bar) — ukrywa link i spina sąsiadów
      const pnav = doc.querySelector('nav.product-nav-bar');
      if (pnav) {
        for (const [cls, dir] of [['a.pnav-prev[href]', 'prev'], ['a.pnav-next[href]', 'next']]) {
          const btn = pnav.querySelector(cls);
          if (btn && resolveHref(btn.getAttribute('href'), pagePath) === targetPath) {
            const comment = doc.createComment(`wolbud-hidden:${targetPath}|${encodeSafe(btn.outerHTML)}`);
            const nextHopPath = dir === 'prev' ? targetPnav?.prevPath : targetPnav?.nextPath;
            const neighbor = nextHopPath && nextHopPath !== pagePath ? byPath.get(nextHopPath) : null;
            const parent = btn.parentNode;
            if (neighbor) {
              const stitched = btn.cloneNode(true);
              stitched.setAttribute('href', toRel(neighbor.page.path, pagePath));
              stitched.setAttribute('data-wolbud-stitched', targetPath);
              const sp = stitched.querySelector('span');
              if (sp) sp.textContent = neighbor.label;
              parent.insertBefore(comment, btn);
              parent.replaceChild(stitched, btn);
            } else {
              parent.replaceChild(comment, btn);
            }
            pageChanged = true;
            hiddenPlaces++;
          }
        }
        const allA = pnav.querySelector('a.pnav-all[href]');
        if (allA && resolveHref(allA.getAttribute('href'), pagePath) === targetPath) {
          const comment = doc.createComment(`wolbud-hidden:${targetPath}|${encodeSafe(allA.outerHTML)}`);
          allA.parentNode.replaceChild(comment, allA);
          pageChanged = true;
          hiddenPlaces++;
        }
      }

      // 4. Pozostałe linki (np. okruszki lub linki śródtekstowe) — zamień na sam tekst otoczony znacznikami komentarza
      for (const a of Array.from(doc.querySelectorAll('a[href]'))) {
        if (resolveHref(a.getAttribute('href'), pagePath) !== targetPath) continue;
        const parent = a.parentNode;
        const startC = doc.createComment(`wolbud-hidden-link:${targetPath}|${encodeSafe(a.outerHTML)}`);
        const txt = doc.createTextNode(a.textContent || target.label);
        const endC = doc.createComment(`/wolbud-hidden-link:${targetPath}`);
        parent.insertBefore(startC, a);
        parent.insertBefore(txt, a);
        parent.replaceChild(endC, a);
        pageChanged = true;
        hiddenPlaces++;
      }

      if (pageChanged) {
        await ctx.writePage(pagePath, ctx.serialize(doc));
        changedPages.push(pagePath);
      }
    }

    // Menu i stopka w globals
    const hiddenMenu = Array.isArray(globals.hiddenMenu) ? [...globals.hiddenMenu] : [];
    const nextMenu = [];
    (globals.menu || []).forEach((item, idx) => {
      if (normPath(String(item.href || '').split('#')[0]) === targetPath) {
        hiddenMenu.push({ ...item, _hiddenFor: targetPath, _index: idx });
        globalsChanged = true;
        hiddenPlaces++;
      } else {
        nextMenu.push(item);
      }
    });

    const hiddenFooterLinks = Array.isArray(globals.hiddenFooterLinks) ? [...globals.hiddenFooterLinks] : [];
    const nextFooter = [];
    (globals.footerLinks || []).forEach((item, idx) => {
      if (normPath(String(item.href || '').split('#')[0]) === targetPath) {
        hiddenFooterLinks.push({ ...item, _hiddenFor: targetPath, _index: idx });
        globalsChanged = true;
        hiddenPlaces++;
      } else {
        nextFooter.push(item);
      }
    });

    if (globalsChanged) {
      await ctx.setGlobals({ ...globals, menu: nextMenu, footerLinks: nextFooter, hiddenMenu, hiddenFooterLinks });
    }

    if (hiddenPlaces === 0) {
      return {
        ok: true,
        summary: `Pozycja „${target.label}” (${targetPath}) nie ma już widocznych linków ani kafelków do ukrycia (sama strona została zachowana).`,
        changedPages: [],
      };
    }

    return {
      ok: true,
      summary: `Ukryto „${target.label}” (${targetPath}) w ${hiddenPlaces} miejscach na stronach: ${changedPages.join(', ')}${globalsChanged ? ' oraz w menu/stopce' : ''}. Sama strona nie została usunięta.`,
      changedPages,
      hiddenPlaces,
    };
  }

  // ---------- ukryj === false: pokaż z powrotem ----------
  let restoredPlaces = 0;
  const blockPrefix = `wolbud-hidden:${targetPath}|`;
  const linkStartPrefix = `wolbud-hidden-link:${targetPath}|`;
  const linkEndVal = `/wolbud-hidden-link:${targetPath}`;

  for (const e of entries) {
    let pageChanged = false;
    const doc = e.doc;
    const pagePath = e.page.path;

    // Usuń tymczasowe spięte przyciski pnav
    for (const stitched of Array.from(doc.querySelectorAll('[data-wolbud-stitched]'))) {
      if (stitched.getAttribute('data-wolbud-stitched') === targetPath) {
        stitched.remove();
        pageChanged = true;
      }
    }

    const comments = collectCommentNodes(doc.documentElement);
    for (const c of comments) {
      const val = c.nodeValue || '';
      if (val.startsWith(blockPrefix)) {
        const html = decodeSafe(val.slice(blockPrefix.length));
        const restored = parseFragment(doc, html);
        if (restored && c.parentNode) {
          c.parentNode.replaceChild(restored, c);
          pageChanged = true;
          restoredPlaces++;
        }
      } else if (val.startsWith(linkStartPrefix)) {
        const html = decodeSafe(val.slice(linkStartPrefix.length));
        const restored = parseFragment(doc, html);
        if (restored && c.parentNode) {
          const parent = c.parentNode;
          let cur = c.nextSibling;
          while (cur) {
            const nxt = cur.nextSibling;
            if (cur.nodeType === 8 && cur.nodeValue === linkEndVal) {
              cur.remove();
              break;
            }
            cur.remove();
            cur = nxt;
          }
          parent.replaceChild(restored, c);
          pageChanged = true;
          restoredPlaces++;
        }
      }
    }

    if (pageChanged) {
      await ctx.writePage(pagePath, ctx.serialize(doc));
      changedPages.push(pagePath);
    }
  }

  // Przywróć wpisy menu/stopki w globals
  const nextMenu = [...(globals.menu || [])];
  const remainingHiddenMenu = [];
  for (const item of globals.hiddenMenu || []) {
    if (item._hiddenFor === targetPath) {
      const { _hiddenFor, _index, ...cleanItem } = item;
      const pos = typeof _index === 'number' && _index >= 0 && _index <= nextMenu.length ? _index : nextMenu.length;
      nextMenu.splice(pos, 0, cleanItem);
      globalsChanged = true;
      restoredPlaces++;
    } else {
      remainingHiddenMenu.push(item);
    }
  }

  const nextFooter = [...(globals.footerLinks || [])];
  const remainingHiddenFooter = [];
  for (const item of globals.hiddenFooterLinks || []) {
    if (item._hiddenFor === targetPath) {
      const { _hiddenFor, _index, ...cleanItem } = item;
      const pos = typeof _index === 'number' && _index >= 0 && _index <= nextFooter.length ? _index : nextFooter.length;
      nextFooter.splice(pos, 0, cleanItem);
      globalsChanged = true;
      restoredPlaces++;
    } else {
      remainingHiddenFooter.push(item);
    }
  }

  if (globalsChanged) {
    const nextGlobals = { ...globals, menu: nextMenu, footerLinks: nextFooter };
    if (remainingHiddenMenu.length) nextGlobals.hiddenMenu = remainingHiddenMenu;
    else delete nextGlobals.hiddenMenu;
    if (remainingHiddenFooter.length) nextGlobals.hiddenFooterLinks = remainingHiddenFooter;
    else delete nextGlobals.hiddenFooterLinks;
    await ctx.setGlobals(nextGlobals);
  }

  if (restoredPlaces === 0) {
    return {
      ok: true,
      summary: `Pozycja „${target.label}” (${targetPath}) była już widoczna (brak ukrytych miejsc do przywrócenia).`,
      changedPages: [],
    };
  }

  return {
    ok: true,
    summary: `Przywrócono widoczność „${target.label}” (${targetPath}) w ${restoredPlaces} miejscach na stronach: ${changedPages.join(', ')}${globalsChanged ? ' oraz w menu/stopce' : ''}.`,
    changedPages,
    restoredPlaces,
  };
}

export const tools = [
  {
    name: 'zmien_kafelek',
    description:
      'Zmienia tytuł, opis lub zdjęcie wybranego kafelka WSZĘDZIE, gdzie prowadzi do tej samej strony (strona główna, Oferta, kategoria nadrzędna, pigułki kategorii).',
    parameters: {
      type: 'object',
      properties: {
        cel: {
          type: 'string',
          description: 'Nazwa kafelka albo nazwa/ścieżka strony, do której kafelek prowadzi (np. „Okna PCV”, „Rolety zewnętrzne”).',
        },
        tytul: {
          type: 'string',
          description: 'Opcjonalny nowy tytuł na kafelku.',
        },
        opis: {
          type: 'string',
          description: 'Opcjonalny nowy krótki opis na kafelku (pusty tekst usuwa opis).',
        },
        zdjecie: {
          type: 'string',
          description: 'Opcjonalna ścieżka do nowego zdjęcia (np. „img/products/okno.webp”).',
        },
      },
      required: ['cel'],
    },
  },
  {
    name: 'usun_kafelek',
    description:
      'Usuwa wskazany kafelek z jednej wybranej strony, zostawiając samą stronę docelową. Gdy kafelek prowadzi do istniejącej podstrony, pyta czy usunąć tylko kafelek czy też całą stronę.',
    parameters: {
      type: 'object',
      properties: {
        strona: {
          type: 'string',
          description: 'Nazwa lub ścieżka strony, z której usunąć kafelek (np. „strona główna”, „Oferta”, „Osłony okienne”).',
        },
        kafelek: {
          type: 'string',
          description: 'Tytuł kafelka lub ścieżka docelowa do usunięcia.',
        },
        usun_strone: {
          type: 'boolean',
          description: 'Opcjonalnie: false = usuń tylko kafelek (strona zostaje), true = usuń całą stronę docelową przez usun_pozycje_oferty.',
        },
      },
      required: ['strona', 'kafelek'],
    },
  },
  {
    name: 'ukryj_pozycje',
    description:
      'Chowa (ukryj=true) lub ponownie pokazuje (ukryj=false) pozycję oferty lub podstronę we wszystkich miejscach naraz (kafelki, pigułki, menu, stopka, pasek boczny, nawigacja produktów, linki), bez usuwania samej strony.',
    parameters: {
      type: 'object',
      properties: {
        strona: {
          type: 'string',
          description: 'Nazwa lub ścieżka pozycji do ukrycia lub pokazania.',
        },
        ukryj: {
          type: 'boolean',
          description: 'true = ukryj wszędzie, false = pokaż z powrotem.',
        },
      },
      required: ['strona', 'ukryj'],
    },
  },
];

export async function run(name, args, ctx) {
  if (name === 'zmien_kafelek') return handleZmienKafelek(args || {}, ctx);
  if (name === 'usun_kafelek') return handleUsunKafelek(args || {}, ctx);
  if (name === 'ukryj_pozycje') return handleUkryjPozycje(args || {}, ctx);
  return { ok: false, error: `Nieznane narzędzie: ${name}` };
}
