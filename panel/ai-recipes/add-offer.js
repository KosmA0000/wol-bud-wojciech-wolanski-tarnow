const TOOL_NAME = 'dodaj_pozycje_oferty';
const KINDS = ['kategoria', 'podkategoria', 'produkt'];
const OFFER_PAGES = ['index.html', 'oferta/index.html'];
const SITE_ORIGIN = 'https://wolbud.local.invalid';
const PLACEHOLDER = 'img/placeholder-photo.svg';

export const tools = [{
  name: TOOL_NAME,
  description: 'Dodaje kategorię, podkategorię lub produkt na podstawie istniejącej strony. Łączy stronę z ofertą i jej nawigacją. Gdy brakuje rodzaju lub strony nadrzędnej, zwraca pytanie z opcjami.',
  parameters: {
    type: 'object',
    required: ['nazwa'],
    properties: {
      nazwa: { type: 'string', description: 'Nazwa nowej pozycji oferty.' },
      rodzaj: { type: 'string', enum: KINDS, description: 'Rodzaj pozycji wybrany przez klienta.' },
      rodzic: { type: 'string', description: 'Nazwa lub ścieżka kategorii nadrzędnej dla podkategorii lub produktu.' },
      opis: { type: 'string', description: 'Opis przekazany przez klienta.' },
      zdjecie: { type: 'string', description: 'Ścieżka zdjęcia od katalogu głównego strony lub adres HTTP(S).' },
    },
  },
}];

function pagePath(href, from = '') {
  if (!href || href.startsWith('#')) return '';
  try {
    const url = new URL(href, SITE_ORIGIN + '/' + from);
    if (url.origin !== SITE_ORIGIN) return '';
    const path = decodeURIComponent(url.pathname.slice(1));
    return path.endsWith('/') || !path ? path + 'index.html' : path;
  } catch {
    return '';
  }
}

function hrefFrom(path, from) {
  return '../'.repeat(from.split('/').length - 1) + path;
}

function linkTo(root, path, from) {
  return [...root.querySelectorAll('a[href]')]
    .find((link) => pagePath(link.getAttribute('href'), from) === path);
}

function setImage(image, src, title) {
  image.setAttribute('src', src);
  image.setAttribute('alt', title);
  image.removeAttribute('srcset');
  image.removeAttribute('sizes');
  image.removeAttribute('width');
  image.removeAttribute('height');
  for (const attr of ['data-src', 'data-lightbox-src']) {
    if (image.hasAttribute(attr)) image.setAttribute(attr, src);
  }
  image.closest('picture')?.querySelectorAll('source').forEach((source) => source.remove());
}

function clonedLink(sample, path, from, title) {
  const link = sample.cloneNode(true);
  link.setAttribute('href', hrefFrom(path, from));
  link.classList.remove('is-active', 'is-current');
  link.removeAttribute('style');
  link.removeAttribute('aria-current');
  if (link.hasAttribute('aria-label')) link.setAttribute('aria-label', title);
  link.textContent = title;
  return link;
}

function setBreadcrumbs(doc, ancestors, path, title) {
  const breadcrumbs = doc.querySelector('.breadcrumbs');
  const home = breadcrumbs.querySelector('[data-home-link]').cloneNode(true);
  const separator = breadcrumbs.querySelector('span:not([aria-current])').cloneNode(true);
  const current = breadcrumbs.querySelector('[aria-current]').cloneNode(true);
  home.setAttribute('href', hrefFrom('index.html#oferta', path));
  current.textContent = title;
  breadcrumbs.replaceChildren(home);
  for (const item of [{ path: 'oferta/index.html', label: 'Oferta' }, ...ancestors]) {
    const link = doc.createElement('a');
    link.setAttribute('href', hrefFrom(item.path, path));
    link.textContent = item.label;
    breadcrumbs.append(separator.cloneNode(true), link);
  }
  breadcrumbs.append(separator, current);
}

