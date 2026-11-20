import { readPublished } from '../assets/home-content.js?v=3';
import { fixedIds, isContent, itemTypes, maxText, nestedGroup, normalize, safeImage, safeLink, sameContent, sectionTypes } from '../assets/home-model.js?v=3';
import { config } from './config.js';
import { AccessError, sendPublication, waitForPublication } from './publish.js?v=3';

const get = (id) => document.getElementById(id);
const frame = get('preview');
const save = get('save');
const publish = get('publish');
const access = get('access');
const credentialInput = get('credential');
const blockDialog = get('add-block');
const initialDraftKey = 'wolbud:' + location.pathname.replace(/index\.html$/, '') + ':home-draft';
const addLabels = {
  review: 'Dodaj opinię', product: 'Dodaj produkt', tile: 'Dodaj kafelek', project: 'Dodaj realizację',
  text: 'Dodaj tekst', link: 'Dodaj odnośnik', service: 'Dodaj usługę', logo: 'Dodaj logotyp', mixed: 'Dodaj element',
};
const controls = new Map();
const previewControls = new Map();
const endSlots = new Map();
let home, previewDoc, published, content, saved, pending, selected, dragged, busy, credential, formContext;
let pages = [], currentPath = 'index.html', draftKey = initialDraftKey, pendingKey = draftKey + ':publication';

