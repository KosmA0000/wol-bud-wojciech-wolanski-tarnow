// Samodzielny komponent klikanych kart wyboru z miniaturami (bez zewnętrznych zależności).

const STYLE_ID = 'ai-ui-choices-styles';

const CHOICES_CSS = `
.ai-choice-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
  font-family: var(--font, 'Figtree', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
}
.ai-choice-cards--with-thumbs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}
.ai-choice-card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  width: 100%;
  min-height: 46px;
  padding: 0;
  margin: 0;
  border: 1.5px solid var(--border, #d8ded3);
  border-radius: var(--radius-md, 11px);
  background: var(--bg-white, #ffffff);
  color: var(--text, #17231a);
  font: inherit;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  box-shadow: var(--shadow-xs, 0 1px 2px rgb(20 35 22 / 6%));
  transition: border-color 140ms ease, background-color 140ms ease, box-shadow 140ms ease, transform 140ms ease;
}
.ai-choice-card:hover:not(:disabled) {
  border-color: var(--brand-accent, #426728);
  background: var(--bg-selected, #e5efe0);
  box-shadow: var(--shadow-sm, 0 2px 8px rgb(20 35 22 / 8%));
  transform: translateY(-1px);
}
.ai-choice-card:active:not(:disabled) {
  transform: translateY(0);
}
.ai-choice-card:focus-visible {
  outline: 2px solid var(--brand, #2c4d19);
  outline-offset: 2px;
  border-color: var(--brand, #2c4d19);
}
.ai-choice-card.is-selected,
.ai-choice-card[aria-pressed="true"] {
  border-color: var(--brand, #2c4d19);
  background: var(--bg-selected, #e5efe0);
  box-shadow: 0 0 0 1px var(--brand, #2c4d19), var(--shadow-sm, 0 2px 8px rgb(20 35 22 / 8%));
}
.ai-choice-card-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 108px;
  padding: 6px;
  background: var(--bg-subtle, #f3f6ef);
  border-bottom: 1px solid var(--border, #d8ded3);
  overflow: hidden;
}
.ai-choice-card-thumb.is-hidden {
  display: none;
}
.ai-choice-card-thumb img {
  display: block;
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: var(--radius-xs, 6px);
}
.ai-choice-card-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 13px;
  min-width: 0;
}
.ai-choice-card-label {
  display: block;
  font-size: 13.5px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--text, #17231a);
  word-break: break-word;
}
.ai-choice-card.is-selected .ai-choice-card-label {
  color: var(--brand-dark, #213719);
}
.ai-choice-card-sub {
  display: block;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.35;
  color: var(--text-muted, #4f5f52);
  word-break: break-word;
}
`;

function resolveDoc(container) {
  if (container) {
    if (container.ownerDocument) return container.ownerDocument;
    if (container.nodeType === 9) return container;
  }
  return globalThis.document || null;
}

function ensureStyles(doc, fallbackHost) {
  if (!doc) return;
  if (typeof doc.getElementById === 'function' && doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CHOICES_CSS;
  const target = doc.head || doc.documentElement || fallbackHost;
  if (target && typeof target.appendChild === 'function') {
    target.appendChild(style);
  }
}

function safeImageUrl(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!url) return '';
  if (/^(javascript|vbscript):/i.test(url)) return '';
  if (/^data:/i.test(url)) {
    return /^data:image\/(?:png|jpeg|jpg|gif|webp|avif|svg\+xml|bmp|x-icon);/i.test(url) ? url : '';
  }
  if (/^(https?:|blob:|\/|\.\/|\.\.\/)/i.test(url)) return url;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) return url;
  return '';
}

function normalizeOptions(options) {
  if (!Array.isArray(options)) return [];
  return options
    .map((raw) => {
      if (raw && typeof raw === 'object') {
        const label = raw.label != null ? String(raw.label) : (raw.value != null ? String(raw.value) : '');
        const sub = raw.sub != null ? String(raw.sub) : '';
        const imageUrl = safeImageUrl(raw.imageUrl);
        const value = 'value' in raw && raw.value !== undefined ? raw.value : label;
        return { raw, label, sub, imageUrl, value };
      }
      const label = raw == null ? '' : String(raw);
      return { raw, label, sub: '', imageUrl: '', value: label };
    })
    .filter((item) => item.label.trim() !== '' || item.sub.trim() !== '' || item.imageUrl !== '');
}