function fillPage(doc, { path, title, description, photo, ancestors }) {
  const heading = doc.querySelector('h1');
  const oldHeading = heading.textContent.trim();
  const oldTitle = doc.title;
  doc.title = oldTitle.includes(' | ') ? title + oldTitle.slice(oldTitle.lastIndexOf(' | ')) : title;
  heading.textContent = title;
  let meta = doc.querySelector('meta[name="description"]');
  if (!meta) {
    meta = doc.createElement('meta');
    meta.name = 'description';
    doc.head.append(meta);
  }
  meta.content = description || title;
  for (const property of ['og:title', 'og:description', 'og:image', 'og:url']) {
    doc.querySelector('meta[property="' + property + '"]')?.remove();
  }
  const canonical = doc.querySelector('link[rel="canonical"]');
  if (canonical) canonical.setAttribute('href', hrefFrom(path, path));

  setBreadcrumbs(doc, ancestors, path, title);
  const eyebrow = doc.querySelector('.subpage-head .eyebrow');
  if (eyebrow && ancestors.length) eyebrow.textContent = ancestors.at(-1).label;
  const lead = doc.querySelector('.subpage-lead');
  if (lead) lead.textContent = description;

  const descriptionBody = doc.querySelector('.source-content-body');
  if (descriptionBody) {
    const paragraph = doc.createElement('p');
    paragraph.textContent = description;
    descriptionBody.replaceChildren(paragraph);
    if (!description) descriptionBody.closest('details')?.remove();
  }

  const content = doc.querySelector('.subpage-content');
  const keep = '.product-gallery, .category-feature, .source-content-disclosure, .product-nav-bar, .cta-banner-dark, .cat-products-grid, .subcat-grid';
  for (const child of [...content.children]) {
    if (!child.matches(keep)) child.remove();
  }
  for (const grid of content.querySelectorAll('.cat-products-grid, .subcat-grid')) {
    grid.replaceChildren();
  }

  const gallery = content.querySelector('.product-gallery');
  const thumbs = gallery?.querySelectorAll('.product-gallery-thumb');
  if (thumbs?.length) {
    thumbs.forEach((thumb, index) => {
      if (index > 0) thumb.remove();
    });
    const thumb = thumbs[0];
    thumb.setAttribute('data-index', '0');
    thumb.setAttribute('aria-label', 'Pokaż zdjęcie 1 z 1: ' + title);
    thumb.setAttribute('aria-current', 'true');
    thumb.classList.add('is-active');
    thumb.setAttribute('data-src', photo);
    thumb.removeAttribute('data-ratio');
    thumb.style.removeProperty('--gallery-ratio');
  }
  for (const image of content.querySelectorAll('.product-gallery img, .category-feature img')) {
    setImage(image, photo, title);
  }
  for (const node of content.querySelectorAll('.product-gallery [aria-label]')) {
    const label = node.getAttribute('aria-label');
    if (oldHeading && label.includes(oldHeading)) {
      node.setAttribute('aria-label', label.replaceAll(oldHeading, title));
    }
  }
  return { title: doc.title, description: meta.content };
}

function appendCard(doc, gridSelector, cardSelector, fallback, item) {
  let grid = doc.querySelector(gridSelector);
  const sample = (grid && [...grid.querySelectorAll(cardSelector)].at(-1)) || fallback?.querySelector(cardSelector);
  if (!sample) return false;

  if (!grid) {
    const content = doc.querySelector('.subpage-content');
    if (!content) return false;
    grid = fallback.cloneNode(false);
    grid.removeAttribute('id');
    content.prepend(grid);
  }
  const card = sample.cloneNode(true);
  card.removeAttribute('id');
  const links = card.matches('a[href]') ? [card] : card.querySelectorAll('a[href]');
  for (const link of links) {
    link.setAttribute('href', hrefFrom(item.path, item.host));
    if (link.hasAttribute('aria-label')) link.setAttribute('aria-label', item.title);
  }
  const heading = card.querySelector('h3 a') || card.querySelector('h3');
  if (heading) heading.textContent = item.title;
  const image = card.querySelector('img');
  if (image) setImage(image, item.imageFrom(item.host), item.title);
  const copy = card.querySelector('.home-cat-body p, .subcat-card-body p, .cat-prod-body p');
  if (copy) copy.textContent = item.description;
  grid.append(card);
  return true;
}