function stored(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function setStatus(id, message, error = false) {
  const node = get(id);
  node.textContent = message;
  node.toggleAttribute('data-error', error);
}

function refreshControls() {
  const valid = content && isContent(content);
  save.disabled = busy || !valid || sameContent(content, saved || published);
  publish.disabled = busy || !valid || (sameContent(content, published) && !pending);
}

function changed() {
  if (!isContent(content)) {
    setStatus('draft-status', 'Sprawdź długość tekstu i rozmiar dodanych zdjęć.', true);
  } else if (sameContent(content, saved)) {
    setStatus('draft-status', 'Szkic zapisany w tej przeglądarce.');
  } else if (sameContent(content, published) && !saved) {
    setStatus('draft-status', 'Brak zmian do zapisania.');
  } else {
    setStatus('draft-status', 'Niezapisane zmiany.');
  }
  refreshControls();
}

function writeDraft() {
  try {
    localStorage.setItem(draftKey, JSON.stringify(content));
    saved = structuredClone(content);
    setStatus('draft-status', 'Szkic zapisany w tej przeglądarce.');
    refreshControls();
    return true;
  } catch {
    setStatus('draft-status', 'Zapis nie powiódł się. Zmiany są w edytorze. Spróbuj zapisać ponownie.', true);
    return false;
  }
}

const items = (group) => group === 'main' ? content.order : content.lists[group] || home.defaultItems(group);
const editableOrder = (group) => group === 'main' ? content.order : (content.lists[group] ||= [...home.defaultItems(group)]);
const valueOf = (field) => content.texts[field.id] ?? field.initial;

function labelOf(id) {
  const block = home.blocks.get(id);
  if (!block) return '';
  if (block.group && block.group !== 'photos' && (block.group !== 'main' || content.added[id])) {
    const title = block.fields.find((field) => !field.attribute && field.element.matches('h2,h3,h4,blockquote,.kt-store-title'));
    const first = title || block.fields.find((field) => !field.attribute || field.attribute === 'alt');
    const value = first && valueOf(first);
    if (value) return value.length > 56 ? value.slice(0, 54) + '…' : value;
  }
  return block.label;
}

function button(label, action, className) {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  if (className) element.className = className;
  element.addEventListener('click', action);
  return element;
}

function previewSection(id) {
  const block = home.blocks.get(id);
  if (!block) return;
  if (id === 'header' || block.group === 'menu') {
    previewDoc.getElementById('menu').classList.add('open');
    previewDoc.getElementById('menuButton').setAttribute('aria-expanded', 'true');
    previewDoc.getElementById('site-menu').hidden = false;
  }
  const view = previewDoc.defaultView;
  const group = home.groups.get(block.group);
  if (group?.host.matches('.reviews-track')) {
    group.host.scrollLeft += block.node.getBoundingClientRect().left - group.host.getBoundingClientRect().left;
  }
  const bar = previewDoc.querySelector('header.bar')?.getBoundingClientRect().height || 0;
  view.scrollTo({ top: Math.max(0, block.node.getBoundingClientRect().top + view.scrollY - bar - 14), behavior: 'instant' });
}

function select(id, scroll = false) {
  if (!home.blocks.has(id)) return;
  if (selected !== id) {
    selected = id;
    renderInspector();
    markSelected();
  }
  if (scroll) previewSection(id);
}

function markSelected() {
  for (const [id, row] of controls) {
    row.container.classList.toggle('is-selected', id === selected);
    row.name.setAttribute('aria-expanded', String(id === selected));
    row.actions.hidden = id !== selected;
  }
  const active = home.blocks.get(selected);
  for (const [id, row] of previewControls) {
    row.grip.classList.toggle('is-selected', id === selected);
    if (row.block.layoutOwner) {
      row.grip.hidden = active?.group !== row.block.group;
    }
  }
}

function grip(doc, id, group) {
  const node = doc.createElement('span');
  node.className = doc === document ? 'grip' : 'editor-handle';
  node.draggable = true;
  node.setAttribute('aria-hidden', 'true');
  node.textContent = doc === document || group !== 'main' ? '⠿' : '⠿ ' + labelOf(id);
  node.title = 'Przeciągnij „' + labelOf(id) + '”';
  node.addEventListener('dragstart', (event) => {
    if (busy) return event.preventDefault();
    dragged = { id, group };
    event.dataTransfer.setData('application/x-wolbud-section', id);
    event.dataTransfer.effectAllowed = 'move';
    showSlots();
  });
  node.addEventListener('dragend', clearDrag);
  return node;
}

function dropIndex(group, id, before) {
  const others = items(group).filter((item) => item !== id);
  return before ? others.indexOf(before) : others.length;
}

function slot(doc, group, before, end = false) {
  const node = doc.createElement('div');
  node.className = doc === document ? 'slot' : 'editor-slot' + (end ? ' editor-slot-end' : '');
  node.dataset.slotGroup = group;
  node.dataset.before = before || '';
  node.setAttribute('aria-hidden', 'true');
  node.addEventListener('dragover', (event) => {
    if (!node.classList.contains('is-valid')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    node.classList.add('is-over');
  });
  node.addEventListener('dragleave', () => node.classList.remove('is-over'));
  node.addEventListener('drop', (event) => {
    if (!dragged || !node.classList.contains('is-valid')) return;
    event.preventDefault();
    const { id } = dragged;
    const index = dropIndex(group, id, before);
    clearDrag();
    move(id, group, index);
  });
  return node;
}

function showSlots() {
  document.body.classList.toggle('is-dragging', Boolean(dragged));
  for (const doc of [document, previewDoc]) {
    for (const node of doc.querySelectorAll('[data-slot-group]')) {
      const { before, slotGroup } = node.dataset;
      const allowed = Boolean(dragged && home.canPlace(dragged.id, slotGroup) && dragged.id !== before &&
        (dragged.group !== slotGroup || dropIndex(slotGroup, dragged.id, before) !== items(slotGroup).indexOf(dragged.id)));
      node.classList.toggle('is-valid', allowed);
      node.classList.remove('is-over');
      if (doc === previewDoc) node.hidden = !allowed;
      node.textContent = allowed ? (before ? 'Upuść przed ' + (labelOf(before).length > 27 ? 'tym elementem' : '„' + labelOf(before) + '”') : 'Upuść na końcu') : '';
    }
  }
}

function clearDrag() {
  dragged = null;
  showSlots();
}

function renderRows(list, group) {
  list.replaceChildren();
  const order = items(group);
  order.forEach((id, index) => {
    if (home.blocks.get(id)?.group !== group) return;
    const entry = document.createElement('li');
    const container = document.createElement('div');
    container.className = 'section-row';
    const title = document.createElement('div');
    title.className = 'section-name';
    const name = button(labelOf(id), () => select(id, true));
    const actions = document.createElement('div');
    actions.className = 'section-actions';
    actions.id = 'actions-' + id;
    name.setAttribute('aria-controls', actions.id);
    const up = button('Przenieś wyżej', () => move(id, group, index - 1, 'up'));
    const down = button('Przenieś niżej', () => move(id, group, index + 1, 'down'));
    up.disabled = busy || index === 0;
    down.disabled = busy || index === order.length - 1;
    title.append(grip(document, id, group), name);
    actions.append(up, down);
    if (content.added[id]) {
      const remove = button('Usuń', () => removeBlock(id));
      remove.disabled = busy;
      actions.append(remove);
    }
    container.append(title, actions);
    entry.append(slot(document, group, id), container);
    list.append(entry);
    controls.set(id, { container, name, actions, up, down });
  });
  const end = document.createElement('li');
  end.append(slot(document, group, null, true));
  list.append(end);
}

function renderInspector() {
  const box = get('inspector');
  for (const [id, row] of controls) {
    if (box.contains(row.container)) controls.delete(id);
  }
  box.replaceChildren();
  const block = home.blocks.get(selected);
  if (!block) return;
  const canNest = !block.layoutOwner && !block.node.matches('header.bar,footer,nav,button,p') &&
    (!block.node.closest('ul,ol') || block.node.matches('.review'));
  if (canNest) {
    const addInside = button('Dodaj w środku', () => openAdd(nestedGroup(selected)), 'add-button');
    addInside.disabled = busy;
    box.append(addInside);
  }
  if ((block.group && block.group !== 'main' && block.group !== 'photos') || home.mediaFor(block).image) {
    const media = button('Zdjęcie i odnośnik', () => openAdd(block.group, block.id), 'add-button');
    media.disabled = busy;
    box.append(media);
  }
  const link = home.mediaFor(block).link;
  if (link) {
    const target = new URL(link, previewDoc.baseURI);
    const base = new URL('../', import.meta.url);
    const path = target.origin === base.origin && target.pathname.startsWith(base.pathname)
      ? target.pathname.slice(base.pathname.length).replace(/\/$/, '/index.html') || 'index.html' : null;
    if (pages.some((page) => page.path === path) && path !== currentPath) {
      const open = button('Otwórz podlinkowaną stronę w panelu', () => visitPage(path));
      open.disabled = busy;
      box.append(open);
    }
  }
  const siblingGroup = block.group !== 'main' && home.groups.get(block.group);
  const showGroups = new Set(siblingGroup ? [block.group] : []);
  for (const [id, group] of home.groups) {
    if (group.owner === selected) showGroups.add(id);
  }
  const layout = document.createElement('details');
  layout.className = 'advanced-layout';
  layout.open = Boolean(block.layoutOwner);
  const layoutLabel = document.createElement('summary');
  layoutLabel.textContent = 'Układ elementów';
  layout.append(layoutLabel);
  for (const id of showGroups) {
    const group = home.groups.get(id);
    const details = document.createElement('details');
    details.className = 'collection-panel';
    details.open = siblingGroup === group;
    const heading = document.createElement('summary');
    heading.textContent = group.label + ' (' + items(id).length + ')';
    const list = document.createElement('ol');
    list.className = 'collection';
    details.append(heading, list);
    (group.layout ? layout : box).append(details);
    if (addLabels[group.type]) {
      const add = button(addLabels[group.type], () => openAdd(id), 'add-button');
      add.disabled = busy;
      (group.layout ? layout : box).append(add);
    }
    renderRows(list, id);
  }
  if (layout.children.length > 1) box.append(layout);
  if (block.fields.length) {
    const details = document.createElement('details');
    details.className = 'text-fields';
    const summary = document.createElement('summary');
    summary.textContent = 'Teksty i opisy · ' + labelOf(selected);
    details.append(summary);
    for (const field of block.fields) {
      const label = document.createElement('label');
      const name = document.createElement('span');
      name.textContent = field.label;
      const input = document.createElement(field.initial.length > 110 ? 'textarea' : 'input');
      input.maxLength = maxText;
      input.value = valueOf(field);
      input.disabled = busy;
      input.addEventListener('input', () => {
        setField(field, input.value);
        home.render(content);
      });
      label.append(name, input);
      details.append(label);
    }
    box.append(details);
  }
  markSelected();
  showSlots();
}

function move(id, group, index, focus) {
  const block = home.blocks.get(id);
  const currentGroup = block?.group;
  if (busy || !home.canPlace(id, group) || index < 0 ||
      index > items(group).length || (currentGroup === group && index === items(group).length)) return;
  const order = editableOrder(group);
  const previous = editableOrder(currentGroup);
  previous.splice(previous.indexOf(id), 1);
  order.splice(index, 0, id);
  if (content.added[id]) content.added[id].group = group;
  selected = id;
  render();
  previewSection(id);
  const row = controls.get(id);
  if (row && focus) (row[focus].disabled ? row.name : row[focus]).focus();
  const groupLabel = home.groups.get(group)?.label;
  get('movement').textContent = labelOf(id) + ' · pozycja ' + (index + 1) + ' z ' + order.length + ' · ' + groupLabel + '.';
  changed();
}

function setField(field, raw) {
  const value = normalize(raw);
  if (value === field.initial) delete content.texts[field.id];
  else content.texts[field.id] = value;
  field.editorTarget?.setAttribute('aria-invalid', String(value.length > maxText));
  const row = controls.get(field.block);
  if (row) row.name.textContent = labelOf(field.block);
  changed();
}

function attachField(field, withControls) {
  if (field.attribute || field.editorTarget) return;
  const parent = field.element;
  let target = parent;
  if (withControls || parent.childNodes.length > 1 || parent.matches('a,button')) {
    target = previewDoc.createElement('span');
    field.textNode.before(target);
    target.append(field.textNode);
  }
  field.editorTarget = target;
  target.classList.add('home-copy-field');
  target.contentEditable = busy ? 'false' : 'plaintext-only';
  target.setAttribute('role', 'textbox');
  target.setAttribute('aria-label', field.label);
  target.addEventListener('focus', () => select(field.block));
  target.addEventListener('input', () => setField(field, target.textContent));
  target.addEventListener('paste', (event) => {
    event.preventDefault();
    previewDoc.execCommand('insertText', false, normalize(event.clipboardData.getData('text')));
  });
  target.addEventListener('blur', () => {
    if (target.textContent !== valueOf(field)) target.textContent = valueOf(field);
    if (isContent(content)) home.render(content);
  });
  target.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      target.blur();
    }
  });
}

