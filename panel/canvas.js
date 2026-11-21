// Serce wizualnego kreatora WYSIWYG dla witryny statycznej WOL-BUD Tarnów i dowolnych stron HTML
import {
  ITEM_TEMPLATES,
  SECTION_TEMPLATES,
  toRelativeUrl,
  toRootPath,
} from './templates.js?v=20261121-25';
import { sanitizeHtmlFragment, sanitizeUrl, sanitizeText } from './sanitizer.js?v=20261121-25';

const BUTTON_STYLE_LABELS = {
  'tc-tel': 'Ciemny przycisk główny (zaokrąglony)',
  'tc-mail': 'Przycisk konturowy z ikoną',
  'hero-btn': 'Zielony przycisk główny (Hero)',
  'hero-mail': 'Jasny przycisk konturowy (Hero)',
  'store-nav-btn': 'Przycisk linku / nawigacji z ikoną',
  'trust-about-link': 'Przycisk z ramką i strzałką ↗',
  'service-feature-btn': 'Jasny przycisk wyróżnienia',
  'realizations-more': 'Przycisk „Zobacz wszystkie”',
  'reviews-link': 'Przycisk linku (ciemne tło)',
  'cat-nav-pill': 'Pigułka nawigacyjna (pill)',
  'home-extra-category': 'Przycisk kategorii ze strzałką',
  'sidebar-link': 'Link ze strzałką w karcie',
  'pnav-all': 'Przycisk powrotu / oferty',
  'btn-primary': 'Przycisk główny (.btn-primary)',
  'btn-secondary': 'Przycisk dodatkowy (.btn-secondary)',
  btn: 'Przycisk standardowy (.btn)',
  button: 'Przycisk standardowy (.button)',
};

const KNOWN_BUTTON_CLASSES = new Set(Object.keys(BUTTON_STYLE_LABELS));
const CARD_LINK_CLASSES = new Set([
  'home-cat-card',
  'subcat-card',
  'realization-card',
  'home-featured-product',
  'cat-prod-media',
  'brand',
  'phone',
  'menu-phone',
  'contact-bubble',
  'sidebar-tel',
  'kt-num',
]);

function detectButtonStyleId(el) {
  if (!el || !el.classList || el.classList.length === 0) return '';
  const classes = Array.from(el.classList).filter((c) => !c.startsWith('cms-'));
  if (classes.some((c) => CARD_LINK_CLASSES.has(c))) return '';
  for (const c of classes) {
    if (KNOWN_BUTTON_CLASSES.has(c)) return c;
  }
  const genericMatch = classes.find((c) => /(?:^|-)(?:btn|button|cta|pill)(?:-|$)/i.test(c));
  return genericMatch || '';
}

function cleanPrototypeHtml(el) {
  const clone = el.cloneNode(true);
  clone.querySelectorAll('[data-cms-ui]').forEach((n) => n.remove());
  [clone, ...clone.querySelectorAll('*')].forEach((node) => {
    EDITOR_CLASSES.forEach((cls) => node.classList?.remove(cls));
    EDITOR_ATTRS.forEach((attr) => node.removeAttribute?.(attr));
    if (node.hasAttribute?.('class') && !node.getAttribute('class').trim()) {
      node.removeAttribute('class');
    }
  });
  return clone.outerHTML;
}

/**
 * Skanuje dokument HTML i wykrywa wszystkie realne style przycisków istniejące na tej witrynie.
 */
export function extractButtonStylesFromDoc(targetDoc, sourcePage = 'index.html') {
  if (!targetDoc) return [];
  const main = targetDoc.querySelector('main#main') || targetDoc.querySelector('main') || targetDoc.body;
  if (!main) return [];

  const byStyle = new Map();
  main.querySelectorAll('a[class], button[class]').forEach((el) => {
    if (el.closest('[data-cms-ui], header.bar, footer, nav.contact-bubbles, .lightbox-modal, .page-nav-bar')) return;
    if (el.hasAttribute('data-lightbox-trigger') || el.hasAttribute('data-scroll-prev') || el.hasAttribute('data-scroll-next')) return;
    if (el.querySelector('img, figure, h1, h2, h3, h4, div')) return;

    const styleId = detectButtonStyleId(el);
    if (!styleId) return;

    const text = truncate(getPreservedText(el), 40);
    const existing = byStyle.get(styleId);
    if (existing) {
      existing.sampleCount += 1;
      return;
    }

    const classes = Array.from(el.classList).filter((c) => !c.startsWith('cms-'));
    byStyle.set(styleId, {
      styleId,
      label: BUTTON_STYLE_LABELS[styleId] || `Przycisk ze stylu .${styleId}`,
      cssClass: classes.join(' '),
      exampleText: text || 'Zobacz więcej',
      exampleHref: el.getAttribute('href') || '',
      foundOnPage: sourcePage,
      sampleCount: 1,
      templateHtml: cleanPrototypeHtml(el),
    });
  });

  return Array.from(byStyle.values());
}

/**
 * Skanuje dokument HTML i zwraca listę istniejących sekcji/bloków możliwych do 1:1 sklonowania na inną stronę.
 */
export function extractReusableSectionsFromDoc(targetDoc, sourcePage = 'index.html') {
  if (!targetDoc) return [];
  const main = targetDoc.querySelector('main#main') || targetDoc.querySelector('main') || targetDoc.body;
  if (!main) return [];

  const blocks = [];
  const subpageContent = main.querySelector('.subpage-content');
  let candidates = [];
  if (subpageContent) {
    candidates = Array.from(subpageContent.children);
  } else {
    for (const ch of Array.from(main.children)) {
      if (ch.classList?.contains('photo-band')) {
        candidates.push(...Array.from(ch.children));
      } else {
        candidates.push(ch);
      }
    }
  }

  let idx = 0;
  for (const el of candidates) {
    if (!el || el.nodeType !== 1 || el.hasAttribute('data-cms-ui')) continue;
    const tag = el.tagName.toUpperCase();
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'HEADER' || tag === 'FOOTER' || tag === 'NAV') continue;
    if (el.classList.contains('hero') || el.id === 'start' || el.classList.contains('page-nav-bar')) continue;

    const label = getSectionLabel(el);
    const classes = Array.from(el.classList).filter((c) => !c.startsWith('cms-'));
    blocks.push({
      sourcePage,
      sectionIndex: idx,
      sectionId: el.id || '',
      label,
      cssClass: classes.join(' '),
      hasCarousel: Boolean(el.querySelector('.cms-carousel-track, [data-scroll-gallery]')),
      html: cleanPrototypeHtml(el),
    });
    idx += 1;
  }

  return blocks;
}

const PREVIEW_CSS_URL = new URL('./preview.css', import.meta.url).href;

const FRAME_IMAGE_SELECTOR =
  '.cat-prod-media, .subcat-card-media, .home-cat-thumb, .montage-step-media, .home-featured-media';

const SECTION_STYLE_CLASSES = {
  tone: {
    light: 'cms-tone-light',
    dark: 'cms-tone-dark',
    accent: 'cms-tone-accent',
  },
  align: {
    left: 'cms-align-left',
    center: 'cms-align-center',
  },
  spacing: {
    compact: 'cms-space-compact',
    spacious: 'cms-space-spacious',
  },
};

const GENERIC_REPEATER_SELECTOR = [
  '[data-cms-repeater]',
  '.cards',
  '.card-grid',
  '.grid',
  '.services-grid',
  '.features-grid',
  '.gallery-grid',
  '.team-grid',
  '.pricing-grid',
].join(', ');

const GENERIC_REPEATER_ITEM_TAGS = new Set(['ARTICLE', 'A', 'DIV', 'LI']);

const EDITOR_CLASSES = [
  'wolbud-preview',
  'cms-browse-mode',
  'cms-free-mode',
  'cms-ai-pick-mode',
  'cms-ai-pick-hover',
  'cms-selected',
  'cms-hovered',
  'cms-section',
  'cms-repeater',
  'cms-item',
  'cms-editable-text',
  'cms-dragging',
  'cms-drag-over',
  'cms-drag-over-before',
  'cms-drag-over-after',
  'cms-is-dragging-section',
  'cms-img-host',
  'cms-element-selected',
];

const EDITOR_ATTRS = [
  'contenteditable',
  'data-cms-uid',
  'data-cms-kind',
  'data-cms-item-type',
  'data-cms-label',
  'data-cms-field',
  'data-cms-repeater-uid',
  'draggable',
  'spellcheck',
];

const REPEATER_SPECS = [
  { selector: '.home-catalog-grid', itemSelector: ':scope > .home-cat-card', itemType: 'cat-card', label: 'Kafelki oferty (duże kategorie ze zdjęciem)' },
  { selector: '.home-extra-categories', itemSelector: ':scope > .home-extra-category', itemType: 'extra-category', label: 'Dodatkowe kategorie (małe kafelki-pigułki bez zdjęcia)' },
  { selector: '.home-featured-grid', itemSelector: ':scope > .home-featured-product', itemType: 'featured-product', label: 'Polecane produkty (karty produktów)' },
  { selector: '.home-services-grid', itemSelector: ':scope > .home-service-item', itemType: 'home-service', label: 'Kafelki usług' },
  { selector: '.reviews-track', itemSelector: ':scope > .review', itemType: 'review-card', label: 'Opinie' },
  { selector: '.realization-cards', itemSelector: ':scope > .realization-card', itemType: 'realization-card', label: 'Kafelki realizacji' },
  { selector: '.cms-carousel-track', itemSelector: ':scope > .realization-photo', itemType: 'realization-photo', label: 'Zdjęcia w galerii' },
  { selector: '.realization-grid', itemSelector: ':scope > .realization-photo', itemType: 'realization-photo', label: 'Zdjęcia realizacji' },
  { selector: 'aside.subpage-sidebar', itemSelector: ':scope > .sidebar-box', itemType: 'sidebar-box', label: 'Karty panelu bocznego', vertical: true },
  { selector: '.product-gallery-row', itemSelector: ':scope > .product-gallery-thumb', itemType: 'gallery-thumb', label: 'Zdjęcia produktu' },
  { selector: '.partner-row', itemSelector: ':scope > .partner-logo', itemType: 'partner-logo', label: 'Logotypy partnerów' },
  { selector: '.kt-adres', itemSelector: ':scope > .kt-store-item', itemType: 'store-item', label: 'Salony sprzedaży', insertBeforeSelector: ':scope > .store-full-copy-link' },
  { selector: '.location-grid', itemSelector: ':scope > .location-card', itemType: 'location-card', label: 'Karty salonów' },
  { selector: '.profile-list', itemSelector: ':scope > .profile-row', itemType: 'profile-row', label: 'Profile / systemy', vertical: true },
  { selector: '.subcat-grid', itemSelector: ':scope > .subcat-card', itemType: 'subcat-card', label: 'Kafelki podkategorii' },
  { selector: '.cat-products-grid, .cat-prod-grid', itemSelector: ':scope > .cat-prod-card', itemType: 'cat-prod-card', label: 'Kafelki produktów' },
  { selector: '.brand-chips', itemSelector: ':scope > li', itemType: 'brand-chip', label: 'Katalogi / linki' },
  { selector: '.cat-quick-nav-pills', itemSelector: ':scope > .cat-nav-pill', itemType: 'nav-pill', label: 'Kafelki paska kategorii („Kategorie:” — np. Okna PCV, Drzwi…)' },
  { selector: 'ul.source-list', itemSelector: ':scope > li', itemType: 'list-item', label: 'Punkty listy', vertical: true },
  { selector: '.montage-steps-grid', itemSelector: ':scope > .montage-step-card', itemType: 'montage-step', label: 'Kroki montażu' },
];

const INLINE_TEXT_SELECTOR = [
  'h1', 'h2', 'h3', 'h4', 'p',
  '.eyebrow', '.profile-row__kicker', '.home-cat-cta',
  '.score-value', '.score-meta', 'blockquote', '.review-source',
  '.kt-lab', '.kt-store-title', '.kt-store-addr', '.kt-store-phone', '.kt-oferta',
  'address', '.location-card__hours', 'summary',
  '.realization-card-body span', '.home-featured-copy span',
  '.cat-prod-btn', '.cat-prod-tag', '.cat-prod-title a',
  '.hero-meta span', '.subpage-lead', '.service-card-teaser',
  '.realization-count', '.sidebar-tel', '.montage-step-title',
  'a.trust-about-link', 'a.tc-tel', 'a.tc-mail',
  'a.hero-btn', 'a.hero-mail', 'a.realizations-more',
  'a.store-full-copy-link', 'a.service-feature-btn',
  'a.home-extra-category', 'a.cat-nav-pill',
  '.home-services-head > a', '.reviews-link',
  '.source-list > li', '.mobile-details-body li',
  '.kt-lista li > span', '.kt-lista li > a',
  '.sidebar-links a', 'a.sidebar-link', 'a.sidebar-map-link',
  '.brand-chips a',
  'a.btn', 'a.button',
].join(', ');

const SINGLE_LINE_SELECTOR =
  'h1, h2, h3, h4, .eyebrow, .profile-row__kicker, .score-value, .review-source, .kt-lab, .kt-store-title, .cat-prod-tag, .realization-count, .montage-step-title, summary, a, .hero-meta span, .mask > span';

function trimText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function truncate(value, max = 38) {
  const s = trimText(value);
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trim()}…`;
}

function pluralizePhotos(n) {
  const count = Math.max(0, Number(n) || 0);
  if (count === 1) return '1 zdjęcie';
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} zdjęcia`;
  }
  return `${count} zdjęć`;
}

function normalizeRepoPath(path) {
  if (!path) return '';
  return String(path).trim().replace(/\\/g, '/').replace(/^(\.\/|\/)+/, '');
}

function isDecorativeSpan(node) {
  if (!node || node.nodeType !== 1) return false;
  if (node.tagName !== 'SPAN') return false;
  const txt = trimText(node.textContent);
  return txt === '↗' || txt === '→' || txt === '←' || node.getAttribute('aria-hidden') === 'true';
}

function isIconOrUiNode(node) {
  if (!node || node.nodeType !== 1) return false;
  if (node.hasAttribute('data-cms-ui')) return true;
  const tag = node.tagName.toUpperCase();
  if (tag === 'SVG' || tag === 'I') return true;
  if (isDecorativeSpan(node)) return true;
  return false;
}

function hasProtectedChildren(el) {
  for (const child of el.children) {
    if (child.hasAttribute('data-cms-ui')) continue;
    const tag = child.tagName.toUpperCase();
    if (
      tag === 'SVG' ||
      tag === 'I' ||
      tag === 'UL' ||
      tag === 'OL' ||
      tag === 'A' ||
      tag === 'H1' ||
      tag === 'H2' ||
      tag === 'H3' ||
      tag === 'H4' ||
      tag === 'BR' ||
      tag === 'DIV' ||
      tag === 'DETAILS' ||
      child.classList?.contains('mask') ||
      isDecorativeSpan(child)
    ) {
      return true;
    }
    if ((tag === 'B' || tag === 'STRONG') && el.classList.contains('kt-oferta')) {
      return true;
    }
  }
  return false;
}

/**
 * Odczytuje tekst elementu z pominięciem nakładek CMS, ikon <svg>/<i> oraz strzałek <span>↗</span>.
 */
function getPreservedText(el) {
  if (!el) return '';
  if (el.matches('.kt-oferta')) {
    const parts = [];
    for (const node of el.childNodes) {
      if (node.nodeType === 3) parts.push(node.nodeValue);
      else if (node.nodeType === 1 && !node.hasAttribute('data-cms-ui')) {
        if (node.tagName === 'BR') parts.push('\n');
        else parts.push(node.textContent);
      }
    }
    return parts.join('').replace(/[ \t]+/g, ' ').trim();
  }

  let out = '';
  for (const node of el.childNodes) {
    if (node.nodeType === 3) {
      out += node.nodeValue;
    } else if (node.nodeType === 1) {
      if (isIconOrUiNode(node)) continue;
      if (node.tagName === 'BR') {
        out += '\n';
      } else if (node.tagName === 'UL' || node.tagName === 'OL') {
        continue;
      } else {
        out += getPreservedText(node);
      }
    }
  }
  return out
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .trim();
}

/**
 * Bezpiecznie ustawia tekst elementu bez niszczenia wewnętrznych <svg>, <i>, <span>↗</span>, <ul> ani nakładek CMS.
 */
function setPreservedText(el, rawValue) {
  if (!el) return;
  const doc = el.ownerDocument;
  const value = String(rawValue ?? '');

  // Zabezpiecz nakładki CMS
  const uiNodes = Array.from(el.children).filter((ch) => ch.hasAttribute('data-cms-ui'));

  // Elementy z <br> (np. .score-meta)
  const hasBr = Boolean(el.querySelector('br'));
  const hasIcons = Array.from(el.children).some((ch) => !ch.hasAttribute('data-cms-ui') && isIconOrUiNode(ch));
  const nestedList = Array.from(el.children).find((ch) => ch.tagName === 'UL' || ch.tagName === 'OL');

  if (hasIcons) {
    const leadingIcons = [];
    const trailingIcons = [];
    let seenTextOrContent = false;
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === 1 && node.hasAttribute('data-cms-ui')) continue;
      if (node.nodeType === 1 && isIconOrUiNode(node)) {
        if (!seenTextOrContent) leadingIcons.push(node);
        else trailingIcons.push(node);
      } else if (node.nodeType === 3 && trimText(node.nodeValue)) {
        seenTextOrContent = true;
      } else if (node.nodeType === 1) {
        seenTextOrContent = true;
      }
    }

    // Usuń istniejące węzły tekstowe (zachowaj ikony i UI)
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === 3) {
        node.remove();
      } else if (node.nodeType === 1 && !node.hasAttribute('data-cms-ui') && !isIconOrUiNode(node)) {
        node.remove();
      }
    }

    const needsTrailingSpace =
      trailingIcons.length > 0 && trailingIcons[0].tagName === 'SPAN' && value.length > 0;
    const textNode = doc.createTextNode(needsTrailingSpace ? `${value} ` : value);

    if (trailingIcons.length > 0) {
      el.insertBefore(textNode, trailingIcons[0]);
    } else if (leadingIcons.length > 0) {
      const lastLead = leadingIcons[leadingIcons.length - 1];
      lastLead.after(textNode);
    } else if (uiNodes.length > 0) {
      el.insertBefore(textNode, uiNodes[0]);
    } else {
      el.appendChild(textNode);
    }
    return;
  }

  if (nestedList) {
    for (const node of Array.from(el.childNodes)) {
      if (node === nestedList) continue;
      if (node.nodeType === 1 && node.hasAttribute('data-cms-ui')) continue;
      node.remove();
    }
    el.insertBefore(doc.createTextNode(value), nestedList);
    return;
  }

  if (hasBr || value.includes('\n')) {
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === 1 && node.hasAttribute('data-cms-ui')) continue;
      node.remove();
    }
    const anchor = uiNodes[0] || null;
    const lines = value.split('\n');
    lines.forEach((line, idx) => {
      el.insertBefore(doc.createTextNode(line), anchor);
      if (idx < lines.length - 1) {
        el.insertBefore(doc.createElement('br'), anchor);
      }
    });
    return;
  }

  // Zwykły element tekstowy — zachowaj ewentualne [data-cms-ui]
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 1 && node.hasAttribute('data-cms-ui')) continue;
    node.remove();
  }
  const anchor = uiNodes[0] || null;
  el.insertBefore(doc.createTextNode(value), anchor);
}

function updateFrameImageFor(img) {
  if (!img) return;
  const frame = img.closest(FRAME_IMAGE_SELECTOR);
  if (!frame) return;
  const raw = img.getAttribute('src') || '';
  let src = img.currentSrc || img.src || raw;
  if (src && !/^(?:https?:|data:|blob:|\/)/i.test(src)) {
    try {
      src = new URL(src, img.ownerDocument?.baseURI || location.href).href;
    } catch {
      // keep raw
    }
  }
  if (src) {
    frame.style.setProperty('--frame-image', `url("${src}")`);
  }
}

function updateAllFrameImages(root) {
  if (!root) return;
  root.querySelectorAll(FRAME_IMAGE_SELECTOR).forEach((frame) => {
    const img = frame.querySelector('img');
    if (img) {
      updateFrameImageFor(img);
      if (!img.complete) {
        img.addEventListener('load', () => updateFrameImageFor(img), { once: true });
      }
    }
  });
}

function createEl(doc, tag, attrs = {}, text = '') {
  const el = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  if (text) el.textContent = text;
  return el;
}

function parseHtmlFragment(doc, html, alreadySanitized = false) {
  const safeHtml = alreadySanitized ? String(html || '') : sanitizeHtmlFragment(String(html || ''));
  const tpl = doc.createElement('template');
  tpl.innerHTML = String(safeHtml || '').trim();
  return tpl.content.firstElementChild;
}

function readSectionStyle(el) {
  if (!el || !el.classList) {
    return { tone: 'default', align: 'default', spacing: 'default' };
  }
  const tone = el.classList.contains('cms-tone-light')
    ? 'light'
    : el.classList.contains('cms-tone-dark')
    ? 'dark'
    : el.classList.contains('cms-tone-accent')
    ? 'accent'
    : 'default';

  const align = el.classList.contains('cms-align-left')
    ? 'left'
    : el.classList.contains('cms-align-center')
    ? 'center'
    : 'default';

  const spacing = el.classList.contains('cms-space-compact')
    ? 'compact'
    : el.classList.contains('cms-space-spacious')
    ? 'spacious'
    : 'default';

  return { tone, align, spacing };
}

function readFreeLayout(el) {
  if (!el || !el.style) {
    return { active: false, tx: 0, ty: 0, w: null, h: null, scale: 100, z: 2 };
  }
  const parsePx = (v) => {
    const n = Number.parseFloat(String(v || ''));
    return Number.isFinite(n) ? Math.round(n) : null;
  };
  const tx = parsePx(el.style.getPropertyValue('--cms-tx')) || 0;
  const ty = parsePx(el.style.getPropertyValue('--cms-ty')) || 0;
  const w = el.getAttribute('data-cms-has-w') === '1' ? parsePx(el.style.getPropertyValue('--cms-w')) : null;
  const h = el.getAttribute('data-cms-has-h') === '1' ? parsePx(el.style.getPropertyValue('--cms-h')) : null;
  const rawScale = Number.parseFloat(String(el.style.getPropertyValue('--cms-scale') || '1'));
  const scale = Number.isFinite(rawScale) ? Math.round(rawScale * 100) : 100;
  const rawZ = Number.parseInt(String(el.style.getPropertyValue('--cms-z') || '2'), 10);
  const z = Number.isFinite(rawZ) ? rawZ : 2;
  const active =
    el.classList.contains('cms-free-block') ||
    tx !== 0 ||
    ty !== 0 ||
    w !== null ||
    h !== null ||
    scale !== 100 ||
    z !== 2;
  return { active, tx, ty, w, h, scale, z };
}