/**
 * Renderuje klikane karty wyboru (opcjonalnie z miniaturą) w przekazanym kontenerze DOM.
 * @param {HTMLElement|null|undefined} container Element docelowy (opcjonalny).
 * @param {Array<{label:string, sub?:string, imageUrl?:string, value:any}|string>} options Opcje do wyboru.
 * @param {(value:any, rawOption:any, index:number) => void} onPick Callback wywoływany po wybraniu karty.
 * @returns {HTMLElement} Utworzony kontener `.ai-choice-cards`.
 */
export function renderChoiceCards(container, options, onPick) {
  const doc = resolveDoc(container);
  if (!doc) throw new Error('renderChoiceCards wymaga aktywnego dokumentu DOM.');

  ensureStyles(doc, container);

  const items = normalizeOptions(options);
  const root = doc.createElement('div');
  root.className = 'ai-choice-cards';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Wybierz opcję');
  root.setAttribute('data-ai-choice-cards', 'true');

  if (items.some((item) => item.imageUrl)) {
    root.classList.add('ai-choice-cards--with-thumbs');
  }

  const buttons = [];

  const pick = (idx) => {
    const chosen = items[idx];
    if (!chosen) return;
    buttons.forEach((btn, i) => {
      const selected = i === idx;
      btn.classList.toggle('is-selected', selected);
      btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    root.dataset.selectedIndex = String(idx);
    if (typeof onPick === 'function') {
      onPick(chosen.value, chosen.raw, idx);
    }
  };

  items.forEach((item, idx) => {
    const card = doc.createElement('button');
    card.type = 'button';
    card.className = 'ai-choice-card';
    card.setAttribute('aria-pressed', 'false');
    card.setAttribute('data-choice-index', String(idx));

    if (item.imageUrl) {
      const thumbWrap = doc.createElement('div');
      thumbWrap.className = 'ai-choice-card-thumb';
      const img = doc.createElement('img');
      img.setAttribute('src', item.imageUrl);
      img.setAttribute('alt', item.label || '');
      img.setAttribute('loading', 'lazy');
      img.addEventListener('error', () => {
        thumbWrap.classList.add('is-hidden');
      });
      thumbWrap.appendChild(img);
      card.appendChild(thumbWrap);
    }

    const body = doc.createElement('span');
    body.className = 'ai-choice-card-body';

    const labelEl = doc.createElement('span');
    labelEl.className = 'ai-choice-card-label';
    labelEl.textContent = item.label;
    body.appendChild(labelEl);

    if (item.sub) {
      const subEl = doc.createElement('span');
      subEl.className = 'ai-choice-card-sub';
      subEl.textContent = item.sub;
      body.appendChild(subEl);
    }

    card.appendChild(body);

    card.addEventListener('click', () => {
      pick(idx);
    });

    card.addEventListener('keydown', (e) => {
      const key = e.key;
      if (key === 'Enter' || key === ' ' || key === 'Spacebar' || e.code === 'Space') {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        pick(idx);
        return;
      }
      if (!buttons.length) return;
      let nextIdx = -1;
      if (key === 'ArrowRight' || key === 'ArrowDown') {
        nextIdx = (idx + 1) % buttons.length;
      } else if (key === 'ArrowLeft' || key === 'ArrowUp') {
        nextIdx = (idx - 1 + buttons.length) % buttons.length;
      } else if (key === 'Home') {
        nextIdx = 0;
      } else if (key === 'End') {
        nextIdx = buttons.length - 1;
      }
      if (nextIdx >= 0) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        if (typeof buttons[nextIdx].focus === 'function') buttons[nextIdx].focus();
      }
    });

    buttons.push(card);
    root.appendChild(card);
  });

  if (container && typeof container.appendChild === 'function') {
    container.appendChild(root);
  }

  return root;
}
