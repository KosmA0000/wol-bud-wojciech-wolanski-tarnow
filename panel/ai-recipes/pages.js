import { hrefFrom, pagePath, productButton, run as addOffer, setImage } from './add-offer.js?v=turbo32';
import { kindOf as siteKind, parentOf } from './knowledge.js?v=turbo32';

const ADD = 'dodaj_podstrone';
const COPY = 'duplikuj_strone';
const CATALOG = ['kategoria', 'podkategoria', 'produkt'];
const KINDS = ['promocja', 'informacyjna', 'lista promocji', ...CATALOG];
const PROMOTIONS = 'promocje/index.html';

export const tools = [{
  name: ADD,
  description: 'Tworzy podstronę z istniejącej analogicznej strony. Gdy podasz stronę i grupę, stosuje rodzaj, układ i wszystkie odnośniki wymagane przez tę grupę.',
  parameters: {
    type: 'object',
    required: ['nazwa'],
    properties: {
      nazwa: { type: 'string' },
      rodzaj: { type: 'string', description: 'Np. promocja, informacyjna, lista promocji, kategoria, podkategoria lub produkt.' },
      wzor: { type: 'string', description: 'Opcjonalna nazwa lub ścieżka analogicznej strony.' },
      rodzic: { type: 'string', description: 'Kategoria nadrzędna podkategorii lub produktu.' },
      opis: { type: 'string', description: 'Treść podana przez klienta.' },
      zdjecie: { type: 'string', description: 'Ścieżka zdjęcia od katalogu głównego strony albo URL HTTP(S).' },
      strona: { type: 'string', description: 'Ścieżka strony, na której znajduje się grupa nowych odnośników.' },
      grupa: { type: 'string', description: 'Nazwa albo selektor grupy reguł. Można podać ścieżkę i selektor jako strona::selektor.' },
      sekcja: { type: 'string', description: 'Nazwa sekcji z grupą na wskazanej stronie.' },
    },
  },
}, {
  name: COPY,
  description: 'Kopiuje istniejącą podstronę, jej układ i treść. Podpina kopię w tych samych miejscach co oryginał.',
  parameters: {
    type: 'object',
    required: ['strona', 'nowaNazwa'],
    properties: {
      strona: { type: 'string', description: 'Nazwa lub ścieżka strony źródłowej.' },
      nowaNazwa: { type: 'string' },
    },
  },
}];

function ask(needsAnswer, options = []) {
  return { ok: false, needsAnswer, options };
}

async function optionalSibling(promise) {
  try {
    return await promise;
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') return null;
    throw error;
  }
}

export async function recipeGroups(ctx) {
  const consistency = await optionalSibling(import('./consistency.js?v=spojnosc1'));
  return consistency ? consistency.analyzeGroups(ctx) : [];
}

const fold = (value) => String(value || '').trim().toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l');

function findElements(doc, selector) {
  try {
    return [...doc.querySelectorAll(selector)];
  } catch {
    return [];
  }
}

export function groupElements(doc, group) {
  const split = group.selector.lastIndexOf(' > ');
  return findElements(doc, split < 0 ? group.selector : group.selector.slice(0, split));
}

function linksInGroup(doc, group) {
  const roots = group.selector.includes(' > ') ? findElements(doc, group.selector) : groupElements(doc, group);
  return roots.flatMap((root) => root.matches('a[href]') ? [root] : [...root.querySelectorAll('a[href]')]);
}