function attachPreview() {
  const movable = new Set([...home.blocks.values()].filter((block) => block.group).map((block) => block.node));
  for (const [id, row] of previewControls) {
    if (row.block !== home.blocks.get(id) || row.group !== row.block.group) {
      row.grip.remove();
      row.slot.remove();
      previewControls.delete(id);
    }
  }
  for (const block of home.blocks.values()) {
    const { id, node, group } = block;
    if (group && !node.matches('img,input,br') && !previewControls.has(id)) {
      if (previewDoc.defaultView.getComputedStyle(node).position === 'static') node.classList.add('editor-section');
      if (group !== 'main' && group !== 'photos') node.classList.add('editor-tile');
      const handle = grip(previewDoc, id, group);
      const start = slot(previewDoc, group, id);
      node.append(handle, start);
      previewControls.set(id, { block, group, grip: handle, slot: start });
    }
    for (const field of block.fields) attachField(field, movable.has(field.element));
  }
  for (const [group, end] of endSlots) {
    if (!home.groups.has(group)) {
      end.remove();
      endSlots.delete(group);
    }
  }
  for (const group of home.groups.keys()) {
    const last = home.blocks.get(items(group).at(-1));
    if (!last || last.node.matches('img,input,br')) continue;
    if (!endSlots.has(group)) endSlots.set(group, slot(previewDoc, group, null, true));
    last.node.append(endSlots.get(group));
  }
  for (const group of home.groups.values()) {
    if (group.drawer) group.drawer.open = true;
  }
}

