import { fixedIds, isContent, isLegacy, itemTypes, kindForSection, mainIds, nestedGroup, normalize, pageGroups, regions } from './home-model.js?v=3';

const defaultPath = 'assets/home-content.json';
const legacySelectors = {
  ofirmie: { heading: '.trust-compact h2', intro: '.trust-compact p' },
  oferta: { heading: '.offer-head h2', intro: '.offer-head p' },
  opinie: { heading: '.reviews-head h2', intro: '.reviews-note' },
};
const textLabels = { heading: 'Nagłówek', intro: 'Wprowadzenie' };
const headingSelector = 'h1,h2,h3,h4,blockquote,.kt-store-title';
const decoration = /^[↗×]+$/u;
const movableParts = 'a,button,blockquote,details,div,figure,h1,h2,h3,h4,img,nav,ol,p,section,span,ul';
const subpageCollections = [
  ['produkty', 'Produkty', '.cat-products-grid', '.cat-prod-card', 'product', 'cat-prod-media', 'cat-prod-body'],
  ['podkategorie', 'Kafelki kategorii', '.subcat-grid', '.subcat-card', 'tile', 'subcat-card-media', 'subcat-card-body'],
  ['profile', 'Pozycje w katalogu', '.profile-list', '.profile-row', 'product', 'profile-row__media', 'profile-row__body'],
  ['lokalizacje', 'Kafelki lokalizacji', '.location-grid', '.location-card', 'tile', 'location-card__photo', 'location-card__body'],
  ['montaz', 'Kroki montażu', '.montage-steps-grid', '.montage-step-card', 'tile', 'montage-step-media', 'home-cat-body'],
  ['realizacje', 'Zdjęcia realizacji', '.realization-grid,[data-scroll-track]', ':is(button,a,figure,.realization-card)', 'project',
    'realization-card-media', 'realization-card-body'],
  ['spis', 'Odnośniki do produktów', '.directory-list-grid', 'li', 'link', '', ''],
];

