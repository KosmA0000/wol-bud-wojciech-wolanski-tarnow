import { isContent, normalize, readPublished, sections } from '../assets/home-content.js';
import { config } from './config.js';
import { AccessError, sendPublication, waitForPublication } from './publish.js?v=20261120-2';

const get = (id) => document.getElementById(id);
const frame = get('preview');
const list = get('sections');
const save = get('save');
const publish = get('publish');
const access = get('access');
const credentialInput = get('credential');
const draftKey = 'wolbud:' + location.pathname.replace(/index\.html$/, '') + ':home-draft';
const pendingKey = draftKey + ':publication';
let home, published, content, saved, pending, previewDoc, selected, dragged, busy, credential;
let sidebarRows = {};
let previewHandles = {};
let previewSlots = {};
let dropSlots = [];

function stored(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function sameContent(a, b) {
  return a?.order.join() === b?.order.join() &&
    Object.keys(sections).every((id) =>
      Object.keys(sections[id].fields).every((key) => a.fields[id][key] === b.fields[id][key]));
}

function setStatus(id, message, error = false) {
  const node = get(id);
  node.textContent = message;
  node.toggleAttribute('data-error', error);
}

function refreshControls() {
  const valid = isContent(content);
  save.disabled = busy || !valid || sameContent(content, saved || published);
  publish.disabled = busy || !valid || (sameContent(content, published) && !pending);
}

function changed() {
  if (!isContent(content)) {
    setStatus('draft-status', 'Sprawdź zaznaczone pole. Tekst nie może być pusty ani przekraczać limitu.', true);
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

function previewSection(id, preferred = null) {
  const section = home.nodes[id];
  const scrollTarget = preferred || section;
  const view = previewDoc.defaultView;
  const bar = previewDoc.querySelector('header.bar')?.getBoundingClientRect().height || 0;
  const offset = Math.max(0, scrollTarget.getBoundingClientRect().top + view.scrollY - bar - 14);
  view.scrollTo({ top: offset, behavior: 'instant' });
}

function selectSection(id) {
  selected = id;
  for (const [item, row] of Object.entries(sidebarRows)) {
    row.container.classList.toggle('is-selected', id === item);
    row.name.setAttribute('aria-expanded', String(id === item));
    row.actions.hidden = id !== item;
    previewHandles[item]?.classList.toggle('is-selected', id === item);
  }
}

function makeButton(label, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', action);
  return button;
}

function makeGrip(doc, id, className) {
  const grip = doc.createElement('span');
  grip.className = className;
  grip.draggable = true;
  grip.setAttribute('aria-hidden', 'true');
  grip.textContent = doc === document ? '⠿' : '⠿  ' + sections[id].label;
  grip.title = 'Przeciągnij sekcję „' + sections[id].label + '”';
  grip.addEventListener('dragstart', (event) => {
    if (busy) return event.preventDefault();
    dragged = id;
    event.dataTransfer.setData('application/x-wolbud-section', id);
    event.dataTransfer.effectAllowed = 'move';
    selectSection(id);
    showDropSlots();
  });
  grip.addEventListener('dragend', clearDrag);
  return grip;
}

function targetIndex(id, before) {
  const without = content.order.filter((item) => item !== id);
  return before ? without.indexOf(before) : without.length;
}

function makeSlot(doc, before, className) {
  const slot = doc.createElement('div');
  slot.className = className;
  slot.setAttribute('aria-hidden', 'true');
  slot.dataset.before = before || '';
  const allowed = () => dragged && slot.classList.contains('is-valid');
  slot.addEventListener('dragover', (event) => {
    if (!allowed()) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    slot.classList.add('is-over');
  });
  slot.addEventListener('dragleave', () => slot.classList.remove('is-over'));
  slot.addEventListener('drop', (event) => {
    if (!allowed()) return;
    event.preventDefault();
    const id = dragged;
    const index = targetIndex(id, before);
    clearDrag();
    move(id, index);
  });
  return slot;
}

function showDropSlots() {
  document.body.classList.toggle('is-dragging', Boolean(dragged));
  for (const slot of dropSlots) {
    const before = slot.dataset.before;
    const available = Boolean(dragged && before !== dragged &&
      targetIndex(dragged, before) !== content.order.indexOf(dragged));
    slot.classList.toggle('is-valid', available);
    slot.classList.remove('is-over');
    slot.textContent = available ? (before ? 'Upuść przed sekcją „' + sections[before].label + '”' : 'Upuść na końcu') : '';
    if (slot.ownerDocument !== document) slot.hidden = !available;
  }
}

function clearDrag() {
  dragged = null;
  showDropSlots();
}

function renderOrder() {
  home.renderOrder(content.order);
  const last = content.order.at(-1);
  home.nodes[last].append(previewSlots.end);
  list.replaceChildren();
  sidebarRows = {};
  dropSlots = [...Object.values(previewSlots)];

  content.order.forEach((id, index) => {
    const entry = document.createElement('li');
    const slot = makeSlot(document, id, 'slot');
    dropSlots.push(slot);
    const container = document.createElement('div');
    container.className = 'section-row';
    const title = document.createElement('div');
    title.className = 'section-name';
    const name = makeButton(sections[id].label, () => {
      selectSection(id);
      previewSection(id);
    });
    const actions = document.createElement('div');
    actions.className = 'section-actions';
    actions.id = 'actions-' + id;
    name.setAttribute('aria-controls', actions.id);
    const up = makeButton('Przenieś wyżej', () => move(id, index - 1, 'up'));
    const down = makeButton('Przenieś niżej', () => move(id, index + 1, 'down'));
    up.disabled = busy || index === 0;
    down.disabled = busy || id === last;
    title.append(makeGrip(document, id, 'grip'), name);
    actions.append(up, down);
    container.append(title, actions);
    entry.append(slot, container);
    list.append(entry);
    sidebarRows[id] = { container, name, actions, up, down };
  });

  const end = makeSlot(document, null, 'slot');
  dropSlots.push(end);
  get('last-slot').replaceChildren(end);
  selectSection(selected);
  showDropSlots();
}

function move(id, index, focus) {
  if (busy || index < 0 || index >= content.order.length) return;
  const from = content.order.indexOf(id);
  content.order.splice(from, 1);
  content.order.splice(index, 0, id);
  selected = id;
  renderOrder();
  previewSection(id);
  const row = sidebarRows[id];
  if (focus) (row[focus].disabled ? row.name : row[focus]).focus();
  get('movement').textContent = sections[id].label + ' · pozycja ' + (index + 1) + ' z 3.';
  changed();
}

function fieldState(id, key, target) {
  const value = normalize(target.textContent);
  const max = sections[id].fields[key][2];
  content.fields[id][key] = value;
  target.setAttribute('aria-invalid', String(!value || value.length > max));
  changed();
}

function attachPreview() {
  previewDoc.body.classList.add('wolbud-preview');
  const style = previewDoc.createElement('link');
  style.rel = 'stylesheet';
  style.href = new URL('./preview.css', import.meta.url).href;
  previewDoc.head.append(style);
  for (const id of Object.keys(sections)) {
    const node = home.nodes[id];
    node.classList.add('editor-section');
    const grip = makeGrip(previewDoc, id, 'editor-handle');
    const slot = makeSlot(previewDoc, id, 'editor-slot');
    previewHandles[id] = grip;
    previewSlots[id] = slot;
    node.prepend(grip, slot);
    for (const [key, target] of Object.entries(home.targets[id])) {
      const [, label, max] = sections[id].fields[key];
      target.contentEditable = 'plaintext-only';
      target.setAttribute('role', 'textbox');
      target.setAttribute('aria-label', label + ' · ' + sections[id].label);
      target.setAttribute('title', label + ' · do ' + max + ' znaków');
      target.addEventListener('focus', () => selectSection(id));
      target.addEventListener('input', () => fieldState(id, key, target));
      target.addEventListener('paste', (event) => {
        event.preventDefault();
        previewDoc.execCommand('insertText', false, normalize(event.clipboardData.getData('text')));
      });
      target.addEventListener('blur', () => {
        if (target.textContent !== content.fields[id][key]) target.textContent = content.fields[id][key];
      });
      target.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          target.blur();
        }
      });
    }
  }
  previewSlots.end = makeSlot(previewDoc, null, 'editor-slot editor-slot-end');
  previewDoc.addEventListener('click', (event) => {
    if (event.target.closest('a')) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
}

function setBusy(value) {
  busy = value;
  if (value) clearDrag();
  for (const group of Object.values(home.targets)) {
    for (const target of Object.values(group)) target.contentEditable = value ? 'false' : 'plaintext-only';
  }
  for (const [id, row] of Object.entries(sidebarRows)) {
    const index = content.order.indexOf(id);
    row.up.disabled = value || index === 0;
    row.down.disabled = value || index === content.order.length - 1;
  }
  publish.textContent = value ? 'Publikowanie…' : 'Opublikuj';
  refreshControls();
}

function rememberPublication(revision) {
  pending = revision;
  try {
    if (revision) localStorage.setItem(pendingKey, JSON.stringify(revision));
    else localStorage.removeItem(pendingKey);
  } catch {
    // The in-memory revision still permits a retry in this tab.
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
    // A matching draft is ignored when the next session opens.
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
    const visible = await readPublished(home.original, { fresh: true, signal: AbortSignal.timeout(8000) });
    if (pending === visible.revision && sameContent(content, visible)) {
      finishPublication(visible);
      return;
    }
    if (visible.revision !== published.revision && visible.revision !== pending) {
      throw new Error('Strona publiczna ma nowszą wersję. Odśwież panel i sprawdź zapisany szkic przed ponowieniem.');
    }
    const candidate = { ...content, revision: crypto.randomUUID() };
    setStatus('live-status', 'Wysyłanie zmian…');
    // Keep the last accepted revision until the next request is acknowledged.
    const prior = pending;
    let sent = false;
    try {
      await sendPublication(candidate, visible.revision, prior, credential);
      sent = true;
    } catch (error) {
      if (error instanceof TypeError || error.name === 'TimeoutError') rememberPublication(candidate.revision);
      throw error;
    }
    if (sent) rememberPublication(candidate.revision);
    setStatus('live-status', 'Zmiany wysłane. Czekam, aż będą widoczne na stronie publicznej.');
    finishPublication(await waitForPublication(home.original, candidate.revision));
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
  const draft = stored(draftKey);
  saved = isContent(draft) && !sameContent(draft, published) ? draft : null;
  pending = stored(pendingKey);
  if (pending === published.revision) rememberPublication(null);
  content = structuredClone(saved || published);
  if (saved && saved.revision !== published.revision) {
    setStatus('live-status', 'Strona ma nowszą wersję. Sprawdź przywrócony szkic przed publikacją.');
    content.revision = published.revision;
  }
  selected = content.order[0];
  attachPreview();
  home.renderFields(content.fields);
  renderOrder();
  const initial = new URLSearchParams(location.search).get('sekcja');
  if (Object.hasOwn(sections, initial)) selectSection(initial);
  previewSection(selected);
  changed();
}

if (config.mode === 'hosting') {
  get('access-help').textContent = 'Użyj hasła edytora otrzymanego od administratora strony.';
  get('credential-label').textContent = 'Hasło edytora';
  credentialInput.autocomplete = 'current-password';
}

save.addEventListener('click', writeDraft);
publish.addEventListener('click', publishChanges);
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

const initialize = () => start().catch((error) => setStatus('live-status', error.message, true));
if (frame.contentWindow?.wolbudHome) initialize();
else frame.addEventListener('load', initialize, { once: true });