function getGenericRepeaterLabel(repEl) {
  if (!repEl) return 'Elementy siatki';
  const explicit = trimText(
    repEl.getAttribute('data-cms-repeater-label') || repEl.getAttribute('data-cms-repeater')
  );
  if (explicit && explicit !== 'true' && explicit !== '1') return truncate(explicit, 30);
  if (repEl.classList.contains('services-grid')) return 'Usługi';
  if (repEl.classList.contains('features-grid')) return 'Cechy / atuty';
  if (repEl.classList.contains('gallery-grid')) return 'Galeria';
  if (repEl.classList.contains('team-grid')) return 'Zespół';
  if (repEl.classList.contains('pricing-grid')) return 'Cennik';
  if (repEl.classList.contains('cards') || repEl.classList.contains('card-grid')) return 'Karty';
  return 'Elementy siatki';
}

function isDangerousHrefScheme(raw) {
  const normalized = String(raw || '').replace(/[\u0000-\u001f\s]+/g, '').toLowerCase();
  return /^(javascript|vbscript|data):/i.test(normalized);
}

function isSafePreviewImageSrc(raw) {
  const trimmed = String(raw || '').trim();
  return (
    trimmed.startsWith('blob:') ||
    /^data:image\/(png|jpe?g|webp|gif|avif);base64,/i.test(trimmed)
  );
}

function sanitizeId(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_:.]/g, '');
}

function findPrimaryImage(el) {
  if (!el) return null;
  if (el.tagName === 'IMG') return el;
  const prioritySelectors = [
    '.hero-frame img',
    '.home-cat-thumb img',
    '.home-featured-media img',
    '.realization-card-media img',
    '.realization-photo img',
    '.profile-row__media img',
    '.subcat-card-media img',
    '.cat-prod-media img',
    '.location-card__photo img',
    '.kt-salon-photo img',
    '.category-feature img',
    '.montage-step-media img',
    '.product-gallery-thumb img',
    '.partner-logo img',
    '[data-gallery-main]',
  ];
  for (const sel of prioritySelectors) {
    if (el.matches(sel)) return el;
    const found = el.querySelector(sel);
    if (found && !found.closest('[data-cms-ui]')) return found;
  }
  // Jeśli to sekcja zawierająca kafelki, nie łap pierwszego obrazka z kafelka jako głównego obrazu sekcji
  if (el.classList.contains('cms-section') && el.querySelector('.cms-item')) {
    return null;
  }
  const anyImg = el.querySelector('img');
  return anyImg && !anyImg.closest('[data-cms-ui]') ? anyImg : null;
}

function getSectionLabel(el) {
  if (!el) return 'Sekcja';
  const id = el.id || '';
  if (id === 'start' || el.classList.contains('hero')) return 'Baner główny (Hero)';
  if (el.matches('header.subpage-head')) return 'Nagłówek podstrony';
  if (el.classList.contains('cat-quick-nav')) return 'Pasek kategorii („Kategorie:”)';
  if (el.matches('aside.subpage-sidebar')) return 'Panel boczny';
  if (el.classList.contains('product-gallery')) return 'Galeria produktu';
  if (el.classList.contains('product-nav-bar')) return 'Nawigacja produktów';
  if (el.classList.contains('category-feature')) return 'Zdjęcie główne kategorii';
  if (el.classList.contains('home-catalog-grid')) return 'Siatka oferty';
  if (el.classList.contains('subcat-grid')) return 'Podkategorie oferty';
  if (el.classList.contains('cat-products-grid') || el.classList.contains('cat-prod-grid')) {
    return 'Produkty w kategorii';
  }
  if (el.classList.contains('profile-list')) return 'Profile / systemy';
  if (el.classList.contains('location-grid')) return 'Salony sprzedaży';
  if (el.classList.contains('kt')) return 'Kontakt i salony';
  if (el.classList.contains('partners-section')) {
    const h = el.querySelector('h2, h3');
    return h ? truncate(getPreservedText(h)) : 'Partnerzy';
  }
  if (el.classList.contains('realizations-home')) {
    const h = el.querySelector('h2, h3');
    return h ? truncate(getPreservedText(h)) : 'Realizacje';
  }
  if (el.classList.contains('realization-group')) {
    const h = el.querySelector('h2, h3');
    const isCarousel = Boolean(el.querySelector('.cms-carousel-track'));
    if (h) {
      const txt = truncate(getPreservedText(h), 32);
      if (isCarousel || /galeria|promocj|zdjęc|zdjec/i.test(txt)) return txt;
      return `Realizacje: ${truncate(txt, 26)}`;
    }
    return isCarousel ? 'Przewijana galeria zdjęć' : 'Galeria zdjęć';
  }
  if (el.classList.contains('reviews')) {
    const h = el.querySelector('h2, h3');
    return h ? truncate(getPreservedText(h)) : 'Opinie klientów';
  }
  if (el.classList.contains('contact')) {
    const h = el.querySelector('h2, h3');
    return h ? truncate(getPreservedText(h)) : 'Kontakt';
  }
  if (el.classList.contains('cta-banner-dark') || el.querySelector(':scope > .wrap > .cta-banner-dark, :scope > .cta-banner-dark')) {
    const h = el.querySelector('h3, h2');
    return h ? `Baner CTA: ${truncate(getPreservedText(h), 24)}` : 'Baner CTA';
  }
  if (el.classList.contains('brand-box')) {
    const h = el.querySelector('h2, h3');
    return h ? truncate(getPreservedText(h)) : 'Katalogi producentów';
  }
  if (el.classList.contains('service-feature-box')) {
    const eb = el.querySelector('.eyebrow');
    return eb ? truncate(getPreservedText(eb)) : 'Wyróżnienie usługi';
  }
  if (el.classList.contains('source-content-disclosure')) {
    const sum = el.querySelector(':scope > summary');
    return sum ? truncate(getPreservedText(sum)) : 'Opis szczegółowy';
  }
  if (el.classList.contains('service-card')) {
    const h = el.querySelector('h2, h3');
    return h ? truncate(getPreservedText(h)) : 'Karta usługi';
  }
  if (el.classList.contains('cms-faq-section')) {
    const h = el.querySelector('h2, h3');
    return h ? truncate(getPreservedText(h)) : 'Pytania i odpowiedzi (FAQ)';
  }
  const heading = el.querySelector('h1, h2, h3, summary');
  if (heading && !heading.closest('.cms-item')) {
    const text = truncate(getPreservedText(heading));
    if (text) return text;
  }
  if (id) return `Sekcja #${id}`;
  return 'Sekcja';
}

function getItemLabel(el, itemType) {
  if (!el) return 'Element';
  if (itemType === 'partner-logo' || itemType === 'realization-photo' || itemType === 'gallery-thumb') {
    const img = el.querySelector('img');
    const alt = trimText(img?.getAttribute('alt'));
    if (alt) return truncate(alt, 32);
    return itemType === 'partner-logo' ? 'Logo partnera' : 'Zdjęcie';
  }
  if (itemType === 'review-card') {
    const bq = el.querySelector('blockquote');
    return bq ? `„${truncate(getPreservedText(bq), 28)}”` : 'Opinia';
  }
  if (itemType === 'store-item') {
    const t = el.querySelector('.kt-store-title');
    return t ? truncate(getPreservedText(t), 32) : 'Salon sprzedaży';
  }
  if (itemType === 'sidebar-box') {
    const eb = el.querySelector('.eyebrow, h2, h3, h4');
    return eb ? truncate(getPreservedText(eb), 34) : 'Karta boczna';
  }
  const heading = el.querySelector('h2, h3, h4, .cat-prod-title, .montage-step-title, summary');
  if (heading) {
    const txt = truncate(getPreservedText(heading), 34);
    if (txt) return txt;
  }
  const own = truncate(getPreservedText(el), 34);
  if (own) return own;
  return ITEM_TEMPLATES[itemType]?.label || 'Element';
}

function countStars(el) {
  if (!el) return null;
  const starsEl = el.matches('.stars') ? el : el.querySelector('.stars');
  if (!starsEl) return null;
  const text = starsEl.textContent || '';
  const filled = (text.match(/★/g) || []).length;
  if (filled >= 1 && filled <= 5) return filled;
  const aria = starsEl.getAttribute('aria-label') || '';
  const m = aria.match(/(\d)/);
  return m ? Math.min(5, Math.max(1, Number(m[1]))) : 5;
}

/**
 * Główna funkcja podpinająca wizualny kreator WYSIWYG do dokumentu iframe'a.
 */