function element(doc, name, className, text) {
  const node = doc.createElement(name);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function fallbackItem(doc, type) {
  if (type === 'review') {
    const item = element(doc, 'li', 'review');
    const stars = element(doc, 'div', 'stars');
    stars.setAttribute('role', 'img');
    item.append(stars, element(doc, 'blockquote'), element(doc, 'div', 'review-source'));
    return item;
  }
  const classes = {
    product: ['home-featured-product', 'home-featured-media', 'home-featured-copy', 'h4', 'Zobacz produkt ↗'],
    tile: ['home-cat-card', 'home-cat-thumb', 'home-cat-body', 'h3', 'Zobacz ofertę ↗'],
    project: ['realization-card', 'realization-card-media', 'realization-card-body', 'h3', ''],
  };
  const [cardClass, mediaClass, bodyClass, heading, callToAction] = classes[type];
  const card = element(doc, 'a', cardClass);
  const media = element(doc, 'div', mediaClass);
  media.append(element(doc, 'img'));
  const body = element(doc, 'div', bodyClass);
  body.append(element(doc, heading));
  if (type === 'product') body.append(element(doc, 'p'));
  body.append(element(doc, type === 'tile' ? 'div' : 'span', type === 'tile' ? 'home-cat-cta' : null, callToAction));
  card.append(media, body);
  return card;
}

function setCopy(field, value) {
  if (field.attribute) {
    field.element.setAttribute(field.attribute, value);
    return;
  }
  if (field.editorTarget) {
    if (normalize(field.editorTarget.textContent) !== value) field.editorTarget.textContent = value;
  } else if (normalize(field.textNode.data) !== value) {
    const raw = field.original;
    field.textNode.data = raw.match(/^\s*/u)[0] + value + raw.match(/\s*$/u)[0];
  }
  const link = field.element.closest('a');
  const href = field.originalLink;
  if (link && href?.startsWith('mailto:') && /^[^ @:]+@[^ @:]+\.[a-z]+$/i.test(value)) {
    link.setAttribute('href', 'mailto:' + value);
  } else if (link && href?.startsWith('tel:')) {
    const digits = value.replace(/\D/gu, '');
    if (digits.length === 9 || (digits.length === 11 && digits.startsWith('48'))) {
      link.setAttribute('href', 'tel:+' + (digits.length === 9 ? '48' : '') + digits);
    }
  }
  if (field.element.matches('.stars[role=img]') && /^[★☆]{1,5}$/u.test(value)) {
    field.element.setAttribute('aria-label', 'Ocena ' + Array.from(value).filter((mark) => mark === '★').length + ' na 5');
  }
}

export function connectHome(doc, repositoryPath = defaultPath) {
  const blocks = new Map();
  const groups = new Map();
  const fields = new Map();
  const templates = new Map();
  const legacyKeys = {};
  const originals = new Map();
  const selector = (id) => doc.querySelector(regions[id][1]);

  function register(id, node, label, group = null) {
    if (!node) return;
    node.dataset.homeBlock = id;
    const block = { id, node, mount: node, label, group, defaultGroup: group, fields: [] };
    blocks.set(id, block);
    return block;
  }

  function registerGroup(id, host, definition, members) {
    if (!host) return;
    const marker = doc.createComment('');
    host.insertBefore(marker, members[0]?.node || host.firstChild);
    groups.set(id, { ...definition, host, marker });
    originals.set(id, members.map((member) => member.id));
  }

  function findFields(block) {
    const { id, node, label } = block;
    const legacy = legacySelectors[id] || {};
    const special = Object.fromEntries(Object.entries(legacy).map(([key, selector]) => [key, node.querySelector(selector)]));
    const walker = doc.createTreeWalker(node, 4);
    let index = 0;
    while (walker.nextNode()) {
      const textNode = walker.currentNode;
      const parent = textNode.parentElement;
      const initial = normalize(textNode.data);
      if (!initial || decoration.test(initial) ||
          parent.closest('[data-home-block]') !== node || parent.closest('svg,script,style') ||
          (parent.closest('[aria-hidden=true]') && !parent.matches('.stars'))) continue;
      const alias = Object.keys(special).find((key) => parent === special[key]);
      const key = id + ':' + (alias || index++);
      const field = {
        id: key, block: id, element: parent, textNode, initial, original: textNode.data,
        originalLink: parent.closest('a')?.getAttribute('href'),
        label: alias
          ? (id === 'opinie' && alias === 'intro' ? 'Tekst pod opiniami' : textLabels[alias]) + ' · ' + label
          : initial.slice(0, 65),
      };
      if (alias) (legacyKeys[id] ||= {})[alias] = key;
      fields.set(key, field);
      block.fields.push(field);
    }
    let attr = 0;
    for (const target of [node, ...node.querySelectorAll('img[alt],[aria-label],[title]')]) {
      if (target.closest('[data-home-block]') !== node) continue;
      for (const [attribute, label] of [['alt', 'Opis zdjęcia'], ['aria-label', 'Opis dostępności'], ['title', 'Podpowiedź']]) {
        const initial = normalize(target.getAttribute(attribute) || '');
        if (!initial || (attribute === 'aria-label' && target.classList.contains('stars'))) continue;
        const key = id + ':attr-' + attr++;
        const field = { id: key, block: id, element: target, initial, attribute, label };
        fields.set(key, field);
        block.fields.push(field);
      }
    }
  }

  const homePage = repositoryPath === defaultPath;
  const mainHost = doc.querySelector(homePage ? 'main' : 'main > .wrap,main');
  if (!mainHost) throw new Error('Brakuje głównej treści strony.');
  const ids = homePage ? [...fixedIds, ...mainIds, 'realizacje', 'partnerzy'] : fixedIds;
  for (const id of ids) register(id, selector(id), regions[id][0], mainIds.includes(id) ? 'main' : null);
  const contentHost = homePage ? mainHost : mainHost.querySelector(':scope > .wrap') || mainHost;
  const main = [...contentHost.children].filter((node) => !node.matches('script,style,template,svg'))
    .map((node, index) => homePage
      ? blocks.get(node.dataset.homeBlock)
      : register('strona-' + (index + 1), node, normalize(node.querySelector(headingSelector)?.textContent || '') ||
        (node.matches('nav,.page-nav-bar') ? 'Nawigacja strony' : 'Treść ' + (index + 1)), 'main'))
    .filter(Boolean);
  registerGroup('main', contentHost, pageGroups.main, main);

  function connectGroup(id, definition, host) {
    if (!host) return;
    const members = definition.members
      ? Array.from(host.children).map((node) => blocks.get(node.dataset.homeBlock))
          .filter((block) => definition.members.includes(block?.id))
      : Array.from(host.children).filter((node) => node.matches(definition.item)).map((node, index) =>
          register(id + '-' + (index + 1), node, definition.label, id));
    for (const member of members) {
      member.group = id;
      member.defaultGroup = id;
    }
    if (definition.type && members[0]) templates.set(definition.type, members[0].node.cloneNode(true));
    registerGroup(id, host, definition, members);
  }
  for (const [id, definition] of Object.entries(pageGroups)) {
    if (!definition.selector) continue;
    const owner = blocks.get(definition.owner)?.node;
    connectGroup(id, definition, id === 'photos' ? owner : owner?.querySelector(definition.selector));
  }
  if (!homePage) {
    const definitions = [...Object.entries(pageGroups), ...subpageCollections.map(([id, label, selector, item, type, media, body]) =>
      [id, { label, selector, item, type, variant: { media, body } }])];
    for (const [id, definition] of definitions) {
      if (!definition.item || definition.owner === 'header' || definition.owner === 'footer') continue;
      const hosts = [...contentHost.querySelectorAll(definition.selector)];
      if (contentHost.firstElementChild?.matches(definition.selector)) hosts.unshift(contentHost.firstElementChild);
      for (const [index, host] of [...new Set(hosts)].entries()) {
        const owner = host.closest('[data-home-block]')?.dataset.homeBlock;
        if (owner) connectGroup(id + 'lista-' + (index + 1), { ...definition, owner }, host);
      }
    }
  }
  for (const block of blocks.values()) findFields(block);

  function findParts(block) {
    const { id, node } = block;
    const groupHosts = new Set([...groups.values()].map((group) => group.host));
    let index = 0;
    for (const parent of [node, ...node.querySelectorAll('div,h1,nav,section,summary')]) {
      if (parent.closest('[data-home-block]') !== node || groupHosts.has(parent) ||
          parent.closest('svg,script,style,[aria-hidden=true],.reviews-nav')) continue;
      const children = Array.from(parent.children).filter((part) =>
        !part.hasAttribute('data-home-block') && part.matches(movableParts) &&
        (part.matches('img') || block.fields.some((field) => part.contains(field.element)) ||
          [...blocks.values()].some((item) => item !== block && part.contains(item.node))));
      if (children.length < 2) continue;
      const key = 'uklad-' + id + '-' + index++;
      const members = children.map((part, position) => {
        const partId = key + '-' + (position + 1);
        const local = block.fields.filter((field) => part.contains(field.element));
        const title = local.find((field) => !field.attribute) || local[0];
        const item = {
          id: partId, node: part, mount: part, label: title?.initial.slice(0, 48) || 'Element układu',
          group: key, defaultGroup: key, layoutOwner: id, fields: local,
        };
        blocks.set(partId, item);
        return item;
      });
      registerGroup(key, parent, { label: members.map((item) => item.label).join(' · ').slice(0, 70), owner: id, layout: true }, members);
    }
  }
  for (const block of [...blocks.values()]) findParts(block);
  doc.defaultView.addEventListener('resize', () => {
    for (const group of groups.values()) group.sync?.();
  });

  const original = {
    version: 2, revision: 'original', order: originals.get('main'),
    lists: Object.fromEntries([...originals].filter(([id]) => id !== 'main')),
    added: {}, texts: {}, media: {},
  };

  function upgrade(value) {
    if (value?.version === 1 && value.revision === 'original' && !value.fields) return structuredClone(original);
    if (homePage && isLegacy(value)) {
      const next = structuredClone(original);
      next.revision = value.revision;
      next.order = ['start', ...value.order, ...original.order.filter((id) => id !== 'start' && !value.order.includes(id))];
      for (const [id, values] of Object.entries(value.fields)) {
        for (const [key, text] of Object.entries(values)) {
          const field = fields.get(legacyKeys[id]?.[key]);
          if (field && field.initial !== text) next.texts[field.id] = text;
        }
      }
      return next;
    }
    if (value?.version === 2) {
      const next = structuredClone({ media: {}, ...value });
      if (Array.isArray(next.order)) {
        const allowed = new Set(original.order);
        const order = next.order.filter((id) => allowed.has(id) || next.added?.[id]?.group === 'main');
        const missing = original.order.filter((id) => !order.includes(id));
        next.order = missing.includes('start') ? ['start', ...order, ...missing.filter((id) => id !== 'start')] : [...order, ...missing];
      }
      if (!isContent(next)) return null;
      const used = new Set(Object.values(next.lists).flat());
      for (const [id, defaults] of Object.entries(original.lists)) {
        next.lists[id] = [...(next.lists[id] || []), ...defaults.filter((item) => !used.has(item))];
      }
      return next;
    }
    return null;
  }

  function createSection(id, record) {
    const type = kindForSection(record.type);
    const isReview = type === 'review';
    const section = element(doc, 'section', isReview ? 'reviews' : 'offer home-added-section');
    section.id = id;
    const wrap = element(doc, 'div', 'wrap');
    const head = element(doc, 'div', isReview ? 'reviews-head' : 'offer-head');
    const intro = element(doc, 'div');
    intro.append(element(doc, 'h2', null, record.title));
    if (record.body) intro.append(element(doc, 'p', null, record.body));
    head.append(intro);
    const host = element(doc, isReview ? 'ul' : 'div', {
      review: 'reviews-track', product: 'home-featured-grid', tile: 'home-catalog-grid', text: 'home-nested-grid',
    }[type]);
    let sync;
    if (isReview) {
      host.id = id + '-track';
      const nav = doc.querySelector('#opinie .reviews-nav')?.cloneNode(true);
      if (nav) {
        nav.querySelectorAll('[aria-controls]').forEach((button) => button.setAttribute('aria-controls', host.id));
        const previous = nav.querySelector('.rev-prev');
        const next = nav.querySelector('.rev-next');
        sync = () => {
          previous.disabled = host.scrollLeft <= 2;
          next.disabled = host.scrollLeft >= host.scrollWidth - host.clientWidth - 2;
        };
        previous.addEventListener('click', () => host.scrollBy({ left: -host.clientWidth * .8, behavior: 'smooth' }));
        next.addEventListener('click', () => host.scrollBy({ left: host.clientWidth * .8, behavior: 'smooth' }));
        host.addEventListener('scroll', sync, { passive: true });
        wrap.append(head, host, nav);
      } else wrap.append(head, host);
    } else wrap.append(head, host);
    section.append(wrap);
    registerGroup(id, host, { label: record.title, type, owner: id, sync }, []);
    return section;
  }

  function createItem(record, group) {
    if (group.variant) {
      if (group.item === 'li') {
        const item = element(doc, 'li');
        const link = element(doc, 'a', null, record.title);
        if (record.link) link.href = record.link;
        item.append(link);
        return item;
      }
      const variant = group.item.startsWith('.');
      const card = element(doc, 'article', (variant ? group.item.slice(1) + ' ' : '') +
        'home-generic-tile' + (record.image ? '' : ' home-generic-without-image'));
      if (record.image) {
        const media = element(doc, 'div', group.variant.media);
        const img = element(doc, 'img');
        img.src = record.image;
        img.alt = record.title;
        media.append(img);
        card.append(media);
      }
      const body = element(doc, 'div', group.variant.body);
      const title = element(doc, 'h3', null, record.title);
      if (record.link) {
        const link = element(doc, 'a', null, record.title);
        link.href = record.link;
        title.replaceChildren(link);
      }
      body.append(title);
      if (record.body) body.append(element(doc, 'p', null, record.body));
      card.append(body);
      return card;
    }
    if (record.type === 'text') {
      const tile = element(doc, 'article', 'home-text-tile');
      tile.append(element(doc, 'h3', null, record.title), element(doc, 'p', null, record.body));
      return tile;
    }
    if (record.type === 'link') {
      const link = element(doc, 'a', null, record.title);
      if (record.link) link.href = record.link;
      return link;
    }
    if (record.type === 'logo') {
      const logo = element(doc, 'div', 'partner-logo');
      if (!record.image) logo.textContent = record.title;
      else {
        const image = element(doc, 'img');
        image.src = record.image;
        image.alt = record.title;
        logo.append(image);
      }
      return logo;
    }
    if (record.type === 'service') {
      const detail = element(doc, 'details', 'home-service-item');
      detail.open = true;
      detail.append(element(doc, 'summary', null, record.title), element(doc, 'p', 'home-service-item-body', record.body));
      return detail;
    }
    const node = templates.get(record.type)?.cloneNode(true) || fallbackItem(doc, record.type);
    if (record.type === 'review') {
      const stars = node.querySelector('.stars');
      stars.textContent = '★'.repeat(record.rating) + '☆'.repeat(5 - record.rating);
      stars.setAttribute('aria-label', 'Ocena ' + record.rating + ' na 5');
      node.querySelector('.review-source').textContent = record.title;
      node.querySelector('blockquote').textContent = record.body;
      return node;
    }
    if (record.link) node.setAttribute('href', record.link);
    else node.removeAttribute('href');
    const image = node.querySelector('img');
    if (image) {
      if (record.image) image.setAttribute('src', record.image);
        else {
          image.removeAttribute('src');
          image.parentElement.hidden = true;
        }
      image.alt = record.title;
    }
    node.classList.toggle('home-card-without-image', !record.image);
    node.querySelector(headingSelector).textContent = record.title;
    if (record.type === 'product') node.querySelector('.home-featured-copy p').textContent = record.body;
    if (record.type === 'tile' && record.body) {
      node.querySelector('.home-cat-body h3').after(element(doc, 'p', null, record.body));
    }
    if (record.type === 'project') node.querySelector('.realization-card-body span').textContent = record.body;
    if (!record.link) node.querySelector('.home-featured-copy > span,.home-cat-cta')?.setAttribute('hidden', '');
    return node;
  }

  function ensureNested(groupId) {
    if (groups.has(groupId)) return groups.get(groupId);
    if (!groupId.startsWith('wewnatrz-')) return;
    const owner = blocks.get(groupId.slice('wewnatrz-'.length));
    if (!owner || owner.layoutOwner || owner.node.matches('header,footer,nav,button')) return;
    const inside = owner.node.matches('li');
    const wrap = inside ? owner.node : element(doc, 'div', 'home-with-children');
    const drawer = element(doc, 'details', 'home-nested-drawer');
    drawer.append(element(doc, 'summary', null, 'Zobacz zawartość'));
    const host = element(doc, 'div', 'home-nested-grid');
    drawer.append(host);
    if (!inside) {
      if (owner.node.parentElement) owner.node.before(wrap);
      wrap.append(owner.node);
    }
    wrap.append(drawer);
    owner.mount = wrap;
    registerGroup(groupId, host, { label: 'Elementy w środku', type: 'mixed', owner: owner.id, wrapper: wrap, drawer, inside }, []);
    return groups.get(groupId);
  }

  function restoreMount(groupId, group) {
    const owner = blocks.get(group.owner);
    if (owner && !group.inside) {
      group.wrapper.before(owner.node);
      owner.mount = owner.node;
    }
    if (group.inside) group.drawer.remove();
    else group.wrapper.remove();
    groups.delete(groupId);
    originals.delete(groupId);
  }

  function canPlace(blockId, targetId) {
    const block = blocks.get(blockId);
    const target = groups.get(targetId);
    if (!block || !target) return false;
    if (block.group === targetId) return true;
    const source = groups.get(block.defaultGroup);
    const type = block.type || source?.type;
    if (!Object.hasOwn(itemTypes, type) ||
        (target.type !== 'mixed' && target.type !== type)) return false;
    let owner = blocks.get(target.owner);
    const seen = new Set();
    while (owner && !seen.has(owner.id)) {
      if (owner.id === blockId) return false;
      seen.add(owner.id);
      owner = blocks.get(groups.get(owner.group)?.owner);
    }
    return true;
  }

  const mediaInitial = new WeakMap();
  const mediaApplied = new WeakMap();
  const primaryImage = (node) => node.matches('img') ? node :
    [...node.querySelectorAll('img')].find((image) => image.closest('[data-home-block]') === node.closest('[data-home-block]'));
  function mediaFor(block) {
    const node = block.node;
    return {
      link: node.matches('a') ? node.getAttribute('href') || '' : node.querySelector('.home-text-link')?.getAttribute('href') || '',
      image: primaryImage(node)?.closest('[hidden]') ? '' : primaryImage(node)?.getAttribute('src') || '',
    };
  }

  function applyMedia(block, overrides) {
    const { node } = block;
    if (!overrides && !mediaApplied.has(node)) return;
    if (!mediaInitial.has(node)) mediaInitial.set(node, mediaFor(block));
    const initial = mediaInitial.get(node);
    const values = { ...initial, ...overrides };
    if (JSON.stringify(mediaApplied.get(node)) === JSON.stringify(values)) return;
    mediaApplied.set(node, values);
    if (values.link !== initial.link) {
      if (node.matches('a')) {
        if (values.link) node.setAttribute('href', values.link);
        else node.removeAttribute('href');
      } else {
        let link = node.querySelector('.home-text-link');
        if (!link && values.link) {
          link = element(doc, 'a', 'home-text-link', 'Dowiedz się więcej');
          node.append(link);
        }
        if (link) {
          link.hidden = !values.link;
          if (values.link) link.setAttribute('href', values.link);
        }
      }
    } else if (node.matches('a') && initial.link) node.setAttribute('href', initial.link);
    if (node.matches('.home-featured-product,.home-cat-card')) {
      node.querySelector('.home-featured-copy > span,.home-cat-cta')?.toggleAttribute('hidden', !values.link);
    }
    let image = primaryImage(node);
    if (!image && values.image) {
      image = element(doc, 'img', 'home-upload-photo');
      image.loading = 'lazy';
      image.alt = block.label;
      node.prepend(image);
    }
    if (image) {
      if (values.image) image.setAttribute('src', values.image);
      image.hidden = !values.image;
      const container = image.closest('.home-featured-media,.home-cat-thumb,.realization-card-media');
      if (container) container.hidden = !values.image;
      node.classList.toggle('home-card-without-image', !values.image);
    }
  }

  const active = new Map();
  function syncAdditions(added) {
    for (const [id, previous] of active) {
      if (added[id] === previous) continue;
      const block = blocks.get(id);
      if (block) {
        block.mount.remove();
        block.fields.forEach((field) => fields.delete(field.id));
        blocks.delete(id);
      }
      if (previous.group === 'main') {
        groups.delete(id);
        originals.delete(id);
      }
      for (const [groupId, group] of groups) {
        if (group.layout && group.owner === id) {
          for (const part of originals.get(groupId)) blocks.delete(part);
          groups.delete(groupId);
          originals.delete(groupId);
        }
      }
      const nest = groups.get(nestedGroup(id));
      if (nest) restoreMount(nestedGroup(id), nest);
      active.delete(id);
    }
    let remaining = Object.entries(added).filter(([id]) => !active.has(id));
    while (remaining.length) {
      const deferred = [];
      for (const [id, record] of remaining) {
        const group = groups.get(record.group) || ensureNested(record.group);
        if (!group || (record.group !== 'main' && group.type !== record.type && group.type !== 'mixed')) {
          deferred.push([id, record]);
          continue;
        }
        const node = record.group === 'main' ? createSection(id, record) : createItem(record, group);
        if (!node) continue;
        const block = register(id, node, record.title, record.group);
        block.type = record.type;
        findFields(block);
        findParts(block);
        active.set(id, record);
      }
      if (deferred.length === remaining.length) break;
      remaining = deferred;
    }
  }

  function render(state) {
    syncAdditions(state.added);
    for (const id of Object.keys(state.lists)) {
      if (state.lists[id].length) ensureNested(id);
    }
    for (const [id, group] of groups) {
      if (group.wrapper && !state.lists[id]?.length) restoreMount(id, group);
    }
    for (const [id, group] of groups) {
      const order = id === 'main' ? state.order : state.lists[id] || originals.get(id);
      let previous = group.marker;
      for (const key of order) {
        const block = blocks.get(key);
        if (!canPlace(key, id) || block.mount.contains(group.host)) continue;
        block.group = id;
        if (previous.nextElementSibling !== block.mount) group.host.insertBefore(block.mount, previous.nextElementSibling);
        previous = block.mount;
      }
      group.sync?.();
    }
    for (const block of blocks.values()) {
      const record = state.added[block.id];
      const recordMedia = record && {
        ...(record.image && !mediaFor(block).image ? { image: record.image } : {}),
        ...(record.link && !block.node.matches('a') ? { link: record.link } : {}),
      };
      const initial = mediaInitial.get(block.node);
      const inheritedImage = record?.image && initial && !initial.image ? { image: record.image } : {};
      const overrides = Object.assign({}, recordMedia, inheritedImage, state.media[block.id]);
      if (Object.keys(overrides).length || mediaApplied.has(block.node)) applyMedia(block, overrides);
    }
    for (const [id, field] of fields) {
      const text = state.texts[id];
      if (text !== undefined || field.modified) {
        setCopy(field, text ?? field.initial);
        field.modified = text !== undefined;
      }
    }
    doc.dispatchEvent(new Event('wolbud-home-rendered'));
  }

  return { original, render, upgrade, blocks, groups, fields, legacyKeys, canPlace, mediaFor, repositoryPath,
    defaultItems: (group) => originals.get(group) || [] };
}

export async function readPublished(home, { signal, fresh = false } = {}) {
  const url = new URL('../' + home.repositoryPath, import.meta.url);
  if (fresh) url.searchParams.set('sprawdz', Date.now().toString(36));
  const response = await fetch(url, { cache: 'no-store', signal });
  if (!response.ok) throw new Error('Nie udało się odczytać opublikowanej wersji.');
  const value = home.upgrade(await response.json());
  if (!value) throw new Error('Opublikowana treść ma nieprawidłowy format.');
  return value;
}