function render() {
  home.render(content);
  attachPreview();
  controls.clear();
  renderRows(get('sections'), 'main');
  renderInspector();
  const fixed = get('fixed-regions');
  fixed.replaceChildren(...fixedIds.filter((id) => home.blocks.has(id)).map((id) => button(labelOf(id), () => select(id, true))));
  markSelected();
}

function setBusy(value) {
  busy = value;
  if (value) clearDrag();
  get('add-section').disabled = value;
  for (const field of home.fields.values()) {
    if (field.editorTarget) field.editorTarget.contentEditable = value ? 'false' : 'plaintext-only';
  }
  renderRows(get('sections'), 'main');
  renderInspector();
  publish.textContent = value ? 'Publikowanie…' : 'Opublikuj';
  refreshControls();
}

function openAdd(group, id) {
  if (busy) return;
  const block = home.blocks.get(id);
  const type = content.added[id]?.type || home.groups.get(group)?.type || (group?.startsWith('wewnatrz-') ? 'mixed' : null);
  const currentMedia = block ? home.mediaFor(block) : null;
  formContext = { group, id, type };
  get('block-form').reset();
  const section = group === 'main';
  get('type-field').hidden = Boolean(id) || (!section && type !== 'mixed');
  get('block-type').replaceChildren(...Object.entries(section ? sectionTypes : itemTypes)
    .map(([value, label]) => new Option(label, value)));
  get('media-fields').hidden = !id && section;
  get('image-summary').textContent = currentMedia?.image ? 'Zdjęcie jest już dodane.' : '';
  get('remove-photo-label').hidden = !currentMedia?.image;
  get('block-title').closest('.entry-field').hidden = Boolean(id);
  get('block-title').required = !id;
  get('block-link').value = /^mailto:|^tel:/.test(currentMedia?.link) ? '' : currentMedia?.link || '';
  get('add-title').textContent = id ? 'Zdjęcie i odnośnik' : (section ? 'Dodaj sekcję' : addLabels[type]);
  get('confirm-add').textContent = id ? 'Zastosuj' : 'Dodaj';
  updateBlockForm();
  setStatus('add-error', '');
  blockDialog.showModal();
}