function appendOfferPill(doc, fallback, path, host, title) {
  let grid = doc.querySelector('.home-extra-categories');
  const sample = grid?.querySelector('.home-extra-category') || fallback?.querySelector('.home-extra-category');
  if (!sample) return false;
  if (!grid) {
    const cards = doc.querySelector('.home-catalog-grid');
    if (!cards) return false;
    grid = fallback.cloneNode(false);
    grid.removeAttribute('id');
    cards.after(grid);
  }
  const pill = sample.cloneNode(true);
  pill.setAttribute('href', hrefFrom(path, host));
  const arrow = pill.querySelector('[aria-hidden]');
  const label = pill.querySelector('span:not([aria-hidden])');
  if (label) label.textContent = title;
  else if (arrow) pill.replaceChildren(title + ' ', arrow);
  else pill.textContent = title;
  grid.append(pill);
  return true;
}

function appendCategoryLinks(doc, host, path, title) {
  let changed = false;
  const pills = doc.querySelector('.cat-quick-nav-pills');
  const pill = pills && [...pills.querySelectorAll('a.cat-nav-pill')]
    .findLast((link) => /^kategorie\//.test(pagePath(link.getAttribute('href'), host)));
  if (pill && !linkTo(pills, path, host)) {
    const newPill = clonedLink(pill, path, host, title);
    newPill.classList.toggle('is-active', host === path);
    pill.after(newPill);
    changed = true;
  }
  for (const list of doc.querySelectorAll('.subpage-sidebar .sidebar-links')) {
    const sample = [...list.querySelectorAll('li > a[href]')]
      .findLast((link) => /^kategorie\//.test(pagePath(link.getAttribute('href'), host)));
    if (!sample || linkTo(list, path, host)) continue;
    const item = sample.parentElement.cloneNode(false);
    item.append(clonedLink(sample, path, host, title));
    sample.parentElement.after(item);
    changed = true;
  }
  return changed;
}

function productButton(sample, path, host, label, direction) {
  const button = sample.cloneNode(true);
  button.classList.remove('pnav-prev', 'pnav-next');
  button.classList.add('pnav-' + direction);
  button.setAttribute('href', hrefFrom(path, host));
  button.querySelector('small').textContent = direction === 'prev' ? '← Poprzedni produkt' : 'Następny produkt →';
  button.querySelector('span').textContent = label;
  return button;
}

export async function run(name, args, ctx) {
  if (name !== TOOL_NAME) return { ok: false, error: 'Nieznany przepis: ' + name };
  const title = args.nazwa?.trim();
  const kind = args.rodzaj;
  if (!title) return { ok: false, needsAnswer: 'Jak ma się nazywać nowa pozycja oferty?' };
  if (!KINDS.includes(kind)) {
    return { ok: false, needsAnswer: 'Czy „' + title + '” ma być kategorią, podkategorią czy produktem?', options: KINDS };
  }

  const slug = ctx.slugify(title);
  if (!slug) return { ok: false, error: 'Z tej nazwy nie da się utworzyć adresu strony.' };
  const prefix = kind === 'produkt' ? 'produkty' : 'kategorie';
  const path = prefix + '/' + slug + '/index.html';
  const pages = ctx.listPages();
  if (pages.some((page) => page.path === path) || await ctx.readPage(path)) {
    return { ok: false, error: 'Strona „' + path + '” już istnieje. Podaj inną nazwę.' };
  }

  const cache = new Map();
  const read = (path) => {
    if (!cache.has(path)) {
      cache.set(path, ctx.readPage(path).then((html) => {
        return { html, doc: html ? ctx.parse(html) : null };
      }));
    }
    return cache.get(path);
  };
  const sections = await Promise.all(pages.filter((page) => /^kategorie\/[^/]+\/index\.html$/.test(page.path))
    .map(async (page) => ({ ...page, ...await read(page.path) })));
  const categories = sections.filter(({ doc }) => doc?.querySelector('main h1') && !doc.querySelector('meta[http-equiv="refresh" i]'));
  for (const category of categories) {
    const heading = category.doc.querySelector('main h1');
    category.label = category.label || heading.textContent.trim();
    category.parent = categories.find((candidate) => {
      if (candidate === category) return false;
      const grid = candidate.doc.querySelector('.subcat-grid');
      return grid && linkTo(grid, category.path, candidate.path);
    });
    if (!category.parent) {
      const links = [...category.doc.querySelectorAll('.breadcrumbs a[href]')];
      const parentPath = links.map((link) => pagePath(link.getAttribute('href'), category.path)).at(-1);
      category.parent = categories.find((candidate) => candidate !== category && candidate.path === parentPath);
    }
  }

  const parents = kind === 'podkategoria' ? categories.filter((page) => !page.parent) : categories;
  const parentQuery = args.rodzic?.trim() || '';
  const parentSlug = parentQuery ? ctx.slugify(parentQuery) : '';
  const parentMatches = parentSlug ? parents.filter((page) => {
    return ctx.slugify(page.label) === parentSlug || page.path.split('/')[1] === parentSlug;
  }) : [];
  const parent = parents.find((page) => page.path === pagePath(parentQuery))
    || (parentMatches.length === 1 ? parentMatches[0] : null);
  if (kind !== 'kategoria' && !parent) {
    return {
      ok: false,
      needsAnswer: 'Do której kategorii dodać „' + title + '”?',
      options: parents.map((page) => page.label),
    };
  }

  const description = args.opis?.trim() || '';
  let photo = args.zdjecie?.trim() || PLACEHOLDER;
  const externalPhoto = /^https?:\/\//i.test(photo);
  if (!externalPhoto) {
    photo = photo.replace(/^\/+/, '');
    if (/[:\\]/.test(photo) || photo.split('/').includes('..')) {
      return { ok: false, error: 'Podaj ścieżkę zdjęcia od katalogu strony lub adres HTTP(S).' };
    }
  }
  const imageFrom = (host) => externalPhoto ? photo : hrefFrom(photo, host);
  const item = { path, title, description, imageFrom };
  const changes = new Map();

  let template;
  let previous = '';
  let previousLabel = '';
  if (kind === 'produkt') {
    const catalog = [...parent.doc.querySelectorAll('.cat-prod-card .cat-prod-title a[href]')];
    const lastCard = catalog.at(-1);
    previous = lastCard ? pagePath(lastCard.getAttribute('href'), parent.path) : '';
    previousLabel = lastCard?.textContent.trim();
    const productPaths = [...new Set([
      previous,
      ...pages.map((page) => page.path).filter((path) => /^produkty\/[^/]+\/index\.html$/.test(path)),
    ].filter(Boolean))];
    for (const candidate of productPaths) {
      const source = await read(candidate);
      if (source.doc?.querySelector('.product-gallery') && source.doc.querySelector('.product-nav-bar .pnav-all')
          && (!previous || source.doc.querySelector('.product-nav-bar .pnav-btn'))) {
        template = { path: candidate, ...source };
        break;
      }
    }
  } else {
    const sameType = categories.filter((page) => Boolean(page.parent) === (kind === 'podkategoria'));
    const siblings = sameType.filter((page) => page.parent === parent || (!parent && !page.parent));
    template = siblings.find((page) => page.doc.querySelector('.category-feature img')) || siblings[0]
      || sameType.find((page) => page.doc.querySelector('.category-feature img')) || sameType[0];
  }
  if (!template) return { ok: false, error: 'Brak istniejącej strony tego rodzaju do skopiowania.' };

  const doc = ctx.parse(ctx.rebaseUrls(template.html, template.path, path));
  if (!doc.querySelector('main h1') || !doc.querySelector('.subpage-content')
      || !doc.querySelector('.breadcrumbs [data-home-link]') || !doc.querySelector('.breadcrumbs span:not([aria-current])')
      || !doc.querySelector('.breadcrumbs [aria-current]')) {
    return { ok: false, error: 'Strona wzorcowa nie ma nagłówka, treści lub okruszków potrzebnych do skopiowania.' };
  }
  if (kind !== 'produkt' && args.zdjecie && !doc.querySelector('.category-feature img')) {
    const figure = categories.map((page) => page.doc.querySelector('.category-feature'))
      .find((feature) => feature?.querySelector('img'));
    if (figure) doc.querySelector('.subpage-content').prepend(figure.cloneNode(true));
  }
  const ancestors = kind === 'kategoria' ? [] : [parent.parent, parent].filter(Boolean);
  const metadata = fillPage(doc, { ...item, photo: imageFrom(path), ancestors });
  changes.set(path, { doc, opts: { ...metadata, label: title } });

  const places = [];
  if (kind !== 'kategoria') {
    const gridSelector = kind === 'produkt' ? '.cat-products-grid' : '.subcat-grid';
    const cardSelector = kind === 'produkt' ? '.cat-prod-card' : '.subcat-card';
    const fallback = categories.map((page) => page.doc.querySelector(gridSelector))
      .find((grid) => grid?.querySelector(cardSelector));
    if (!appendCard(parent.doc, gridSelector, cardSelector, fallback, { ...item, host: parent.path })) {
      return { ok: false, error: 'Brak kafelka tego rodzaju do skopiowania na stronie „' + parent.label + '”.' };
    }
    changes.set(parent.path, { doc: parent.doc });
    places.push('kafelek na stronie „' + parent.label + '”');
  }

  if (kind !== 'produkt') {
    const home = (await read(OFFER_PAGES[0])).doc;
    const pills = home?.querySelector('.home-extra-categories');
    for (const host of OFFER_PAGES) {
      const { doc: offer } = await read(host);
      if (!offer) return { ok: false, error: 'Nie udało się odczytać strony „' + host + '”.' };
      const updated = kind === 'kategoria'
        ? appendCard(offer, '.home-catalog-grid', '.home-cat-card', null, { ...item, host })
        : appendOfferPill(offer, pills, path, host, title);
      if (!updated) return { ok: false, error: 'Brak wzoru kafelka lub pigułki na stronie „' + host + '”.' };
      changes.set(host, { doc: offer });
    }
    places.push(kind === 'kategoria' ? 'kafelki na stronie głównej i w Ofercie' : 'pigułki na stronie głównej i w Ofercie');
  }

  let globals;
  if (kind === 'kategoria') {
    const oldPill = linkTo(doc.querySelector('.cat-quick-nav-pills') || doc, template.path, path);
    if (oldPill?.matches('.cat-nav-pill')) {
      oldPill.classList.remove('is-active');
      oldPill.removeAttribute('aria-current');
    }
    for (const link of doc.querySelectorAll('.subpage-sidebar .sidebar-links a[style]')) {
      if (pagePath(link.getAttribute('href'), path) === template.path) link.removeAttribute('style');
    }
    appendCategoryLinks(doc, path, path, title);
    const others = await Promise.all(pages.filter((page) => !OFFER_PAGES.includes(page.path))
      .map(async (page) => ({ ...page, ...await read(page.path) })));
    let linked = 0;
    for (const page of others) {
      if (page.doc && appendCategoryLinks(page.doc, page.path, path, title)) {
        changes.set(page.path, { doc: page.doc });
        linked++;
      }
    }
    if (linked) places.push('pasek kategorii i boczna nawigacja na ' + linked + ' podstronach');

    const currentGlobals = ctx.getGlobals();
    const menu = [...(currentGlobals.menu || [])];
    const categoryPaths = new Set(categories.filter((page) => !page.parent).map((page) => page.path));
    const lastCategory = menu.findLastIndex((entry) => categoryPaths.has(pagePath(entry.href)));
    if (lastCategory >= 0 && !menu.some((entry) => pagePath(entry.href) === path)) {
      menu.splice(lastCategory + 1, 0, { label: title, href: path, mobileHref: '' });
      globals = { ...currentGlobals, menu };
      places.push('menu główne');
    }
  }

  if (kind === 'produkt') {
    const nav = doc.querySelector('.product-nav-bar');
    const all = nav.querySelector('.pnav-all');
    const sample = nav.querySelector('.pnav-btn');
    all.setAttribute('href', hrefFrom(parent.path, path));
    all.textContent = 'Wszystkie z kategorii ' + parent.label + ' ↗';
    nav.querySelectorAll('.pnav-btn').forEach((button) => button.remove());
    if (previous) {
      const { doc: previousDoc } = await read(previous);
      const previousNav = previousDoc?.querySelector('.product-nav-bar');
      if (!previousNav || !sample) {
        return { ok: false, error: 'Nie udało się podpiąć nawigacji poprzedniego produktu.' };
      }
      all.before(productButton(sample, previous, path, previousLabel || previous, 'prev'));
      previousNav.querySelector('.pnav-next')?.remove();
      previousNav.append(productButton(sample, path, previous, title, 'next'));
      changes.set(previous, { doc: previousDoc });
    }
    places.push('nawigacja produktów w kategorii');
  }

  for (const [page, { doc, opts }] of changes) {
    await ctx.writePage(page, ctx.serialize(doc), opts);
  }
  if (globals) await ctx.setGlobals(globals);

  return {
    ok: true,
    summary: 'Dodano „' + title + '” w szkicu. Zmienione miejsca: nowa strona z okruszkami, ' + places.join(', ') + '.',
    changedPages: [...changes.keys()],
  };
}
