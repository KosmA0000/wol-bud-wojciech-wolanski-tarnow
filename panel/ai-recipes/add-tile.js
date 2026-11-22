// Przepis D2: dodaj kafelek w istniejącej siatce kafelków na wskazanej stronie (klonuje sąsiedni kafelek).

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

async function loadPageEntries(ctx) {
  const pages = ctx.listPages();
  const entries = [];
  for (const p of pages) {
    const html = await ctx.readPage(p.path);
    if (!html) continue;
    const doc = ctx.parse(html);
    if (isRedirectDoc(doc)) continue;
    entries.push({
      ...p,
      doc,
      html,
      displayLabel: getPageLabel(p, doc),
      docTitle: doc?.title || p.title || '',
    });
  }
  return entries;
}

function resolvePage(query, pages) {
  const qRaw = String(query || '').trim();
  if (!qRaw) return { error: 'Podaj nazwę lub ścieżkę strony, na której dodać kafelek.' };
  const qNorm = normText(qRaw);

  if (qNorm === 'home' || qNorm === 'strona glowna' || qNorm === 'glowna' || qRaw === '/') {
    const home = pages.find((p) => p.path === 'index.html');
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
  for (const p of pages) {
    if (pathCandidates.has(p.path)) return { match: p };
  }

  const exact = pages.filter((p) => {
    const lbl = normText(p.displayLabel || p.label);
    const pLbl = normText(p.label);
    const tBase = normText(String(p.docTitle || p.title || '').split('|')[0]);
    return lbl === qNorm || pLbl === qNorm || tBase === qNorm;
  });
  if (exact.length === 1) return { match: exact[0] };
  if (exact.length > 1) return { ambiguous: exact };

  const partial = pages.filter((p) => {
    const hay = `${normText(p.displayLabel || p.label)} ${normText(p.label)} ${normText(p.docTitle || p.title)} ${normText(p.path)}`;
    return hay.includes(qNorm);
  });
  if (partial.length === 1) return { match: partial[0] };
  if (partial.length > 1) return { ambiguous: partial };

  return { error: `Nie znaleziono strony „${qRaw}”.` };
}

const KNOWN_GRIDS = [
  { selector: '.home-catalog-grid', key: 'kategorie', label: 'Kategorie produktów (główna siatka kafelków)' },
  { selector: '.home-extra-categories', key: 'dodatkowe', label: 'Dodatkowe kategorie (pigułki)' },
  { selector: '.home-featured-grid', key: 'polecane', label: 'Polecane produkty (Warto sprawdzić)' },
  { selector: '.home-services-grid', key: 'uslugi', label: 'Usługi montażowe i serwisowe' },
  { selector: '.realization-cards', key: 'realizacje', label: 'Realizacje' },
  { selector: '.subcat-grid', key: 'podkategorie', label: 'Podkategorie' },
  { selector: '.cat-products-grid', key: 'produkty', label: 'Produkty w kategorii' },
];

function findGridSections(doc) {
  const sections = [];
  const usedEls = new Set();

  for (const def of KNOWN_GRIDS) {
    for (const el of doc.querySelectorAll(def.selector)) {
      if (usedEls.has(el) || !el.firstElementChild) continue;
      usedEls.add(el);
      const heading = el.closest('section')?.querySelector('h2, h3')?.textContent?.trim();
      const label = heading ? `${def.label} — „${heading}”` : def.label;
      sections.push({ el, key: def.key, label, selector: def.selector });
    }
  }

  if (sections.length === 0) {
    const main = doc.querySelector('main') || doc.body;
    for (const el of main.querySelectorAll('[class*="grid"], [class*="cards"]')) {
      if (usedEls.has(el)) continue;
      if (el.closest('aside.subpage-sidebar, .cat-quick-nav, header, footer')) continue;
      if (el.classList.contains('subpage-grid')) continue;
      const item = el.firstElementChild;
      if (!item || !item.matches('a, article, details, div')) continue;
      if (!item.querySelector('a[href], h3, h4') && !item.matches('a[href]')) continue;
      usedEls.add(el);
      const heading = el.closest('section')?.querySelector('h2, h3')?.textContent?.trim();
      sections.push({
        el,
        key: el.className.split(/\s+/)[0] || 'siatka',
        label: heading ? `Siatka kafelków („${heading}”)` : `Siatka kafelków (${el.className.split(/\s+/)[0]})`,
        selector: '.' + el.className.split(/\s+/)[0],
      });
    }
  }

  return sections;
}

function matchSection(sekcjaQuery, sections) {
  const q = normText(sekcjaQuery);
  const exact = sections.filter((s) => normText(s.label) === q || normText(s.key) === q);
  if (exact.length === 1) return { match: exact[0] };

  const byLabel = sections.filter((s) => normText(s.label).includes(q));
  if (byLabel.length === 1) return { match: byLabel[0] };
  if (byLabel.length > 1) return { ambiguous: byLabel };

  const byKey = sections.filter((s) => normText(s.key).includes(q) || q.includes(normText(s.key)));
  if (byKey.length === 1) return { match: byKey[0] };
  if (byKey.length > 1) return { ambiguous: byKey };

  return { notFound: true };
}

async function resolveLinkTarget(rawLink, hostPagePath, pages) {
  const raw = String(rawLink || '').trim();
  if (!raw) return { href: '#' };
  if (raw.startsWith('#') || /^(?:https?:|mailto:|tel:)/i.test(raw)) {
    return { href: raw };
  }

  const hashIdx = raw.indexOf('#');
  const linkBase = (hashIdx >= 0 ? raw.slice(0, hashIdx) : raw).trim();
  const hashPart = hashIdx >= 0 ? raw.slice(hashIdx) : '';

  const found = resolvePage(linkBase, pages);
  if (found.match) {
    return { href: toRel(found.match.path, hostPagePath) + hashPart, targetPage: found.match };
  }
  if (found.ambiguous) {
    return { ambiguous: found.ambiguous, raw };
  }

  return { missing: raw };
}

function updateClonedTile(clone, { tytul, opis, href, imgRel, hasCustomImage }) {
  // 1. Tytuł
  if (clone.classList.contains('home-extra-category')) {
    const spans = clone.querySelectorAll('span');
    if (spans.length >= 2) {
      spans[0].textContent = tytul;
    } else {
      const arrow = clone.querySelector('span[aria-hidden="true"]');
      clone.textContent = '';
      clone.append(clone.ownerDocument.createTextNode(`${tytul} `));
      if (arrow) clone.append(arrow);
      else {
        const sp = clone.ownerDocument.createElement('span');
        sp.setAttribute('aria-hidden', 'true');
        sp.textContent = '↗';
        clone.append(sp);
      }
    }
  } else {
    const titleEl =
      clone.querySelector('.cat-prod-title a') ||
      clone.querySelector('.cat-prod-title') ||
      clone.querySelector('summary h4') ||
      clone.querySelector('h3, h4, h2');
    if (titleEl) titleEl.textContent = tytul;
  }

  // 2. Opis
  const descEl = clone.querySelector('.home-service-item-teaser, .home-featured-copy p, p');
  if (opis !== undefined && opis !== null && String(opis).trim() !== '') {
    const cleanOpis = String(opis).trim();
    if (descEl) {
      descEl.textContent = cleanOpis;
    } else if (!clone.classList.contains('home-extra-category') && !clone.classList.contains('realization-card')) {
      const body = clone.querySelector('.home-cat-body, .subcat-card-body, .cat-prod-body, .home-featured-copy') || clone;
      const p = clone.ownerDocument.createElement('p');
      p.textContent = cleanOpis;
      const cta = body.querySelector('.home-cat-cta, .cat-prod-btn, .arr');
      if (cta) body.insertBefore(p, cta);
      else body.appendChild(p);
    }
  } else if (descEl) {
    descEl.remove();
  }

  // 3. Link
  if (clone.matches('a[href]')) {
    clone.setAttribute('href', href);
  }
  for (const a of clone.querySelectorAll('a[href]')) {
    a.setAttribute('href', href);
  }
  for (const a of clone.querySelectorAll('a[aria-label]')) {
    a.setAttribute('aria-label', a.classList.contains('arr') ? `Dowiedz się więcej: ${tytul}` : tytul);
  }

  // 4. Zdjęcie
  const img = clone.querySelector('img');
  if (img) {
    if (hasCustomImage || imgRel) {
      img.setAttribute('src', imgRel);
      for (const attr of ['data-src', 'data-lightbox-src']) {
        if (img.hasAttribute(attr)) img.setAttribute(attr, imgRel);
      }
    }
    img.removeAttribute('srcset');
    img.removeAttribute('sizes');
    img.removeAttribute('width');
    img.removeAttribute('height');
    img.closest('picture')?.querySelectorAll('source').forEach((s) => s.remove());
    img.setAttribute('alt', tytul);
  }
  clone.removeAttribute('id');
  clone.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
}

export const tools = [
  {
    name: 'dodaj_kafelek',
    description:
      'Dodaje nowy kafelek (kartę lub pigułkę) w istniejącej siatce kafelków na wskazanej stronie, klonując sąsiedni kafelek i podmieniając tekst, link i zdjęcie. Gdy na stronie jest kilka sekcji z kafelkami i nie podano sekcji — pyta o wybór. Gdy link wskazuje nieistniejącą stronę — pyta, czy ją utworzyć.',
    parameters: {
      type: 'object',
      properties: {
        strona: {
          type: 'string',
          description: 'Nazwa lub ścieżka strony, na której dodać kafelek (np. „strona główna”, „Oferta”, „Osłony okienne”, „index.html”).',
        },
        sekcja: {
          type: 'string',
          description: 'Opcjonalna nazwa sekcji z kafelkami, jeśli na stronie jest ich kilka (np. „Kategorie produktów”, „Polecane produkty”).',
        },
        tytul: {
          type: 'string',
          description: 'Tytuł nowego kafelka.',
        },
        opis: {
          type: 'string',
          description: 'Opcjonalny krótki opis na kafelku.',
        },
        link: {
          type: 'string',
          description: 'Opcjonalny docelowy adres (ścieżka strony, nazwa istniejącej podstrony, #kotwica lub URL zewnętrzny).',
        },
        zdjecie: {
          type: 'string',
          description: 'Opcjonalna ścieżka do zdjęcia (np. „img/products/okno.webp”).',
        },
      },
      required: ['strona', 'tytul'],
    },
  },
];

export async function run(name, args, ctx) {
  if (name !== 'dodaj_kafelek') {
    return { ok: false, error: `Nieznane narzędzie: ${name}` };
  }

  const pages = await loadPageEntries(ctx);
  if (!args.strona || !String(args.strona).trim()) {
    return {
      ok: false,
      needsAnswer: 'Na której stronie chcesz dodać kafelek?',
      options: ['Strona główna (index.html)', 'Oferta (oferta/index.html)', ...pages.filter((p) => p.path.startsWith('kategorie/')).slice(0, 6).map((p) => `${p.displayLabel} (${p.path})`)],
    };
  }

  const hostFound = resolvePage(args.strona, pages);
  if (hostFound.error) return { ok: false, error: hostFound.error };
  if (hostFound.ambiguous) {
    return {
      ok: false,
      needsAnswer: `Znalazłem kilka stron pasujących do „${args.strona}”. Na której dodać kafelek?`,
      options: hostFound.ambiguous.slice(0, 8).map((p) => `${p.displayLabel} (${p.path})`),
    };
  }

  const hostPage = hostFound.match;
  const tytul = String(args.tytul || '').trim();
  if (!tytul) {
    return {
      ok: false,
      needsAnswer: `Jaki tytuł ma mieć nowy kafelek na stronie „${hostPage.displayLabel}”?`,
    };
  }
  const hostHtml = hostPage.html;
  if (!hostHtml) return { ok: false, error: `Nie udało się odczytać strony „${hostPage.path}”.` };

  const doc = hostPage.doc;
  const sections = findGridSections(doc);
  if (sections.length === 0) {
    return {
      ok: false,
      error: `Na stronie „${hostPage.displayLabel}” nie znaleziono żadnej siatki kafelków do sklonowania.`,
    };
  }

  let chosenSection = sections[0];
  if (args.sekcja && String(args.sekcja).trim()) {
    const matched = matchSection(args.sekcja, sections);
    if (matched.match) {
      chosenSection = matched.match;
    } else {
      const list = matched.ambiguous || sections;
      return {
        ok: false,
        needsAnswer: `Nie mam pewności, o którą sekcję chodzi na „${hostPage.displayLabel}”. Wybierz sekcję dla kafelka „${tytul}”:`,
        options: list.map((s) => s.label),
      };
    }
  } else if (sections.length > 1) {
    return {
      ok: false,
      needsAnswer: `Na stronie „${hostPage.displayLabel}” jest kilka sekcji z kafelkami. W której dodać kafelek „${tytul}”?`,
      options: sections.map((s) => s.label),
    };
  }

  const linkRes = await resolveLinkTarget(args.link, hostPage.path, pages);
  if (linkRes.ambiguous) {
    return {
      ok: false,
      needsAnswer: `Znalazłem kilka stron pasujących do linku „${linkRes.raw}”. Którą podpiąć?`,
      options: linkRes.ambiguous.slice(0, 8).map((p) => `${p.displayLabel} (${p.path})`),
    };
  }
  if (linkRes.missing) {
    return {
      ok: false,
      needsAnswer: `Strona docelowa „${linkRes.missing}” jeszcze nie istnieje. Czy najpierw utworzyć tę stronę, czy dodać kafelek z pustym linkiem „#” do uzupełnienia?`,
      options: [
        `Tak, utwórz stronę „${linkRes.missing}”`,
        'Dodaj kafelek z linkiem „#” (bez tworzenia strony)',
      ],
    };
  }

  const templateTile = chosenSection.el.lastElementChild;
  if (!templateTile) {
    return { ok: false, error: `Sekcja „${chosenSection.label}” jest pusta — nie ma sąsiedniego kafelka do sklonowania.` };
  }

  let imgRel = '';
  let hasCustomImage = false;
  if (args.zdjecie && String(args.zdjecie).trim()) {
    const rawImg = String(args.zdjecie).trim();
    hasCustomImage = true;
    imgRel = /^(?:https?:|data:)/i.test(rawImg) ? rawImg : toRel(normPath(rawImg), hostPage.path);
  } else if (templateTile.querySelector('img')) {
    imgRel = toRel('img/placeholder-photo.svg', hostPage.path);
  }

  const clone = templateTile.cloneNode(true);
  updateClonedTile(clone, {
    tytul,
    opis: args.opis,
    href: linkRes.href,
    imgRel,
    hasCustomImage,
  });

  chosenSection.el.appendChild(clone);
  await ctx.writePage(hostPage.path, ctx.serialize(doc));

  return {
    ok: true,
    summary: `Dodano kafelek „${tytul}” w sekcji „${chosenSection.label}” na stronie „${hostPage.displayLabel}” (klon sąsiedniego kafelka, link: ${linkRes.href}).`,
    changedPages: [hostPage.path],
  };
}