function updateBlockForm() {
  const { group, id, type } = formContext;
  const actual = group === 'main' || type === 'mixed' ? get('block-type').value : type;
  const review = actual === 'review';
  get('rating-field').hidden = Boolean(id) || !review;
  get('block-body').closest('.entry-field').hidden = Boolean(id) || ['link', 'logo'].includes(actual);
  get('block-body').required = review && !id;
  get('block-title-label').textContent = review ? 'Podpis lub źródło opinii' : 'Nazwa';
  get('block-body-label').textContent = review ? 'Treść opinii' : 'Opis';
}

async function compactImage(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 20 * 1024 * 1024) {
    throw new Error('Wybierz plik JPG, PNG lub WebP o rozmiarze do 20 MB.');
  }
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  try {
    for (const width of [960, 720, 520]) {
      const scale = Math.min(1, width / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL('image/webp', .74);
      if (safeImage(data)) return data;
    }
  } finally {
    bitmap.close();
  }
  throw new Error('To zdjęcie jest za duże. Wybierz mniejszy plik.');
}

async function applyBlock(event) {
  event.preventDefault();
  const submit = get('confirm-add');
  if (submit.disabled) return;
  submit.disabled = true;
  try {
    const { group, id, type } = formContext;
    const settings = id && home.mediaFor(home.blocks.get(id));
    const record = {
      group, type: group === 'main' || type === 'mixed' ? get('block-type').value : type,
      title: normalize(get('block-title').value),
      body: normalize(get('block-body').value),
      rating: Number(get('block-rating').value),
      link: get('block-link').value.trim(),
      image: get('remove-photo').checked ? '' : settings?.image || '',
    };
    if (!id && (!record.title || (record.type === 'review' && !record.body))) throw new Error('Uzupełnij wymagane pola.');
    if (!safeLink(record.link)) throw new Error('Wpisz poprawny adres HTTPS lub adres podstrony.');
    const file = get('block-image').files[0];
    if (file) record.image = await compactImage(file);
    if (!blockDialog.open) return;
    const key = id || 'blok-' + crypto.randomUUID();
    const next = structuredClone(content);
    next.added = { ...content.added };
    if (id) {
      const overrides = { ...next.media[id] };
      if (record.link !== settings.link && (record.link || !/^mailto:|^tel:/.test(settings.link))) overrides.link = record.link;
      if (record.image !== settings.image) overrides.image = record.image;
      if (Object.keys(overrides).length) next.media[id] = overrides;
    } else {
      next.added[key] = record;
      const order = group === 'main' ? next.order : (next.lists[group] ||= []);
      order.push(key);
      if (group === 'main') next.lists[key] = [];
    }
    if (!isContent(next)) throw new Error('Brak miejsca na kolejny element. Zmniejsz rozmiar dodanych zdjęć.');
    content = next;
    selected = key;
    blockDialog.close();
    render();
    previewSection(key);
    changed();
    (controls.get(key)?.name || get('add-section')).focus();
  } catch (error) {
    setStatus('add-error', error.message || 'Nie udało się dodać elementu.', true);
  } finally {
    submit.disabled = false;
  }
}