export function findRecipeGroups(groups, { host, query, doc, section, block } = {}) {
  const [hostRef, selector] = String(query || '').trim().split('::');
  const selectors = selector ? [selector] : [hostRef];
  const scoped = groups.filter((group) => (!host || group.hostPage === host)
    && (!selector || group.hostPage === hostRef));
  if (section && doc) {
    return scoped.filter((group) => group.selector === section.selector
      || groupElements(doc, group).some((element) => element === section.el));
  }
  if (!hostRef) return scoped;
  const text = fold(selectors[0]);
  const exact = scoped.filter((group) => [group.selector, group.label].some((value) => fold(value) === text));
  if (exact.length) return exact;
  const container = scoped.filter((group) => doc && groupElements(doc, group).some((element) => {
    return [...element.classList].some((cls) => fold(cls) === text.replace(/^\./, ''));
  }));
  if (container.length) return container;
  const region = doc?.getElementById(selectors[0].replace(/^#/, ''));
  if (region) {
    const withContainer = scoped.flatMap((group) => groupElements(doc, group).map((element) => ({ group, element })));
    const firstGroup = [...region.querySelectorAll('*')].find((element) => withContainer.some((entry) => entry.element === element));
    if (firstGroup) return withContainer.filter((entry) => entry.element === firstGroup).map((entry) => entry.group);
  }
  return scoped.filter((group) => {
    if (fold(group.label).includes(text)) return true;
    return doc && groupElements(doc, group).some((element) => {
      const region = element.closest('section[id]');
      const name = region && fold(region.querySelector('h2, h3')?.textContent);
      if (region && (fold(region.id) === text || name === text)) return true;
      return block && [...element.children].some((child) => [...child.classList].some((cls) => fold(cls) === text));
    });
  });
}

export const groupOptions = (groups) => groups.map((group) => `${group.hostPage}::${group.selector}`);

async function groupModels(ctx, group) {
  const targets = [...new Set(group.members.map((member) => member.target).filter(Boolean))];
  const models = await Promise.all(targets.map(async (path) => {
    const html = await ctx.readPage(path);
    if (!html) return null;
    const doc = ctx.parse(html);
    return { path, doc, kind: siteKind(path, doc), parent: parentOf(path, doc) };
  }));
  return models.filter(Boolean);
}

function groupTargetKind(group) {
  const inferred = fold(group.rules?.targetKind);
  return inferred === 'strona informacyjna' ? 'informacyjna' : inferred;
}

function groupParent(group, models, groups) {
  const siblings = new Set(models.map(({ path }) => path));
  const byParent = new Map();
  for (const model of models) {
    if (model.parent) byParent.set(model.parent, (byParent.get(model.parent) || 0) + 1);
  }
  for (const possible of groups) {
    if (!/^kategorie\//.test(possible.hostPage) || groupTargetKind(possible) !== groupTargetKind(group)) continue;
    const count = new Set(possible.members.map(({ target }) => target).filter((path) => siblings.has(path))).size;
    if (count) byParent.set(possible.hostPage, Math.max(count, byParent.get(possible.hostPage) || 0));
  }
  const ordered = [...byParent.entries()].sort((a, b) => b[1] - a[1]);
  const parent = ordered.find(([path]) => path === group.hostPage)?.[0]
    || (ordered[0]?.[1] > (ordered[1]?.[1] || 0) ? ordered[0][0] : '');
  return { parent, options: ordered.map(([path]) => path) };
}

async function stageGroupChanges(ctx, perform) {
  const changes = new Map();
  let globals;
  const staged = {
    ...ctx,
    listPages: () => {
      const entries = new Map(ctx.listPages().map((entry) => [entry.path, entry]));
      for (const [path, { opts }] of changes) entries.set(path, { ...entries.get(path), ...opts, path });
      return [...entries.values()];
    },
    readPage: async (path) => changes.get(path)?.html ?? ctx.readPage(path),
    writePage: async (path, html, opts) => changes.set(path, { html, opts: { ...changes.get(path)?.opts, ...opts } }),
    getGlobals: () => globals === undefined ? ctx.getGlobals() : structuredClone(globals),
    setGlobals: async (value) => { globals = structuredClone(value); },
  };
  const result = await perform(staged);
  if (!result.ok) return result;
  for (const [path, { html, opts }] of changes) await ctx.writePage(path, html, opts);
  if (globals !== undefined) await ctx.setGlobals(globals);
  return { ...result, changedPages: [...changes.keys()] };
}

export async function addGroupMember(ctx, group, args, groups, updateMember) {
  const kind = groupTargetKind(group);
  if (!kind) return ask(`Do jakiego rodzaju strony ma prowadzić element w grupie „${group.label}”?`, KINDS);
  const models = await groupModels(ctx, group);
  const neighbors = models.filter((model) => model.path !== args.target);
  const sample = neighbors.find((model) => {
    return model.kind === kind || (kind === 'informacyjna' && model.kind === 'strona informacyjna');
  }) || neighbors[0];
  if (!sample) return ask(`Wskaż istniejącą stronę, której układ ma wzorować nowy element w grupie „${group.label}”.`);
  const join = await optionalSibling(import('./group-join.js?v=spojnosc1'));
  if (!join) return { ok: false, error: 'Dołączanie do grupy jest chwilowo niedostępne.' };
  const { parent, options } = groupParent(group, models, groups);
  if (!args.target && ['produkt', 'podkategoria'].includes(kind) && !args.rodzic && !parent) {
    return ask(`Do której kategorii należy dodać „${args.nazwa}”?`, options);
  }

  return stageGroupChanges(ctx, async (staged) => {
    let created;
    let target = args.target;
    if (!target) {
      const createArgs = {
        nazwa: args.nazwa, rodzaj: kind, rodzic: args.rodzic || parent, wzor: sample.path, opis: args.opis, zdjecie: args.zdjecie,
      };
      created = CATALOG.includes(kind) ? await addOffer('dodaj_pozycje_oferty', createArgs, staged)
        : await run(ADD, createArgs, staged);
      if (!created.ok) return created;
      target = created.pagePath;
    }
    const linked = await join.run('dolacz_do_grupy', {
      strona: target, grupa: group.selector, jakStrona: sample.path, hostPage: group.hostPage,
    }, staged);
    if (!linked.ok) return linked;
    const hostHtml = await staged.readPage(group.hostPage);
    const hostDoc = hostHtml && staged.parse(hostHtml);
    const existing = hostDoc && linksInGroup(hostDoc, group)
      .filter((link) => pagePath(link.getAttribute('data-desktop-href') || link.getAttribute('href'), group.hostPage) === target);
    if (!existing?.length) return { ok: false, error: `Brakuje odnośnika do „${args.nazwa}” w grupie „${group.label}”.` };
    const memberSummary = updateMember && await updateMember(staged, hostDoc, existing, target);
    const summary = [created?.summary, linked.changedPages?.length ? linked.summary : '', memberSummary].filter(Boolean).join(' ');
    return {
      ...linked,
      pagePath: target,
      summary: summary || linked.summary,
    };
  });
}

function kindOf(path) {
  if (path === PROMOTIONS) return 'lista promocji';
  if (path.startsWith('promocje/')) return 'promocja';
  if (path.startsWith('produkty/')) return 'produkt';
  if (path.startsWith('kategorie/')) return 'kategoria';
  return 'informacyjna';
}

function byName(pages, query, slugify) {
  const path = pagePath(query);
  const exact = pages.find((page) => page.path === path);
  if (exact) return exact;
  const slug = slugify(query);
  if (!slug) return null;
  const matches = pages.filter((page) => slugify(page.label) === slug || page.path.split('/').at(-2) === slug);
  return matches.length === 1 ? matches[0] : null;
}

function renameHeader(doc, title, description) {
  const heading = doc.querySelector('main h1');
  const oldName = heading.textContent.trim();
  const brand = doc.title.includes(' | ') ? doc.title.slice(doc.title.lastIndexOf(' | ')) : '';
  doc.title = title + brand;
  heading.textContent = title;
  const current = doc.querySelector('.breadcrumbs [aria-current]');
  if (current) current.textContent = title;
  let meta = doc.querySelector('meta[name="description"]');
  if (!meta) {
    meta = doc.createElement('meta');
    meta.setAttribute('name', 'description');
    doc.head.append(meta);
  }
  const oldDescription = meta.getAttribute('content') || '';
  meta.setAttribute('content', description ?? (oldName ? oldDescription.replaceAll(oldName, title) : oldDescription));
  for (const item of doc.querySelectorAll('meta[property="og:title"], meta[property="og:description"], meta[property="og:url"], meta[property="og:image"]')) {
    item.remove();
  }
  return { title: doc.title, label: title, description: meta.getAttribute('content') };
}

function definePromotionBreadcrumbs(doc, target) {
  const breadcrumbs = doc.querySelector('.breadcrumbs');
  const home = breadcrumbs?.querySelector('[data-home-link]');
  const current = breadcrumbs?.querySelector('[aria-current]');
  const separator = breadcrumbs?.querySelector('span:not([aria-current])');
  if (!home || !current || !separator) return;
  home.setAttribute('href', hrefFrom('index.html#uslugi', target));
  const promotions = doc.createElement('a');
  promotions.setAttribute('href', hrefFrom(PROMOTIONS, target));
  promotions.textContent = 'Promocje';
  breadcrumbs.replaceChildren(home, separator, promotions, separator.cloneNode(true), current);
}

function replaceGalleryContent(block, image, photo, title) {
  const track = image.closest('[data-scroll-track]');
  const item = track && [...track.children].find((child) => child.contains(image));
  if (item) {
    track.replaceChildren(item);
    for (const element of item.querySelectorAll('h2, h3, h4, p, figcaption')) element.replaceChildren();
    for (const sample of item.querySelectorAll('img')) setImage(sample, photo, title);
    for (const link of item.querySelectorAll('a[href]')) link.setAttribute('href', photo);
    for (const element of block.querySelectorAll('h2, [data-scroll-track][aria-label], [data-scroll-gallery][aria-label]')) {
      if (element.matches('h2')) element.textContent = title;
      else element.setAttribute('aria-label', title);
    }
    return;
  }
  setImage(image, photo, title);
  const figure = image.closest('figure');
  if (figure) figure.querySelectorAll('figcaption').forEach((caption) => caption.remove());
  block.replaceChildren(figure && block.contains(figure) ? figure : image);
}

function useNewContent(doc, title, description, photo) {
  const header = doc.querySelector('.subpage-head');
  const lead = header?.querySelector('.subpage-lead');
  if (lead) lead.textContent = description;
  header?.querySelector('.eyebrow')?.replaceChildren();

  const container = doc.querySelector('main .subpage-content') || doc.querySelector('main > .wrap') || doc.querySelector('main');
  let descriptionPlaced = false;
  let imagePlaced = false;
  for (const block of container.children) {
    if (block.matches('.page-nav-bar, .subpage-head, .subpage-sidebar, style, script')) continue;
    if (block.matches('.cta-banner-dark')) {
      for (const element of block.querySelectorAll('h2, h3, p, .eyebrow')) {
        element.textContent = element.matches('h2, h3') ? title : '';
      }
      continue;
    }
    const disclosure = block.matches('details') ? block : block.querySelector('details');
    const copy = block.querySelector('.source-content-body');
    if (!descriptionPlaced && copy) {
      const paragraph = doc.createElement('p');
      paragraph.textContent = description;
      copy.replaceChildren(paragraph);
      const summary = disclosure?.querySelector('summary');
      if (summary) summary.textContent = title;
      if (disclosure && disclosure !== block) block.replaceChildren(disclosure);
      if (!description) block.setAttribute('hidden', '');
      descriptionPlaced = true;
      continue;
    }
    const image = photo && !imagePlaced ? block.querySelector('img') : null;
    if (image) {
      replaceGalleryContent(block, image, photo, title);
      imagePlaced = true;
    } else if (!descriptionPlaced && description) {
      const paragraph = doc.createElement('p');
      paragraph.textContent = description;
      block.replaceChildren(paragraph);
      descriptionPlaced = true;
    } else {
      block.replaceChildren();
      block.setAttribute('hidden', '');
    }
  }
}

function hrefWithAnchor(href, target, host, targetDoc) {
  const hash = href.slice(href.indexOf('#') + 1);
  let anchorId = hash;
  try {
    anchorId = decodeURIComponent(hash);
  } catch {
    // Niepoprawnie zapisany identyfikator może nadal występować dosłownie.
  }
  const suffix = href.includes('#') && targetDoc.getElementById(anchorId) ? '#' + hash : '';
  return hrefFrom(target + suffix, host);
}

function renameLink(link, href, title) {
  const arrow = [...link.children].find((child) => child.getAttribute('aria-hidden') === 'true'
    || child.tagName.toLowerCase() === 'svg' || /^[↗→›]+$/u.test(child.textContent.trim()));
  const textArrow = link.textContent.trim().match(/[↗→›]$/u)?.[0];
  const label = link.querySelector('span:not([aria-hidden])');
  if (label && label !== arrow && link.children.length <= 2) label.textContent = title;
  else if (arrow) link.replaceChildren(title + ' ', arrow);
  else link.textContent = textArrow ? title + ' ' + textArrow : title;
  link.setAttribute('href', href);
  if (link.hasAttribute('aria-label')) link.setAttribute('aria-label', title);
  if (link.hasAttribute('data-desktop-href')) link.setAttribute('data-desktop-href', href);
  link.removeAttribute('data-mobile-home-href');
}

function cloneIncoming(doc, host, source, target, targetDoc, title, photo) {
  const links = [...doc.querySelectorAll('a[href]')].filter((link) => {
    if (link.closest('.breadcrumbs, .product-nav-bar')) return false;
    return pagePath(link.getAttribute('data-desktop-href') || link.getAttribute('href'), host) === source;
  });
  const copiedCards = new Set();
  for (const link of links) {
    const href = hrefWithAnchor(link.getAttribute('data-desktop-href') || link.getAttribute('href'), target, host, targetDoc);
    const card = link.closest('.cat-prod-card, .subcat-card, .home-cat-card');
    if (card) {
      if (copiedCards.has(card)) continue;
      copiedCards.add(card);
      const copy = card.cloneNode(true);
      copy.removeAttribute('id');
      const clickable = copy.matches('a[href]') ? [copy] : copy.querySelectorAll('a[href]');
      for (const anchor of clickable) {
        if (pagePath(anchor.getAttribute('href'), host) !== source) continue;
        const caption = anchor.querySelector('h3') || (anchor.closest('h3') ? anchor : null);
        if (caption) caption.textContent = title;
        if (anchor.hasAttribute('aria-label')) anchor.setAttribute('aria-label', title);
        anchor.setAttribute('href', href);
      }
      const image = copy.querySelector('img');
      if (image) {
        if (photo) setImage(image, photo(host), title);
        else image.setAttribute('alt', title);
      }
      card.after(copy);
      continue;
    }

    const copy = link.cloneNode(true);
    copy.removeAttribute('id');
    renameLink(copy, href, title);
    if (host === target) {
      link.classList.remove('is-active', 'is-current');
      link.removeAttribute('aria-current');
    } else {
      copy.classList.remove('is-active', 'is-current');
      copy.removeAttribute('aria-current');
      if (link.closest('.sidebar-links')) copy.removeAttribute('style');
    }
    if (link.parentElement.matches('.sidebar-links > li')) {
      const item = link.parentElement.cloneNode(false);
      item.removeAttribute('id');
      item.append(copy);
      link.parentElement.after(item);
    } else {
      link.after(copy);
    }
  }
  return links.length > 0;
}

function syncGlobals(globals, source, target, title) {
  let changed = false;
  const result = { ...globals };
  for (const field of ['menu', 'footerLinks']) {
    if (!Array.isArray(globals[field])) continue;
    result[field] = globals[field].flatMap((item) => {
      if (pagePath(item.href) !== source) return [item];
      changed = true;
      const copy = { ...item, label: title, href: target };
      if (field === 'menu') copy.mobileHref = '';
      return [item, copy];
    });
  }
  return changed ? result : null;
}

function putNavLink(nav, direction, button) {
  const existing = nav.querySelector('.pnav-' + direction);
  if (existing) existing.replaceWith(button);
  else {
    const slot = direction === 'prev' ? nav.firstElementChild : nav.lastElementChild;
    if (slot?.matches('span:not([class])')) slot.replaceWith(button);
    else if (direction === 'prev') nav.prepend(button);
    else nav.append(button);
  }
}

function insertProductCopy(source, targetDoc, target, title, pages, changes) {
  const nav = source.doc.querySelector('.product-nav-bar');
  const copyNav = targetDoc.querySelector('.product-nav-bar');
  const sample = nav?.querySelector('.pnav-btn');
  if (!nav || !copyNav || !sample) return;
  const nextPath = pagePath(nav.querySelector('.pnav-next')?.getAttribute('href'), source.path);
  putNavLink(nav, 'next', productButton(sample, target, source.path, title, 'next'));
  putNavLink(copyNav, 'prev', productButton(sample, source.path, target, source.label, 'prev'));
  changes.set(source.path, source.doc);

  const next = pages.find((page) => page.path === nextPath);
  if (!next) return;
  const nextNav = next.doc.querySelector('.product-nav-bar');
  if (!nextNav) return;
  putNavLink(nextNav, 'prev', productButton(sample, target, next.path, title, 'prev'));
  changes.set(next.path, next.doc);
}

function addPromotionToList(doc, target, title) {
  if (!doc) return false;
  const hasLink = [...doc.querySelectorAll('main a[href]')]
    .some((link) => pagePath(link.getAttribute('href'), PROMOTIONS) === target);
  if (hasLink) return false;
  const sample = doc.querySelector('.subpage-content .source-list > li');
  if (!sample) return false;
  const item = sample.cloneNode(false);
  item.removeAttribute('id');
  const link = doc.createElement('a');
  link.setAttribute('href', hrefFrom(target, PROMOTIONS));
  link.textContent = title;
  item.append(link);
  sample.parentElement.append(item);
  return true;
}

export async function run(name, args, ctx) {
  if (name !== ADD && name !== COPY) return { ok: false, error: 'Nieznany przepis: ' + name };
  const copying = name === COPY;
  const title = String(copying ? args.nowaNazwa ?? '' : args.nazwa ?? '').trim();
  if (!title) return ask(copying ? 'Jak ma się nazywać kopia strony?' : 'Jak ma się nazywać podstrona?');
  const requestedKind = String(args.rodzaj ?? '').trim().toLowerCase();
  const kind = requestedKind === 'strona informacyjna' ? 'informacyjna' : requestedKind;
  const groupQuery = args.grupa || args.sekcja;
  if (!copying && (args.strona || groupQuery)) {
    const host = pagePath(args.strona) || (String(groupQuery || '').includes('::') ? '' : ctx.currentPage || 'index.html');
    const html = host && await ctx.readPage(host);
    const groups = await recipeGroups(ctx);
    const matches = findRecipeGroups(groups, { host, query: groupQuery, doc: html && ctx.parse(html) });
    if (matches.length !== 1) {
      return ask('Do której grupy ma prowadzić nowa podstrona?', groupOptions(matches.length ? matches : findRecipeGroups(groups, { host })));
    }
    const group = matches[0];
    if (kind && groupTargetKind(group) && kind !== groupTargetKind(group)) {
      return ask(`W grupie „${group.label}” są strony rodzaju „${groupTargetKind(group)}”. Utworzyć stronę tego rodzaju czy wybrać inną grupę?`, [groupTargetKind(group), ...groupOptions(findRecipeGroups(groups, { host }).filter((other) => other !== group))]);
    }
    return addGroupMember(ctx, group, { ...args, nazwa: title }, groups);
  }
  if (!copying && CATALOG.includes(kind)) return addOffer('dodaj_pozycje_oferty', { ...args, rodzaj: kind }, ctx);
  if (!copying && !KINDS.includes(kind)) return ask('Jaki rodzaj podstrony utworzyć?', KINDS);

  const pages = (await Promise.all(ctx.listPages().map(async (entry) => {
    const html = await ctx.readPage(entry.path);
    if (!html) return null;
    const doc = ctx.parse(html);
    return { ...entry, html, doc, kind: kindOf(entry.path), label: doc.querySelector('main h1')?.textContent.trim() || entry.label };
  }))).filter(Boolean);
  const subpages = pages.filter(({ path, doc }) => path !== 'index.html'
    && doc.querySelector('main h1') && !doc.querySelector('meta[http-equiv="refresh" i]'));
  const sameKind = copying ? subpages : subpages.filter((page) => page.kind === kind);
  const query = String(copying ? args.strona ?? '' : args.wzor ?? '').trim();
  const source = query ? byName(sameKind, query, ctx.slugify)
    : !copying && (sameKind.find((page) => page.path === 'o-firmie/index.html') || sameKind[0]);
  if (!source) return ask(copying ? 'Którą podstronę skopiować?' : 'Która podstrona ma być wzorem?', sameKind.map((page) => page.label));

  const slug = ctx.slugify(title);
  if (!slug) return { ok: false, error: 'Z tej nazwy nie da się utworzyć adresu strony.' };
  const level = source.path.split('/');
  const target = [...level.slice(0, -2), slug, 'index.html'].join('/');
  if (pages.some((page) => page.path === target)) {
    return { ok: false, error: 'Strona „' + target + '” już istnieje. Podaj inną nazwę.' };
  }

  const description = String(args.opis ?? '').trim();
  const photo = String(args.zdjecie ?? '').trim();
  const externalPhoto = /^https?:\/\//i.test(photo);
  if (photo && !externalPhoto && (/[\\:]/.test(photo) || photo.split('/').includes('..'))) {
    return { ok: false, error: 'Podaj ścieżkę zdjęcia od katalogu strony albo URL HTTP(S).' };
  }
  const photoFrom = photo ? (host) => externalPhoto ? photo : hrefFrom(photo.replace(/^\/+/, ''), host) : null;
  const doc = ctx.parse(ctx.rebaseUrls(source.html, source.path, target));
  const metadata = renameHeader(doc, title, copying ? undefined : description || title);
  if (source.kind === 'promocja') definePromotionBreadcrumbs(doc, target);
  if (!copying) useNewContent(doc, title, description, photoFrom?.(target));
  if (copying && source.kind === 'kategoria') {
    for (const grid of doc.querySelectorAll('.subcat-grid, .cat-products-grid')) grid.replaceChildren();
  }
  doc.querySelector('link[rel="canonical"]')?.setAttribute('href', hrefFrom(target, target));

  const changes = new Map([[target, doc]]);
  for (const page of [...pages, { path: target, doc }]) {
    if (cloneIncoming(page.doc, page.path, source.path, target, doc, title, photoFrom)) changes.set(page.path, page.doc);
  }
  if (source.kind === 'promocja') {
    const list = pages.find((page) => page.path === PROMOTIONS);
    if (addPromotionToList(list?.doc, target, title)) changes.set(list.path, list.doc);
  }
  if (copying && source.kind === 'produkt') insertProductCopy(source, doc, target, title, pages, changes);

  const globals = syncGlobals(ctx.getGlobals(), source.path, target, title);
  const hosts = [...changes.keys()].filter((path) => path !== target);
  if (!hosts.length && !globals) {
    return ask('Strona wzorcowa nie ma dróg dojścia. Którą podstronę z nawigacji wybrać jako wzór?',
      sameKind.filter((page) => page !== source).map((page) => page.label));
  }
  for (const [path, page] of changes) {
    await ctx.writePage(path, ctx.serialize(page), path === target ? metadata : undefined);
  }
  if (globals) await ctx.setGlobals(globals);
  const places = hosts.length > 8 ? 'nawigacja na ' + hosts.length + ' stronach, m.in. ' + hosts.slice(0, 4).join(', ') : hosts.join(', ');
  return {
    ok: true,
    summary: (copying ? 'Skopiowano' : 'Utworzono') + ' „' + title + '” na wzór „' + source.label + '”.'
      + ' Zapisano podstronę z okruszkami' + (places ? ' i odnośniki w: ' + places : '')
      + (globals ? ' oraz w ustawieniach menu lub stopki' : '') + '.',
    pagePath: target,
    sourcePath: source.path,
    changedPages: [...changes.keys()],
  };
}