export function connectCanvas(doc, options = {}) {
  if (!doc || !doc.body || !doc.head) {
    throw new Error('connectCanvas wymaga prawidłowego obiektu Document.');
  }

  const pagePath = options.pagePath || 'index.html';
  let pendingImages = { ...(options.pendingImages || {}) };
  const callbacks = {
    onSelect: typeof options.onSelect === 'function' ? options.onSelect : () => {},
    onStructureChange: typeof options.onStructureChange === 'function' ? options.onStructureChange : () => {},
    onMutate: typeof options.onMutate === 'function' ? options.onMutate : () => {},
    onRequestImage: typeof options.onRequestImage === 'function' ? options.onRequestImage : () => {},
    onRequestAddSection: typeof options.onRequestAddSection === 'function' ? options.onRequestAddSection : () => {},
    onRequestAddItem: typeof options.onRequestAddItem === 'function' ? options.onRequestAddItem : () => {},
    onRequestGlobals: typeof options.onRequestGlobals === 'function' ? options.onRequestGlobals : () => {},
    onSendToAi: typeof options.onSendToAi === 'function' ? options.onSendToAi : () => {},
    onDragTargetStart: typeof options.onDragTargetStart === 'function' ? options.onDragTargetStart : () => {},
    onDragTargetEnd: typeof options.onDragTargetEnd === 'function' ? options.onDragTargetEnd : () => {},
    onNavigate: typeof options.onNavigate === 'function' ? options.onNavigate : () => {},
  };

  let browseMode = Boolean(options.browseMode);
  let freeLayoutMode = Boolean(options.freeLayoutMode);
  let aiPickMode = false;
  let uidCounter = { sec: 0, rep: 0, item: 0, el: 0 };
  let selectedUid = null;
  let hoveredSectionEl = null;
  let hoveredItemEl = null;
  let aiPickHoverEl = null;
  let dragState = null;
  let freeInteract = null;
  let marqueeState = null;
  let textMutateTimer = 0;
  let textDirty = false;
  let destroyed = false;

  // Bieżąca mapa wykrytej struktury
  let nodesByUid = new Map(); // uid -> { uid, el, kind, label, itemType?, repeaterUid?, parentSectionUid?, containerKind? }
  let repeatersByUid = new Map(); // repeaterUid -> { repeaterUid, el, spec, parentSectionUid, items: Element[] }
  let sectionList = []; // Array of { uid, el, scope }
  let isHomePage = false;

  // Wstrzyknięcie preview.css i klasy body
  const existingCss = doc.head.querySelector('link[data-cms-ui="preview-css"]');
  if (!existingCss) {
    const link = createEl(doc, 'link', {
      rel: 'stylesheet',
      href: PREVIEW_CSS_URL,
      'data-cms-ui': 'preview-css',
    });
    doc.head.appendChild(link);
  }
  doc.body.classList.add('wolbud-preview');

  function nextUid(prefix) {
    uidCounter[prefix] = (uidCounter[prefix] || 0) + 1;
    let candidate = `${prefix}-${uidCounter[prefix]}`;
    while (nodesByUid.has(candidate) || doc.querySelector(`[data-cms-uid="${candidate}"]`)) {
      uidCounter[prefix] += 1;
      candidate = `${prefix}-${uidCounter[prefix]}`;
    }
    return candidate;
  }

  function ensureUid(el, prefix, usedSet) {
    let existing = el.getAttribute('data-cms-uid');
    if (existing && !usedSet.has(existing)) {
      const m = existing.match(/^(sec|rep|item|el)-(\d+)$/);
      if (m) {
        uidCounter[m[1]] = Math.max(uidCounter[m[1]] || 0, Number(m[2]));
      }
      usedSet.add(existing);
      return existing;
    }
    const fresh = nextUid(prefix);
    el.setAttribute('data-cms-uid', fresh);
    usedSet.add(fresh);
    return fresh;
  }

  function getMainRoot() {
    return doc.querySelector('main#main') || doc.querySelector('main') || doc.body;
  }

  function isMeaningfulGenericSection(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.hasAttribute('data-cms-ui')) return false;
    const tag = el.tagName.toUpperCase();
    if (
      tag === 'HEADER' ||
      tag === 'FOOTER' ||
      tag === 'NAV' ||
      tag === 'SCRIPT' ||
      tag === 'STYLE' ||
      tag === 'NOSCRIPT' ||
      tag === 'TEMPLATE' ||
      tag === 'LINK' ||
      tag === 'META' ||
      tag === 'SVG'
    ) {
      return false;
    }
    if (el.getAttribute('role') === 'dialog' || el.getAttribute('aria-modal') === 'true') {
      return false;
    }
    if (el.matches('.copy-toast, .lightbox-modal, .contact-bubbles')) {
      return false;
    }

    const isSemanticBlock = tag === 'SECTION' || tag === 'ARTICLE';
    const isIdentifiedDiv =
      tag === 'DIV' &&
      (Boolean(el.id && el.id.trim()) || (el.classList && el.classList.length > 0));

    if (!isSemanticBlock && !isIdentifiedDiv) return false;

    // Ukryte przez CMS sekcje zawsze zachowuj, aby dało się je ponownie pokazać
    if (el.classList.contains('cms-hidden')) return true;

    const win = doc.defaultView;
    const style = win?.getComputedStyle ? win.getComputedStyle(el) : null;
    if (style && (style.display === 'none' || style.visibility === 'hidden')) {
      return false;
    }

    const textLen = trimText(el.textContent).length;
    const hasMediaOrContent = Boolean(
      el.querySelector('img, picture, video, svg, form, ul, ol, h1, h2, h3, h4, p, blockquote')
    );
    const rect = typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null;
    const hasHeight = rect ? rect.height >= 24 : false;

    if (isSemanticBlock) {
      return textLen > 0 || hasMediaOrContent || hasHeight;
    }
    if (textLen >= 10 || hasMediaOrContent) {
      return !rect || rect.height === 0 ? true : rect.height >= 20;
    }
    return hasHeight && el.children.length > 0;
  }

  function detectGenericSections(rootEl) {
    if (!rootEl) return [];
    let candidates = Array.from(rootEl.children).filter((child) => isMeaningfulGenericSection(child));

    // Jeśli strona opakowuje wszystkie sekcje w jeden kontener layoutu (np. <div id="app"> / <div class="page">),
    // rozpakuj jeden poziom głębiej, o ile wewnątrz są co najmniej 2 sensowne sekcje.
    if (candidates.length === 1 && candidates[0].tagName === 'DIV') {
      const wrapper = candidates[0];
      const hasDirectCopy = Array.from(wrapper.children).some((ch) => {
        const t = ch.tagName.toUpperCase();
        return t === 'H1' || t === 'H2' || t === 'P';
      });
      if (!hasDirectCopy) {
        const inner = Array.from(wrapper.children).filter((child) => isMeaningfulGenericSection(child));
        const hasSemanticInner = inner.some(
          (ch) => ch.tagName === 'SECTION' || ch.tagName === 'ARTICLE'
        );
        if (inner.length >= 2 && (hasSemanticInner || inner.length >= 3)) {
          candidates = inner;
        }
      }
    }

    return candidates.map((el) => ({ el, scope: 'main' }));
  }

  function detectTopSections() {
    const main = getMainRoot();
    const isSubpage = main.classList.contains('page-main');
    const hasWolbudMarkers = Boolean(
      doc.getElementById('start') ||
        isSubpage ||
        doc.querySelector('.subpage-content') ||
        main.querySelector(':scope > .photo-band')
    );

    // Tryb uniwersalny dla stron innych klientów (bez selektorów WOL-BUD)
    if (!hasWolbudMarkers) {
      isHomePage = true;
      return detectGenericSections(main);
    }

    isHomePage = !isSubpage && Boolean(doc.getElementById('start') || main.querySelector(':scope > section'));

    const sections = [];

    if (!isSubpage) {
      // Strona główna WOL-BUD: bezpośrednie <section> w main oraz <section> wewnątrz .photo-band
      for (const child of Array.from(main.children)) {
        if (child.hasAttribute('data-cms-ui')) continue;
        if (child.tagName === 'SECTION') {
          sections.push({ el: child, scope: 'main' });
        } else if (child.classList.contains('photo-band')) {
          for (const bandChild of Array.from(child.children)) {
            if (bandChild.hasAttribute('data-cms-ui')) continue;
            if (bandChild.tagName === 'SECTION') {
              sections.push({ el: bandChild, scope: 'main' });
            }
          }
        }
      }
      return sections.length > 0 ? sections : detectGenericSections(main);
    }

    // Podstrona: main.page-main > .wrap
    const wrap = main.querySelector(':scope > .wrap') || main;
    const subpageGrid = wrap.querySelector(':scope > .subpage-grid');

    if (subpageGrid) {
      for (const child of Array.from(wrap.children)) {
        if (child.hasAttribute('data-cms-ui')) continue;
        if (child.classList.contains('page-nav-bar')) continue;
        if (child === subpageGrid) continue;
        if (child.tagName === 'SCRIPT' || child.tagName === 'STYLE') continue;
        sections.push({ el: child, scope: 'subpage-top' });
      }

      const content = subpageGrid.querySelector(':scope > .subpage-content');
      if (content) {
        for (const child of Array.from(content.children)) {
          if (child.hasAttribute('data-cms-ui')) continue;
          if (child.tagName === 'SCRIPT' || child.tagName === 'STYLE') continue;
          sections.push({ el: child, scope: 'subpage-content' });
        }
      }

      const sidebar = subpageGrid.querySelector(':scope > aside.subpage-sidebar');
      if (sidebar) {
        sections.push({ el: sidebar, scope: 'subpage-sidebar' });
      }
      return sections;
    }

    // Podstrona bez .subpage-grid (np. oferta, nasze-sklepy, kontakt)
    for (const child of Array.from(wrap.children)) {
      if (child.hasAttribute('data-cms-ui')) continue;
      if (child.classList.contains('page-nav-bar')) continue;
      if (child.tagName === 'SCRIPT' || child.tagName === 'STYLE') continue;
      const scope = child.matches('header.subpage-head') ? 'subpage-top' : 'subpage-wrap';
      sections.push({ el: child, scope });
    }

    return sections;
  }

  function getScopeSiblings(scope) {
    return sectionList.filter((s) => s.scope === scope);
  }

  function computeCanMoveSection(secEntry) {
    if (secEntry.scope === 'subpage-sidebar') {
      return { canMoveUp: false, canMoveDown: false };
    }
    const siblings = getScopeSiblings(secEntry.scope);
    const idx = siblings.findIndex((s) => s.uid === secEntry.uid);
    return {
      canMoveUp: idx > 0,
      canMoveDown: idx >= 0 && idx < siblings.length - 1,
    };
  }

  function clearAllInjectedUi() {
    doc.querySelectorAll('[data-cms-ui]').forEach((node) => {
      const uiType = node.getAttribute('data-cms-ui');
      if (uiType === 'preview-css' || uiType === 'base') return;
      node.remove();
    });
  }

  function syncHiddenVeil(el) {
    const existing = el.querySelector(':scope > [data-cms-ui="hidden-veil"]');
    const isHidden = el.classList.contains('cms-hidden');
    if (isHidden && !existing) {
      const veil = createEl(doc, 'div', { 'data-cms-ui': 'hidden-veil', contenteditable: 'false' });
      const badge = createEl(doc, 'span', { 'data-cms-ui': 'hidden-badge', contenteditable: 'false' }, '👁 Ukryta sekcja');
      veil.appendChild(badge);
      el.appendChild(veil);
    } else if (!isHidden && existing) {
      existing.remove();
    }
  }

  function setupEditableTextNodes(root) {
    // 1. Specjalny przypadek: Hero h1 z .mask > span
    root.querySelectorAll('.hero h1 .mask > span').forEach((span) => {
      if (span.closest('[data-cms-ui]')) return;
      span.classList.add('cms-editable-text');
      span.setAttribute('contenteditable', 'plaintext-only');
    });

    // 2. Specjalny przypadek: .kt-oferta > b
    root.querySelectorAll('.kt-oferta > b').forEach((b) => {
      if (b.closest('[data-cms-ui]')) return;
      b.classList.add('cms-editable-text');
      b.setAttribute('contenteditable', 'plaintext-only');
    });

    // 3. Wszystkie standardowe selektory tekstowe
    root.querySelectorAll(INLINE_TEXT_SELECTOR).forEach((el) => {
      if (el.closest('[data-cms-ui]')) return;
      if (el.closest('header.bar, body > header, body > nav, footer, .lightbox-modal, .contact-bubbles, .page-nav-bar, [role="dialog"]')) return;

      // Nie nakładaj zagnieżdżonego contentEditable
      if (el.parentElement?.closest('[contenteditable="plaintext-only"], [contenteditable="true"]')) {
        return;
      }

      // Nie edytuj bezpośrednio elementów z chronionymi dziećmi (<svg>, <i>, <span>↗</span>, <ul>, <h4> w <summary>, <a> w <h3>, .mask w <h1>)
      if (hasProtectedChildren(el)) {
        return;
      }

      el.classList.add('cms-editable-text');
      el.setAttribute('contenteditable', 'plaintext-only');
    });
  }

  function attachImageOverlay(hostEl, targetUid, label = 'Zmień zdjęcie') {
    if (!hostEl) return;
    if (hostEl.querySelector(':scope > [data-cms-ui="img-edit-btn"]')) return;
    hostEl.classList.add('cms-img-host');
    const btn = createEl(
      doc,
      'button',
      {
        type: 'button',
        'data-cms-ui': 'img-edit-btn',
        'data-cms-target-uid': targetUid,
        contenteditable: 'false',
        title: label,
      },
      `🖼 ${label}`
    );
    hostEl.appendChild(btn);
  }

  function buildSectionToolbar(secEntry, childRepeaters) {
    const { el, uid, label } = secEntry;
    const { canMoveUp, canMoveDown } = computeCanMoveSection(secEntry);
    const isHidden = el.classList.contains('cms-hidden');

    const bar = createEl(doc, 'div', {
      'data-cms-ui': 'section-toolbar',
      'data-cms-for': uid,
      contenteditable: 'false',
    });

    const handle = createEl(
      doc,
      'span',
      {
        class: 'cms-tb-handle',
        'data-cms-ui': 'drag-handle',
        'data-drag-kind': 'section',
        'data-drag-uid': uid,
        draggable: canMoveUp || canMoveDown ? 'true' : 'false',
        title: 'Przeciągnij, aby zmienić kolejność sekcji',
      },
      '⠿'
    );
    bar.appendChild(handle);

    bar.appendChild(createEl(doc, 'span', { class: 'cms-tb-label', title: label }, label));
    bar.appendChild(createEl(doc, 'span', { class: 'cms-tb-sep' }));

    const btnUp = createEl(
      doc,
      'button',
      {
        type: 'button',
        class: 'cms-tb-btn',
        'data-cms-action': 'move-up',
        'data-cms-target': uid,
        disabled: !canMoveUp,
        title: 'Przesuń sekcję w górę',
      },
      '↑'
    );
    const btnDown = createEl(
      doc,
      'button',
      {
        type: 'button',
        class: 'cms-tb-btn',
        'data-cms-action': 'move-down',
        'data-cms-target': uid,
        disabled: !canMoveDown,
        title: 'Przesuń sekcję w dół',
      },
      '↓'
    );
    const btnDup = createEl(
      doc,
      'button',
      {
        type: 'button',
        class: 'cms-tb-btn',
        'data-cms-action': 'duplicate',
        'data-cms-target': uid,
        title: 'Duplikuj sekcję',
      },
      '⧉'
    );
    const btnHide = createEl(
      doc,
      'button',
      {
        type: 'button',
        class: isHidden ? 'cms-tb-btn cms-tb-btn--active' : 'cms-tb-btn',
        'data-cms-action': 'toggle-hide',
        'data-cms-target': uid,
        title: isHidden ? 'Pokaż sekcję na stronie' : 'Ukryj sekcję na stronie',
      },
      isHidden ? '👁 Pokaż' : '👁'
    );

    bar.append(btnUp, btnDown, btnDup, btnHide);

    if (childRepeaters.length > 0) {
      const primary = childRepeaters[0];
      const addLabel =
        primary.itemType === 'subpage-service'
          ? '+ Usługa'
          : primary.itemType === 'realization-photo'
          ? '+ Zdjęcie'
          : primary.itemType === 'sidebar-box'
          ? '+ Karta'
          : '+ Kafelek';
      const btnAddItem = createEl(
        doc,
        'button',
        {
          type: 'button',
          class: 'cms-tb-btn cms-tb-btn--accent',
          'data-cms-action': 'add-item',
          'data-cms-repeater': primary.repeaterUid,
          'data-cms-item-type': primary.itemType,
          title: `Dodaj element do: ${primary.label}`,
        },
        addLabel
      );
      bar.appendChild(btnAddItem);
    }

    const btnAi = createEl(
      doc,
      'button',
      {
        type: 'button',
        class: 'cms-tb-btn cms-tb-btn--ai',
        'data-cms-action': 'send-to-ai',
        'data-cms-target': uid,
        title: 'Wyślij ten fragment do Asystenta AI (wskaż dokładnie miejsce pracy)',
      },
      '✨ AI'
    );

    const btnDel = createEl(
      doc,
      'button',
      {
        type: 'button',
        class: 'cms-tb-btn cms-tb-btn--danger',
        'data-cms-action': 'delete',
        'data-cms-target': uid,
        title: 'Usuń sekcję',
      },
      '🗑'
    );
    bar.append(btnAi, btnDel);

    el.appendChild(bar);

    // Przycisk "+ Sekcja poniżej" (pomijany dla panelu bocznego)
    if (secEntry.scope !== 'subpage-sidebar') {
      const addBelowBtn = createEl(
        doc,
        'button',
        {
          type: 'button',
          'data-cms-ui': 'add-section-below',
          'data-cms-action': 'add-section-below',
          'data-cms-target': uid,
          contenteditable: 'false',
          title: 'Wstaw nową sekcję poniżej',
        },
        '+ Sekcja poniżej'
      );
      el.appendChild(addBelowBtn);
    }

    // Nakładka zmiany zdjęcia dla sekcji z własnym zdjęciem (Hero, category-feature, product-gallery main)
    if (el.classList.contains('hero')) {
      attachImageOverlay(el, uid, 'Zmień zdjęcie tła');
    } else if (el.classList.contains('category-feature')) {
      attachImageOverlay(el, uid, 'Zmień zdjęcie');
    } else if (el.classList.contains('product-gallery')) {
      const stage = el.querySelector('.product-gallery-stage');
      if (stage) attachImageOverlay(stage, uid, 'Zmień zdjęcie główne');
    }
  }

  function buildItemToolbar(itemEl, itemUid, repeaterEntry, index, total) {
    const isVertical = Boolean(repeaterEntry.spec.vertical);
    const bar = createEl(doc, 'div', {
      'data-cms-ui': 'item-toolbar',
      'data-cms-for': itemUid,
      contenteditable: 'false',
    });

    const handle = createEl(
      doc,
      'span',
      {
        class: 'cms-tb-handle',
        'data-cms-ui': 'drag-handle',
        'data-drag-kind': 'item',
        'data-drag-uid': itemUid,
        'data-drag-repeater': repeaterEntry.repeaterUid,
        draggable: 'true',
        title: 'Przeciągnij, aby zmienić kolejność',
      },
      '⠿'
    );
    const btnPrev = createEl(
      doc,
      'button',
      {
        type: 'button',
        class: 'cms-tb-btn',
        'data-cms-action': 'move-up',
        'data-cms-target': itemUid,
        disabled: index <= 0,
        title: isVertical ? 'Przesuń wyżej' : 'Przesuń w lewo',
      },
      isVertical ? '↑' : '←'
    );
    const btnNext = createEl(
      doc,
      'button',
      {
        type: 'button',
        class: 'cms-tb-btn',
        'data-cms-action': 'move-down',
        'data-cms-target': itemUid,
        disabled: index >= total - 1,
        title: isVertical ? 'Przesuń niżej' : 'Przesuń w prawo',
      },
      isVertical ? '↓' : '→'
    );
    const btnDup = createEl(
      doc,
      'button',
      {
        type: 'button',
        class: 'cms-tb-btn',
        'data-cms-action': 'duplicate',
        'data-cms-target': itemUid,
        title: 'Duplikuj element',
      },
      '⧉'
    );
    const btnAi = createEl(
      doc,
      'button',
      {
        type: 'button',
        class: 'cms-tb-btn cms-tb-btn--ai',
        'data-cms-action': 'send-to-ai',
        'data-cms-target': itemUid,
        title: 'Wyślij ten element do Asystenta AI',
      },
      '✨ AI'
    );
    const btnDel = createEl(
      doc,
      'button',
      {
        type: 'button',
        class: 'cms-tb-btn cms-tb-btn--danger',
        'data-cms-action': 'delete',
        'data-cms-target': itemUid,
        title: 'Usuń element',
      },
      '🗑'
    );

    bar.append(handle, btnPrev, btnNext, btnDup, btnAi, btnDel);
    itemEl.appendChild(bar);

    // Nakładka zmiany zdjęcia jeśli kafelek zawiera <img>
    const img = findPrimaryImage(itemEl);
    if (img) {
      const mediaHost =
        img.closest(
          '.home-cat-thumb, .home-featured-media, .realization-card-media, .realization-photo, .profile-row__media, .subcat-card-media, .cat-prod-media, .location-card__photo, .kt-salon-photo, .montage-step-media, .partner-logo, .product-gallery-thumb'
        ) || itemEl;
      attachImageOverlay(mediaHost, itemUid, 'Zmień zdjęcie');
    }
  }

  function scanStructure() {
    clearAllInjectedUi();

    // Zdejmij tymczasowe klasy z poprzedniego skanu
    doc.querySelectorAll('.cms-section, .cms-repeater, .cms-item, .cms-img-host').forEach((el) => {
      el.classList.remove('cms-section', 'cms-repeater', 'cms-item', 'cms-img-host');
    });

    nodesByUid = new Map();
    repeatersByUid = new Map();
    sectionList = [];

    const usedUids = new Set();
    const detectedSections = detectTopSections();

    // 1. Zarejestruj sekcje najwyższego poziomu
    detectedSections.forEach(({ el, scope }) => {
      const uid = ensureUid(el, 'sec', usedUids);
      const label = getSectionLabel(el);
      el.classList.add('cms-section');
      el.setAttribute('data-cms-kind', 'section');
      el.setAttribute('data-cms-label', label);

      const secEntry = {
        uid,
        el,
        kind: 'section',
        label,
        scope,
        parentSectionUid: uid,
      };
      sectionList.push(secEntry);
      nodesByUid.set(uid, secEntry);
    });

    // 2. Specjalny przypadek: .subpage-content z kartami .service-card (np. uslugi/index.html)
    const subpageContent = doc.querySelector('main.page-main .subpage-content');
    let subpageServiceRepeaterUid = null;
    if (subpageContent && subpageContent.querySelector(':scope > .service-card')) {
      subpageServiceRepeaterUid = ensureUid(subpageContent, 'rep', usedUids);
      subpageContent.setAttribute('data-cms-repeater-uid', subpageServiceRepeaterUid);
      const serviceItems = Array.from(subpageContent.querySelectorAll(':scope > .service-card'));
      repeatersByUid.set(subpageServiceRepeaterUid, {
        repeaterUid: subpageServiceRepeaterUid,
        el: subpageContent,
        spec: {
          selector: '.subpage-content',
          itemSelector: ':scope > .service-card',
          itemType: 'subpage-service',
          label: 'Karty usług',
          vertical: true,
        },
        parentSectionUid: null,
        items: serviceItems,
      });
    }

    // 3. Wykryj repeatery i kafelki wewnątrz każdej sekcji
    const sectionRepeatersMap = new Map(); // sectionUid -> repeaterEntry[]

    sectionList.forEach((secEntry) => {
      const childRepeaters = [];

      // Jeśli ta sekcja to .service-card w .subpage-content, podepnij repeater usług
      if (subpageServiceRepeaterUid && secEntry.el.matches('.service-card') && secEntry.el.parentElement === subpageContent) {
        const rep = repeatersByUid.get(subpageServiceRepeaterUid);
        if (rep) childRepeaters.push(rep);
      }

      const registerRepeater = (repEl, spec, items) => {
        const isSameAsSection = repEl === secEntry.el;
        const repeaterUid = isSameAsSection ? secEntry.uid : ensureUid(repEl, 'rep', usedUids);
        repEl.classList.add('cms-repeater');
        repEl.setAttribute('data-cms-repeater-uid', repeaterUid);

        const repEntry = {
          repeaterUid,
          el: repEl,
          spec,
          parentSectionUid: secEntry.uid,
          items,
        };
        repeatersByUid.set(repeaterUid, repEntry);
        childRepeaters.push(repEntry);

        if (!isSameAsSection && !nodesByUid.has(repeaterUid)) {
          nodesByUid.set(repeaterUid, {
            uid: repeaterUid,
            el: repEl,
            kind: 'repeater',
            label: spec.label,
            itemType: spec.itemType,
            parentSectionUid: secEntry.uid,
          });
        }

        items.forEach((itemEl, idx) => {
          const itemUid = ensureUid(itemEl, 'item', usedUids);
          const itemLabel = getItemLabel(itemEl, spec.itemType);
          itemEl.classList.add('cms-item');
          itemEl.setAttribute('data-cms-kind', 'item');
          itemEl.setAttribute('data-cms-item-type', spec.itemType);
          itemEl.setAttribute('data-cms-label', itemLabel);

          nodesByUid.set(itemUid, {
            uid: itemUid,
            el: itemEl,
            kind: 'item',
            label: itemLabel,
            itemType: spec.itemType,
            repeaterUid,
            parentSectionUid: secEntry.uid,
          });

          buildItemToolbar(itemEl, itemUid, repEntry, idx, items.length);
          syncHiddenVeil(itemEl);
        });
      };

      const seenRepEls = new Set();
      REPEATER_SPECS.forEach((spec) => {
        const candidates = [];
        if (secEntry.el.matches(spec.selector)) {
          candidates.push(secEntry.el);
        }
        secEntry.el.querySelectorAll(spec.selector).forEach((cand) => {
          if (!cand.closest('[data-cms-ui]')) candidates.push(cand);
        });

        candidates.forEach((repEl) => {
          if (seenRepEls.has(repEl)) return;
          // Pomiń zagnieżdżone ul.source-list wewnątrz innego ul.source-list > li
          if (spec.itemType === 'list-item' && repEl.parentElement?.closest('ul.source-list')) {
            return;
          }
          seenRepEls.add(repEl);

          const items = Array.from(repEl.querySelectorAll(spec.itemSelector)).filter(
            (item) => !item.hasAttribute('data-cms-ui')
          );

          registerRepeater(repEl, spec, items);
        });
      });

      // Fallback dla stron innych klientów: wykrywaj generyczne kontenery siatek/list z >= 2 dziećmi
      if (childRepeaters.length === 0) {
        const genericCandidates = [];
        if (secEntry.el.matches(GENERIC_REPEATER_SELECTOR)) {
          genericCandidates.push(secEntry.el);
        }
        secEntry.el.querySelectorAll(GENERIC_REPEATER_SELECTOR).forEach((cand) => {
          if (!cand.closest('[data-cms-ui]')) genericCandidates.push(cand);
        });

        genericCandidates.forEach((repEl) => {
          if (seenRepEls.has(repEl)) return;
          // Nie rejestruj zagnieżdżonego kontenera wewnątrz już wykrytego repeatera
          if (repEl.parentElement?.closest('.cms-repeater')) return;

          const items = Array.from(repEl.children).filter(
            (child) =>
              !child.hasAttribute('data-cms-ui') &&
              GENERIC_REPEATER_ITEM_TAGS.has(child.tagName.toUpperCase())
          );
          if (items.length < 2) return;

          seenRepEls.add(repEl);
          const isVerticalList = repEl.tagName === 'UL' || repEl.tagName === 'OL';
          const genericSpec = {
            selector: GENERIC_REPEATER_SELECTOR,
            itemSelector: ':scope > article, :scope > a, :scope > div, :scope > li',
            itemType: 'generic-item',
            label: getGenericRepeaterLabel(repEl),
            vertical: isVerticalList,
          };
          registerRepeater(repEl, genericSpec, items);
        });
      }

      sectionRepeatersMap.set(secEntry.uid, childRepeaters);
      buildSectionToolbar(secEntry, childRepeaters);
      syncHiddenVeil(secEntry.el);
    });

    // 4. Ustaw inline contentEditable dla wszystkich bezpiecznych tekstów
    setupEditableTextNodes(getMainRoot());

    // 5. Zsynchronizuj --frame-image dla wszystkich kafelków
    updateAllFrameImages(getMainRoot());

    // 6. Przywróć zaznaczenie jeśli wciąż istnieje
    if (selectedUid) {
      const entry = nodesByUid.get(selectedUid);
      if (entry && doc.contains(entry.el)) {
        applySelectedVisual(entry);
        syncFreeHandles();
      } else {
        selectedUid = null;
      }
    }

    return sectionRepeatersMap;
  }

  function applySelectedVisual(entry) {
    doc.querySelectorAll('.cms-selected, .cms-element-selected').forEach((el) => {
      el.classList.remove('cms-selected', 'cms-element-selected');
    });
    if (!entry || !entry.el) return;
    if (entry.kind === 'section' || entry.kind === 'item') {
      entry.el.classList.add('cms-selected');
    } else {
      entry.el.classList.add('cms-element-selected');
    }
  }

  function getStructure() {
    const sections = sectionList.map((secEntry) => {
      const { canMoveUp, canMoveDown } = computeCanMoveSection(secEntry);
      const repeaters = [];

      repeatersByUid.forEach((repEntry) => {
        const belongsHere =
          repEntry.parentSectionUid === secEntry.uid ||
          (repEntry.spec.itemType === 'subpage-service' &&
            secEntry.el.matches('.service-card') &&
            repEntry.el === secEntry.el.parentElement);
        if (!belongsHere) return;
        // Unikaj duplikowania globalnego repeatera usług pod każdą kartą — przypisz go pod pierwszą kartą lub pokaż skrótem
        if (repEntry.spec.itemType === 'subpage-service') {
          const firstCard = repEntry.items[0];
          if (firstCard !== secEntry.el) return;
        }

        repeaters.push({
          repeaterUid: repEntry.repeaterUid,
          itemType: repEntry.spec.itemType,
          label: repEntry.spec.label,
          count: repEntry.items.length,
          items: repEntry.items.map((itemEl) => {
            const itemUid = itemEl.getAttribute('data-cms-uid');
            return {
              uid: itemUid,
              label: getItemLabel(itemEl, repEntry.spec.itemType),
              itemType: repEntry.spec.itemType,
              hidden: itemEl.classList.contains('cms-hidden'),
            };
          }),
        });
      });

      return {
        uid: secEntry.uid,
        label: getSectionLabel(secEntry.el),
        tag: secEntry.el.tagName.toLowerCase(),
        id: secEntry.el.id || '',
        hidden: secEntry.el.classList.contains('cms-hidden'),
        canMoveUp,
        canMoveDown,
        scope: secEntry.scope,
        repeaters,
      };
    });

    return {
      pagePath,
      isHome: isHomePage,
      sections,
    };
  }

  // =========================================================================
  // Deskryptor wybranego elementu dla Inspektora
  // =========================================================================
  function collectTextFieldSpecs(el, kind, itemType) {
    const specs = [];
    const seenEls = new Set();

    const add = (key, label, targetEl, multiline = false) => {
      if (!targetEl || seenEls.has(targetEl)) return;
      if (targetEl.closest('[data-cms-ui]')) return;
      seenEls.add(targetEl);
      specs.push({
        key,
        label,
        targetEl,
        value: getPreservedText(targetEl),
        multiline,
      });
    };

    if (!el) return specs;

    // 1. Kafelki / elementy w repeaterach
    if (itemType === 'cat-card' || el.classList.contains('home-cat-card')) {
      add('title', 'Tytuł kafelka', el.querySelector('h3'));
      add('cta', 'Tekst przycisku', el.querySelector('.home-cat-cta'));
      return specs;
    }
    if (itemType === 'extra-category' || itemType === 'nav-pill') {
      add('text', 'Etykieta przycisku', el);
      return specs;
    }
    if (itemType === 'featured-product' || el.classList.contains('home-featured-product')) {
      add('title', 'Nazwa produktu', el.querySelector('h4, h3'));
      add('description', 'Opis produktu', el.querySelector('.home-featured-copy p, p'), true);
      add('cta', 'Tekst linku', el.querySelector('.home-featured-copy span'));
      return specs;
    }
    if (itemType === 'home-service' || el.classList.contains('home-service-item')) {
      add('title', 'Tytuł usługi', el.querySelector('summary h4') || el.querySelector('summary'));
      add('description', 'Opis usługi', el.querySelector('.home-service-item-teaser, p'), true);
      add('cta', 'Tekst linku', el.querySelector('a.arr'));
      return specs;
    }
    if (itemType === 'review-card' || el.classList.contains('review')) {
      add('quote', 'Treść opinii', el.querySelector('blockquote'), true);
      add('source', 'Źródło / autor', el.querySelector('.review-source'));
      return specs;
    }
    if (itemType === 'realization-card' || el.classList.contains('realization-card')) {
      add('title', 'Nazwa kategorii', el.querySelector('h3'));
      add('count', 'Podpis / liczba zdjęć', el.querySelector('.realization-card-body span'));
      return specs;
    }
    if (itemType === 'store-item' || el.classList.contains('kt-store-item')) {
      add('title', 'Nazwa salonu', el.querySelector('.kt-store-title'));
      add('address', 'Adres salonu', el.querySelector('.kt-store-addr'), true);
      add('phone', 'Telefony', el.querySelector('.kt-store-phone'));
      add('navBtn', 'Przycisk mapy', el.querySelector('.store-nav-btn'));
      return specs;
    }
    if (itemType === 'location-card' || el.classList.contains('location-card')) {
      add('title', 'Nazwa salonu', el.querySelector('h2'));
      add('address', 'Adres salonu', el.querySelector('address'), true);
      add('hours', 'Godziny otwarcia', el.querySelector('.location-card__hours'));
      add('navBtn', 'Przycisk mapy', el.querySelector('.store-nav-btn'));
      return specs;
    }
    if (itemType === 'profile-row' || el.classList.contains('profile-row')) {
      add('kicker', 'Nadtytuł / system', el.querySelector('.profile-row__kicker'));
      add('title', 'Nazwa profilu', el.querySelector('h2'));
      add('summary', 'Nagłówek opisu', el.querySelector('summary'));
      return specs;
    }
    if (itemType === 'subcat-card' || el.classList.contains('subcat-card')) {
      add('title', 'Nazwa podkategorii', el.querySelector('h3'));
      add('cta', 'Tekst przycisku', el.querySelector('.cat-prod-btn'));
      return specs;
    }
    if (itemType === 'cat-prod-card' || el.classList.contains('cat-prod-card')) {
      add('tag', 'Etykieta / marka', el.querySelector('.cat-prod-tag'));
      add('title', 'Nazwa produktu', el.querySelector('.cat-prod-title a') || el.querySelector('.cat-prod-title'));
      add('cta', 'Tekst przycisku', el.querySelector('.cat-prod-btn'));
      return specs;
    }
    if (itemType === 'brand-chip') {
      add('text', 'Nazwa katalogu', el.querySelector('a') || el);
      return specs;
    }
    if (itemType === 'list-item') {
      add('text', 'Treść punktu', el, true);
      return specs;
    }
    if (itemType === 'montage-step' || el.classList.contains('montage-step-card')) {
      add('title', 'Podpis zdjęcia', el.querySelector('.montage-step-title, h3'));
      return specs;
    }
    if (itemType === 'sidebar-box' || el.classList.contains('sidebar-box')) {
      add('eyebrow', 'Nagłówek karty', el.querySelector('.eyebrow, h2, h3, h4'));
      add('tel', 'Numer telefonu', el.querySelector('a.sidebar-tel'));
      const storePs = el.querySelectorAll('.sidebar-store p');
      if (storePs.length > 0) {
        storePs.forEach((p, idx) => add(`store${idx}`, `Salon ${idx + 1}`, p));
      } else {
        el.querySelectorAll(':scope > p').forEach((p, idx) => {
          add(idx === 0 ? 'text' : `text${idx}`, idx === 0 ? 'Opis karty' : `Akapit ${idx + 1}`, p, true);
        });
      }
      add('cta', 'Przycisk telefonu', el.querySelector('a.tc-tel'));
      add('bottomLink', 'Link na dole karty', el.querySelector('a.sidebar-link'));
      return specs;
    }
    if (itemType === 'partner-logo' || itemType === 'realization-photo' || itemType === 'gallery-thumb') {
      return specs; // Głównie obrazek (alt edytowane w sekcji Obraz)
    }

    // 2. Sekcje najwyższego poziomu
    if (el.classList.contains('hero')) {
      el.querySelectorAll('.hero-meta > span').forEach((sp, i) => {
        add(`heroMeta${i}`, `Pasek górny ${i + 1}`, sp);
      });
      const maskSpans = el.querySelectorAll('h1 .mask > span');
      if (maskSpans.length > 0) {
        maskSpans.forEach((sp, i) => add(`heroLine${i}`, `Nagłówek — linia ${i + 1}`, sp));
      } else {
        add('title', 'Nagłówek główny', el.querySelector('h1'));
      }
      add('heroSub', 'Opis pod nagłówkiem', el.querySelector('.hero-sub'), true);
      add('heroBtn', 'Przycisk telefonu', el.querySelector('a.hero-btn'));
      add('heroMail', 'Przycisk e-mail', el.querySelector('a.hero-mail'));
      return specs;
    }

    if (el.classList.contains('trust')) {
      add('eyebrow', 'Nadtytuł', el.querySelector('.eyebrow'));
      add('title', 'Nagłówek', el.querySelector('h2'));
      add('text', 'Opis firmy', el.querySelector('p'), true);
      add('aboutLink', 'Przycisk 1', el.querySelector('a.trust-about-link'));
      add('telLink', 'Przycisk 2 (telefon)', el.querySelector('a.tc-tel'));
      return specs;
    }

    if (el.matches('header.subpage-head')) {
      add('eyebrow', 'Nadtytuł', el.querySelector('.eyebrow'));
      add('title', 'Tytuł strony (H1)', el.querySelector('h1'));
      add('lead', 'Wprowadzenie (lead)', el.querySelector('.subpage-lead'), true);
      return specs;
    }

    if (el.classList.contains('cta-banner-dark') || el.querySelector(':scope > .wrap > .cta-banner-dark, :scope > .cta-banner-dark')) {
      const box = el.classList.contains('cta-banner-dark') ? el : el.querySelector('.cta-banner-dark');
      add('eyebrow', 'Nadtytuł', box.querySelector('.eyebrow'));
      add('title', 'Nagłówek banera', box.querySelector('h3, h2'));
      add('text', 'Treść banera', box.querySelector('p'), true);
      add('telBtn', 'Przycisk telefonu', box.querySelector('a.tc-tel'));
      add('mailBtn', 'Przycisk e-mail', box.querySelector('a.tc-mail'));
      return specs;
    }

    if (el.classList.contains('reviews')) {
      add('eyebrow', 'Nadtytuł', el.querySelector('.reviews-head .eyebrow'));
      add('title', 'Nagłówek sekcji', el.querySelector('.reviews-head h2'));
      add('score', 'Ocena Google', el.querySelector('.score-value'));
      add('scoreMeta', 'Opis oceny', el.querySelector('.score-meta'), true);
      add('reviewsLink', 'Link do opinii Google', el.querySelector('a.reviews-link'));
      add('reviewsNote', 'Nota pod opiniami', el.querySelector('.reviews-note'), true);
      return specs;
    }

    if (el.classList.contains('contact') || el.classList.contains('kt')) {
      add('eyebrow', 'Nadtytuł', el.querySelector('.contact-head .eyebrow'));
      add('title', 'Nagłówek sekcji', el.querySelector('.contact-head h2'));
      add('lead', 'Opis sekcji', el.querySelector('.contact-head p'), true);
      add('telLabel', 'Etykieta telefonu', el.querySelector('.kt-tel > .kt-lab'));
      add('telNum', 'Główny numer telefonu', el.querySelector('.kt-num'));
      el.querySelectorAll('.kt-lista > li').forEach((li, i) => {
        const labelSpan = li.querySelector(':scope > span:first-child');
        const valEl = li.querySelector(':scope > a, :scope > span:nth-child(2)');
        const lbl = trimText(labelSpan?.textContent || '').replace(/:$/, '') || `Wiersz ${i + 1}`;
        if (valEl) add(`ktRow${i}`, lbl, valEl);
      });
      add('companyBold', 'Nazwa firmy (stopka kontaktu)', el.querySelector('.kt-oferta > b'));
      add('companyDesc', 'Opis firmy (kontakt)', el.querySelector('.kt-oferta'), true);
      add('storesLabel', 'Nagłówek salonów', el.querySelector('.kt-adres > .kt-lab'));
      add('storesLink', 'Link do opisu salonów', el.querySelector('.store-full-copy-link'));
      return specs;
    }

    if (el.classList.contains('offer')) {
      add('eyebrow', 'Nadtytuł', el.querySelector('.offer-head .eyebrow'));
      add('title', 'Nagłówek oferty', el.querySelector('.offer-head h2'));
      add('lead', 'Opis pod nagłówkiem', el.querySelector('.offer-head > p'), true);
      add('featuredEyebrow', 'Polecane — nadtytuł', el.querySelector('.home-featured-heading .eyebrow'));
      add('featuredTitle', 'Polecane — nagłówek', el.querySelector('.home-featured-heading h3'));
      add('servicesEyebrow', 'Usługi — nadtytuł', el.querySelector('.home-services-head .eyebrow'));
      add('servicesTitle', 'Usługi — nagłówek', el.querySelector('.home-services-head h3'));
      add('servicesLink', 'Usługi — link', el.querySelector('.home-services-head > a'));
      return specs;
    }

    if (el.classList.contains('realizations-home')) {
      add('eyebrow', 'Nadtytuł', el.querySelector('.eyebrow'));
      add('title', 'Nagłówek sekcji', el.querySelector('h2'));
      add('moreLink', 'Przycisk „Zobacz wszystkie”', el.querySelector('a.realizations-more'));
      return specs;
    }

    if (el.classList.contains('realization-group')) {
      add('title', 'Nazwa grupy realizacji', el.querySelector('.realization-group-head h2, h2'));
      add('count', 'Licznik zdjęć', el.querySelector('.realization-count'));
      return specs;
    }

    if (el.classList.contains('partners-section')) {
      add('eyebrow', 'Nadtytuł', el.querySelector('.eyebrow'));
      add('title', 'Nagłówek sekcji', el.querySelector('h2'));
      return specs;
    }

    if (el.classList.contains('service-card')) {
      add('title', 'Tytuł karty', el.querySelector('h2'));
      add('teaser', 'Krótki opis (zajawka)', el.querySelector('.service-card-teaser'), true);
      add('summary', 'Nagłówek rozwinięcia', el.querySelector(':scope > details > summary'));
      return specs;
    }

    if (el.classList.contains('service-feature-box')) {
      add('eyebrow', 'Nadtytuł', el.querySelector('.eyebrow'));
      add('text', 'Opis', el.querySelector('p'), true);
      add('btn', 'Przycisk', el.querySelector('a.service-feature-btn'));
      return specs;
    }

    if (el.classList.contains('brand-box')) {
      add('title', 'Nagłówek katalogów', el.querySelector('h2, h3'));
      return specs;
    }

    if (el.classList.contains('cat-quick-nav')) {
      add('label', 'Etykieta paska', el.querySelector('.cat-quick-nav-label'));
      return specs;
    }

    if (el.classList.contains('source-content-disclosure')) {
      add('summary', 'Nagłówek sekcji', el.querySelector(':scope > summary'));
      return specs;
    }

    // Fallback ogólny dla innych sekcji/elementów
    if (kind === 'element') {
      add('text', 'Treść elementu', el, !el.matches(SINGLE_LINE_SELECTOR));
      return specs;
    }

    const candidates = el.querySelectorAll('.eyebrow, h1, h2, h3, h4, summary, .subpage-lead, .service-card-teaser, p');
    let idx = 0;
    for (const node of candidates) {
      if (idx >= 6) break;
      if (node.closest('[data-cms-ui]')) continue;
      if (node.closest('.cms-item') && !el.classList.contains('cms-item')) continue;
      const tag = node.tagName.toLowerCase();
      const fieldLabel = node.classList.contains('eyebrow')
        ? 'Nadtytuł'
        : tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4'
        ? 'Nagłówek'
        : tag === 'summary'
        ? 'Nagłówek rozwinięcia'
        : `Akapit ${idx + 1}`;
      add(`field-${idx}`, fieldLabel, node, tag === 'p');
      idx += 1;
    }

    if (specs.length === 0 && (el.tagName === 'A' || el.tagName === 'LI' || el.tagName === 'DIV') && getPreservedText(el)) {
      add('text', 'Treść elementu', el, el.tagName !== 'A');
    }

    return specs;
  }

  function collectLinkSpecs(el, itemType) {
    const links = [];
    const seen = new Set();

    const pushLink = (linkEl, label) => {
      if (!linkEl || seen.has(linkEl)) return;
      if (linkEl.closest('[data-cms-ui]')) return;
      seen.add(linkEl);
      const href = linkEl.getAttribute('href') || '';
      links.push({
        index: links.length,
        label,
        el: linkEl,
        href,
        rootPath: toRootPath(href, pagePath),
        target: linkEl.getAttribute('target') || '',
        text: getPreservedText(linkEl),
      });
    };

    if (!el) return links;

    if (el.tagName === 'A') {
      pushLink(el, 'Link docelowy');
      return links;
    }

    if (itemType === 'cat-prod-card' || el.classList.contains('cat-prod-card')) {
      const titleLink = el.querySelector('.cat-prod-title a') || el.querySelector('.cat-prod-btn') || el.querySelector('a');
      if (titleLink) pushLink(titleLink, 'Link do produktu');
      return links;
    }

    if (itemType === 'home-service' || el.classList.contains('home-service-item')) {
      pushLink(el.querySelector('a.arr'), 'Link „Dowiedz się więcej”');
      return links;
    }

    if (itemType === 'brand-chip') {
      pushLink(el.querySelector('a'), 'Link katalogu (URL / PDF)');
      return links;
    }

    if (itemType === 'store-item' || el.classList.contains('kt-store-item')) {
      pushLink(el.querySelector('a.store-nav-btn'), 'Link Google Maps');
      return links;
    }

    if (itemType === 'location-card' || el.classList.contains('location-card')) {
      pushLink(el.querySelector('a.store-nav-btn'), 'Link Google Maps');
      el.querySelectorAll('.location-card__links a').forEach((a, i) => {
        pushLink(a, `Telefon ${i + 1}`);
      });
      return links;
    }

    if (itemType === 'realization-photo' || el.classList.contains('realization-photo')) {
      pushLink(el.querySelector('a'), 'Link pełnego zdjęcia');
      return links;
    }

    if (itemType === 'sidebar-box' || el.classList.contains('sidebar-box')) {
      const boxLinks = el.querySelectorAll('a[href]');
      let added = 0;
      for (const a of boxLinks) {
        if (added >= 15) break;
        if (a.closest('[data-cms-ui]')) continue;
        const href = a.getAttribute('href') || '';
        const lbl =
          a.classList.contains('sidebar-tel') || a.classList.contains('tc-tel') || href.startsWith('tel:')
            ? 'Link telefonu'
            : a.classList.contains('sidebar-map-link')
            ? `Google Maps (${added + 1})`
            : truncate(getPreservedText(a), 28) || `Link ${added + 1}`;
        pushLink(a, lbl);
        added += 1;
      }
      return links;
    }

    // Sekcje: zbierz przyciski CTA (poza kafelkami .cms-item)
    const ctaLinks = el.querySelectorAll(
      'a.hero-btn, a.hero-mail, a.trust-about-link, a.tc-tel, a.tc-mail, a.realizations-more, a.reviews-link, a.store-full-copy-link, a.service-feature-btn, .home-services-head > a, a.kt-num, a.sidebar-tel, a.sidebar-link'
    );
    ctaLinks.forEach((a, i) => {
      if (a.closest('.cms-item') && !el.classList.contains('cms-item')) return;
      const lbl =
        a.classList.contains('hero-btn') || a.classList.contains('tc-tel') || a.classList.contains('kt-num') || a.classList.contains('sidebar-tel')
          ? 'Link telefonu'
          : a.classList.contains('hero-mail') || a.classList.contains('tc-mail')
          ? 'Link e-mail'
          : `Link ${i + 1}`;
      pushLink(a, lbl);
    });

    // Uniwersalny fallback dla stron innych klientów (sekcje i generyczne kafelki)
    if (links.length === 0) {
      const genericLinks = el.querySelectorAll('a[href]');
      let added = 0;
      for (const a of genericLinks) {
        if (added >= 6) break;
        if (a.closest('[data-cms-ui]')) continue;
        if (a.closest('.cms-item') && !el.classList.contains('cms-item')) continue;
        const href = a.getAttribute('href') || '';
        const lbl = href.startsWith('tel:')
          ? 'Link telefonu'
          : href.startsWith('mailto:')
          ? 'Link e-mail'
          : truncate(getPreservedText(a), 24) || `Link ${added + 1}`;
        pushLink(a, lbl);
        added += 1;
      }
    }

    return links;
  }

  function getImageDescriptor(el) {
    const img = findPrimaryImage(el);
    if (!img) return null;
    const rawSrc = img.getAttribute('src') || '';
    const repoAttr = img.getAttribute('data-cms-repo-src');
    const rootPath = repoAttr || toRootPath(rawSrc, pagePath) || '';
    let resolvedSrc = (rootPath && pendingImages[rootPath]) || '';
    if (!resolvedSrc) {
      if (rawSrc.startsWith('data:') || rawSrc.startsWith('blob:') || /^https?:\/\//i.test(rawSrc)) {
        resolvedSrc = rawSrc;
      } else if (img.currentSrc && !img.currentSrc.startsWith('about:')) {
        resolvedSrc = img.currentSrc;
      } else if (rawSrc) {
        try {
          const base = doc.baseURI && !doc.baseURI.startsWith('about:') ? doc.baseURI : win.location.href;
          resolvedSrc = new URL(rawSrc, base).href;
        } catch {
          resolvedSrc = rawSrc;
        }
      }
    }
    return {
      src: rawSrc,
      resolvedSrc,
      rootPath,
      alt: img.getAttribute('alt') || '',
    };
  }

  function getSelectedDescriptor() {
    if (!selectedUid) return null;
    const entry = nodesByUid.get(selectedUid);
    if (!entry || !doc.contains(entry.el)) return null;

    const { uid, el, kind, itemType, parentSectionUid } = entry;
    let canMoveUp = false;
    let canMoveDown = false;
    let repeaterContext = null;
    let childRepeaters = [];

    if (kind === 'section') {
      const secEntry = sectionList.find((s) => s.uid === uid);
      if (secEntry) {
        const mv = computeCanMoveSection(secEntry);
        canMoveUp = mv.canMoveUp;
        canMoveDown = mv.canMoveDown;
      }
      repeatersByUid.forEach((rep) => {
        const belongs =
          rep.parentSectionUid === uid ||
          (rep.spec.itemType === 'subpage-service' &&
            el.matches('.service-card') &&
            rep.el === el.parentElement);
        if (!belongs) return;
        childRepeaters.push({
          repeaterUid: rep.repeaterUid,
          itemType: rep.spec.itemType,
          label: rep.spec.label,
          count: rep.items.length,
        });
      });
    } else if (kind === 'item') {
      const rep = repeatersByUid.get(entry.repeaterUid);
      if (rep) {
        const idx = rep.items.indexOf(el);
        canMoveUp = idx > 0;
        canMoveDown = idx >= 0 && idx < rep.items.length - 1;
        repeaterContext = {
          repeaterUid: rep.repeaterUid,
          itemType: rep.spec.itemType,
          label: rep.spec.label,
        };
      }
    }

    const fieldSpecs = collectTextFieldSpecs(el, kind, itemType);
    const linkSpecs = collectLinkSpecs(el, itemType);
    const imageDesc = getImageDescriptor(el);
    const stars =
      el.classList.contains('review') || el.classList.contains('reviews')
        ? countStars(el)
        : null;

    return {
      uid,
      kind,
      label: kind === 'section' ? getSectionLabel(el) : getItemLabel(el, itemType),
      tag: el.tagName.toLowerCase(),
      id: el.id || '',
      hidden: el.classList.contains('cms-hidden'),
      canMoveUp,
      canMoveDown,
      parentSectionUid: parentSectionUid || uid,
      textFields: fieldSpecs.map(({ key, label, value, multiline }) => ({
        key,
        label,
        value,
        multiline,
      })),
      link: linkSpecs[0]
        ? {
            href: linkSpecs[0].href,
            rootPath: linkSpecs[0].rootPath,
            target: linkSpecs[0].target,
            text: linkSpecs[0].text,
          }
        : null,
      links: linkSpecs.map(({ index, label, href, rootPath, target, text }) => ({
        index,
        label,
        href,
        rootPath,
        target,
        text,
      })),
      image: imageDesc,
      stars,
      sectionStyle: kind === 'section' ? readSectionStyle(el) : null,
      freeLayout: readFreeLayout(el),
      repeaterContext,
      childRepeaters,
    };
  }

  function buildTargetPayload(entry) {
    if (!entry || !entry.el || !doc.contains(entry.el)) return null;
    const el = entry.el;
    const label = entry.kind === 'section' ? getSectionLabel(el) : getItemLabel(el, entry.itemType);
    const textSnippet = truncate(getPreservedText(el), 140);
    return {
      uid: entry.uid,
      kind: entry.kind,
      itemType: entry.itemType || '',
      label,
      id: el.id || '',
      pagePath,
      textSnippet,
    };
  }

  function getElementTargetPayload(uid) {
    const entry = nodesByUid.get(uid);
    return buildTargetPayload(entry);
  }

  function removeFreeHandles() {
    doc.querySelectorAll('[data-cms-ui="free-handle"], [data-cms-ui="free-hud"]').forEach((n) => n.remove());
  }

  function syncFreeHandles() {
    removeFreeHandles();
    if (!freeLayoutMode || browseMode || aiPickMode || !selectedUid) return;
    const entry = nodesByUid.get(selectedUid);
    if (!entry || !doc.contains(entry.el)) return;
    if (entry.kind !== 'section' && entry.kind !== 'item') return;

    const el = entry.el;
    const handles = [
      { dir: 'e', title: 'Przeciągnij, aby zmienić szerokość' },
      { dir: 's', title: 'Przeciągnij, aby zmienić wysokość' },
      { dir: 'se', title: 'Przeciągnij róg, aby zmienić szerokość i wysokość' },
    ];
    for (const h of handles) {
      el.appendChild(
        createEl(doc, 'button', {
          type: 'button',
          'data-cms-ui': 'free-handle',
          'data-free-dir': h.dir,
          'data-free-uid': entry.uid,
          contenteditable: 'false',
          title: h.title,
          'aria-label': h.title,
        })
      );
    }
  }

  function applyFreeLayoutToEl(el, patch = {}) {
    if (!el || !el.style) return false;
    const curr = readFreeLayout(el);
    const clamp = (n, min, max) => Math.max(min, Math.min(max, Math.round(n)));

    const nextTx = patch.tx !== undefined ? clamp(Number(patch.tx) || 0, -1200, 1200) : curr.tx;
    const nextTy = patch.ty !== undefined ? clamp(Number(patch.ty) || 0, -1200, 1200) : curr.ty;
    const nextW =
      patch.w === null || patch.w === ''
        ? null
        : patch.w !== undefined
        ? clamp(Number(patch.w) || 0, 80, 1600)
        : curr.w;
    const nextH =
      patch.h === null || patch.h === ''
        ? null
        : patch.h !== undefined
        ? clamp(Number(patch.h) || 0, 40, 1800)
        : curr.h;
    const nextScale =
      patch.scale !== undefined ? clamp(Number(patch.scale) || 100, 30, 200) : curr.scale;
    const nextZ = patch.z !== undefined ? clamp(Number(patch.z) || 2, 1, 40) : curr.z;

    const isDefault =
      nextTx === 0 && nextTy === 0 && nextW === null && nextH === null && nextScale === 100 && nextZ === 2;

    if (isDefault) {
      el.classList.remove('cms-free-block');
      el.removeAttribute('data-cms-has-w');
      el.removeAttribute('data-cms-has-h');
      el.style.removeProperty('--cms-tx');
      el.style.removeProperty('--cms-ty');
      el.style.removeProperty('--cms-w');
      el.style.removeProperty('--cms-h');
      el.style.removeProperty('--cms-scale');
      el.style.removeProperty('--cms-z');
      if (!el.getAttribute('style')?.trim()) el.removeAttribute('style');
      return true;
    }

    el.classList.add('cms-free-block');
    if (nextTx !== 0) el.style.setProperty('--cms-tx', `${nextTx}px`);
    else el.style.removeProperty('--cms-tx');

    if (nextTy !== 0) el.style.setProperty('--cms-ty', `${nextTy}px`);
    else el.style.removeProperty('--cms-ty');

    if (nextW !== null) {
      el.setAttribute('data-cms-has-w', '1');
      el.style.setProperty('--cms-w', `${nextW}px`);
    } else {
      el.removeAttribute('data-cms-has-w');
      el.style.removeProperty('--cms-w');
    }

    if (nextH !== null) {
      el.setAttribute('data-cms-has-h', '1');
      el.style.setProperty('--cms-h', `${nextH}px`);
    } else {
      el.removeAttribute('data-cms-has-h');
      el.style.removeProperty('--cms-h');
    }

    if (nextScale !== 100) el.style.setProperty('--cms-scale', String((nextScale / 100).toFixed(2)));
    else el.style.removeProperty('--cms-scale');

    if (nextZ !== 2) el.style.setProperty('--cms-z', String(nextZ));
    else el.style.removeProperty('--cms-z');

    return true;
  }

  function updateFreeLayout(uid, patch = {}, { silent = false } = {}) {
    const resolvedUid = uid || selectedUid;
    if (!resolvedUid) return false;
    const entry = nodesByUid.get(resolvedUid);
    if (!entry || !doc.contains(entry.el)) return false;
    applyFreeLayoutToEl(entry.el, patch);
    if (!silent) {
      callbacks.onSelect(getSelectedDescriptor());
      callbacks.onMutate('layout');
    }
    return true;
  }

  function resetFreeLayout(uid) {
    return updateFreeLayout(uid, { tx: 0, ty: 0, w: null, h: null, scale: 100, z: 2 });
  }

  function selectByUid(uid, { scroll = false } = {}) {
    if (!uid) {
      clearSelection();
      return null;
    }
    let entry = nodesByUid.get(uid);
    if (!entry) {
      const domEl = doc.querySelector(`[data-cms-uid="${uid}"]`);
      if (domEl) {
        const secAncestor = domEl.closest('.cms-section');
        entry = {
          uid,
          el: domEl,
          kind: 'element',
          label: domEl.tagName.toLowerCase(),
          parentSectionUid: secAncestor?.getAttribute('data-cms-uid') || uid,
        };
        nodesByUid.set(uid, entry);
      }
    }
    if (!entry || !doc.contains(entry.el)) return null;

    selectedUid = uid;
    applySelectedVisual(entry);
    syncFreeHandles();
    if (scroll) {
      entry.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const desc = getSelectedDescriptor();
    callbacks.onSelect(desc);
    return desc;
  }

  function clearSelection() {
    selectedUid = null;
    applySelectedVisual(null);
    removeFreeHandles();
    callbacks.onSelect(null);
  }

  // =========================================================================
  // Mutacje pól, linków, obrazów, gwiazdek, widoczności i struktury
  // =========================================================================
  function syncStructureAndSelection(reason, { emitSelect = true } = {}) {
    scanStructure();
    callbacks.onStructureChange(getStructure());
    if (emitSelect) {
      callbacks.onSelect(getSelectedDescriptor());
    }
    if (reason) {
      callbacks.onMutate(reason);
    }
  }

  function updateField(uid, key, value) {
    const entry = nodesByUid.get(uid);
    if (!entry || !doc.contains(entry.el)) return false;

    const specs = collectTextFieldSpecs(entry.el, entry.kind, entry.itemType);
    const spec = specs.find((s) => s.key === key);
    if (!spec || !spec.targetEl) return false;

    setPreservedText(spec.targetEl, value);

    // Zaktualizuj etykietę w pasku narzędzi jeśli zmienił się tytuł
    if (key === 'title' || key === 'text' || key === 'summary') {
      const newLabel =
        entry.kind === 'section'
          ? getSectionLabel(entry.el)
          : getItemLabel(entry.el, entry.itemType);
      entry.label = newLabel;
      entry.el.setAttribute('data-cms-label', newLabel);
      const tbLabel = entry.el.querySelector(':scope > [data-cms-ui="section-toolbar"] .cms-tb-label');
      if (tbLabel) {
        tbLabel.textContent = newLabel;
        tbLabel.setAttribute('title', newLabel);
      }
      callbacks.onStructureChange(getStructure());
    }

    callbacks.onMutate('text');
    return true;
  }

  function updateLink(uid, linkData = {}) {
    const entry = nodesByUid.get(uid);
    if (!entry || !doc.contains(entry.el)) return false;

    const linkSpecs = collectLinkSpecs(entry.el, entry.itemType);
    const idx = Number.isInteger(linkData.index)
      ? linkData.index
      : Number.isInteger(linkData.linkIndex)
      ? linkData.linkIndex
      : 0;
    const spec = linkSpecs[idx] || linkSpecs[0];
    if (!spec || !spec.el) return false;

    let nextHref = null;
    if (linkData.rootPath !== undefined && linkData.rootPath !== null && linkData.rootPath !== '') {
      nextHref = toRelativeUrl(linkData.rootPath, pagePath);
    } else if (linkData.href !== undefined) {
      nextHref = String(linkData.href);
    }

    if (nextHref !== null) {
      const trimmedHref = String(nextHref).trim();
      if (!trimmedHref || trimmedHref === '#') {
        nextHref = '#';
      } else {
        const safeHref = sanitizeUrl(trimmedHref);
        if (!safeHref || isDangerousHrefScheme(trimmedHref) || isDangerousHrefScheme(safeHref)) {
          return false;
        }
        nextHref = safeHref;
      }
    }

    const targets =
      entry.itemType === 'cat-prod-card' || entry.el.classList.contains('cat-prod-card')
        ? Array.from(entry.el.querySelectorAll('.cat-prod-media, .cat-prod-title a, .cat-prod-btn'))
        : [spec.el];

    if (nextHref !== null) {
      targets.forEach((a) => a.setAttribute('href', nextHref));
    }

    if (linkData.target !== undefined) {
      const targetVal = String(linkData.target || '').trim();
      targets.forEach((a) => {
        if (targetVal === '_blank') {
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener noreferrer');
        } else {
          a.removeAttribute('target');
          a.removeAttribute('rel');
        }
      });
    }

    if (
      linkData.text !== undefined &&
      !spec.el.querySelector('img, h1, h2, h3, h4, h5, h6, p, div, figure, article, section, ul, ol')
    ) {
      setPreservedText(spec.el, sanitizeText(linkData.text));
    }

    // NIE wywołujemy tutaj callbacks.onSelect(), aby nie przebudowywać Inspektora i nie odbierać fokusu przy wpisywaniu URL litera po literze!
    callbacks.onMutate('link');
    return true;
  }

  function updateImage(uid, imageData = {}) {
    const entry = nodesByUid.get(uid);
    if (!entry || !doc.contains(entry.el)) return false;

    const img = findPrimaryImage(entry.el);
    if (!img) return false;

    const rawRepo = imageData.repoSrc ?? imageData.rootPath ?? null;
    const repoPath = rawRepo ? normalizeRepoPath(rawRepo) : null;
    const rawSrc = imageData.previewSrc ?? imageData.src ?? null;

    let displaySrc = null;
    if (imageData.previewSrc) {
      displaySrc = imageData.previewSrc;
    } else if (repoPath && pendingImages[repoPath]) {
      displaySrc = pendingImages[repoPath];
    } else if (repoPath) {
      displaySrc = toRelativeUrl(repoPath, pagePath);
    } else if (rawSrc) {
      displaySrc = rawSrc;
    }

    if (displaySrc !== null) {
      const trimmedSrc = String(displaySrc).trim();
      if (!isSafePreviewImageSrc(trimmedSrc)) {
        const safeSrc = sanitizeUrl(trimmedSrc);
        if (trimmedSrc && (!safeSrc || isDangerousHrefScheme(trimmedSrc))) {
          return false;
        }
        displaySrc = safeSrc || '';
      }

      if ((displaySrc.startsWith('data:') || displaySrc.startsWith('blob:')) && repoPath) {
        img.setAttribute('data-cms-repo-src', repoPath);
        img.setAttribute('src', displaySrc);
      } else if (repoPath) {
        img.removeAttribute('data-cms-repo-src');
        img.setAttribute('src', toRelativeUrl(repoPath, pagePath));
      } else {
        img.setAttribute('src', displaySrc);
      }

      const relForAttr = repoPath ? toRelativeUrl(repoPath, pagePath) : displaySrc;

      if (img.hasAttribute('data-lightbox-src')) {
        img.setAttribute('data-lightbox-src', relForAttr);
      }

      // Zdjęcie realizacji (<figure class="realization-photo"><a href="..." data-lightbox-src="...">)
      if (entry.el.classList.contains('realization-photo')) {
        const a = entry.el.querySelector('a');
        if (a) {
          a.setAttribute('href', relForAttr);
          a.setAttribute('data-lightbox-src', relForAttr);
        }
      }

      // Miniatura galerii produktu
      if (entry.el.classList.contains('product-gallery-thumb')) {
        entry.el.setAttribute('data-src', relForAttr);
        const gallery = entry.el.closest('[data-gallery]');
        if (gallery && entry.el.classList.contains('is-active')) {
          const mainImg = gallery.querySelector('[data-gallery-main]');
          if (mainImg) {
            if ((displaySrc.startsWith('data:') || displaySrc.startsWith('blob:')) && repoPath) {
              mainImg.setAttribute('data-cms-repo-src', repoPath);
            } else {
              mainImg.removeAttribute('data-cms-repo-src');
            }
            mainImg.setAttribute('src', displaySrc);
          }
        }
      }

      // Zaktualizuj --frame-image rodzica
      updateFrameImageFor(img);
    }

    if (imageData.alt !== undefined) {
      const nextAlt = String(imageData.alt ?? '');
      img.setAttribute('alt', nextAlt);
      if (entry.el.classList.contains('product-gallery-thumb') && entry.el.classList.contains('is-active')) {
        const mainImg = entry.el.closest('[data-gallery]')?.querySelector('[data-gallery-main]');
        if (mainImg) mainImg.setAttribute('alt', nextAlt);
      }
    }

    callbacks.onStructureChange(getStructure());
    callbacks.onSelect(getSelectedDescriptor());
    callbacks.onMutate('image');
    return true;
  }

  function updateStars(uid, count) {
    const entry = nodesByUid.get(uid);
    if (!entry || !doc.contains(entry.el)) return false;

    const starsEl = entry.el.matches('.stars') ? entry.el : entry.el.querySelector('.stars');
    if (!starsEl) return false;

    const clamped = Math.min(5, Math.max(1, Math.round(Number(count) || 5)));
    starsEl.textContent = '★'.repeat(clamped) + '☆'.repeat(5 - clamped);
    if (starsEl.hasAttribute('aria-label')) {
      starsEl.setAttribute('aria-label', `Ocena ${clamped} na 5`);
    }

    callbacks.onSelect(getSelectedDescriptor());
    callbacks.onMutate('stars');
    return true;
  }

  function updateSectionId(uid, newId) {
    const entry = nodesByUid.get(uid);
    if (!entry || !doc.contains(entry.el)) return false;

    const clean = sanitizeId(newId);
    if (clean) entry.el.setAttribute('id', clean);
    else entry.el.removeAttribute('id');

    callbacks.onStructureChange(getStructure());
    callbacks.onSelect(getSelectedDescriptor());
    callbacks.onMutate('meta');
    return true;
  }

  function updateSectionStyle(uid, { tone, align, spacing } = {}) {
    const resolvedUid = uid || selectedUid;
    if (!resolvedUid) return false;
    const entry = nodesByUid.get(resolvedUid);
    if (!entry || !doc.contains(entry.el)) return false;

    let targetEl = entry.kind === 'section' ? entry.el : null;
    if (!targetEl) {
      const parentEntry = entry.parentSectionUid ? nodesByUid.get(entry.parentSectionUid) : null;
      targetEl =
        (parentEntry && doc.contains(parentEntry.el) ? parentEntry.el : null) ||
        entry.el.closest('.cms-section');
    }
    if (!targetEl || !doc.contains(targetEl)) return false;

    if (tone !== undefined) {
      targetEl.classList.remove('cms-tone-light', 'cms-tone-dark', 'cms-tone-accent');
      const cls = SECTION_STYLE_CLASSES.tone[tone];
      if (cls) targetEl.classList.add(cls);
    }

    if (align !== undefined) {
      targetEl.classList.remove('cms-align-left', 'cms-align-center');
      const cls = SECTION_STYLE_CLASSES.align[align];
      if (cls) targetEl.classList.add(cls);
    }

    if (spacing !== undefined) {
      targetEl.classList.remove('cms-space-compact', 'cms-space-spacious');
      const cls = SECTION_STYLE_CLASSES.spacing[spacing];
      if (cls) targetEl.classList.add(cls);
    }

    callbacks.onSelect(getSelectedDescriptor());
    callbacks.onMutate('style');
    return true;
  }

  function toggleHidden(uid) {
    const entry = nodesByUid.get(uid);
    if (!entry || !doc.contains(entry.el)) return false;

    entry.el.classList.toggle('cms-hidden');
    syncStructureAndSelection('visibility');
    return true;
  }

  // Pomocnik: rozpakowuje .photo-band jeśli trzeba swobodnie przestawić sekcje na index.html
  function cleanupEmptyPhotoBand() {
    const main = getMainRoot();
    main.querySelectorAll(':scope > .photo-band').forEach((band) => {
      const remaining = Array.from(band.children).filter((ch) => !ch.hasAttribute('data-cms-ui'));
      if (remaining.length === 0) band.remove();
    });
  }

  function unwrapPhotoBandIfNeeded(band) {
    if (!band || !band.parentElement) return;
    const parent = band.parentElement;
    const children = Array.from(band.children).filter((ch) => !ch.hasAttribute('data-cms-ui'));
    children.forEach((child) => {
      parent.insertBefore(child, band);
    });
    band.remove();
  }

  function placeSectionAtScopeIndex(secEntry, targetIndex) {
    const siblings = getScopeSiblings(secEntry.scope);
    const currentIdx = siblings.findIndex((s) => s.uid === secEntry.uid);
    if (currentIdx === -1) return false;

    const clamped = Math.max(0, Math.min(siblings.length - 1, targetIndex));
    if (clamped === currentIdx) return false;

    const movingEl = secEntry.el;
    const targetEntry = siblings[clamped];
    const targetEl = targetEntry.el;

    if (secEntry.scope === 'main') {
      const main = getMainRoot();
      const movingBand = movingEl.parentElement?.classList.contains('photo-band')
        ? movingEl.parentElement
        : null;
      const targetBand = targetEl.parentElement?.classList.contains('photo-band')
        ? targetEl.parentElement
        : null;

      // Jeśli obie sekcje są w tym samym .photo-band, zamień je w środku zachowując tło
      if (movingBand && movingBand === targetBand) {
        if (clamped < currentIdx) {
          movingBand.insertBefore(movingEl, targetEl);
        } else {
          targetEl.after(movingEl);
        }
        return true;
      }

      // Jeśli sekcja docelowa jest wewnątrz .photo-band, rozpakuj .photo-band do main,
      // żeby każdą sekcję dało się swobodnie przestawić w dowolne miejsce strony
      if (targetBand) {
        unwrapPhotoBandIfNeeded(targetBand);
      }

      if (clamped < currentIdx) {
        const parent = targetEl.parentElement || main;
        parent.insertBefore(movingEl, targetEl);
      } else {
        targetEl.after(movingEl);
      }
      cleanupEmptyPhotoBand();
      return true;
    }

    // Podstrona: wszystkie sekcje w danym scope mają wspólnego rodzica
    const parent = targetEl.parentElement;
    if (!parent) return false;
    if (clamped < currentIdx) {
      parent.insertBefore(movingEl, targetEl);
    } else {
      targetEl.after(movingEl);
    }
    return true;
  }

  function placeItemAtIndex(entry, targetIndex) {
    const rep = repeatersByUid.get(entry.repeaterUid);
    if (!rep) return false;
    const items = rep.items;
    const currentIdx = items.indexOf(entry.el);
    if (currentIdx === -1) return false;

    const clamped = Math.max(0, Math.min(items.length - 1, targetIndex));
    if (clamped === currentIdx) return false;

    const targetEl = items[clamped];
    if (clamped < currentIdx) {
      rep.el.insertBefore(entry.el, targetEl);
    } else {
      targetEl.after(entry.el);
    }

    syncGalleryMeta(rep.el);
    return true;
  }

  function syncGalleryMeta(containerEl) {
    if (!containerEl) return;
    // Licznik realizacji / zdjęć w .realization-group
    const group = containerEl.closest('.realization-group');
    if (group) {
      const countEl = group.querySelector('.realization-count');
      const photos = group.querySelectorAll('.cms-carousel-track > .realization-photo, .realization-grid > .realization-photo');
      if (countEl) {
        countEl.textContent = pluralizePhotos(photos.length);
      }
    }
    // Indeksy i licznik w galerii produktu
    const gallery = containerEl.closest('[data-gallery]');
    if (gallery) {
      const thumbs = Array.from(gallery.querySelectorAll('.product-gallery-row > .product-gallery-thumb'));
      thumbs.forEach((thumb, i) => {
        thumb.setAttribute('data-index', String(i));
      });
      const totalSpan = gallery.querySelector('.gallery-counter span:last-child');
      if (totalSpan && thumbs.length > 0) {
        totalSpan.textContent = String(thumbs.length);
      }
    }
  }

  function moveNode(uid, direction) {
    const entry = nodesByUid.get(uid);
    if (!entry || !doc.contains(entry.el)) return false;

    const delta =
      direction === -1 || direction === 'up' || direction === 'prev' || direction === 'left'
        ? -1
        : direction === 1 || direction === 'down' || direction === 'next' || direction === 'right'
        ? 1
        : 0;
    if (!delta) return false;

    let moved = false;
    if (entry.kind === 'section') {
      const secEntry = sectionList.find((s) => s.uid === uid);
      if (!secEntry) return false;
      const siblings = getScopeSiblings(secEntry.scope);
      const currentIdx = siblings.findIndex((s) => s.uid === uid);
      moved = placeSectionAtScopeIndex(secEntry, currentIdx + delta);
    } else if (entry.kind === 'item') {
      const rep = repeatersByUid.get(entry.repeaterUid);
      if (!rep) return false;
      const currentIdx = rep.items.indexOf(entry.el);
      moved = placeItemAtIndex(entry, currentIdx + delta);
    }

    if (!moved) return false;
    syncStructureAndSelection('move');
    return true;
  }

  function moveNodeToIndex(uid, targetIndex) {
    const entry = nodesByUid.get(uid);
    if (!entry || !doc.contains(entry.el)) return false;

    let moved = false;
    if (entry.kind === 'section') {
      const secEntry = sectionList.find((s) => s.uid === uid);
      if (!secEntry) return false;
      moved = placeSectionAtScopeIndex(secEntry, Number(targetIndex));
    } else if (entry.kind === 'item') {
      moved = placeItemAtIndex(entry, Number(targetIndex));
    }

    if (!moved) return false;
    syncStructureAndSelection('move');
    return true;
  }

  function stripEditorArtifactsForClone(clone) {
    clone.querySelectorAll('[data-cms-ui]').forEach((n) => n.remove());
    const walk = [clone, ...clone.querySelectorAll('*')];
    walk.forEach((node) => {
      EDITOR_CLASSES.forEach((cls) => node.classList.remove(cls));
      EDITOR_ATTRS.forEach((attr) => node.removeAttribute(attr));
    });
    if (clone.id) {
      const base = clone.id.replace(/-\d+$/, '');
      let suffix = 2;
      while (doc.getElementById(`${base}-${suffix}`)) suffix += 1;
      clone.id = `${base}-${suffix}`;
    }
    return clone;
  }

  function duplicateNode(uid) {
    const entry = nodesByUid.get(uid);
    if (!entry || !doc.contains(entry.el)) return null;

    const clone = stripEditorArtifactsForClone(entry.el.cloneNode(true));
    entry.el.after(clone);

    if (entry.kind === 'item') {
      const rep = repeatersByUid.get(entry.repeaterUid);
      if (rep) syncGalleryMeta(rep.el);
    }

    scanStructure();
    const newUid = clone.getAttribute('data-cms-uid');
    if (newUid) {
      selectedUid = newUid;
      applySelectedVisual(nodesByUid.get(newUid));
    }
    callbacks.onStructureChange(getStructure());
    callbacks.onSelect(getSelectedDescriptor());
    callbacks.onMutate('duplicate');
    return newUid;
  }

  function deleteNode(uid) {
    const entry = nodesByUid.get(uid);
    if (!entry || !doc.contains(entry.el)) return false;

    const parentEl = entry.el.parentElement;
    const isItem = entry.kind === 'item';
    const repEl = isItem ? repeatersByUid.get(entry.repeaterUid)?.el : null;

    entry.el.remove();
    cleanupEmptyPhotoBand();
    if (repEl) syncGalleryMeta(repEl);
    else if (parentEl) syncGalleryMeta(parentEl);

    if (selectedUid === uid) {
      selectedUid = null;
    }

    syncStructureAndSelection('delete');
    return true;
  }

  function insertSection(templateIdOrHtml, afterSectionUid = null) {
    const main = getMainRoot();
    const isSubpage = main.classList.contains('page-main');
    const subpageContent = isSubpage ? main.querySelector('.subpage-content') : null;
    const inSubpage = Boolean(subpageContent);

    let html = '';
    if (typeof templateIdOrHtml === 'string') {
      const tpl = SECTION_TEMPLATES.find((t) => t.id === templateIdOrHtml);
      if (tpl) {
        html = tpl.createHtml(pagePath, inSubpage);
      } else if (templateIdOrHtml.trim().startsWith('<')) {
        html = templateIdOrHtml;
      }
    } else if (templateIdOrHtml && typeof templateIdOrHtml.createHtml === 'function') {
      html = templateIdOrHtml.createHtml(pagePath, inSubpage);
    }

    if (!html) return null;
    const safeHtml = sanitizeHtmlFragment(html);
    const newEl = parseHtmlFragment(doc, safeHtml, true);
    if (!newEl) return null;

    const afterEntry = afterSectionUid ? sectionList.find((s) => s.uid === afterSectionUid) : null;

    if (!isSubpage) {
      // Strona główna / uniwersalna strona klienta
      if (afterEntry && doc.contains(afterEntry.el)) {
        const band = afterEntry.el.parentElement?.classList.contains('photo-band')
          ? afterEntry.el.parentElement
          : null;
        if (band) {
          const bandSections = Array.from(band.children).filter((ch) => ch.tagName === 'SECTION');
          if (bandSections[bandSections.length - 1] === afterEntry.el) {
            band.after(newEl);
          } else {
            unwrapPhotoBandIfNeeded(band);
            afterEntry.el.after(newEl);
          }
        } else {
          afterEntry.el.after(newEl);
        }
      } else if (sectionList.length > 0 && doc.contains(sectionList[sectionList.length - 1].el)) {
        const lastEl = sectionList[sectionList.length - 1].el;
        const isLastContact =
          /^kontakt|contact$/i.test(lastEl.id || '') ||
          lastEl.classList.contains('home-contact') ||
          lastEl.classList.contains('contact-section');
        if (isLastContact) {
          // Nie dokładaj nowych sekcji poniżej sekcji Kontakt — wstaw je naturalnie przed Kontaktem
          const lastBand = lastEl.parentElement?.classList.contains('photo-band')
            ? lastEl.parentElement
            : null;
          if (lastBand) lastBand.before(newEl);
          else lastEl.before(newEl);
        } else {
          const lastBand = lastEl.parentElement?.classList.contains('photo-band')
            ? lastEl.parentElement
            : null;
          if (lastBand) lastBand.after(newEl);
          else lastEl.after(newEl);
        }
      } else {
        const directFooter = main === doc.body ? doc.body.querySelector(':scope > footer') : null;
        if (directFooter) main.insertBefore(newEl, directFooter);
        else main.appendChild(newEl);
      }
    } else if (subpageContent) {
      // Podstrona z .subpage-content
      if (afterEntry && afterEntry.scope === 'subpage-content' && doc.contains(afterEntry.el)) {
        afterEntry.el.after(newEl);
      } else if (afterEntry && afterEntry.scope === 'subpage-top') {
        subpageContent.prepend(newEl);
      } else {
        subpageContent.appendChild(newEl);
      }
    } else {
      // Podstrona bez .subpage-grid (wstaw w .wrap)
      const wrap = main.querySelector(':scope > .wrap') || main;
      if (afterEntry && doc.contains(afterEntry.el) && afterEntry.el.parentElement === wrap) {
        afterEntry.el.after(newEl);
      } else {
        wrap.appendChild(newEl);
      }
    }

    refreshPendingImages(pendingImages);
    scanStructure();
    callbacks.onStructureChange(getStructure());
    const newUid = newEl.getAttribute('data-cms-uid');
    if (newUid) {
      selectByUid(newUid, { scroll: true });
    }
    callbacks.onMutate('insert-section');
    return newUid;
  }

  const FORBIDDEN_CUSTOM_TAGS = new Set([
    'HTML', 'HEAD', 'BODY', 'MAIN', 'HEADER', 'FOOTER',
    'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'APPLET', 'LINK', 'META', 'BASE', 'FORM',
  ]);

  function stripEditorArtifactsOnly(nodeRoot) {
    nodeRoot.querySelectorAll('[data-cms-ui]').forEach((n) => n.remove());
    const walk = [nodeRoot, ...nodeRoot.querySelectorAll('*')];
    walk.forEach((node) => {
      EDITOR_CLASSES.forEach((cls) => node.classList.remove(cls));
      if (node.hasAttribute('class') && !node.getAttribute('class').trim()) {
        node.removeAttribute('class');
      }
      EDITOR_ATTRS.forEach((attr) => node.removeAttribute(attr));
    });
    return nodeRoot;
  }

  function getElementCleanHtml(uid) {
    const entry = nodesByUid.get(uid) || repeatersByUid.get(uid);
    if (!entry || !entry.el || !doc.contains(entry.el)) return null;
    const clean = stripEditorArtifactsOnly(entry.el.cloneNode(true));
    return {
      uid: entry.uid || entry.repeaterUid || uid,
      kind: entry.kind || 'repeater',
      label: entry.label || entry.spec?.label || getSectionLabel(clean),
      tagName: clean.tagName.toLowerCase(),
      id: clean.id || '',
      className: typeof clean.className === 'string' ? clean.className.trim() : '',
      html: clean.outerHTML,
    };
  }

  function updateElementHtml(uid, rawHtml) {
    if (!uid || typeof rawHtml !== 'string' || !rawHtml.trim()) return null;
    const entry = nodesByUid.get(uid) || repeatersByUid.get(uid);
    if (!entry || !entry.el || !doc.contains(entry.el)) return null;

    const currentTag = entry.el.tagName?.toUpperCase();
    if (['HTML', 'HEAD', 'BODY', 'MAIN', 'HEADER', 'FOOTER'].includes(currentTag)) {
      return null;
    }

    const safeHtml = sanitizeHtmlFragment(rawHtml);
    const parsed = parseHtmlFragment(doc, safeHtml, true);
    if (!parsed || parsed.nodeType !== 1) return null;
    if (FORBIDDEN_CUSTOM_TAGS.has(parsed.tagName.toUpperCase())) return null;

    const cleanEl = stripEditorArtifactsOnly(parsed);
    flushPendingTextMutation();
    entry.el.replaceWith(cleanEl);

    refreshPendingImages(pendingImages);
    scanStructure();
    callbacks.onStructureChange(getStructure());

    const resolvedEl =
      cleanEl.getAttribute('data-cms-uid')
        ? cleanEl
        : cleanEl.querySelector?.('[data-cms-uid]') ||
          cleanEl.closest?.('[data-cms-uid]') ||
          cleanEl;
    const newUid = resolvedEl?.getAttribute?.('data-cms-uid') || null;
    if (newUid) {
      selectByUid(newUid, { scroll: true });
    }
    callbacks.onMutate('update-html');
    return {
      uid: newUid,
      tagName: cleanEl.tagName.toLowerCase(),
      className: typeof cleanEl.className === 'string' ? cleanEl.className.trim() : '',
    };
  }

  function insertCustomSectionHtml(rawHtml, { afterUid = null, position = 'after' } = {}) {
    if (typeof rawHtml !== 'string' || !rawHtml.trim()) return null;
    const safeHtml = sanitizeHtmlFragment(rawHtml);
    const parsed = parseHtmlFragment(doc, safeHtml, true);
    if (!parsed || parsed.nodeType !== 1) return null;
    if (FORBIDDEN_CUSTOM_TAGS.has(parsed.tagName.toUpperCase())) return null;

    const cleanEl = stripEditorArtifactsOnly(parsed);
    if (cleanEl.id && doc.getElementById(cleanEl.id)) {
      const base = cleanEl.id.replace(/-\d+$/, '');
      let suffix = 2;
      while (doc.getElementById(`${base}-${suffix}`)) suffix += 1;
      cleanEl.id = `${base}-${suffix}`;
    }

    if (position === 'before' && afterUid) {
      const refEntry = nodesByUid.get(afterUid);
      if (refEntry?.el && doc.contains(refEntry.el) && refEntry.el.parentElement) {
        flushPendingTextMutation();
        refEntry.el.before(cleanEl);
        refreshPendingImages(pendingImages);
        scanStructure();
        callbacks.onStructureChange(getStructure());
        const newUid =
          cleanEl.getAttribute('data-cms-uid') ||
          cleanEl.querySelector?.('[data-cms-uid]')?.getAttribute('data-cms-uid') ||
          null;
        if (newUid) selectByUid(newUid, { scroll: true });
        callbacks.onMutate('insert-custom-section');
        return newUid;
      }
    }

    return insertSection(cleanEl.outerHTML, afterUid);
  }

  function insertItem(repeaterUid, itemType = null, afterItemUid = null) {
    let rep = repeatersByUid.get(repeaterUid);

    // Jeśli przekazano UID sekcji, znajdź jej pierwszy pasujący repeater
    if (!rep) {
      for (const candidate of repeatersByUid.values()) {
        if (candidate.parentSectionUid === repeaterUid && (!itemType || candidate.spec.itemType === itemType)) {
          rep = candidate;
          break;
        }
      }
      // Obsługa .service-card -> .subpage-content
      if (!rep) {
        const secEntry = nodesByUid.get(repeaterUid);
        if (secEntry?.el?.matches('.service-card')) {
          const parentRepUid = secEntry.el.parentElement?.getAttribute('data-cms-repeater-uid');
          if (parentRepUid) rep = repeatersByUid.get(parentRepUid);
        }
      }
    }

    if (!rep || !doc.contains(rep.el)) return null;

    // Dla znanego kontenera (repeatera) ZAWSZE zachowuj jego własny typ kafelka,
    // aby nie wstawić np. kafelka produktu do siatki kategorii (chyba że przekazano czysty HTML).
    const isRawHtmlArg = typeof itemType === 'string' && itemType.trim().startsWith('<');
    const resolvedType = isRawHtmlArg ? itemType : (rep.spec?.itemType || itemType);
    let newEl = null;

    const tpl = ITEM_TEMPLATES[resolvedType];
    if (tpl && typeof tpl.createHtml === 'function') {
      const safeHtml = sanitizeHtmlFragment(tpl.createHtml(pagePath));
      newEl = parseHtmlFragment(doc, safeHtml, true);
    } else if (typeof itemType === 'string' && itemType.trim().startsWith('<')) {
      const safeHtml = sanitizeHtmlFragment(itemType);
      newEl = parseHtmlFragment(doc, safeHtml, true);
    } else if (rep.items.length > 0) {
      // Fallback np. dla montage-step-card lub generycznego repeatera: sklonuj ostatni element
      const cloned = stripEditorArtifactsForClone(rep.items[rep.items.length - 1].cloneNode(true));
      const safeHtml = sanitizeHtmlFragment(cloned.outerHTML);
      newEl = parseHtmlFragment(doc, safeHtml, true);
    }

    if (!newEl) return null;

    const afterEntry = afterItemUid ? nodesByUid.get(afterItemUid) : null;
    if (afterEntry && afterEntry.el.parentElement === rep.el) {
      afterEntry.el.after(newEl);
    } else if (rep.spec.insertBeforeSelector) {
      const anchor = rep.el.querySelector(rep.spec.insertBeforeSelector);
      if (anchor) rep.el.insertBefore(newEl, anchor);
      else rep.el.appendChild(newEl);
    } else if (resolvedType === 'subpage-service' && rep.items.length > 0) {
      rep.items[rep.items.length - 1].after(newEl);
    } else if (rep.items.length > 0) {
      rep.items[rep.items.length - 1].after(newEl);
    } else {
      rep.el.appendChild(newEl);
    }

    syncGalleryMeta(rep.el);
    refreshPendingImages(pendingImages);
    scanStructure();
    callbacks.onStructureChange(getStructure());

    const newUid = newEl.getAttribute('data-cms-uid');
    if (newUid) {
      selectByUid(newUid, { scroll: true });
    }
    callbacks.onMutate('insert-item');
    return newUid;
  }

  function insertBlockInside(targetUid, blockType = 'paragraph') {
    const entry = targetUid ? nodesByUid.get(targetUid) : null;
    const hostBase = entry?.el || doc.querySelector('.subpage-content') || getMainRoot();
    if (!hostBase || !doc.contains(hostBase)) return null;

    const container =
      hostBase.querySelector('.source-content-body') ||
      hostBase.querySelector('.mobile-details-body') ||
      hostBase.querySelector('.article-copy') ||
      (hostBase.classList.contains('service-card') ? hostBase : null) ||
      hostBase;

    let html = '';
    if (blockType === 'paragraph') {
      html = ITEM_TEMPLATES.paragraph?.createHtml(pagePath) || '<p>Nowy akapit tekstu – kliknij, aby edytować.</p>';
    } else if (blockType === 'heading') {
      html = '<h3>Nowy podtytuł</h3>';
    } else if (blockType === 'list') {
      html = '<ul class="source-list"><li>Pierwszy punkt listy</li><li>Drugi punkt listy</li></ul>';
    } else if (ITEM_TEMPLATES[blockType]) {
      html = ITEM_TEMPLATES[blockType].createHtml(pagePath);
    } else if (typeof blockType === 'string' && blockType.trim().startsWith('<')) {
      html = blockType;
    } else {
      html = '<p>Nowy blok treści.</p>';
    }

    const safeHtml = sanitizeHtmlFragment(html);
    const newEl = parseHtmlFragment(doc, safeHtml, true);
    if (!newEl) return null;

    if (blockType === 'list-item') {
      const existingList = container.querySelector('ul.source-list');
      if (existingList) {
        existingList.appendChild(newEl);
      } else {
        const ul = createEl(doc, 'ul', { class: 'source-list' });
        ul.appendChild(newEl);
        container.appendChild(ul);
      }
    } else {
      container.appendChild(newEl);
    }

    scanStructure();
    const newUid = newEl.getAttribute('data-cms-uid') || nextUid('el');
    if (!newEl.hasAttribute('data-cms-uid')) {
      newEl.setAttribute('data-cms-uid', newUid);
    }
    callbacks.onStructureChange(getStructure());
    selectByUid(newUid, { scroll: true });
    callbacks.onMutate('insert-block');
    return newUid;
  }

  function getAvailableButtonStyles() {
    return extractButtonStylesFromDoc(doc, pagePath);
  }

  function insertStyledButton(
    targetUid,
    { styleId = 'tc-tel', label = 'Zobacz więcej', href = 'kontakt/index.html', templateHtml = '', target = '' } = {}
  ) {
    const entry = targetUid ? nodesByUid.get(targetUid) : null;
    const hostBase = entry?.el || doc.querySelector('.subpage-content') || getMainRoot();
    if (!hostBase || !doc.contains(hostBase)) return null;

    let rawBtnHtml = String(templateHtml || '').trim();
    if (!rawBtnHtml) {
      const localMatch = getAvailableButtonStyles().find((b) => b.styleId === styleId);
      if (localMatch?.templateHtml) {
        rawBtnHtml = localMatch.templateHtml;
      }
    }
    if (!rawBtnHtml) {
      const safeClass = String(styleId || 'tc-tel').replace(/[^a-zA-Z0-9_-]/g, '') || 'tc-tel';
      rawBtnHtml = `<a class="${safeClass}" href="#">Zobacz więcej</a>`;
    }

    const safeHtml = sanitizeHtmlFragment(rawBtnHtml);
    const parsed = parseHtmlFragment(doc, safeHtml, true);
    if (!parsed) return null;

    // Zawsze wstawiaj jako bezpieczny link <a> z oryginalnymi klasami stylu strony
    let btnEl = parsed;
    if (btnEl.tagName !== 'A') {
      const a = doc.createElement('a');
      if (btnEl.className) a.className = btnEl.className;
      a.innerHTML = btnEl.innerHTML;
      btnEl = a;
    }

    const rawHref = String(href || '').trim();
    const isDirectScheme = /^(?:https?:|mailto:|tel:|#)/i.test(rawHref);
    const resolvedHref = rawHref
      ? isDirectScheme
        ? rawHref
        : toRelativeUrl(rawHref, pagePath)
      : '#';
    const safeHref = sanitizeUrl(resolvedHref);
    if (!safeHref || isDangerousHrefScheme(safeHref)) return null;

    // Jeśli klonowany przycisk miał ikonę e-mail/telefon/mapy, usuń ikonę gdy docelowy link jest innego typu
    const isTel = /^tel:/i.test(safeHref);
    const isMail = /^mailto:/i.test(safeHref);
    const isMaps = /google\.com\/maps/i.test(safeHref);
    if (!isTel && !isMail && !isMaps) {
      btnEl.querySelectorAll('svg').forEach((s) => s.remove());
      btnEl.querySelectorAll('i').forEach((ic) => {
        if (!btnEl.classList.contains('hero-btn') && !btnEl.classList.contains('pill')) ic.remove();
      });
    }

    btnEl.setAttribute('href', safeHref);
    if (target === '_blank' || /^https?:\/\//i.test(safeHref)) {
      btnEl.setAttribute('target', '_blank');
      btnEl.setAttribute('rel', 'noopener noreferrer');
    } else {
      btnEl.removeAttribute('target');
      btnEl.removeAttribute('rel');
    }
    btnEl.removeAttribute('id');
    setPreservedText(btnEl, sanitizeText(String(label || 'Zobacz więcej').trim() || 'Zobacz więcej'));

    // Umieść w istniejącym rzędzie przycisków sekcji lub utwórz spójny .cta-actions
    const existingActionsRow = hostBase.querySelector(
      '.cta-actions, .hero-cta, .trust-compact-actions, .trust-actions, .location-card__links'
    );
    if (existingActionsRow && !existingActionsRow.closest('[data-cms-ui]')) {
      existingActionsRow.appendChild(btnEl);
    } else {
      const targetBody =
        hostBase.querySelector('.cta-banner-dark') ||
        hostBase.querySelector('.source-content-body') ||
        hostBase.querySelector('.mobile-details-body') ||
        hostBase.querySelector('.article-copy') ||
        hostBase.querySelector(':scope > .wrap') ||
        hostBase;
      const row = createEl(doc, 'div', { class: 'cta-actions' });
      row.appendChild(btnEl);
      targetBody.appendChild(row);
    }

    scanStructure();
    callbacks.onStructureChange(getStructure());
    const ownerUid = entry?.uid || hostBase.getAttribute('data-cms-uid');
    if (ownerUid) {
      selectByUid(ownerUid, { scroll: true });
    }
    callbacks.onMutate('insert-button');
    return {
      uid: ownerUid,
      styleId,
      label: getPreservedText(btnEl),
      href: safeHref,
    };
  }

  function rewriteClonedUrls(rootEl, sourcePagePath) {
    if (!rootEl || !sourcePagePath || sourcePagePath === pagePath) return;
    const rewriteAttr = (node, attr) => {
      const val = node.getAttribute(attr);
      if (!val) return;
      const trimmed = val.trim();
      if (!trimmed || /^(?:https?:|mailto:|tel:|#|data:|blob:)/i.test(trimmed)) return;
      const rootPath = toRootPath(trimmed, sourcePagePath);
      if (rootPath) {
        node.setAttribute(attr, toRelativeUrl(rootPath, pagePath));
      }
    };
    const all = [rootEl, ...rootEl.querySelectorAll('*')];
    for (const el of all) {
      rewriteAttr(el, 'src');
      rewriteAttr(el, 'href');
      rewriteAttr(el, 'data-lightbox-src');
      rewriteAttr(el, 'data-src');
    }
  }

  function insertClonedSectionHtml(rawSectionHtml, sourcePagePath = 'index.html', afterSectionUid = null) {
    if (!rawSectionHtml || typeof rawSectionHtml !== 'string') return null;
    const safeHtml = sanitizeHtmlFragment(rawSectionHtml);
    const parsed = parseHtmlFragment(doc, safeHtml, true);
    if (!parsed) return null;

    const clone = stripEditorArtifactsForClone(parsed);
    rewriteClonedUrls(clone, sourcePagePath);

    // Jeśli klonowana sekcja ze strony głównej jest wstawiana do .subpage-content i ma .wrap, zachowaj czystość
    const isSubpage = Boolean(getMainRoot()?.classList?.contains('page-main') && doc.querySelector('.subpage-content'));
    if (isSubpage && clone.tagName === 'SECTION') {
      const directWrap = clone.querySelector(':scope > .wrap');
      if (directWrap && clone.children.length === 1) {
        while (directWrap.firstChild) {
          clone.insertBefore(directWrap.firstChild, directWrap);
        }
        directWrap.remove();
      }
    }

    return insertSection(clone.outerHTML, afterSectionUid);
  }

  function applyLiveGlobals(globals = {}) {
    if (!globals || typeof globals !== 'object') return;

    const phoneDisplay = String(globals.phoneDisplay ?? globals.phone ?? '').trim();
    let phoneHref = String(globals.phoneHref ?? '').trim();
    if (!phoneHref && phoneDisplay) {
      const digits = phoneDisplay.replace(/[^\d+]/g, '');
      phoneHref = digits.startsWith('+')
        ? `tel:${digits}`
        : digits.length === 9
        ? `tel:+48${digits}`
        : digits
        ? `tel:${digits}`
        : '';
    }
    const email = String(globals.email ?? globals.mail ?? '').trim();
    const facebookUrl = String(globals.facebookUrl ?? globals.facebook ?? '').trim();
    const facebookLabel =
      String(globals.facebookLabel ?? '').trim() ||
      (facebookUrl ? facebookUrl.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '') : '');
    const footerText = String(globals.footerText ?? globals.footerCopy ?? '').trim();

    const safePhoneHref = phoneHref ? sanitizeUrl(phoneHref) : '';
    const safeFacebookUrl = facebookUrl ? sanitizeUrl(facebookUrl) : '';

    if (phoneDisplay || safePhoneHref) {
      // Header, menu, sidebar, hero, CTA, kontakt, bubbles, footer
      doc.querySelectorAll('a[href^="tel:"]').forEach((a) => {
        // Nie nadpisuj numerów stacjonarnych drugiego salonu (Radłów) w kartach salonów
        if (a.closest('.location-card__links') && !a.textContent.includes(phoneDisplay)) return;
        if (safePhoneHref) a.setAttribute('href', safePhoneHref);
        if (!phoneDisplay) return;

        if (a.classList.contains('contact-bubble--tel')) {
          const txt = a.querySelector('.contact-bubble__text');
          if (txt) txt.textContent = phoneDisplay;
          a.setAttribute('aria-label', `Zadzwoń: ${phoneDisplay}`);
          return;
        }
        const curr = getPreservedText(a);
        if (/^zadzwoń:\s*/i.test(curr)) {
          setPreservedText(a, `Zadzwoń: ${phoneDisplay}`);
        } else if (/^zadzwoń\s+teraz$/i.test(curr)) {
          // Zostaw "Zadzwoń teraz", zaktualizowano tylko href
        } else {
          setPreservedText(a, phoneDisplay);
        }
      });
    }

    if (email) {
      const safeMailHref = sanitizeUrl(`mailto:${email}`);
      doc.querySelectorAll('a[href^="mailto:"]').forEach((a) => {
        if (safeMailHref) a.setAttribute('href', safeMailHref);
        if (a.classList.contains('contact-bubble--mail')) {
          const txt = a.querySelector('.contact-bubble__text');
          if (txt) txt.textContent = email;
          a.setAttribute('aria-label', `E-mail: ${email}`);
        } else {
          setPreservedText(a, email);
        }
      });
    }

    if (safeFacebookUrl) {
      doc.querySelectorAll('a[href*="facebook.com"]').forEach((a) => {
        a.setAttribute('href', safeFacebookUrl);
        if (a.classList.contains('contact-bubble--fb') && facebookLabel) {
          const txt = a.querySelector('.contact-bubble__text');
          if (txt) txt.textContent = facebookLabel;
          a.setAttribute('aria-label', `Facebook: ${facebookLabel} (otwiera się w nowej karcie)`);
        }
      });
    }

    if (footerText) {
      const footerCopy = doc.querySelector('footer .footer-copy');
      if (footerCopy) {
        const telLink = footerCopy.querySelector('a[href^="tel:"]');
        const cleanPrefix = footerText.replace(/\s*·\s*$/, '');
        if (telLink) {
          for (const node of Array.from(footerCopy.childNodes)) {
            if (node !== telLink) node.remove();
          }
          footerCopy.insertBefore(doc.createTextNode(`${cleanPrefix} · `), telLink);
        } else {
          footerCopy.textContent = cleanPrefix;
        }
      }
    }

    callbacks.onSelect(getSelectedDescriptor());
    callbacks.onMutate('globals');
  }

  function getMeta() {
    const descEl = doc.head.querySelector('meta[name="description"]');
    return {
      title: doc.title || '',
      description: descEl ? descEl.getAttribute('content') || '' : '',
    };
  }

  function setMeta({ title, description } = {}) {
    if (title !== undefined) {
      const cleanTitle = sanitizeText(String(title));
      doc.title = cleanTitle;
      const ogTitle = doc.head.querySelector('meta[property="og:title"]');
      if (ogTitle) ogTitle.setAttribute('content', cleanTitle);
    }
    if (description !== undefined) {
      const cleanDesc = sanitizeText(String(description));
      let descEl = doc.head.querySelector('meta[name="description"]');
      if (!descEl) {
        descEl = createEl(doc, 'meta', { name: 'description', content: '' });
        doc.head.appendChild(descEl);
      }
      descEl.setAttribute('content', cleanDesc);
      const ogDesc = doc.head.querySelector('meta[property="og:description"]');
      if (ogDesc) ogDesc.setAttribute('content', cleanDesc);
    }
    callbacks.onMutate('meta');
  }

  function refreshPendingImages(newPendingImages = {}) {
    pendingImages = { ...(newPendingImages || {}) };
    doc.querySelectorAll('img').forEach((img) => {
      if (img.closest('[data-cms-ui]')) return;
      if (img.getAttribute('loading') === 'lazy') {
        img.setAttribute('data-cms-orig-loading', 'lazy');
        img.setAttribute('loading', 'eager');
      }
      const repoAttr = img.getAttribute('data-cms-repo-src');
      const currentSrc = img.getAttribute('src') || '';
      const repoPath = repoAttr || toRootPath(currentSrc, pagePath);
      if (!repoPath) return;

      const norm = normalizeRepoPath(repoPath);
      if (pendingImages[norm]) {
        img.setAttribute('data-cms-repo-src', norm);
        img.setAttribute('src', pendingImages[norm]);
        updateFrameImageFor(img);
      } else if (repoAttr) {
        img.setAttribute('src', toRelativeUrl(norm, pagePath));
        img.removeAttribute('data-cms-repo-src');
        updateFrameImageFor(img);
      }
    });
  }

  // =========================================================================
  // Krystalicznie czysta serializacja HTML
  // =========================================================================
  function serializeCleanHtml() {
    const clone = doc.documentElement.cloneNode(true);

    // 1. Usuń wszystkie nakładki edytora, runtime toasty, niebezpieczne tagi (iframe/object/embed) i przestarzałe skrypty
    clone
      .querySelectorAll('[data-cms-ui], .copy-toast, iframe, object, embed')
      .forEach((el) => el.remove());
    clone.querySelectorAll('script[src]').forEach((scr) => {
      const src = scr.getAttribute('src') || '';
      if (/home-page\.js(\?|#|$)/i.test(src)) {
        scr.remove();
      }
    });

    // 2. Zbuduj odwrotną mapę pendingImages jako dodatkową siatkę bezpieczeństwa
    const reversePending = new Map();
    for (const [repoKey, dataUrl] of Object.entries(pendingImages)) {
      if (dataUrl) reversePending.set(dataUrl, normalizeRepoPath(repoKey));
    }

    // 3. Wyczyść klasy i atrybuty edytora (ZACHOWAJ .cms-hidden, .cms-tone-*, .cms-align-*, .cms-space-*!)
    const allEls = [clone, ...clone.querySelectorAll('*')];
    allEls.forEach((el) => {
      EDITOR_CLASSES.forEach((cls) => el.classList.remove(cls));
      if (el.hasAttribute('class') && !el.getAttribute('class').trim()) {
        el.removeAttribute('class');
      }

      EDITOR_ATTRS.forEach((attr) => el.removeAttribute(attr));

      // Usuń wszelkie ewentualne atrybuty zdarzeń inline on* oraz niebezpieczne schematy URL
      for (const attr of Array.from(el.attributes)) {
        const attrName = attr.name.toLowerCase();
        if (attrName.startsWith('on')) {
          el.removeAttribute(attr.name);
        } else if (
          (attrName === 'href' || attrName === 'src' || attrName === 'action' || attrName === 'formaction') &&
          attr.value
        ) {
          if (isDangerousHrefScheme(attr.value) && !(attrName === 'src' && isSafePreviewImageSrc(attr.value))) {
            el.removeAttribute(attr.name);
          }
        }
      }

      // Tymczasowy --frame-image
      if (el.matches(FRAME_IMAGE_SELECTOR) && el.hasAttribute('style')) {
        el.style.removeProperty('--frame-image');
        if (!el.getAttribute('style').trim()) el.removeAttribute('style');
      }

      // Tymczasowe wymiary galerii ustawione przez site.js
      if (el.classList.contains('product-gallery-stage') && el.hasAttribute('style')) {
        el.style.removeProperty('width');
        el.style.removeProperty('margin-inline');
        if (!el.getAttribute('style').trim()) el.removeAttribute('style');
      }
      if (el.hasAttribute('data-gallery-trigger') && el.hasAttribute('style')) {
        el.style.removeProperty('width');
        el.style.removeProperty('height');
        el.style.removeProperty('--gallery-ratio');
        if (!el.getAttribute('style').trim()) el.removeAttribute('style');
      }

      // Zamień data:/blob: na prawdziwe ścieżki względne repo i przywróć loading="lazy"
      if (el.tagName === 'IMG') {
        const origLoading = el.getAttribute('data-cms-orig-loading');
        if (origLoading) {
          el.setAttribute('loading', origLoading);
          el.removeAttribute('data-cms-orig-loading');
        }
        const repoSrc = el.getAttribute('data-cms-repo-src');
        if (repoSrc) {
          el.setAttribute('src', toRelativeUrl(normalizeRepoPath(repoSrc), pagePath));
          el.removeAttribute('data-cms-repo-src');
        } else {
          const currSrc = el.getAttribute('src') || '';
          if ((currSrc.startsWith('data:') || currSrc.startsWith('blob:')) && reversePending.has(currSrc)) {
            el.setAttribute('src', toRelativeUrl(reversePending.get(currSrc), pagePath));
          }
        }
      } else if (el.hasAttribute('data-cms-repo-src')) {
        el.removeAttribute('data-cms-repo-src');
      }
    });

    return `<!doctype html>\n${clone.outerHTML}\n`;
  }

  // =========================================================================
  // Snapshoty Undo / Redo
  // =========================================================================
  function captureSnapshot() {
    return {
      html: serializeCleanHtml(),
      selectedUid,
      meta: getMeta(),
    };
  }

  function restoreSnapshot(snapshot) {
    if (!snapshot) return false;
    const html = typeof snapshot === 'string' ? snapshot : snapshot.html;
    if (!html) return false;

    const parser = new (doc.defaultView?.DOMParser || DOMParser)();
    const parsed = parser.parseFromString(html, 'text/html');

    // Przywróć metadane
    if (parsed.title) doc.title = parsed.title;
    const parsedDesc = parsed.head?.querySelector('meta[name="description"]')?.getAttribute('content');
    if (parsedDesc !== undefined && parsedDesc !== null) {
      let descEl = doc.head.querySelector('meta[name="description"]');
      if (!descEl) {
        descEl = createEl(doc, 'meta', { name: 'description', content: parsedDesc });
        doc.head.appendChild(descEl);
      } else {
        descEl.setAttribute('content', parsedDesc);
      }
    }

    // Zastąp zawartość kluczowych kontenerów bez przeładowywania iframe'a
    const swapElement = (selector) => {
      const cur = doc.querySelector(selector);
      const next = parsed.querySelector(selector);
      if (cur && next) {
        cur.replaceWith(doc.importNode(next, true));
      }
    };

    if (doc.querySelector('main#main')) {
      swapElement('header.bar');
      swapElement('main#main');
      swapElement('footer');
      swapElement('nav.contact-bubbles');
    } else if (doc.querySelector('main')) {
      swapElement('header.bar');
      if (!doc.querySelector('header.bar')) swapElement('header');
      swapElement('main');
      swapElement('footer');
      swapElement('nav.contact-bubbles');
    } else if (parsed.body) {
      // Uniwersalna strona klienta bez <main>: przywróć strukturę body bez ponownego uruchamiania <script>
      const existingScripts = Array.from(doc.body.querySelectorAll(':scope > script'));
      const nextNodes = Array.from(parsed.body.childNodes)
        .filter((n) => !(n.nodeType === 1 && n.tagName === 'SCRIPT'))
        .map((n) => doc.importNode(n, true));
      doc.body.replaceChildren(...nextNodes, ...existingScripts);
      doc.body.classList.add('wolbud-preview');
    }

    // Upewnij się, że w trybie srcdoc znacznik <base> pozostaje obecny, aby wszystkie względne obrazy i zasoby ładowały się poprawnie
    if (doc.location?.href === 'about:srcdoc' && !doc.head.querySelector('base[data-cms-ui="base"]')) {
      const baseHref = new URL('../' + pagePath, window.location.href).href;
      const baseEl = createEl(doc, 'base', { href: baseHref, 'data-cms-ui': 'base' });
      doc.head.prepend(baseEl);
    }

    refreshPendingImages(pendingImages);
    doc.querySelectorAll('img').forEach((img) => {
      if (img.closest('[data-cms-ui]')) return;
      if (img.getAttribute('loading') === 'lazy') {
        img.loading = 'eager';
      }
      if (!img.complete) {
        img.addEventListener('load', () => updateFrameImageFor(img), { once: true });
      }
    });
    selectedUid = typeof snapshot === 'object' ? snapshot.selectedUid || null : null;
    scanStructure();
    callbacks.onStructureChange(getStructure());
    callbacks.onSelect(getSelectedDescriptor());
    return true;
  }

  // =========================================================================
  // Drag & Drop (sekcje i kafelki)
  // =========================================================================
  function removeDropSlots() {
    doc.querySelectorAll('[data-cms-ui="drop-slot"]').forEach((s) => s.remove());
  }

  function renderSectionDropSlots(draggedSecEntry) {
    removeDropSlots();
    const siblings = getScopeSiblings(draggedSecEntry.scope);
    if (siblings.length < 2) return;

    const makeSlot = (dropIndex) =>
      createEl(
        doc,
        'div',
        {
          'data-cms-ui': 'drop-slot',
          'data-drop-index': String(dropIndex),
          contenteditable: 'false',
        },
        'Upuść sekcję tutaj'
      );

    siblings.forEach((sib, idx) => {
      const slot = makeSlot(idx);
      const parent = sib.el.parentElement;
      if (parent?.classList.contains('photo-band') && idx > 0 && siblings[idx - 1].el.parentElement !== parent) {
        parent.before(slot);
      } else {
        sib.el.before(slot);
      }
    });

    const last = siblings[siblings.length - 1];
    const endSlot = makeSlot(siblings.length);
    if (last.el.parentElement?.classList.contains('photo-band')) {
      last.el.parentElement.after(endSlot);
    } else {
      last.el.after(endSlot);
    }
  }

  function clearDragVisuals() {
    doc.body.classList.remove('cms-is-dragging-section');
    doc.querySelectorAll('.cms-dragging, .cms-drag-over, .cms-drag-over-before, .cms-drag-over-after').forEach((el) => {
      el.classList.remove('cms-dragging', 'cms-drag-over', 'cms-drag-over-before', 'cms-drag-over-after');
    });
    removeDropSlots();
    dragState = null;
  }

  // =========================================================================
  // Obsługa zdarzeń DOM w podglądzie
  // =========================================================================
  function flushPendingTextMutation() {
    if (textMutateTimer) {
      clearTimeout(textMutateTimer);
      textMutateTimer = 0;
    }
    if (textDirty) {
      textDirty = false;
      callbacks.onMutate('text');
    }
  }

  function scheduleTextMutation() {
    textDirty = true;
    if (textMutateTimer) clearTimeout(textMutateTimer);
    textMutateTimer = setTimeout(() => {
      textMutateTimer = 0;
      if (!destroyed && textDirty) {
        textDirty = false;
        callbacks.onMutate('text');
      }
    }, 380);
  }

  function handleUiAction(btn) {
    const action = btn.getAttribute('data-cms-action');
    const targetUid = btn.getAttribute('data-cms-target');

    if (action === 'move-up') {
      moveNode(targetUid, -1);
    } else if (action === 'move-down') {
      moveNode(targetUid, 1);
    } else if (action === 'duplicate') {
      duplicateNode(targetUid);
    } else if (action === 'toggle-hide') {
      toggleHidden(targetUid);
    } else if (action === 'delete') {
      deleteNode(targetUid);
    } else if (action === 'add-section-below') {
      callbacks.onRequestAddSection(targetUid);
    } else if (action === 'add-item') {
      const repUid = btn.getAttribute('data-cms-repeater');
      const itemType = btn.getAttribute('data-cms-item-type');
      callbacks.onRequestAddItem(repUid, itemType);
    } else if (action === 'send-to-ai') {
      const entry = nodesByUid.get(targetUid);
      const payload = buildTargetPayload(entry);
      if (payload) {
        selectByUid(targetUid);
        callbacks.onSendToAi([payload]);
      }
    }
  }

  function setBrowseMode(enabled) {
    browseMode = Boolean(enabled);
    if (browseMode) {
      freeLayoutMode = false;
      setAiPickMode(false);
    }
    doc.body?.classList.toggle('cms-browse-mode', browseMode);
    doc.body?.classList.toggle('cms-free-mode', freeLayoutMode);
    if (browseMode) {
      clearSelection();
      if (hoveredSectionEl) hoveredSectionEl.classList.remove('cms-hovered');
      if (hoveredItemEl) hoveredItemEl.classList.remove('cms-hovered');
      hoveredSectionEl = null;
      hoveredItemEl = null;
      doc.querySelectorAll('.cms-editable-text').forEach((el) => {
        el.removeAttribute('contenteditable');
      });
    } else if (!freeLayoutMode) {
      doc.querySelectorAll('.cms-editable-text').forEach((el) => {
        if (!el.closest('[data-cms-ui]')) {
          el.setAttribute('contenteditable', 'plaintext-only');
        }
      });
    }
    syncFreeHandles();
  }

  function getBrowseMode() {
    return browseMode;
  }

  function setFreeLayoutMode(enabled) {
    freeLayoutMode = Boolean(enabled);
    if (freeLayoutMode) {
      browseMode = false;
      setAiPickMode(false);
    }
    doc.body?.classList.toggle('cms-browse-mode', browseMode);
    doc.body?.classList.toggle('cms-free-mode', freeLayoutMode);
    doc.querySelectorAll('.cms-editable-text').forEach((el) => {
      if (freeLayoutMode || browseMode) {
        el.removeAttribute('contenteditable');
      } else if (!el.closest('[data-cms-ui]')) {
        el.setAttribute('contenteditable', 'plaintext-only');
      }
    });
    syncFreeHandles();
  }

  function getFreeLayoutMode() {
    return freeLayoutMode;
  }

  function clearAiPickVisuals() {
    if (aiPickHoverEl) {
      aiPickHoverEl.classList.remove('cms-ai-pick-hover');
      aiPickHoverEl = null;
    }
    doc.querySelectorAll('[data-cms-ui="ai-marquee"]').forEach((n) => n.remove());
    marqueeState = null;
  }

  function setAiPickMode(enabled) {
    aiPickMode = Boolean(enabled);
    doc.body?.classList.toggle('cms-ai-pick-mode', aiPickMode);
    doc.querySelectorAll('[data-cms-ui="ai-pick-banner"]').forEach((n) => n.remove());
    if (!aiPickMode) {
      clearAiPickVisuals();
    } else {
      removeFreeHandles();
      const banner = createEl(
        doc,
        'div',
        { 'data-cms-ui': 'ai-pick-banner', role: 'status' },
        '🎯 Tryb wskazywania dla AI: kliknij element LUB przeciągnij prostokąt myszką, aby wskazać dokładnie o które miejsce chodzi · Esc = zamknij'
      );
      doc.body?.appendChild(banner);
    }
  }

  function getAiPickMode() {
    return aiPickMode;
  }

  function closeOpenSiteMenus() {
    const menuPanel = doc.getElementById('site-menu');
    const menuBtn = doc.getElementById('menuButton');
    if (menuPanel && !menuPanel.hidden) {
      menuPanel.hidden = true;
      menuBtn?.setAttribute('aria-expanded', 'false');
    }
  }

  function navigateAnchorHref(rawHref) {
    const href = String(rawHref || '').trim();
    if (!href) return false;

    if (/^mailto:|^tel:/i.test(href)) {
      return false;
    }

    if (/^https?:\/\//i.test(href)) {
      callbacks.onNavigate({ externalUrl: href });
      return true;
    }

    if (href.startsWith('#')) {
      const targetId = href.slice(1).trim();
      closeOpenSiteMenus();
      if (targetId) {
        const el = doc.getElementById(targetId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
      return true;
    }

    const hashIdx = href.indexOf('#');
    const pathPart = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
    const hashPart = hashIdx >= 0 ? href.slice(hashIdx + 1).trim() : '';
    const resolvedRoot = pathPart ? toRootPath(pathPart, pagePath) : pagePath;

    closeOpenSiteMenus();
    if (resolvedRoot === pagePath && hashPart) {
      const el = doc.getElementById(hashPart);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return true;
      }
    }

    if (resolvedRoot) {
      callbacks.onNavigate({ pagePath: resolvedRoot, hash: hashPart || null });
      return true;
    }
    return false;
  }

  function onClickCapture(e) {
    const target = e.target instanceof doc.defaultView.Element ? e.target : e.target?.parentElement;
    if (!target) return;

    // -1. Tryb wskazywania fragmentu dla AI (obsługiwany przez pointerdown/pointerup)
    if (aiPickMode) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    // 0. Przycisk Wstecz strony działa jak normalna nawigacja w panelu
    const backBtn = target.closest('[data-history-back]');
    if (backBtn) {
      e.preventDefault();
      e.stopImmediatePropagation();
      callbacks.onNavigate({ back: true });
      return;
    }

    // 0b. Natywne kontrolki strony (MENU, zamknij menu, Do góry, miniaturki/strzałki galerii i karuzel, próbnik) działają normalnie!
    const nativeSiteControl = target.closest(
      '[data-menu-toggle], [data-menu-close], .scroll-top-btn, .product-gallery-thumb, [data-gallery-prev], [data-gallery-next], [data-scroll-prev], [data-scroll-next], [data-palette-src]'
    );
    if (nativeSiteControl) {
      return;
    }

    // 0c. Tryb „Przeglądaj” (normalna strona): wszystkie linki, przyciski, akordeony i lightbox działają jak na żywej stronie
    if (browseMode) {
      const anchor = target.closest('a[href]');
      if (anchor) {
        if (anchor.hasAttribute('data-lightbox-trigger') || anchor.hasAttribute('data-gallery-trigger')) {
          return; // Pozwól otworzyć lightbox zdjęcia!
        }
        const href = (anchor.getAttribute('href') || '').trim();
        if (!href || href === '#') {
          e.preventDefault();
          e.stopImmediatePropagation();
          callbacks.onNavigate({ unlinked: true, label: truncate(getPreservedText(anchor), 50) });
          return;
        }
        if (!/^mailto:|^tel:/i.test(href)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          navigateAnchorHref(href);
        }
      }
      return;
    }

    // 1. Kliknięcie w przycisk nakładki zmiany zdjęcia
    const imgEditBtn = target.closest('[data-cms-ui="img-edit-btn"]');
    if (imgEditBtn) {
      e.preventDefault();
      e.stopPropagation();
      const targetUid = imgEditBtn.getAttribute('data-cms-target-uid');
      if (targetUid) {
        selectByUid(targetUid);
        callbacks.onRequestImage(targetUid);
      }
      return;
    }

    // 2. Kliknięcie w przycisk paska narzędzi CMS
    const actionBtn = target.closest('[data-cms-action]');
    if (actionBtn && actionBtn.closest('[data-cms-ui]')) {
      e.preventDefault();
      e.stopPropagation();
      if (!actionBtn.disabled) handleUiAction(actionBtn);
      return;
    }

    // Kliknięcie w tło paska narzędzi (nie przycisk) — zaznacz właściciela
    const toolbar = target.closest('[data-cms-ui="section-toolbar"], [data-cms-ui="item-toolbar"]');
    if (toolbar) {
      e.preventDefault();
      e.stopPropagation();
      const ownerUid = toolbar.getAttribute('data-cms-for');
      if (ownerUid) selectByUid(ownerUid);
      return;
    }

    // 2b. Elementy globalne witryny (telefon w nagłówku/menu, logo, dymki kontaktu, stopka) — w trybie Edycji otwierają od razu edycję globalną z fokusem na klikniętym polu!
    const globalPhoneTarget = target.closest(
      'header.bar a.phone, nav.menu-panel a.menu-phone, a.contact-bubble--tel, footer .footer-copy a[href^="tel:"]'
    );
    if (globalPhoneTarget) {
      e.preventDefault();
      e.stopImmediatePropagation();
      closeOpenSiteMenus();
      callbacks.onRequestGlobals({ focus: 'phone' });
      return;
    }

    const globalMailTarget = target.closest('a.contact-bubble--mail');
    if (globalMailTarget) {
      e.preventDefault();
      e.stopImmediatePropagation();
      callbacks.onRequestGlobals({ focus: 'email' });
      return;
    }

    const globalFbTarget = target.closest('a.contact-bubble--fb, footer .footer-social a');
    if (globalFbTarget) {
      e.preventDefault();
      e.stopImmediatePropagation();
      callbacks.onRequestGlobals({ focus: 'facebook' });
      return;
    }

    const globalLogoTarget = target.closest('header.bar a.brand');
    if (globalLogoTarget && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      callbacks.onRequestGlobals({ focus: 'logo' });
      return;
    }

    const globalFooterCopyTarget = target.closest('footer .footer-copy');
    if (globalFooterCopyTarget) {
      e.preventDefault();
      e.stopImmediatePropagation();
      callbacks.onRequestGlobals({ focus: 'footer' });
      return;
    }

    // 3. Linki nawigacyjne (Menu główne, nagłówek, stopka, okruszki, paginacja lub Ctrl+Klik) — działają jak normalna strona!
    const anchor = target.closest('a');
    if (anchor) {
      const href = anchor.getAttribute('href') || '';
      const isNavChrome = Boolean(
        anchor.closest('header, nav, footer, .breadcrumbs, .detail-pagination') &&
        !anchor.closest('.cms-section, .cms-item')
      );
      if ((isNavChrome || e.ctrlKey || e.metaKey) && href) {
        if (/^mailto:|^tel:/i.test(href)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
        navigateAnchorHref(href);
        return;
      }

      // Pozostałe linki wewnątrz edytowalnych sekcji/kart — zapobiegaj przypadkowemu opuszczeniu strony podczas edycji tekstu
      e.preventDefault();
      if (
        anchor.hasAttribute('data-lightbox-trigger') ||
        href.startsWith('mailto:') ||
        href.startsWith('#')
      ) {
        e.stopImmediatePropagation();
      }
    }

    const blockedEditTrigger = target.closest('[data-lightbox-trigger], [data-gallery-trigger]');
    if (blockedEditTrigger) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }

    // 4. <summary> — pozwól otworzyć zamknięte <details>, a gdy otwarte i kliknięto tekst, nie zwijaj podczas edycji
    const summary = target.closest('summary');
    if (summary) {
      const details = summary.parentElement;
      const clickedEditable = target.closest('.cms-editable-text');
      if (details?.tagName === 'DETAILS' && details.open && clickedEditable) {
        // Nie pozwól przeglądarce zwinąć <details> podczas kliknięcia w edytowalny tytuł
        e.preventDefault();
        clickedEditable.focus();
      }
    }

    // 5. Zaznacz kliknięty kafelek lub sekcję (bez odbierania fokusu z contentEditable)
    const itemEl = target.closest('.cms-item');
    if (itemEl) {
      const uid = itemEl.getAttribute('data-cms-uid');
      if (uid && uid !== selectedUid) {
        selectByUid(uid);
      } else if (uid) {
        // Odśwież deskryptor na wypadek zmiany wewnątrz
        callbacks.onSelect(getSelectedDescriptor());
      }
      return;
    }

    const secEl = target.closest('.cms-section');
    if (secEl) {
      const uid = secEl.getAttribute('data-cms-uid');
      if (uid && uid !== selectedUid) {
        selectByUid(uid);
      } else if (uid) {
        callbacks.onSelect(getSelectedDescriptor());
      }
      return;
    }

    // Kliknięcie poza główną treścią (np. pusty margines)
    if (!target.closest('main')) {
      clearSelection();
    }
  }

  function onDblClickCapture(e) {
    if (browseMode) return;
    const target = e.target instanceof doc.defaultView.Element ? e.target : e.target?.parentElement;
    if (!target || target.closest('[data-cms-ui]')) return;

    // Podwójne kliknięcie na obraz lub ramkę Hero -> wybierz zdjęcie
    const heroFrame = target.closest('.hero-frame');
    if (heroFrame) {
      const heroSec = heroFrame.closest('.cms-section');
      const uid = heroSec?.getAttribute('data-cms-uid');
      if (uid) {
        e.preventDefault();
        e.stopPropagation();
        selectByUid(uid);
        callbacks.onRequestImage(uid);
      }
      return;
    }

    const img = target.tagName === 'IMG' ? target : target.closest('.cms-img-host')?.querySelector('img');
    if (img && !target.closest('.cms-editable-text')) {
      const owner = img.closest('.cms-item') || img.closest('.cms-section');
      const uid = owner?.getAttribute('data-cms-uid');
      if (uid) {
        e.preventDefault();
        e.stopPropagation();
        selectByUid(uid);
        callbacks.onRequestImage(uid);
      }
    }
  }

  function onMouseMove(e) {
    if (dragState || browseMode || freeInteract) return;
    const target = e.target instanceof doc.defaultView.Element ? e.target : e.target?.parentElement;
    if (!target) return;

    if (aiPickMode) {
      const pickEl = target.closest('.cms-item') || target.closest('.cms-section');
      if (pickEl !== aiPickHoverEl) {
        aiPickHoverEl?.classList.remove('cms-ai-pick-hover');
        aiPickHoverEl = pickEl;
        aiPickHoverEl?.classList.add('cms-ai-pick-hover');
      }
      return;
    }

    const itemEl = target.closest('.cms-item');
    const secEl = target.closest('.cms-section');

    if (itemEl !== hoveredItemEl) {
      hoveredItemEl?.classList.remove('cms-hovered');
      hoveredItemEl = itemEl;
      hoveredItemEl?.classList.add('cms-hovered');
    }

    if (secEl !== hoveredSectionEl) {
      hoveredSectionEl?.classList.remove('cms-hovered');
      hoveredSectionEl = secEl;
      hoveredSectionEl?.classList.add('cms-hovered');
    }
  }

  function onMouseLeave() {
    hoveredItemEl?.classList.remove('cms-hovered');
    hoveredSectionEl?.classList.remove('cms-hovered');
    hoveredItemEl = null;
    hoveredSectionEl = null;
  }

  function onInput(e) {
    const target = e.target;
    if (!target || !target.isContentEditable) return;

    // Zsynchronizuj etykietę w pasku i strukturze jeśli edytowany był nagłówek
    const ownerItem = target.closest('.cms-item');
    const ownerSec = target.closest('.cms-section');
    const owner = ownerItem || ownerSec;
    if (owner) {
      const uid = owner.getAttribute('data-cms-uid');
      const entry = nodesByUid.get(uid);
      if (entry) {
        const nextLabel =
          entry.kind === 'section'
            ? getSectionLabel(entry.el)
            : getItemLabel(entry.el, entry.itemType);
        if (nextLabel !== entry.label) {
          entry.label = nextLabel;
          entry.el.setAttribute('data-cms-label', nextLabel);
          const tbLabel = entry.el.querySelector(':scope > [data-cms-ui="section-toolbar"] .cms-tb-label');
          if (tbLabel) tbLabel.textContent = nextLabel;
          callbacks.onStructureChange(getStructure());
        }
      }
      if (uid && uid === selectedUid) {
        callbacks.onSelect(getSelectedDescriptor());
      }
    }

    scheduleTextMutation();
  }

  function onFocusOut(e) {
    if (e.target?.isContentEditable) {
      flushPendingTextMutation();
    }
  }

  function onPaste(e) {
    const target = e.target;
    if (!target || !target.isContentEditable) return;
    e.preventDefault();
    let plain = e.clipboardData?.getData('text/plain') || '';
    if (target.matches(SINGLE_LINE_SELECTOR)) {
      plain = plain.replace(/[\r\n]+/g, ' ');
    }
    if (doc.queryCommandSupported?.('insertText')) {
      doc.execCommand('insertText', false, plain);
    } else {
      const sel = doc.defaultView?.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const node = doc.createTextNode(plain);
        range.insertNode(node);
        range.setStartAfter(node);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
    scheduleTextMutation();
  }

  function onKeyDown(e) {
    const target = e.target;
    if (!target || !target.isContentEditable) return;

    // Enter w jednoliniowych nagłówkach kończy edycję zamiast rozbijać układ
    if (e.key === 'Enter' && target.matches(SINGLE_LINE_SELECTOR)) {
      e.preventDefault();
      target.blur();
      return;
    }

    // Spacja w contentEditable wewnątrz <summary> w Chromium nie może zwijać <details>
    if (e.key === ' ' && target.closest('summary')) {
      e.preventDefault();
      if (doc.queryCommandSupported?.('insertText')) {
        doc.execCommand('insertText', false, ' ');
      }
      scheduleTextMutation();
      return;
    }

    if (e.key === 'Escape') {
      target.blur();
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  // Drag & Drop handlers
  function onDragStart(e) {
    const target = e.target instanceof doc.defaultView.Element ? e.target : e.target?.parentElement;
    const handle = target?.closest('[data-cms-ui="drag-handle"]');
    if (!handle) {
      // Zablokuj natywne przeciąganie linków <a> i obrazów <img>
      e.preventDefault();
      return;
    }

    const kind = handle.getAttribute('data-drag-kind');
    const uid = handle.getAttribute('data-drag-uid');
    const entry = nodesByUid.get(uid);
    if (!entry) {
      e.preventDefault();
      return;
    }

    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', uid);
    const dragPayload = buildTargetPayload(entry);
    if (dragPayload) {
      try {
        e.dataTransfer.setData('application/x-wolbud-cms-target', JSON.stringify(dragPayload));
      } catch {
        // Ignoruj ewentualne ograniczenia MIME przeglądarki
      }
      callbacks.onDragTargetStart(dragPayload);
    }

    const toolbar = handle.closest('[data-cms-ui="section-toolbar"], [data-cms-ui="item-toolbar"]');
    if (toolbar && e.dataTransfer.setDragImage) {
      e.dataTransfer.setDragImage(toolbar, 16, 14);
    }

    entry.el.classList.add('cms-dragging');

    if (kind === 'section') {
      const secEntry = sectionList.find((s) => s.uid === uid);
      if (!secEntry) return;
      dragState = { kind: 'section', uid, el: entry.el, scope: secEntry.scope };
      doc.body.classList.add('cms-is-dragging-section');
      renderSectionDropSlots(secEntry);
    } else if (kind === 'item') {
      const repUid = handle.getAttribute('data-drag-repeater');
      dragState = { kind: 'item', uid, el: entry.el, repeaterUid: repUid };
    }
  }

  function onDragOver(e) {
    if (!dragState) return;
    const target = e.target instanceof doc.defaultView.Element ? e.target : e.target?.parentElement;
    if (!target) return;

    if (dragState.kind === 'section') {
      const slot = target.closest('[data-cms-ui="drop-slot"]');
      doc.querySelectorAll('[data-cms-ui="drop-slot"].cms-drag-over').forEach((s) => {
        if (s !== slot) s.classList.remove('cms-drag-over');
      });
      if (slot) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        slot.classList.add('cms-drag-over');
      }
      return;
    }

    if (dragState.kind === 'item') {
      const itemEl = target.closest('.cms-item');
      doc.querySelectorAll('.cms-drag-over-before, .cms-drag-over-after').forEach((el) => {
        if (el !== itemEl) el.classList.remove('cms-drag-over-before', 'cms-drag-over-after');
      });
      if (!itemEl || itemEl === dragState.el) return;
      const targetUid = itemEl.getAttribute('data-cms-uid');
      const targetEntry = nodesByUid.get(targetUid);
      if (!targetEntry || targetEntry.repeaterUid !== dragState.repeaterUid) return;

      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      const rep = repeatersByUid.get(dragState.repeaterUid);
      const rect = itemEl.getBoundingClientRect();
      const isVertical = Boolean(rep?.spec.vertical);
      const before = isVertical
        ? e.clientY < rect.top + rect.height / 2
        : e.clientX < rect.left + rect.width / 2;

      itemEl.classList.toggle('cms-drag-over-before', before);
      itemEl.classList.toggle('cms-drag-over-after', !before);
    }
  }

  function onDrop(e) {
    if (!dragState) return;
    const target = e.target instanceof doc.defaultView.Element ? e.target : e.target?.parentElement;
    if (!target) {
      clearDragVisuals();
      return;
    }

    if (dragState.kind === 'section') {
      const slot = target.closest('[data-cms-ui="drop-slot"]');
      if (slot) {
        e.preventDefault();
        e.stopPropagation();
        const rawDropIdx = Number(slot.getAttribute('data-drop-index'));
        const siblings = getScopeSiblings(dragState.scope);
        const fromIdx = siblings.findIndex((s) => s.uid === dragState.uid);
        let destIdx = rawDropIdx;
        if (fromIdx !== -1 && rawDropIdx > fromIdx) {
          destIdx = rawDropIdx - 1;
        }
        const draggedUid = dragState.uid;
        clearDragVisuals();
        moveNodeToIndex(draggedUid, destIdx);
        return;
      }
    }

    if (dragState.kind === 'item') {
      const itemEl = target.closest('.cms-item');
      if (itemEl && itemEl !== dragState.el) {
        const targetUid = itemEl.getAttribute('data-cms-uid');
        const targetEntry = nodesByUid.get(targetUid);
        if (targetEntry && targetEntry.repeaterUid === dragState.repeaterUid) {
          e.preventDefault();
          e.stopPropagation();
          const rep = repeatersByUid.get(dragState.repeaterUid);
          if (rep) {
            const fromIdx = rep.items.indexOf(dragState.el);
            const overIdx = rep.items.indexOf(itemEl);
            const before = itemEl.classList.contains('cms-drag-over-before');
            let destIdx = before ? overIdx : overIdx + 1;
            if (fromIdx < destIdx) destIdx -= 1;
            const draggedUid = dragState.uid;
            clearDragVisuals();
            moveNodeToIndex(draggedUid, destIdx);
            return;
          }
        }
      }
    }

    clearDragVisuals();
  }

  function onDragEnd() {
    clearDragVisuals();
    callbacks.onDragTargetEnd();
  }

  function updateFreeHud(el, text) {
    if (!el) return;
    let hud = el.querySelector(':scope > [data-cms-ui="free-hud"]');
    if (!hud) {
      hud = createEl(doc, 'div', { 'data-cms-ui': 'free-hud', contenteditable: 'false' });
      el.appendChild(hud);
    }
    hud.textContent = text;
  }

  function removeFreeHud() {
    doc.querySelectorAll('[data-cms-ui="free-hud"]').forEach((n) => n.remove());
  }

  function onPointerDown(e) {
    if (e.button !== 0 || browseMode) return;
    const target = e.target instanceof doc.defaultView.Element ? e.target : e.target?.parentElement;
    if (!target) return;

    // 1. Tryb wskazywania fragmentu dla AI (klik lub zaznaczenie ramką)
    if (aiPickMode) {
      if (target.closest('[data-cms-ui]')) return;
      e.preventDefault();
      e.stopPropagation();
      marqueeState = {
        startX: e.clientX,
        startY: e.clientY,
        currX: e.clientX,
        currY: e.clientY,
        target,
        boxEl: null,
        dragging: false,
      };
      return;
    }

    // 2. Tryb układu swobodnego (klocki): skalowanie uchwytami lub swobodne przesuwanie
    if (!freeLayoutMode) return;

    const resizeHandle = target.closest('[data-cms-ui="free-handle"]');
    if (resizeHandle) {
      const uid = resizeHandle.getAttribute('data-free-uid');
      const dir = resizeHandle.getAttribute('data-free-dir') || 'se';
      const entry = nodesByUid.get(uid);
      if (!entry || !doc.contains(entry.el)) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = entry.el.getBoundingClientRect();
      const fl = readFreeLayout(entry.el);
      freeInteract = {
        mode: 'resize',
        dir,
        uid,
        el: entry.el,
        startX: e.clientX,
        startY: e.clientY,
        startW: fl.w || Math.round(rect.width),
        startH: fl.h || Math.round(rect.height),
        moved: false,
      };
      return;
    }

    if (target.closest('[data-cms-ui]')) return;
    const blockEl = target.closest('.cms-item') || target.closest('.cms-section');
    if (!blockEl) return;
    const uid = blockEl.getAttribute('data-cms-uid');
    const entry = nodesByUid.get(uid);
    if (!entry) return;

    e.preventDefault();
    e.stopPropagation();
    if (uid !== selectedUid) {
      selectByUid(uid);
    } else {
      syncFreeHandles();
    }
    const fl = readFreeLayout(entry.el);
    freeInteract = {
      mode: 'move',
      uid,
      el: entry.el,
      startX: e.clientX,
      startY: e.clientY,
      startTx: fl.tx,
      startTy: fl.ty,
      moved: false,
    };
  }

  function onPointerMove(e) {
    if (marqueeState) {
      marqueeState.currX = e.clientX;
      marqueeState.currY = e.clientY;
      const dx = Math.abs(e.clientX - marqueeState.startX);
      const dy = Math.abs(e.clientY - marqueeState.startY);
      if (dx > 12 || dy > 12) {
        marqueeState.dragging = true;
        if (!marqueeState.boxEl) {
          marqueeState.boxEl = createEl(doc, 'div', {
            'data-cms-ui': 'ai-marquee',
            contenteditable: 'false',
          });
          doc.body.appendChild(marqueeState.boxEl);
        }
        const left = Math.min(marqueeState.startX, marqueeState.currX);
        const top = Math.min(marqueeState.startY, marqueeState.currY);
        const width = Math.abs(marqueeState.currX - marqueeState.startX);
        const height = Math.abs(marqueeState.currY - marqueeState.startY);
        marqueeState.boxEl.style.left = `${left}px`;
        marqueeState.boxEl.style.top = `${top}px`;
        marqueeState.boxEl.style.width = `${width}px`;
        marqueeState.boxEl.style.height = `${height}px`;
      }
      return;
    }

    if (!freeInteract) return;
    const dx = e.clientX - freeInteract.startX;
    const dy = e.clientY - freeInteract.startY;
    if (!freeInteract.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
    freeInteract.moved = true;

    if (freeInteract.mode === 'move') {
      const nextTx = Math.round(freeInteract.startTx + dx);
      const nextTy = Math.round(freeInteract.startTy + dy);
      applyFreeLayoutToEl(freeInteract.el, { tx: nextTx, ty: nextTy });
      const signX = nextTx >= 0 ? `+${nextTx}` : String(nextTx);
      const signY = nextTy >= 0 ? `+${nextTy}` : String(nextTy);
      updateFreeHud(freeInteract.el, `X: ${signX}px · Y: ${signY}px`);
    } else if (freeInteract.mode === 'resize') {
      const patch = {};
      if (freeInteract.dir === 'e' || freeInteract.dir === 'se') {
        patch.w = Math.max(80, Math.round(freeInteract.startW + dx));
      }
      if (freeInteract.dir === 's' || freeInteract.dir === 'se') {
        patch.h = Math.max(40, Math.round(freeInteract.startH + dy));
      }
      applyFreeLayoutToEl(freeInteract.el, patch);
      const fl = readFreeLayout(freeInteract.el);
      const rect = freeInteract.el.getBoundingClientRect();
      updateFreeHud(freeInteract.el, `${fl.w || Math.round(rect.width)} × ${fl.h || Math.round(rect.height)} px`);
    }
  }

  function onPointerUp(e) {
    if (marqueeState) {
      const st = marqueeState;
      const payloads = [];
      const seenUids = new Set();

      if (st.dragging) {
        const left = Math.min(st.startX, st.currX);
        const right = Math.max(st.startX, st.currX);
        const top = Math.min(st.startY, st.currY);
        const bottom = Math.max(st.startY, st.currY);
        const intersects = (el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.right >= left && r.left <= right && r.bottom >= top && r.top <= bottom;
        };

        const matchedItems = Array.from(doc.querySelectorAll('.cms-item')).filter(intersects);
        const candidates = matchedItems.length > 0
          ? matchedItems
          : Array.from(doc.querySelectorAll('.cms-section')).filter(intersects);

        for (const el of candidates) {
          const uid = el.getAttribute('data-cms-uid');
          if (!uid || seenUids.has(uid)) continue;
          seenUids.add(uid);
          const p = buildTargetPayload(nodesByUid.get(uid));
          if (p) payloads.push(p);
        }
      } else {
        const el = st.target.closest('.cms-item') || st.target.closest('.cms-section');
        const uid = el?.getAttribute('data-cms-uid');
        if (uid) {
          const p = buildTargetPayload(nodesByUid.get(uid));
          if (p) payloads.push(p);
        }
      }

      setAiPickMode(false);
      if (payloads.length > 0) {
        selectByUid(payloads[0].uid);
        callbacks.onSendToAi(payloads);
      }
      return;
    }

    if (!freeInteract) return;
    const finished = freeInteract;
    freeInteract = null;
    removeFreeHud();
    if (finished.moved) {
      callbacks.onSelect(getSelectedDescriptor());
      callbacks.onMutate('layout');
    }
  }

  // Podepnij listenery
  doc.addEventListener('click', onClickCapture, true);
  doc.addEventListener('dblclick', onDblClickCapture, true);
  doc.addEventListener('pointerdown', onPointerDown, true);
  doc.addEventListener('pointermove', onPointerMove, { passive: true });
  doc.addEventListener('pointerup', onPointerUp, true);
  doc.addEventListener('mousemove', onMouseMove, { passive: true });
  doc.documentElement.addEventListener('mouseleave', onMouseLeave);
  doc.addEventListener('input', onInput);
  doc.addEventListener('focusout', onFocusOut);
  doc.addEventListener('paste', onPaste);
  doc.addEventListener('keydown', onKeyDown);
  doc.addEventListener('submit', onSubmit, true);
  doc.addEventListener('dragstart', onDragStart);
  doc.addEventListener('dragover', onDragOver);
  doc.addEventListener('drop', onDrop);
  doc.addEventListener('dragend', onDragEnd);

  // Inicjalny skan i podmiana tymczasowych zdjęć
  refreshPendingImages(pendingImages);
  scanStructure();
  if (browseMode) {
    setBrowseMode(true);
  } else if (freeLayoutMode) {
    setFreeLayoutMode(true);
  }
  callbacks.onStructureChange(getStructure());

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    flushPendingTextMutation();
    clearDragVisuals();
    clearAiPickVisuals();
    removeFreeHandles();
    freeInteract = null;

    doc.removeEventListener('click', onClickCapture, true);
    doc.removeEventListener('dblclick', onDblClickCapture, true);
    doc.removeEventListener('pointerdown', onPointerDown, true);
    doc.removeEventListener('pointermove', onPointerMove);
    doc.removeEventListener('pointerup', onPointerUp, true);
    doc.removeEventListener('mousemove', onMouseMove);
    doc.documentElement.removeEventListener('mouseleave', onMouseLeave);
    doc.removeEventListener('input', onInput);
    doc.removeEventListener('focusout', onFocusOut);
    doc.removeEventListener('paste', onPaste);
    doc.removeEventListener('keydown', onKeyDown);
    doc.removeEventListener('submit', onSubmit, true);
    doc.removeEventListener('dragstart', onDragStart);
    doc.removeEventListener('dragover', onDragOver);
    doc.removeEventListener('drop', onDrop);
    doc.removeEventListener('dragend', onDragEnd);

    doc.querySelectorAll('[data-cms-ui]').forEach((el) => {
      if (el.getAttribute('data-cms-ui') === 'base') return;
      el.remove();
    });
    doc.body?.classList.remove('wolbud-preview', 'cms-browse-mode', 'cms-free-mode', 'cms-ai-pick-mode');
    doc.querySelectorAll('*').forEach((el) => {
      EDITOR_CLASSES.forEach((cls) => el.classList.remove(cls));
      EDITOR_ATTRS.forEach((attr) => el.removeAttribute(attr));
    });

    nodesByUid.clear();
    repeatersByUid.clear();
    sectionList = [];
    selectedUid = null;
  }

  return {
    getStructure,
    selectByUid,
    clearSelection,
    getSelectedDescriptor,
    getElementTargetPayload,
    updateField,
    updateLink,
    updateImage,
    updateStars,
    updateSectionId,
    updateSectionStyle,
    updateFreeLayout,
    resetFreeLayout,
    toggleHidden,
    moveNode,
    moveNodeToIndex,
    duplicateNode,
    deleteNode,
    insertSection,
    insertItem,
    insertBlockInside,
    getAvailableButtonStyles,
    insertStyledButton,
    insertClonedSectionHtml,
    getElementCleanHtml,
    updateElementHtml,
    insertCustomSectionHtml,
    applyLiveGlobals,
    getMeta,
    setMeta,
    serializeCleanHtml,
    captureSnapshot,
    restoreSnapshot,
    refreshPendingImages,
    setBrowseMode,
    getBrowseMode,
    setFreeLayoutMode,
    getFreeLayoutMode,
    setAiPickMode,
    getAiPickMode,
    destroy,
  };
}