function removeBlock(id) {
  const record = content.added[id];
  if (busy || !record) return;
  const ids = [id];
  for (const entry of ids) ids.push(...(content.lists[entry] || []), ...(content.lists[nestedGroup(entry)] || []));
  const order = editableOrder(record.group);
  order.splice(order.indexOf(id), 1);
  for (const entry of ids) {
    delete content.lists[entry];
    delete content.lists[nestedGroup(entry)];
    delete content.added[entry];
    delete content.media[entry];
    for (const field of home.blocks.get(entry)?.fields || []) delete content.texts[field.id];
    for (const [group, definition] of home.groups) {
      if (definition.layout && definition.owner === entry) delete content.lists[group];
    }
  }
  selected = home.groups.get(record.group).owner || content.order[0];
  render();
  changed();
  (controls.get(selected)?.name || get('add-section')).focus();
}

function rememberPublication(revision) {
  pending = revision;
  try {
    if (revision) localStorage.setItem(pendingKey, JSON.stringify(revision));
    else localStorage.removeItem(pendingKey);
  } catch {
    // The revision stays available for another attempt in this tab.
  }
}

function finishPublication(state) {
  published = state;
  content.revision = state.revision;
  rememberPublication(null);
  try {
    localStorage.removeItem(draftKey);
    saved = null;
  } catch {
    // A matching draft is ignored when the panel reopens.
  }
  setStatus('draft-status', 'Wszystkie zmiany opublikowane.');
  setStatus('live-status', 'Opublikowano. Strona publiczna pokazuje nową wersję.');
}

async function publishChanges() {
  if (busy || !isContent(content)) return;
  if (!credential) {
    access.returnValue = '';
    access.showModal();
    return;
  }
  if (!sameContent(content, saved) && !writeDraft()) return;
  setBusy(true);
  setStatus('live-status', 'Sprawdzanie bieżącej wersji…');
  try {
    const visible = await readPublished(home, { fresh: true, signal: AbortSignal.timeout(8000) });
    if (pending === visible.revision && sameContent(content, visible)) {
      finishPublication(visible);
      return;
    }
    if (visible.revision !== published.revision && visible.revision !== pending) {
      throw new Error('Strona publiczna ma nowszą wersję. Odśwież panel i sprawdź zapisany szkic przed ponowieniem.');
    }
    const candidate = { ...content, revision: crypto.randomUUID() };
    setStatus('live-status', 'Wysyłanie zmian…');
    try {
      await sendPublication(home, candidate, visible.revision, pending, credential);
    } catch (error) {
      if (error instanceof TypeError || error.name === 'TimeoutError') rememberPublication(candidate.revision);
      throw error;
    }
    rememberPublication(candidate.revision);
    setStatus('live-status', 'Zmiany wysłane. Czekam, aż będą widoczne na stronie publicznej.');
    finishPublication(await waitForPublication(home, candidate.revision));
  } catch (error) {
    if (error instanceof AccessError) credential = null;
    const message = error instanceof TypeError || error.name === 'TimeoutError'
      ? 'Połączenie zostało przerwane. Zmiany są w edytorze. Spróbuj ponownie.'
      : error.message;
    setStatus('live-status', message, true);
  } finally {
    setBusy(false);
  }
}

async function start() {
  previewDoc = frame.contentDocument;
  const page = frame.contentWindow.wolbudHome;
  if (!page) throw new Error('Nie udało się uruchomić podglądu. Odśwież panel.');
  home = page.home;
  try {
    published = await page.ready;
    setStatus('live-status', 'Wyświetlasz aktualną opublikowaną wersję.');
  } catch {
    published = home.original;
    setStatus('live-status', 'Nie udało się sprawdzić wersji publicznej. Możesz zapisać szkic.', true);
  }
  const draft = home.upgrade(stored(draftKey));
  saved = draft && !sameContent(draft, published) ? draft : null;
  pending = stored(pendingKey);
  if (pending === published.revision) rememberPublication(null);
  content = structuredClone(saved || published);
  if (saved && saved.revision !== published.revision) {
    setStatus('live-status', 'Strona ma nowszą wersję. Sprawdź przywrócony szkic przed publikacją.');
    content.revision = published.revision;
  }
  const initial = new URLSearchParams(location.search).get('sekcja');
  selected = home.blocks.has(initial) ? initial : content.order[0];
  previewDoc.body.classList.add('wolbud-preview');
  const style = previewDoc.createElement('link');
  style.rel = 'stylesheet';
  style.href = new URL('./preview.css?v=3', import.meta.url).href;
  previewDoc.head.append(style);
  previewDoc.addEventListener('click', (event) => {
    if (event.target.closest('a,.home-copy-field')) {
      event.preventDefault();
      event.stopPropagation();
    }
    const id = event.target.closest('[data-home-block]')?.dataset.homeBlock;
    if (id && !event.target.closest('.home-copy-field,button,summary,.editor-slot,.editor-handle')) select(id);
  }, true);
  render();
  previewSection(selected);
  get('add-section').disabled = false;
  changed();
}

if (config.mode === 'hosting') {
  get('access-help').textContent = 'Użyj hasła edytora otrzymanego od administratora strony.';
  get('credential-label').textContent = 'Hasło edytora';
  credentialInput.autocomplete = 'current-password';
}

save.addEventListener('click', writeDraft);
publish.addEventListener('click', publishChanges);
get('add-section').addEventListener('click', () => openAdd('main'));
get('block-form').addEventListener('submit', applyBlock);
get('block-type').addEventListener('change', updateBlockForm);
get('cancel-add').addEventListener('click', () => blockDialog.close());
access.addEventListener('close', () => {
  if (access.returnValue === 'publish') credential = credentialInput.value.trim();
  credentialInput.value = '';
  if (access.returnValue === 'publish' && credential) publishChanges();
});

for (const mode of ['wide', 'phone']) {
  get(mode).addEventListener('click', () => {
    frame.parentElement.classList.toggle('is-phone', mode === 'phone');
    get('wide').setAttribute('aria-pressed', String(mode === 'wide'));
    get('phone').setAttribute('aria-pressed', String(mode === 'phone'));
    if (home) requestAnimationFrame(() => previewSection(selected));
  });
}

function visitPage(path) {
  if (!path || path === currentPath || busy) return;
  if (content && !sameContent(content, saved || published) &&
      !window.confirm('Na tej stronie masz niezapisane zmiany. Czy chcesz ją opuścić?')) return;
  const url = new URL(location.href);
  url.search = path === 'index.html' ? '' : 'strona=' + encodeURIComponent(path);
  url.searchParams.set('v', '3');
  location.href = url.href;
}

function filterPages() {
  const search = normalize(get('page-filter').value).toLocaleLowerCase('pl');
  const matches = pages.filter(({ path, title }) => (title + ' ' + path).toLocaleLowerCase('pl').includes(search));
  const list = get('page-list');
  list.replaceChildren(...matches.map(({ path, title }) => new Option(title + (path === 'index.html' ? '' : ' · ' + path.replace(/\/index\.html$/, '')), path)));
  if (matches.some(({ path }) => path === currentPath)) list.value = currentPath;
}

async function openWorkspace() {
  try {
    const response = await fetch(new URL('../assets/page-catalog.json', import.meta.url), { cache: 'no-store' });
    if (!response.ok) throw new Error();
    pages = await response.json();
  } catch {
    pages = [{ path: 'index.html', title: 'Strona główna' }];
  }
  const wanted = new URLSearchParams(location.search).get('strona');
  const page = pages.find(({ path }) => path === wanted) || pages[0];
  currentPath = page.path;
  draftKey = initialDraftKey + (currentPath === 'index.html' ? '' : ':' + currentPath);
  pendingKey = draftKey + ':publication';
  const url = new URL('../' + currentPath, import.meta.url);
  get('current-page').textContent = page.title;
  get('public-page').href = url.href;
  filterPages();
  frame.addEventListener('load', () => start().catch((error) => setStatus('live-status', error.message, true)), { once: true });
  frame.src = url.href;
}
get('page-filter').addEventListener('input', filterPages);
get('choose-page').addEventListener('submit', (event) => {
  event.preventDefault();
  visitPage(get('page-list').value);
});
openWorkspace().catch((error) => setStatus('live-status', error.message, true));
