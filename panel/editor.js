import { config } from './config.js';
import { siteProfile } from './site-profile.js';
import { AiGuardrailTracker, sanitizeUrl } from './sanitizer.js';
import {
  initStorage,
  savePageDraft,
  getPageDraft,
  deletePageDraft,
  getAllPageDrafts,
  savePendingImage,
  getAllPendingImages,
  deletePendingImage,
  saveGlobalsDraft,
  getGlobalsDraft,
  deleteGlobalsDraft,
  saveCredential,
  getCredential,
  clearCredential,
  savePendingRevision,
  getPendingRevision,
  clearAllDrafts,
  exportBackup,
  importBackup,
  compressImageToWebP,
  slugifyFilename,
} from './storage.js';
import {
  depthPrefix,
  toRelativeUrl,
  toRootPath,
  slugifyPath,
  SECTION_TEMPLATES,
  ITEM_TEMPLATES,
  PAGE_TEMPLATES,
} from './templates.js';
import {
  AccessError,
  ConflictError,
  SecurityError,
  fetchManifest,
  fetchGlobals,
  checkAuthStatus,
  loginHosting,
  logoutHosting,
  publishChanges,
  listBackups,
  createBackup,
  restoreBackup,
  waitForPublication,
} from './publish.js';
import { connectCanvas } from './canvas.js';
import {
  DEFAULT_AI_SETTINGS,
  AI_MODELS,
  loadAiSettings,
  saveAiSettings,
  checkProxyStatus,
  runAiTurn,
} from './ai-agent.js';

// ============================================================================
// DOM HELPERS & CONSTANTS
// ============================================================================

const $ = (id) => document.getElementById(id);

const DEFAULT_GLOBALS = {
  version: 1,
  phoneDisplay: '534 091 021',
  phoneHref: 'tel:+48534091021',
  email: 'biuro@wol-bud.com.pl',
  facebookUrl: 'https://www.facebook.com/sklep.wol.bud.tarnow',
  facebookLabel: 'facebook.com/sklep.wol.bud.tarnow',
  logoSrc: 'img/wolbud-logo.webp',
  logoAlt: 'WOL-BUD – okna, drzwi, rolety, bramy',
  menu: [
    { label: 'Strona główna', href: 'index.html', mobileHref: 'index.html#start' },
    { label: 'Oferta', href: 'oferta/index.html', mobileHref: 'index.html#oferta' },
    { label: 'Usługi', href: 'uslugi/index.html', mobileHref: 'index.html#uslugi' },
    { label: 'Realizacje', href: 'realizacje/index.html', mobileHref: 'index.html#realizacje' },
    { label: 'O firmie', href: 'o-firmie/index.html', mobileHref: 'index.html#ofirmie' },
    { label: 'Nasze sklepy', href: 'nasze-sklepy/index.html', mobileHref: 'index.html#nasze-sklepy' },
    { label: 'Kontakt', href: 'kontakt/index.html', mobileHref: 'index.html#kontakt' },
  ],
  footerLinks: [
    { label: 'Oferta', href: 'oferta/index.html' },
    { label: 'Usługi', href: 'uslugi/index.html' },
    { label: 'Realizacje', href: 'realizacje/index.html' },
    { label: 'O firmie', href: 'o-firmie/index.html' },
    { label: 'Nasze sklepy', href: 'nasze-sklepy/index.html' },
    { label: 'Kontakt', href: 'kontakt/index.html' },
  ],
  footerCopy:
    'WOL-BUD Wojciech Wolański · Sprzedaż i profesjonalny montaż okien, drzwi i bram od 1995 roku · Tarnów, Radłów · ',
};

const CORE_PROTECTED_PAGES = new Set(
  Array.isArray(siteProfile.protectedPages) && siteProfile.protectedPages.length > 0
    ? ['index.html', ...siteProfile.protectedPages]
    : ['index.html']
);

const aiGuardrails = new AiGuardrailTracker({
  protectedPages: Array.from(CORE_PROTECTED_PAGES),
});

const MAX_UNDO_STEPS = 50;
const AUTOSAVE_DELAY_MS = 1200;

// ============================================================================
// APPLICATION STATE
// ============================================================================

const state = {
  manifest: {
    version: 2,
    revision: null,
    generatedAt: null,
    pages: [
      {
        path: 'index.html',
        label: 'Strona główna',
        title: siteProfile.brandName || 'Strona główna',
        description: '',
        group: 'home',
      },
    ],
    images: [],
  },
  publishedGlobals: structuredClone(DEFAULT_GLOBALS),
  globalsDraft: null,
  pageDrafts: {},
  pendingImages: {},
  pendingRevision: null,
  savedCredential: { value: '', remembered: false },
  auth: {
    authenticated: false,
    csrfToken: null,
  },
  lastError: '',

  currentPagePath: 'index.html',
  currentPageDirty: false,
  canvas: null,
  structure: [],
  selectedDescriptor: null,
  expandedRepeaters: new Set(),

  undoStack: [],
  redoStack: [],
  aiUndoStack: [],
  lastSnapshot: null,
  lastMutateTime: 0,
  autosaveTimer: null,
  isRestoringHistory: false,

  activeTab: 'structure',
  uiMode: 'simple',
  browseMode: false,
  pageHistory: [],
  viewport: 'desktop',
  pendingInsertAfterUid: null,
  blocksQuery: '',
  pagesFilterGroup: 'all',
  pagesQuery: '',

  media: {
    mode: 'browse',
    onPick: null,
    folder: 'all',
    query: '',
  },

  newPage: {
    templateId: PAGE_TEMPLATES[0]?.id || 'duplicate',
    slugTouched: false,
  },

  globalsEditor: {
    working: null,
  },

  loadSeq: 0,
  isPublishing: false,
  dragSectionUid: null,

  ai: {
    open: false,
    settings: null,
    proxyStatus: null,
    history: [],
    isRunning: false,
    abortController: null,
  },
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function normalizeTextForSearch(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l');
}

function escapeAttr(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatDateTimePl(iso) {
  if (!iso) return 'brak danych';
  try {
    return new Intl.DateTimeFormat('pl-PL', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return String(iso);
  }
}

function formatFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function showToast(message, type = 'success', durationMs = 3400) {
  const container = $('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast${type === 'error' ? ' is-error' : type === 'warn' ? ' is-warn' : ''}`;
  el.textContent = message;
  container.append(el);

  const remove = () => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 220);
  };
  el.addEventListener('click', remove, { once: true });
  setTimeout(remove, durationMs);
}

function getActiveGlobals() {
  return state.globalsDraft || state.publishedGlobals || DEFAULT_GLOBALS;
}

function normalizeGlobalsObj(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const menuRaw = Array.isArray(src.menu)
    ? src.menu
    : Array.isArray(src.nav)
      ? src.nav
      : DEFAULT_GLOBALS.menu;
  const footerLinksRaw = Array.isArray(src.footerLinks)
    ? src.footerLinks
    : DEFAULT_GLOBALS.footerLinks;

  return {
    ...DEFAULT_GLOBALS,
    ...src,
    phoneDisplay: src.phoneDisplay ?? src.phone ?? DEFAULT_GLOBALS.phoneDisplay,
    phoneHref: src.phoneHref ?? src.phoneTel ?? DEFAULT_GLOBALS.phoneHref,
    email: src.email ?? DEFAULT_GLOBALS.email,
    facebookUrl: src.facebookUrl ?? src.facebook ?? DEFAULT_GLOBALS.facebookUrl,
    facebookLabel: src.facebookLabel ?? DEFAULT_GLOBALS.facebookLabel,
    logoSrc: src.logoSrc ?? src.logo ?? DEFAULT_GLOBALS.logoSrc,
    logoAlt: src.logoAlt ?? DEFAULT_GLOBALS.logoAlt,
    menu: menuRaw.map((item) => ({
      label: String(item?.label || ''),
      href: String(item?.href || 'index.html'),
      mobileHref: item?.mobileHref ? String(item.mobileHref) : '',
    })),
    footerLinks: footerLinksRaw.map((item) => ({
      label: String(item?.label || ''),
      href: String(item?.href || 'index.html'),
    })),
    footerCopy: src.footerCopy ?? src.footerText ?? DEFAULT_GLOBALS.footerCopy,
  };
}

function resolveRepoImageUrl(repoPath) {
  if (!repoPath) return '';
  const cleaned = String(repoPath).replace(/^\/+/, '');
  if (/^(data:|blob:|https?:|\/\/)/i.test(cleaned)) return cleaned;
  const pending = state.pendingImages[cleaned];
  if (pending?.dataUrl) return pending.dataUrl;
  return new URL('../' + cleaned, location.href).href;
}

function getPendingImageUrlMap() {
  const map = {};
  for (const [repoPath, item] of Object.entries(state.pendingImages || {})) {
    const url = typeof item === 'string' ? item : item?.dataUrl;
    if (url) map[repoPath] = url;
  }
  return map;
}

function snapshotKey(snap) {
  if (!snap) return '';
  return typeof snap === 'string' ? snap : String(snap.html || '');
}

function inferPageGroup(pagePath, fallback = 'glowne') {
  if (pagePath === 'index.html') return 'home';
  if (pagePath.startsWith('kategorie/')) return 'kategorie';
  if (pagePath.startsWith('produkty/')) return 'produkty';
  if (pagePath.startsWith('promocje/')) return 'promocje';
  return fallback || 'glowne';
}

function getAllPagesMerged() {
  const map = new Map();
  for (const p of state.manifest.pages || []) {
    if (!p?.path) continue;
    map.set(p.path, {
      path: p.path,
      label: p.label || p.title || p.path,
      title: p.title || p.label || '',
      description: p.description || '',
      group: p.group || inferPageGroup(p.path),
      isNew: false,
      isModified: false,
      deleted: false,
      fromManifest: true,
    });
  }

  for (const [path, draft] of Object.entries(state.pageDrafts || {})) {
    if (!draft) continue;
    const existing = map.get(path);
    if (existing) {
      map.set(path, {
        ...existing,
        label: draft.label || existing.label,
        title: draft.title ?? existing.title,
        description: draft.description ?? existing.description,
        group: draft.group || existing.group,
        isNew: Boolean(draft.isNew),
        isModified: !draft.deleted,
        deleted: Boolean(draft.deleted),
      });
    } else if (!draft.deleted) {
      map.set(path, {
        path,
        label: draft.label || draft.title || path,
        title: draft.title || draft.label || '',
        description: draft.description || '',
        group: draft.group || inferPageGroup(path),
        isNew: true,
        isModified: true,
        deleted: false,
        fromManifest: false,
      });
    }
  }

  return Array.from(map.values());
}

function getPageEntry(pagePath) {
  return (
    getAllPagesMerged().find((p) => p.path === pagePath) || {
      path: pagePath,
      label: pagePath === 'index.html' ? 'Strona główna' : pagePath,
      title: '',
      description: '',
      group: inferPageGroup(pagePath),
      isNew: false,
      isModified: false,
      deleted: false,
    }
  );
}

function getTotalPendingChanges() {
  const draftEntries = Object.entries(state.pageDrafts || {});
  const modifiedPages = draftEntries.filter(([, d]) => d && !d.deleted && !d.isNew).length;
  const newPages = draftEntries.filter(([, d]) => d && !d.deleted && d.isNew).length;
  const deletedPages = draftEntries.filter(([, d]) => d && d.deleted && !d.isNew).length;
  const imagesCount = Object.keys(state.pendingImages || {}).length;
  const hasGlobals = Boolean(state.globalsDraft);
  const unsavedCurrent = state.currentPageDirty && !state.pageDrafts[state.currentPagePath] ? 1 : 0;

  return {
    modifiedPages,
    newPages,
    deletedPages,
    imagesCount,
    hasGlobals,
    total: modifiedPages + newPages + deletedPages + imagesCount + (hasGlobals ? 1 : 0) + unsavedCurrent,
  };
}

function pluralZmian(n) {
  if (n === 1) return '1 zmiana w szkicu';
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) {
    return `${n} zmiany w szkicu`;
  }
  return `${n} zmian w szkicu`;
}

// ============================================================================
// DEFENSIVE NORMALIZERS FOR CANVAS DATA
// ============================================================================

function normalizeStructure(raw) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.sections) ? raw.sections : [];
  return list.map((sec, idx) => {
    const rawReps = Array.isArray(sec.childRepeaters)
      ? sec.childRepeaters
      : Array.isArray(sec.repeaters)
        ? sec.repeaters
        : [];
    const repeaters = rawReps.map((rep) => {
      const items = Array.isArray(rep.items)
        ? rep.items.map((it, itemIdx) => ({
            uid: it.uid,
            label: it.label || it.title || it.name || `Element ${itemIdx + 1}`,
            hidden: Boolean(it.hidden ?? it.isHidden),
            canMoveUp: it.canMoveUp ?? itemIdx > 0,
            canMoveDown: it.canMoveDown ?? itemIdx < rep.items.length - 1,
          }))
        : [];
      return {
        uid: rep.repeaterUid || rep.uid,
        label: rep.label || ITEM_TEMPLATES[rep.itemType]?.label || 'Elementy',
        itemType: rep.itemType || rep.type || '',
        count: typeof rep.count === 'number' ? rep.count : items.length,
        items,
      };
    });

    return {
      uid: sec.uid,
      label: sec.label || sec.name || sec.title || `Sekcja ${idx + 1}`,
      id: sec.id || sec.sectionId || '',
      hidden: Boolean(sec.hidden ?? sec.isHidden),
      canMoveUp: sec.canMoveUp ?? idx > 0,
      canMoveDown: sec.canMoveDown ?? idx < list.length - 1,
      repeaters,
    };
  });
}

function normalizeDescriptor(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const kind = raw.kind || raw.type || (raw.isSection ? 'section' : 'element');
  const isSection = kind === 'section' || raw.isSection === true;
  const kindMap = {
    section: 'Sekcja',
    item: 'Kafelek / Element',
    card: 'Kafelek',
    block: 'Blok treści',
    link: 'Odnośnik',
    image: 'Zdjęcie',
    element: 'Element',
  };

  const rawRepeaters = Array.isArray(raw.childRepeaters)
    ? raw.childRepeaters
    : Array.isArray(raw.repeaters)
      ? raw.repeaters
      : [];

  const textFields = Array.isArray(raw.textFields)
    ? raw.textFields
    : Array.isArray(raw.fields)
      ? raw.fields
      : [];

  let links = [];
  if (Array.isArray(raw.links) && raw.links.length > 0) {
    links = raw.links;
  } else if (raw.link && typeof raw.link === 'object') {
    links = [raw.link];
  }

  let stars = null;
  if (typeof raw.stars === 'number') {
    stars = raw.stars;
  } else if (raw.stars && typeof raw.stars === 'object') {
    stars = Number(raw.stars.count ?? raw.stars.value ?? 5);
  } else if (raw.hasStars) {
    stars = 5;
  }

  return {
    raw,
    uid: raw.uid,
    tag: String(raw.tag || '').toLowerCase(),
    kind,
    isSection,
    kindLabel: raw.roleLabel || raw.typeLabel || kindMap[kind] || 'Element',
    title: raw.label || raw.title || raw.name || kindMap[kind] || 'Zaznaczony element',
    sectionId: raw.sectionId ?? raw.id ?? null,
    hidden: Boolean(raw.hidden ?? raw.isHidden),
    repeaterUid: raw.repeaterContext?.repeaterUid || raw.repeaterUid || raw.parentRepeaterUid || null,
    itemType: raw.repeaterContext?.itemType || raw.itemType || null,
    canMoveUp: raw.canMoveUp !== false,
    canMoveDown: raw.canMoveDown !== false,
    canDuplicate: raw.canDuplicate !== false,
    canDelete: raw.canDelete !== false,
    childRepeaters: rawRepeaters.map((r) => ({
      uid: r.repeaterUid || r.uid,
      label: r.label || ITEM_TEMPLATES[r.itemType]?.label || 'Element',
      itemType: r.itemType || r.type || '',
      count: r.count ?? r.items?.length ?? 0,
    })),
    textFields,
    links,
    image: raw.image || null,
    stars,
    sectionStyle: raw.sectionStyle || { tone: 'default', align: 'default', spacing: 'default' },
    supportsTextBlocks: Boolean(
      raw.supportsTextBlocks || raw.canAddParagraph || raw.canAddListItem || isSection
    ),
  };
}

// ============================================================================
// HTML BASE TAG HELPERS (FOR SRCDOC PREVIEWS)
// ============================================================================

function stripCmsBaseTag(html) {
  return String(html || '').replace(/<base\b[^>]*data-cms-ui=["']base["'][^>]*>\s*/gi, '');
}

function injectCmsBaseTag(html, pagePath) {
  const cleaned = stripCmsBaseTag(html);
  const baseHref = new URL('../' + pagePath, location.href).href;
  const baseTag = `<base href="${escapeAttr(baseHref)}" data-cms-ui="base">`;
  if (/<head(\s[^>]*)?>/i.test(cleaned)) {
    return cleaned.replace(/<head(\s[^>]*)?>/i, (match) => `${match}\n${baseTag}`);
  }
  return `${baseTag}\n${cleaned}`;
}

function safeCaptureSnapshot() {
  if (!state.canvas) return null;
  try {
    return state.canvas.captureSnapshot();
  } catch (err) {
    console.warn('captureSnapshot failed:', err);
    return null;
  }
}

function safeSerializeHtml() {
  if (!state.canvas) return '';
  return stripCmsBaseTag(state.canvas.serializeCleanHtml());
}

// ============================================================================
// TOPBAR & INDICATORS
// ============================================================================

function updateTopbarAndIndicators() {
  const entry = getPageEntry(state.currentPagePath);
  const draft = state.pageDrafts[state.currentPagePath];
  const counts = getTotalPendingChanges();

  $('topbar-page-label').textContent = entry.label;
  $('topbar-page-path').textContent = entry.path;
  $('stage-page-path').textContent = entry.path;

  const liveLink = $('btn-live-link');
  liveLink.href = '../' + entry.path;
  liveLink.style.opacity = entry.isNew ? '0.55' : '1';
  liveLink.title = entry.isNew
    ? 'Nowa strona będzie dostępna publicznie po kliknięciu „Opublikuj”'
    : 'Otwórz aktualnie wybraną stronę publiczną w nowej karcie';

  const stateDot = $('stage-page-state');
  const hasPageChanges = Boolean(draft || state.currentPageDirty);
  stateDot.classList.toggle('is-dirty', hasPageChanges);
  stateDot.title = hasPageChanges ? 'Strona ma niezopublikowane zmiany w szkicu' : 'Strona zgodna z wersją publiczną';

  const discardBtn = $('btn-discard-page');
  discardBtn.disabled = !hasPageChanges || state.isPublishing;
  discardBtn.textContent = draft?.isNew ? 'Usuń tę nową stronę' : 'Odrzuć zmiany na tej stronie';
  if ($('more-discard')) {
    $('more-discard').disabled = !hasPageChanges || state.isPublishing;
  }

  const badge = $('draft-counter-badge');
  if (counts.total === 0) {
    badge.textContent = 'Brak zmian';
    badge.className = 'draft-badge';
  } else if (state.currentPageDirty) {
    badge.textContent = `${pluralZmian(counts.total)} · zapisywanie…`;
    badge.className = 'draft-badge has-changes';
  } else {
    badge.textContent = pluralZmian(counts.total);
    badge.className = 'draft-badge is-saved';
  }

  const pubCount = $('publish-count');
  pubCount.textContent = String(counts.total);
  pubCount.hidden = counts.total === 0;

  $('btn-publish').disabled = state.isPublishing || counts.total === 0;
  $('btn-save-draft').disabled = state.isPublishing || !state.canvas;
  $('pages-changed-dot').hidden = counts.total === 0;

  updateUndoRedoButtons();
  updateBlocksInsertBanner();
}

function updateUndoRedoButtons() {
  const canUndo = !state.isPublishing && (state.undoStack.length > 0 || state.aiUndoStack.length > 0);
  const redoDis = state.isPublishing || state.redoStack.length === 0;
  $('btn-undo').disabled = !canUndo;
  $('btn-redo').disabled = redoDis;
  if ($('more-undo')) $('more-undo').disabled = !canUndo;
  if ($('btn-simple-undo')) {
    $('btn-simple-undo').hidden = !canUndo;
    $('btn-simple-undo').disabled = !canUndo;
  }
}

// ============================================================================
// TRYB PROSTY / TRYB ZAAWANSOWANY (SZUFLADY I MENU „WIĘCEJ”)
// ============================================================================

function setUiMode(mode, { persist = true } = {}) {
  const next = mode === 'advanced' ? 'advanced' : 'simple';
  state.uiMode = next;
  document.body.classList.toggle('is-simple-mode', next === 'simple');
  toggleMoreMenu(false);
  closeSimpleLeftDrawer();
  closeSimpleInspector();
  if (persist) {
    try {
      localStorage.setItem('cms_ui_mode', next);
    } catch {
      // ignore storage errors
    }
  }
}

function openSimpleLeftDrawer(tabName, titleText) {
  switchSidebarTab(tabName);
  if (state.uiMode !== 'simple') return;
  toggleMoreMenu(false);
  closeSimpleInspector();
  if (state.ai.open) setAiDrawerOpen(false);
  if ($('simple-left-title')) {
    $('simple-left-title').textContent =
      titleText || (tabName === 'pages' ? 'Strony' : tabName === 'blocks' ? 'Dodaj sekcję' : 'Struktura');
  }
  $('panel-left')?.classList.add('is-drawer-open');
}

function closeSimpleLeftDrawer() {
  $('panel-left')?.classList.remove('is-drawer-open');
}

function openSimpleInspector() {
  if (state.uiMode !== 'simple') return;
  toggleMoreMenu(false);
  closeSimpleLeftDrawer();
  if (state.ai.open) setAiDrawerOpen(false);
  $('panel-right')?.classList.add('is-drawer-open');
}

function closeSimpleInspector() {
  $('panel-right')?.classList.remove('is-drawer-open');
}

function toggleMoreMenu(forceOpen) {
  const pop = $('more-menu-popover');
  const btn = $('btn-more-menu');
  if (!pop || !btn) return;
  const next = typeof forceOpen === 'boolean' ? forceOpen : pop.hidden;
  pop.hidden = !next;
  btn.setAttribute('aria-expanded', String(next));
}

function updateBlocksInsertBanner() {
  const textEl = $('blocks-insert-text');
  const clearBtn = $('blocks-insert-clear');
  const targetUid = state.pendingInsertAfterUid || (state.selectedDescriptor?.isSection ? state.selectedDescriptor.uid : null);

  if (targetUid) {
    const sec = state.structure.find((s) => s.uid === targetUid);
    const label = sec ? `„${sec.label}”` : 'wybranej sekcji';
    textEl.textContent = `Nowy blok pojawi się poniżej sekcji ${label}.`;
    clearBtn.hidden = !state.pendingInsertAfterUid;
  } else {
    textEl.textContent = 'Nowy blok zostanie dodany na dole bieżącej strony.';
    clearBtn.hidden = true;
  }
}

// ============================================================================
// HISTORY (UNDO / REDO) & AUTOSAVE
// ============================================================================

function pushUndoSnapshot(coalesce = true) {
  if (state.isRestoringHistory || !state.canvas) return;
  const now = Date.now();
  const nextSnap = safeCaptureSnapshot();
  if (!nextSnap) return;

  if (state.lastSnapshot && snapshotKey(state.lastSnapshot) !== snapshotKey(nextSnap)) {
    const shouldCoalesce = coalesce && now - state.lastMutateTime < 550 && state.undoStack.length > 0;
    if (!shouldCoalesce) {
      state.undoStack.push(state.lastSnapshot);
      if (state.undoStack.length > MAX_UNDO_STEPS) {
        state.undoStack.shift();
      }
    }
    state.redoStack = [];
  }

  state.lastSnapshot = nextSnap;
  state.lastMutateTime = now;
  updateUndoRedoButtons();
}

function scheduleAutosave() {
  clearTimeout(state.autosaveTimer);
  state.autosaveTimer = setTimeout(() => {
    saveCurrentPageDraft({ silent: true });
  }, AUTOSAVE_DELAY_MS);
}

async function flushAutosaveIfNeeded() {
  clearTimeout(state.autosaveTimer);
  state.autosaveTimer = null;
  if (state.currentPageDirty && state.canvas) {
    await saveCurrentPageDraft({ silent: true });
  }
}

async function saveCurrentPageDraft({ silent = false } = {}) {
  if (!state.canvas) return false;
  clearTimeout(state.autosaveTimer);
  state.autosaveTimer = null;

  try {
    const html = safeSerializeHtml();
    const meta = state.canvas.getMeta?.() || {};
    const existing = state.pageDrafts[state.currentPagePath];
    const entry = getPageEntry(state.currentPagePath);

    const draft = {
      html,
      title: meta.title || entry.title || '',
      description: meta.description || entry.description || '',
      label: existing?.label || entry.label,
      group: existing?.group || entry.group || inferPageGroup(state.currentPagePath),
      isNew: Boolean(existing?.isNew),
      deleted: false,
    };

    await savePageDraft(state.currentPagePath, draft);
    state.pageDrafts[state.currentPagePath] = draft;
    state.currentPageDirty = false;

    updateTopbarAndIndicators();
    renderPagesList();
    if (!state.selectedDescriptor) {
      renderPageSettingsInspector();
    }
    if (!silent) {
      showToast('Szkic strony został zapisany w przeglądarce.');
    }
    return true;
  } catch (err) {
    console.error('Błąd zapisu szkicu:', err);
    showToast('Nie udało się zapisać szkicu: ' + (err?.message || 'błąd zapisu'), 'error');
    return false;
  }
}

function handleCanvasMutate() {
  if (state.isRestoringHistory) return;
  state.currentPageDirty = true;
  pushUndoSnapshot(true);
  scheduleAutosave();
  updateTopbarAndIndicators();

  // Keep inspector fields synced if user edited directly inside the iframe
  if (state.canvas && state.selectedDescriptor) {
    const activeEl = document.activeElement;
    const inspectorHasFocus = activeEl && $('inspector-body')?.contains(activeEl);
    if (!inspectorHasFocus) {
      const fresh = normalizeDescriptor(state.canvas.getSelectedDescriptor?.());
      if (fresh && fresh.uid === state.selectedDescriptor.uid) {
        state.selectedDescriptor = fresh;
        syncInspectorTextFieldsFromDescriptor(fresh);
      }
    }
  }
}

function syncInspectorTextFieldsFromDescriptor(desc) {
  const body = $('inspector-body');
  if (!body || !desc) return;
  for (const field of desc.textFields || []) {
    const input = body.querySelector(`[data-field-key="${CSS.escape(String(field.key))}"]`);
    if (input && input !== document.activeElement && input.value !== (field.value ?? '')) {
      input.value = field.value ?? '';
    }
  }
}

const AI_READ_ONLY_TOOLS = new Set([
  'get_page_structure',
  'get_element_details',
  'list_pages',
  'search_images',
  'get_globals',
  'list_backups',
]);

function captureAiTurnCheckpoint() {
  return {
    id: `ai-cp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    pagePath: state.currentPagePath,
    canvasHtml: safeCaptureSnapshot(),
    pageDrafts: structuredClone(state.pageDrafts || {}),
    globalsDraft: state.globalsDraft ? structuredClone(state.globalsDraft) : null,
    restored: false,
  };
}

async function restoreAiTurnCheckpoint(checkpoint) {
  if (!checkpoint || checkpoint.restored || state.isPublishing) return false;
  checkpoint.restored = true;
  clearTimeout(state.autosaveTimer);
  state.autosaveTimer = null;

  // Usuń checkpoint ze stosu aiUndoStack (jeśli tam jest)
  const idx = state.aiUndoStack.indexOf(checkpoint);
  if (idx !== -1) state.aiUndoStack.splice(idx, 1);

  try {
    // 1. Zsynchronizuj szkice stron w IndexedDB do stanu sprzed tury AI
    const prevDrafts = checkpoint.pageDrafts || {};
    const currentKeys = new Set(Object.keys(state.pageDrafts || {}));
    const prevKeys = new Set(Object.keys(prevDrafts));

    for (const p of currentKeys) {
      if (!prevKeys.has(p)) {
        await deletePageDraft(p);
      }
    }
    for (const [p, draft] of Object.entries(prevDrafts)) {
      await savePageDraft(p, draft);
    }
    state.pageDrafts = structuredClone(prevDrafts);

    // 2. Zsynchronizuj ustawienia globalne (menu/stopka/dane firmy)
    if (checkpoint.globalsDraft) {
      const restoredGlobals = normalizeGlobalsObj(checkpoint.globalsDraft);
      await saveGlobalsDraft(restoredGlobals);
      state.globalsDraft = restoredGlobals;
    } else {
      await deleteGlobalsDraft();
      state.globalsDraft = null;
    }

    // 3. Przywróć podgląd bieżącej strony lub wróć na stronę sprzed tury AI
    if (state.currentPagePath === checkpoint.pagePath && state.canvas && checkpoint.canvasHtml) {
      state.isRestoringHistory = true;
      try {
        state.canvas.restoreSnapshot(checkpoint.canvasHtml);
        applyGlobalsPreview(getActiveGlobals());
        state.lastSnapshot = safeCaptureSnapshot();
        state.structure = normalizeStructure(state.canvas.getStructure?.());
        state.selectedDescriptor = normalizeDescriptor(state.canvas.getSelectedDescriptor?.());
        state.currentPageDirty = false;
      } finally {
        state.isRestoringHistory = false;
      }
      renderStructureTree();
      renderPagesList();
      renderInspector();
      updateTopbarAndIndicators();
    } else {
      state.currentPageDirty = false;
      await loadPage(checkpoint.pagePath, { skipFlush: true });
      applyGlobalsPreview(getActiveGlobals());
      renderPagesList();
      updateTopbarAndIndicators();
    }

    showToast('Cofnięto zmianę wykonaną przez Asystenta AI.');
    return true;
  } catch (err) {
    console.error('AI undo failed:', err);
    checkpoint.restored = false;
    showToast('Nie udało się cofnąć zmiany AI.', 'error');
    return false;
  }
}

async function performUndo() {
  if (state.isPublishing) return;

  // Jeśli bieżąca strona ma pusty stos (np. AI utworzyło nową stronę albo zmieniło tylko menu), cofnij całą ostatnią turę AI
  if ((!state.canvas || state.undoStack.length === 0) && state.aiUndoStack.length > 0) {
    const cp = state.aiUndoStack[state.aiUndoStack.length - 1];
    await restoreAiTurnCheckpoint(cp);
    return;
  }

  if (!state.canvas || state.undoStack.length === 0) return;
  const previousHtml = state.undoStack.pop();
  const currentSnap = safeCaptureSnapshot();
  if (currentSnap) {
    state.redoStack.push(currentSnap);
  }

  state.isRestoringHistory = true;
  try {
    state.canvas.restoreSnapshot(previousHtml);
    state.lastSnapshot = safeCaptureSnapshot();
    state.structure = normalizeStructure(state.canvas.getStructure?.());
    state.selectedDescriptor = normalizeDescriptor(state.canvas.getSelectedDescriptor?.());
    state.currentPageDirty = true;
    renderStructureTree();
    renderInspector();
    scheduleAutosave();
    updateTopbarAndIndicators();
    showToast('Cofnięto ostatnią zmianę.');
  } catch (err) {
    console.error('Undo failed:', err);
    showToast('Nie udało się cofnąć zmiany.', 'error');
  } finally {
    state.isRestoringHistory = false;
  }
}

function performRedo() {
  if (!state.canvas || state.redoStack.length === 0 || state.isPublishing) return;
  const nextHtml = state.redoStack.pop();
  const currentSnap = safeCaptureSnapshot();
  if (currentSnap) {
    state.undoStack.push(currentSnap);
  }

  state.isRestoringHistory = true;
  try {
    state.canvas.restoreSnapshot(nextHtml);
    state.lastSnapshot = safeCaptureSnapshot();
    state.structure = normalizeStructure(state.canvas.getStructure?.());
    state.selectedDescriptor = normalizeDescriptor(state.canvas.getSelectedDescriptor?.());
    state.currentPageDirty = true;
    renderStructureTree();
    renderInspector();
    scheduleAutosave();
    updateTopbarAndIndicators();
    showToast('Ponowiono zmianę.');
  } catch (err) {
    console.error('Redo failed:', err);
    showToast('Nie udało się ponowić zmiany.', 'error');
  } finally {
    state.isRestoringHistory = false;
  }
}

// ============================================================================
// PAGE LOADING INTO IFRAME
// ============================================================================

function setCanvasBrowseMode(enabled) {
  state.browseMode = Boolean(enabled);
  state.canvas?.setBrowseMode?.(state.browseMode);
  if (state.browseMode && state.uiMode === 'simple') {
    closeSimpleInspector();
  }
  const editBtn = $('btn-mode-edit');
  const browseBtn = $('btn-mode-browse');
  if (editBtn) {
    editBtn.classList.toggle('is-active', !state.browseMode);
    editBtn.setAttribute('aria-pressed', String(!state.browseMode));
  }
  if (browseBtn) {
    browseBtn.classList.toggle('is-active', state.browseMode);
    browseBtn.setAttribute('aria-pressed', String(state.browseMode));
  }
}

async function handleCanvasNavigate({ pagePath = null, hash = null, back = false, externalUrl = null } = {}) {
  if (externalUrl) {
    window.open(sanitizeUrl(externalUrl, { allowRelative: false }), '_blank', 'noopener,noreferrer');
    return;
  }

  if (back) {
    const prev = state.pageHistory.pop();
    if (prev) {
      await loadPage(prev, { fromHistory: true });
    } else if (state.currentPagePath !== 'index.html') {
      await loadPage('index.html', { fromHistory: true });
    }
    return;
  }

  if (!pagePath) return;
  const clean = String(pagePath).replace(/^\/+/, '');
  const all = getAllPagesMerged().filter((p) => !p.deleted);
  const matched =
    all.find((p) => p.path === clean) ||
    all.find((p) => p.path === `${clean.replace(/\/+$/, '')}/index.html`);

  if (!matched) {
    showToast(`Podstrona „${clean}” nie istnieje jeszcze w projekcie.`, 'warn');
    return;
  }

  if (matched.path === state.currentPagePath) {
    if (hash) {
      const targetEl = $('preview')?.contentDocument?.getElementById(hash);
      targetEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    return;
  }

  await loadPage(matched.path, { focusSectionId: hash || null });
}

async function loadPage(pagePath, { focusSectionId = null, skipFlush = false, fromHistory = false } = {}) {
  if (!skipFlush) {
    await flushAutosaveIfNeeded();
  }

  if (!fromHistory && state.currentPagePath && state.currentPagePath !== pagePath) {
    state.pageHistory.push(state.currentPagePath);
    if (state.pageHistory.length > 30) state.pageHistory.shift();
  }

  const seq = ++state.loadSeq;
  state.currentPagePath = pagePath;
  state.currentPageDirty = false;
  state.selectedDescriptor = null;
  state.structure = [];
  state.undoStack = [];
  state.redoStack = [];
  state.lastSnapshot = null;
  state.pendingInsertAfterUid = null;

  if (state.canvas) {
    try {
      state.canvas.destroy();
    } catch {
      // ignore teardown errors
    }
    state.canvas = null;
  }

  $('stage-loading').hidden = false;
  updateTopbarAndIndicators();
  renderPagesList();
  renderStructureTree();

  // Sync URL query param (?strona=...)
  try {
    const url = new URL(location.href);
    if (pagePath === 'index.html') url.searchParams.delete('strona');
    else url.searchParams.set('strona', pagePath);
    if (!focusSectionId) url.searchParams.delete('sekcja');
    history.replaceState(null, '', url.toString());
  } catch {
    // ignore history API errors
  }

  const frame = $('preview');
  const draft = state.pageDrafts[pagePath];

  await new Promise((resolve) => {
    const onLoad = () => resolve();
    frame.addEventListener('load', onLoad, { once: true });

    if (draft && !draft.deleted && typeof draft.html === 'string' && draft.html.trim()) {
      frame.removeAttribute('src');
      frame.srcdoc = injectCmsBaseTag(draft.html, pagePath);
    } else {
      frame.removeAttribute('srcdoc');
      const liveUrl = new URL('../' + pagePath, location.href);
      liveUrl.searchParams.set('_cms', String(Date.now()));
      frame.src = liveUrl.href;
    }
  });

  // Bail out if user switched to another page while loading
  if (seq !== state.loadSeq) return;

  try {
    const doc = frame.contentDocument;
    if (!doc || !doc.body) {
      throw new Error('Nie udało się odczytać dokumentu strony w podglądzie.');
    }

    state.canvas = connectCanvas(doc, {
      pagePath,
      browseMode: state.browseMode,
      pendingImages: getPendingImageUrlMap(),
      onSelect: handleCanvasSelect,
      onStructureChange: handleStructureChange,
      onMutate: handleCanvasMutate,
      onRequestImage: handleRequestImage,
      onRequestAddSection: handleRequestAddSection,
      onRequestAddItem: handleRequestAddItem,
      onNavigate: handleCanvasNavigate,
    });

    // Bind keyboard shortcuts inside iframe too
    frame.contentWindow?.addEventListener('keydown', handleGlobalKeydown);

    // Preview global draft changes without dirtying the page
    if (state.globalsDraft) {
      applyGlobalsPreview(state.globalsDraft);
    }

    state.structure = normalizeStructure(state.canvas.getStructure?.());
    state.lastSnapshot = safeCaptureSnapshot();

    renderStructureTree();
    renderInspector();
    updateTopbarAndIndicators();

    // Handle ?sekcja=... deep link
    if (focusSectionId) {
      const target = state.structure.find(
        (s) => s.id === focusSectionId || normalizeTextForSearch(s.id) === normalizeTextForSearch(focusSectionId)
      );
      if (target) {
        state.canvas.selectByUid(target.uid, { scroll: true });
      }
    }
  } catch (err) {
    console.error('Błąd połączenia z podglądem:', err);
    showToast('Nie udało się uruchomić edytora na tej stronie: ' + (err?.message || ''), 'error', 5000);
    $('structure-tree').innerHTML = `<div class="empty-state">Błąd ładowania strony. Spróbuj wybrać inną stronę z zakładki „Strony”.</div>`;
  } finally {
    if (seq === state.loadSeq) {
      $('stage-loading').hidden = true;
    }
  }
}

// ============================================================================
// CANVAS CALLBACKS
// ============================================================================

function handleCanvasSelect(payload) {
  let raw = payload;
  if (typeof payload === 'string') {
    raw = state.canvas?.getSelectedDescriptor?.() || null;
  } else if (payload && typeof payload === 'object' && 'descriptor' in payload) {
    raw = payload.descriptor;
  }

  state.selectedDescriptor = normalizeDescriptor(raw);
  $('btn-deselect').hidden = !state.selectedDescriptor;

  renderStructureTree();
  renderInspector();
  updateBlocksInsertBanner();

  if (state.uiMode === 'simple' && !state.ai.isRunning) {
    if (state.selectedDescriptor) {
      openSimpleInspector();
    } else {
      closeSimpleInspector();
    }
  }
}

function handleStructureChange(rawStructure) {
  state.structure = normalizeStructure(rawStructure || state.canvas?.getStructure?.());
  if (state.selectedDescriptor && state.canvas) {
    state.selectedDescriptor = normalizeDescriptor(state.canvas.getSelectedDescriptor?.());
  }
  renderStructureTree();
  renderInspector();
  updateBlocksInsertBanner();
}

function handleRequestImage(uidOrPayload) {
  const uid =
    typeof uidOrPayload === 'string'
      ? uidOrPayload
      : uidOrPayload?.uid || state.selectedDescriptor?.uid;
  if (!uid) return;

  openMediaDialog({
    mode: 'pick',
    onPick: (repoPath, previewUrl) => {
      if (!state.canvas) return;
      const relSrc = toRelativeUrl(repoPath, state.currentPagePath);
      state.canvas.updateImage(uid, {
        src: previewUrl || relSrc,
        rootPath: repoPath,
      });
      state.selectedDescriptor = normalizeDescriptor(state.canvas.getSelectedDescriptor?.());
      renderInspector();
      showToast('Podmieniono zdjęcie.');
    },
  });
}

function handleRequestAddSection(afterUid = null) {
  state.pendingInsertAfterUid = typeof afterUid === 'string' ? afterUid : null;
  openSimpleLeftDrawer('blocks', 'Dodaj sekcję');
  updateBlocksInsertBanner();
  $('blocks-search')?.focus();
}

function handleRequestAddItem(arg1, arg2) {
  let repeaterUid = arg1;
  let itemType = arg2;
  if (arg1 && typeof arg1 === 'object') {
    repeaterUid = arg1.repeaterUid || arg1.uid;
    itemType = arg1.itemType || arg1.type;
  }
  if (!state.canvas || !repeaterUid) return;
  try {
    state.canvas.insertItem(repeaterUid, itemType);
    state.expandedRepeaters.add(repeaterUid);
    handleStructureChange();
    showToast('Dodano nowy element.');
  } catch (err) {
    console.error('insertItem error:', err);
    showToast('Nie udało się dodać elementu.', 'error');
  }
}

// ============================================================================
// LEFT SIDEBAR: TABS
// ============================================================================

function switchSidebarTab(tabName) {
  state.activeTab = tabName;
  document.querySelectorAll('.sidebar-tab').forEach((btn) => {
    const active = btn.dataset.tab === tabName;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.sidebar-pane').forEach((pane) => {
    const active = pane.id === `tab-${tabName}`;
    pane.classList.toggle('is-active', active);
    pane.hidden = !active;
  });
}

// ============================================================================
// LEFT SIDEBAR TAB 1: STRUCTURE TREE (WITH DRAG & DROP + REPEATERS)
// ============================================================================

function renderStructureTree() {
  const container = $('structure-tree');
  if (!container) return;
  container.replaceChildren();

  if (!state.structure.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = state.canvas
      ? 'Brak sekcji na tej stronie. Kliknij „+ Dodaj nową sekcję” poniżej.'
      : 'Wczytywanie struktury strony…';
    container.append(empty);
    return;
  }

  const selectedUid = state.selectedDescriptor?.uid || null;

  state.structure.forEach((sec, secIndex) => {
    const card = document.createElement('div');
    card.className = 'tree-section';
    card.dataset.uid = sec.uid;
    card.draggable = true;
    if (sec.uid === selectedUid) card.classList.add('is-selected');
    if (sec.hidden) card.classList.add('is-hidden-node');

    // Drag & Drop handlers for reordering sections
    card.addEventListener('dragstart', (e) => {
      state.dragSectionUid = sec.uid;
      card.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', sec.uid);
    });

    card.addEventListener('dragend', () => {
      state.dragSectionUid = null;
      card.classList.remove('is-dragging');
      container.querySelectorAll('.drop-before, .drop-after').forEach((el) => {
        el.classList.remove('drop-before', 'drop-after');
      });
    });

    card.addEventListener('dragover', (e) => {
      if (!state.dragSectionUid || state.dragSectionUid === sec.uid) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = card.getBoundingClientRect();
      const isBefore = e.clientY < rect.top + rect.height / 2;
      card.classList.toggle('drop-before', isBefore);
      card.classList.toggle('drop-after', !isBefore);
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('drop-before', 'drop-after');
    });

    card.addEventListener('drop', (e) => {
      e.preventDefault();
      const draggedUid = state.dragSectionUid;
      const isBefore = card.classList.contains('drop-before');
      card.classList.remove('drop-before', 'drop-after');
      if (!draggedUid || draggedUid === sec.uid || !state.canvas) return;

      const fromIdx = state.structure.findIndex((s) => s.uid === draggedUid);
      let targetIdx = isBefore ? secIndex : secIndex + 1;
      if (fromIdx !== -1 && fromIdx < targetIdx) targetIdx -= 1;

      if (fromIdx !== targetIdx) {
        state.canvas.moveNodeToIndex(draggedUid, targetIdx);
        handleStructureChange();
        showToast('Zmieniono kolejność sekcji.');
      }
    });

    // Section header row
    const head = document.createElement('div');
    head.className = 'tree-section-head';

    const grip = document.createElement('span');
    grip.className = 'drag-grip';
    grip.textContent = '⠿';
    grip.title = 'Przeciągnij, aby zmienić kolejność';
    grip.setAttribute('aria-hidden', 'true');

    const selectBtn = document.createElement('button');
    selectBtn.type = 'button';
    selectBtn.className = 'tree-section-btn';
    selectBtn.addEventListener('click', () => {
      state.canvas?.selectByUid(sec.uid, { scroll: true });
    });

    const nameEl = document.createElement('span');
    nameEl.className = 'tree-section-name';
    nameEl.textContent = sec.label;

    const metaParts = [];
    if (sec.id) metaParts.push(`#${sec.id}`);
    if (sec.hidden) metaParts.push('ukryta');
    if (metaParts.length) {
      const metaEl = document.createElement('span');
      metaEl.className = 'tree-section-meta';
      metaEl.textContent = metaParts.join(' · ');
      selectBtn.append(nameEl, metaEl);
    } else {
      selectBtn.append(nameEl);
    }

    const actions = document.createElement('div');
    actions.className = 'tree-actions';

    const mkAction = (symbol, title, onClick, { disabled = false, danger = false } = {}) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `tiny-btn${danger ? ' is-danger' : ''}`;
      b.textContent = symbol;
      b.title = title;
      b.setAttribute('aria-label', title);
      b.disabled = disabled;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
      });
      return b;
    };

    actions.append(
      mkAction('↑', 'Przenieś sekcję wyżej', () => {
        state.canvas?.moveNode(sec.uid, -1);
        handleStructureChange();
      }, { disabled: !sec.canMoveUp }),
      mkAction('↓', 'Przenieś sekcję niżej', () => {
        state.canvas?.moveNode(sec.uid, 1);
        handleStructureChange();
      }, { disabled: !sec.canMoveDown }),
      mkAction(sec.hidden ? '🙈' : '👁', sec.hidden ? 'Pokaż sekcję' : 'Ukryj sekcję', () => {
        state.canvas?.toggleHidden(sec.uid);
        handleStructureChange();
      }),
      mkAction('⧉', 'Duplikuj sekcję', () => {
        state.canvas?.duplicateNode(sec.uid);
        handleStructureChange();
        showToast(`Zduplikowano sekcję „${sec.label}”.`);
      }),
      mkAction('🗑', 'Usuń sekcję', () => {
        state.canvas?.deleteNode(sec.uid);
        handleStructureChange();
        showToast(`Usunięto sekcję „${sec.label}” (Ctrl+Z aby cofnąć).`, 'warn');
      }, { danger: true })
    );

    head.append(grip, selectBtn, actions);
    card.append(head);

    // Repeaters inside section
    if (sec.repeaters.length > 0) {
      const repsWrap = document.createElement('div');
      repsWrap.className = 'tree-repeaters';

      for (const rep of sec.repeaters) {
        const repBox = document.createElement('div');
        const isExpanded =
          state.expandedRepeaters.has(rep.uid) ||
          rep.items.some((it) => it.uid === selectedUid);

        const repHead = document.createElement('div');
        repHead.className = 'repeater-group-head';

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'repeater-toggle';
        toggleBtn.textContent = `${isExpanded ? '▾' : '▸'} ${rep.label} (${rep.count})`;
        toggleBtn.addEventListener('click', () => {
          if (state.expandedRepeaters.has(rep.uid)) {
            state.expandedRepeaters.delete(rep.uid);
          } else {
            state.expandedRepeaters.add(rep.uid);
          }
          renderStructureTree();
        });

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'repeater-add-btn';
        addBtn.textContent = '+ Dodaj';
        addBtn.title = `Dodaj nowy element do: ${rep.label}`;
        addBtn.addEventListener('click', () => {
          handleRequestAddItem(rep.uid, rep.itemType);
        });

        repHead.append(toggleBtn, addBtn);
        repBox.append(repHead);

        if (isExpanded && rep.items.length > 0) {
          const itemsList = document.createElement('div');
          itemsList.className = 'repeater-items';

          for (const item of rep.items) {
            const row = document.createElement('div');
            row.className = `repeater-item-row${item.uid === selectedUid ? ' is-selected' : ''}`;

            const itemBtn = document.createElement('button');
            itemBtn.type = 'button';
            itemBtn.className = 'repeater-item-btn';
            itemBtn.textContent = item.hidden ? `${item.label} (ukryty)` : item.label;
            itemBtn.addEventListener('click', () => {
              state.canvas?.selectByUid(item.uid, { scroll: true });
            });

            const itemDup = mkAction('⧉', 'Duplikuj element', () => {
              state.canvas?.duplicateNode(item.uid);
              handleStructureChange();
              showToast('Zduplikowano element.');
            });
            const itemDel = mkAction('🗑', 'Usuń element', () => {
              state.canvas?.deleteNode(item.uid);
              handleStructureChange();
              showToast('Usunięto element (Ctrl+Z aby cofnąć).', 'warn');
            }, { danger: true });

            row.append(itemBtn, itemDup, itemDel);
            itemsList.append(row);
          }

          repBox.append(itemsList);
        }

        repsWrap.append(repBox);
      }

      card.append(repsWrap);
    }

    container.append(card);
  });
}

// ============================================================================
// LEFT SIDEBAR TAB 2: BLOCKS CATALOG (SECTION_TEMPLATES)
// ============================================================================

function renderBlocksCatalog() {
  const container = $('blocks-catalog');
  if (!container) return;
  container.replaceChildren();

  const q = normalizeTextForSearch(state.blocksQuery);
  const filtered = (SECTION_TEMPLATES || []).filter((tpl) => {
    if (!q) return true;
    const hay = normalizeTextForSearch(`${tpl.name} ${tpl.category} ${tpl.description}`);
    return hay.includes(q);
  });

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Nie znaleziono pasujących bloków.';
    container.append(empty);
    return;
  }

  // Group by category
  const groups = new Map();
  for (const tpl of filtered) {
    const cat = tpl.category || 'Gotowe sekcje';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(tpl);
  }

  for (const [catName, templates] of groups.entries()) {
    const groupEl = document.createElement('div');
    const heading = document.createElement('div');
    heading.className = 'block-category-title';
    heading.textContent = catName;

    const grid = document.createElement('div');
    grid.className = 'block-grid';

    for (const tpl of templates) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'block-card';
      card.addEventListener('click', () => insertSectionFromCatalog(tpl));

      const icon = document.createElement('span');
      icon.className = 'block-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = tpl.icon || '✦';

      const info = document.createElement('span');
      info.className = 'block-info';
      const title = document.createElement('strong');
      title.textContent = tpl.name;
      const desc = document.createElement('small');
      desc.textContent = tpl.description || '';

      info.append(title, desc);
      card.append(icon, info);
      grid.append(card);
    }

    groupEl.append(heading, grid);
    container.append(groupEl);
  }
}

function insertSectionFromCatalog(tpl) {
  if (!state.canvas) {
    showToast('Poczekaj na załadowanie strony przed dodaniem bloku.', 'warn');
    return;
  }

  const afterUid =
    state.pendingInsertAfterUid ||
    (state.selectedDescriptor?.isSection ? state.selectedDescriptor.uid : null);

  try {
    const insertedUid = state.canvas.insertSection(tpl.id, afterUid);
    state.pendingInsertAfterUid = null;
    handleStructureChange();
    if (typeof insertedUid === 'string' && insertedUid) {
      state.canvas.selectByUid(insertedUid, { scroll: true });
    }
    if (state.uiMode === 'simple') {
      closeSimpleLeftDrawer();
    } else {
      switchSidebarTab('structure');
    }
    showToast(`Dodano blok „${tpl.name}”.`);
  } catch (err) {
    console.error('insertSection error:', err);
    showToast('Nie udało się wstawić bloku: ' + (err?.message || ''), 'error');
  }
}

// ============================================================================
// LEFT SIDEBAR TAB 3: PAGES DIRECTORY
// ============================================================================

function renderPagesList() {
  const container = $('pages-list');
  if (!container) return;
  container.replaceChildren();

  const allPages = getAllPagesMerged();
  const q = normalizeTextForSearch(state.pagesQuery);
  const group = state.pagesFilterGroup;

  const filtered = allPages.filter((p) => {
    if (group === 'changed') {
      if (!p.isModified && !p.isNew && !p.deleted) return false;
    } else if (group === 'glowne') {
      if (p.group !== 'home' && p.group !== 'glowne') return false;
    } else if (group !== 'all') {
      if (p.group !== group) return false;
    }

    if (q) {
      const hay = normalizeTextForSearch(`${p.label} ${p.title} ${p.path}`);
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = group === 'changed'
      ? 'Brak zmienionych stron w szkicu.'
      : 'Brak stron pasujących do wyszukiwania.';
    container.append(empty);
    return;
  }

  for (const page of filtered) {
    const row = document.createElement('div');
    row.className = 'page-row';
    row.setAttribute('role', 'listitem');
    if (page.path === state.currentPagePath) row.classList.add('is-active');
    if (page.deleted) row.classList.add('is-deleted');

    const mainBtn = document.createElement('button');
    mainBtn.type = 'button';
    mainBtn.className = 'page-row-main';
    mainBtn.disabled = page.deleted;
    mainBtn.addEventListener('click', () => {
      if (state.uiMode === 'simple') closeSimpleLeftDrawer();
      if (page.path !== state.currentPagePath) {
        switchSidebarTab('structure');
        loadPage(page.path);
      } else {
        switchSidebarTab('structure');
      }
    });

    const titleRow = document.createElement('span');
    titleRow.className = 'page-row-title';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = page.label;
    titleRow.append(nameSpan);

    if (page.deleted) {
      const b = document.createElement('span');
      b.className = 'badge-pill badge-deleted';
      b.textContent = 'Do usunięcia';
      titleRow.append(b);
    } else if (page.isNew) {
      const b = document.createElement('span');
      b.className = 'badge-pill badge-new';
      b.textContent = 'Nowa';
      titleRow.append(b);
    } else if (page.isModified) {
      const b = document.createElement('span');
      b.className = 'badge-pill badge-draft';
      b.textContent = 'Szkic';
      titleRow.append(b);
    }

    const pathSpan = document.createElement('span');
    pathSpan.className = 'page-row-path';
    pathSpan.textContent = page.path;

    mainBtn.append(titleRow, pathSpan);
    row.append(mainBtn);

    // Delete / Restore action for non-core pages or newly created pages
    if (page.deleted) {
      const restoreBtn = document.createElement('button');
      restoreBtn.type = 'button';
      restoreBtn.className = 'tiny-btn';
      restoreBtn.textContent = '↺';
      restoreBtn.title = 'Przywróć stronę';
      restoreBtn.addEventListener('click', async () => {
        await deletePageDraft(page.path);
        delete state.pageDrafts[page.path];
        renderPagesList();
        updateTopbarAndIndicators();
        showToast(`Przywrócono stronę „${page.label}”.`);
      });
      row.append(restoreBtn);
    } else if (page.isNew || !CORE_PROTECTED_PAGES.has(page.path)) {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'tiny-btn is-danger';
      delBtn.textContent = '🗑';
      delBtn.title = page.isNew ? 'Usuń nową stronę ze szkicu' : 'Oznacz stronę do usunięcia przy publikacji';
      delBtn.addEventListener('click', () => handleDeletePageRequest(page));
      row.append(delBtn);
    }

    container.append(row);
  }
}

async function handleDeletePageRequest(page) {
  const msg = page.isNew
    ? `Czy usunąć nowo utworzoną stronę „${page.label}” (${page.path}) ze szkicu?`
    : `Czy oznaczyć podstronę „${page.label}” (${page.path}) do usunięcia przy najbliższej publikacji?`;
  if (!window.confirm(msg)) return;

  if (page.isNew) {
    await deletePageDraft(page.path);
    delete state.pageDrafts[page.path];
    showToast(`Usunięto nową stronę „${page.label}”.`, 'warn');
  } else {
    const deletedDraft = {
      html: '',
      title: page.title,
      description: page.description,
      label: page.label,
      group: page.group,
      isNew: false,
      deleted: true,
    };
    await savePageDraft(page.path, deletedDraft);
    state.pageDrafts[page.path] = deletedDraft;
    showToast(`Oznaczono stronę „${page.label}” do usunięcia.`, 'warn');
  }

  if (state.currentPagePath === page.path) {
    await loadPage('index.html', { skipFlush: true });
  } else {
    renderPagesList();
    updateTopbarAndIndicators();
  }
}

// ============================================================================
// RIGHT PANEL: CONTEXTUAL INSPECTOR
// ============================================================================

function renderInspector() {
  if (state.selectedDescriptor) {
    renderElementInspector(state.selectedDescriptor);
  } else {
    renderPageSettingsInspector();
  }
}

function renderElementInspector(desc) {
  const header = $('inspector-header');
  header.innerHTML = '';
  const kicker = document.createElement('span');
  kicker.className = 'inspector-kicker';
  kicker.textContent = desc.kindLabel;
  const titleEl = document.createElement('h2');
  titleEl.textContent = desc.title;
  header.append(kicker, titleEl);

  const body = $('inspector-body');
  body.replaceChildren();

  // 1. Quick Actions Bar
  const actionsSec = document.createElement('div');
  actionsSec.className = 'inspector-section';

  const qaBar = document.createElement('div');
  qaBar.className = 'quick-actions-bar';

  const mkQa = (label, title, onClick, { disabled = false, active = false, danger = false } = {}) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `qa-btn${active ? ' is-active' : ''}${danger ? ' is-danger' : ''}`;
    btn.textContent = label;
    btn.title = title;
    btn.disabled = disabled;
    btn.addEventListener('click', onClick);
    return btn;
  };

  qaBar.append(
    mkQa('↑', 'Przesuń wyżej / w lewo', () => {
      state.canvas?.moveNode(desc.uid, -1);
      handleStructureChange();
    }, { disabled: !desc.canMoveUp }),
    mkQa('↓', 'Przesuń niżej / w prawo', () => {
      state.canvas?.moveNode(desc.uid, 1);
      handleStructureChange();
    }, { disabled: !desc.canMoveDown }),
    mkQa('⧉', 'Duplikuj element', () => {
      state.canvas?.duplicateNode(desc.uid);
      handleStructureChange();
      showToast('Zduplikowano element.');
    }, { disabled: !desc.canDuplicate }),
    mkQa(desc.hidden ? 'Pokaż' : 'Ukryj', desc.hidden ? 'Pokaż element na stronie' : 'Ukryj element', () => {
      state.canvas?.toggleHidden(desc.uid);
      handleStructureChange();
    }, { active: desc.hidden }),
    mkQa('🗑', 'Usuń element', () => {
      state.canvas?.deleteNode(desc.uid);
      handleStructureChange();
      showToast('Usunięto element (Ctrl+Z aby cofnąć).', 'warn');
    }, { disabled: !desc.canDelete, danger: true })
  );

  actionsSec.append(qaBar);

  // Quick-add buttons for repeaters inside this section OR sibling item inside a repeater
  if (desc.childRepeaters.length > 0 || desc.repeaterUid) {
    const stack = document.createElement('div');
    stack.className = 'btn-stack';

    for (const rep of desc.childRepeaters) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-primary btn-full';
      btn.textContent = `+ Dodaj: ${rep.label}`;
      btn.addEventListener('click', () => handleRequestAddItem(rep.uid, rep.itemType));
      stack.append(btn);
    }

    if (desc.repeaterUid) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-secondary btn-full';
      btn.textContent = '+ Dodaj kolejny element obok';
      btn.addEventListener('click', () => handleRequestAddItem(desc.repeaterUid, desc.itemType));
      stack.append(btn);
    }

    actionsSec.append(stack);
  }

  body.append(actionsSec);

  // 2. Text Fields
  if (desc.textFields.length > 0) {
    const textSec = document.createElement('div');
    textSec.className = 'inspector-section';

    const secTitle = document.createElement('div');
    secTitle.className = 'inspector-section-title';
    secTitle.textContent = 'Treść tekstowa';
    textSec.append(secTitle);

    for (const field of desc.textFields) {
      const group = document.createElement('div');
      group.className = 'field-group';

      const label = document.createElement('label');
      label.className = 'field-label';
      label.textContent = field.label || field.key;

      const val = String(field.value ?? '');
      const isMultiline = Boolean(field.multiline) || val.length > 70 || val.includes('\n');
      const control = document.createElement(isMultiline ? 'textarea' : 'input');
      if (!isMultiline) control.type = 'text';
      else control.rows = val.length > 180 ? 4 : 3;
      control.className = 'input-field';
      control.value = val;
      control.dataset.fieldKey = String(field.key);
      if (field.placeholder) control.placeholder = field.placeholder;

      control.addEventListener('input', () => {
        state.canvas?.updateField(desc.uid, field.key, control.value);
      });

      group.append(label, control);
      textSec.append(group);
    }

    body.append(textSec);
  }

  // 3. Image Editor
  if (desc.image) {
    const imgSec = document.createElement('div');
    imgSec.className = 'inspector-section';

    const secTitle = document.createElement('div');
    secTitle.className = 'inspector-section-title';
    secTitle.textContent = 'Zdjęcie';
    imgSec.append(secTitle);

    const card = document.createElement('div');
    card.className = 'inspector-card';

    const previewBox = document.createElement('div');
    previewBox.className = 'image-preview-box';
    const previewImg = document.createElement('img');
    const rootPath = desc.image.rootPath || toRootPath(desc.image.src || '', state.currentPagePath);
    previewImg.src = desc.image.resolvedSrc || desc.image.previewSrc || resolveRepoImageUrl(rootPath) || desc.image.src || '';
    previewImg.alt = desc.image.alt || '';
    previewBox.append(previewImg);

    const pickBtn = document.createElement('button');
    pickBtn.type = 'button';
    pickBtn.className = 'btn-primary btn-full';
    pickBtn.textContent = 'Wybierz lub wgraj zdjęcie';
    pickBtn.addEventListener('click', () => handleRequestImage(desc.uid));

    const altGroup = document.createElement('div');
    altGroup.className = 'field-group';
    const altLabel = document.createElement('label');
    altLabel.className = 'field-label';
    altLabel.textContent = 'Opis zdjęcia (alt dla SEO)';
    const altInput = document.createElement('input');
    altInput.type = 'text';
    altInput.className = 'input-field';
    altInput.value = desc.image.alt || '';
    altInput.placeholder = 'Krótki opis tego, co widać na zdjęciu';
    altInput.addEventListener('input', () => {
      state.canvas?.updateImage(desc.uid, { alt: altInput.value });
    });
    altGroup.append(altLabel, altInput);

    card.append(previewBox, pickBtn, altGroup);
    imgSec.append(card);
    body.append(imgSec);
  }

  // 4. Links Editor
  if (desc.links.length > 0) {
    const linkSec = document.createElement('div');
    linkSec.className = 'inspector-section';

    const secTitle = document.createElement('div');
    secTitle.className = 'inspector-section-title';
    secTitle.textContent = desc.links.length > 1 ? 'Odnośniki i przyciski' : 'Odnośnik (link)';
    linkSec.append(secTitle);

    desc.links.forEach((lnk, idx) => {
      const card = document.createElement('div');
      card.className = 'inspector-card';

      if (desc.links.length > 1) {
        const sub = document.createElement('strong');
        sub.style.fontSize = '12px';
        sub.textContent = lnk.label || `Odnośnik #${idx + 1}`;
        card.append(sub);
      }

      const targetUid = lnk.uid || desc.uid;
      const isCardSelfLink = desc.links.length === 1 && String(desc.tag || '').toLowerCase() === 'a' && desc.textFields.length > 0;
      const showText = !isCardSelfLink && lnk.editable !== false && typeof lnk.text === 'string' && !desc.textFields.some((f) => f.key === lnk.key);

      const picker = createPageLinkControl({
        currentHref: lnk.href || '',
        currentTarget: lnk.target || '',
        currentText: lnk.text || '',
        showTextInput: showText,
        showTargetCheckbox: true,
        pagePathForRelative: state.currentPagePath,
        onChange: ({ href, target, text }) => {
          const payload = { href, target };
          if (showText) payload.text = text;
          if (lnk.key !== undefined) payload.key = lnk.key;
          if (lnk.index !== undefined) payload.index = lnk.index;
          state.canvas?.updateLink(targetUid, payload);
        },
      });

      card.append(picker);

      // Szybkie przejście do podpiętej podstrony bezpośrednio z Inspektora
      const resolvedLinkTarget = toRootPath(String(lnk.href || '').split('#')[0], state.currentPagePath);
      const linkHash = String(lnk.href || '').includes('#') ? String(lnk.href).split('#')[1] : null;
      const linkedPage = resolvedLinkTarget
        ? getAllPagesMerged().find((p) => !p.deleted && p.path === resolvedLinkTarget)
        : null;
      if (linkedPage && linkedPage.path !== state.currentPagePath) {
        const jumpBtn = document.createElement('button');
        jumpBtn.type = 'button';
        jumpBtn.className = 'btn-secondary mini-btn btn-full';
        jumpBtn.style.marginTop = '0.45rem';
        jumpBtn.textContent = `↗ Otwórz „${linkedPage.label}” w edytorze`;
        jumpBtn.addEventListener('click', () => {
          closeSimpleInspector();
          loadPage(linkedPage.path, { focusSectionId: linkHash || null });
        });
        card.append(jumpBtn);
      }

      linkSec.append(card);
    });

    body.append(linkSec);
  }

  // 5. Stars (Reviews / Testimonials)
  if (desc.stars !== null) {
    const starSec = document.createElement('div');
    starSec.className = 'inspector-section';

    const secTitle = document.createElement('div');
    secTitle.className = 'inspector-section-title';
    secTitle.textContent = 'Ocena (gwiazdki)';
    starSec.append(secTitle);

    const picker = document.createElement('div');
    picker.className = 'stars-picker';
    for (let n = 1; n <= 5; n += 1) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `star-btn${n <= desc.stars ? ' is-filled' : ''}`;
      btn.textContent = '★';
      btn.title = `${n} z 5 gwiazdek`;
      btn.addEventListener('click', () => {
        state.canvas?.updateStars(desc.uid, n);
        state.selectedDescriptor = normalizeDescriptor(state.canvas?.getSelectedDescriptor?.());
        renderInspector();
      });
      picker.append(btn);
    }

    starSec.append(picker);
    body.append(starSec);
  }

  // 6. Progressive Disclosure: Section Style, Anchor ID & Add paragraph / list-item helpers
  if (desc.isSection || desc.supportsTextBlocks) {
    const advSec = document.createElement('div');
    advSec.className = 'inspector-section';

    const details = document.createElement('details');
    details.className = 'inspector-advanced';
    const summary = document.createElement('summary');
    summary.textContent = desc.isSection ? 'Opcje zaawansowane (wygląd, kotwica)' : 'Opcje zaawansowane';
    const advBody = document.createElement('div');
    advBody.className = 'inspector-advanced-body';

    if (desc.isSection) {
      const styleState = desc.sectionStyle || { tone: 'default', align: 'default', spacing: 'default' };
      const applyStylePatch = (patch) => {
        state.canvas?.updateSectionStyle?.(desc.uid, patch);
        state.selectedDescriptor = normalizeDescriptor(state.canvas?.getSelectedDescriptor?.());
        renderInspector();
        showToast('Zaktualizowano wygląd sekcji.');
      };

      const mkSelectGroup = (labelText, value, options, onChange) => {
        const g = document.createElement('div');
        g.className = 'field-group';
        const l = document.createElement('label');
        l.className = 'field-label';
        l.textContent = labelText;
        const sel = document.createElement('select');
        sel.className = 'input-field';
        for (const [val, lbl] of options) {
          const opt = document.createElement('option');
          opt.value = val;
          opt.textContent = lbl;
          if (val === value) opt.selected = true;
          sel.append(opt);
        }
        sel.addEventListener('change', () => onChange(sel.value));
        g.append(l, sel);
        return g;
      };

      advBody.append(
        mkSelectGroup(
          'Tło sekcji',
          styleState.tone || 'default',
          [
            ['default', 'Domyślne (z szablonu)'],
            ['light', 'Jasne'],
            ['dark', 'Ciemne'],
            ['accent', 'Akcent marki'],
          ],
          (tone) => applyStylePatch({ tone })
        ),
        mkSelectGroup(
          'Wyrównanie tekstu',
          styleState.align || 'default',
          [
            ['default', 'Domyślne'],
            ['left', 'Do lewej'],
            ['center', 'Wyśrodkowane'],
          ],
          (align) => applyStylePatch({ align })
        ),
        mkSelectGroup(
          'Odstępy pionowe',
          styleState.spacing || 'default',
          [
            ['default', 'Domyślne'],
            ['compact', 'Zwarte'],
            ['spacious', 'Przestronne'],
          ],
          (spacing) => applyStylePatch({ spacing })
        )
      );

      const idGroup = document.createElement('div');
      idGroup.className = 'field-group';
      const idLabel = document.createElement('label');
      idLabel.className = 'field-label';
      idLabel.textContent = 'Kotwica / ID sekcji (np. promocja)';
      const idInput = document.createElement('input');
      idInput.type = 'text';
      idInput.className = 'input-field';
      idInput.value = desc.sectionId || '';
      idInput.placeholder = 'opcjonalne-id-sekcji';
      idInput.addEventListener('change', () => {
        const clean = slugifyPath(idInput.value);
        idInput.value = clean;
        state.canvas?.updateSectionId(desc.uid, clean);
        handleStructureChange();
      });
      idGroup.append(idLabel, idInput);
      advBody.append(idGroup);
    }

    if (desc.supportsTextBlocks) {
      const row = document.createElement('div');
      row.className = 'btn-row-2';

      const addP = document.createElement('button');
      addP.type = 'button';
      addP.className = 'btn-secondary';
      addP.textContent = '+ Akapit';
      addP.addEventListener('click', () => {
        state.canvas?.insertBlockInside(desc.uid, 'paragraph');
        handleStructureChange();
        showToast('Dodano nowy akapit.');
      });

      const addLi = document.createElement('button');
      addLi.type = 'button';
      addLi.className = 'btn-secondary';
      addLi.textContent = '+ Punkt listy';
      addLi.addEventListener('click', () => {
        state.canvas?.insertBlockInside(desc.uid, 'list-item');
        handleStructureChange();
        showToast('Dodano punkt listy.');
      });

      row.append(addP, addLi);
      advBody.append(row);
    }

    details.append(summary, advBody);
    advSec.append(details);
    body.append(advSec);
  }
}

function renderPageSettingsInspector() {
  const entry = getPageEntry(state.currentPagePath);
  const meta = state.canvas?.getMeta?.() || {
    title: entry.title || '',
    description: entry.description || '',
  };

  const header = $('inspector-header');
  header.innerHTML = '';
  const kicker = document.createElement('span');
  kicker.className = 'inspector-kicker';
  kicker.textContent = 'Ustawienia bieżącej strony';
  const titleEl = document.createElement('h2');
  titleEl.textContent = entry.label;
  header.append(kicker, titleEl);

  const body = $('inspector-body');
  body.replaceChildren();

  // SEO Section
  const seoSec = document.createElement('div');
  seoSec.className = 'inspector-section';

  const seoTitle = document.createElement('div');
  seoTitle.className = 'inspector-section-title';
  seoTitle.textContent = 'Wygląd strony w Google';
  seoSec.append(seoTitle);

  // Page Title
  const tGroup = document.createElement('div');
  tGroup.className = 'field-group';
  const tHead = document.createElement('div');
  tHead.className = 'field-label-row';
  const tLabel = document.createElement('label');
  tLabel.className = 'field-label';
  tLabel.textContent = 'Tytuł strony w Google';
  const tCount = document.createElement('span');
  tCount.className = 'char-counter';
  const tInput = document.createElement('input');
  tInput.type = 'text';
  tInput.className = 'input-field';
  tInput.value = meta.title || '';

  const updateTitleCounter = () => {
    const len = tInput.value.length;
    tCount.textContent = `${len} / 65`;
    tCount.classList.toggle('is-warn', len > 65 || len === 0);
  };
  updateTitleCounter();

  // Page Description
  const dGroup = document.createElement('div');
  dGroup.className = 'field-group';
  const dHead = document.createElement('div');
  dHead.className = 'field-label-row';
  const dLabel = document.createElement('label');
  dLabel.className = 'field-label';
  dLabel.textContent = 'Krótki opis w Google';
  const dCount = document.createElement('span');
  dCount.className = 'char-counter';
  const dInput = document.createElement('textarea');
  dInput.className = 'input-field';
  dInput.rows = 3;
  dInput.value = meta.description || '';

  const updateDescCounter = () => {
    const len = dInput.value.length;
    dCount.textContent = `${len} / 160`;
    dCount.classList.toggle('is-warn', len > 165);
  };
  updateDescCounter();

  const applyMeta = () => {
    updateTitleCounter();
    updateDescCounter();
    state.canvas?.setMeta({ title: tInput.value, description: dInput.value });
    state.currentPageDirty = true;
    scheduleAutosave();
    updateTopbarAndIndicators();
  };

  tInput.addEventListener('input', applyMeta);
  dInput.addEventListener('input', applyMeta);

  tHead.append(tLabel, tCount);
  tGroup.append(tHead, tInput);
  dHead.append(dLabel, dCount);
  dGroup.append(dHead, dInput);
  seoSec.append(tGroup, dGroup);
  body.append(seoSec);

  // Status Card
  const statusSec = document.createElement('div');
  statusSec.className = 'inspector-section';
  const stTitle = document.createElement('div');
  stTitle.className = 'inspector-section-title';
  stTitle.textContent = 'Status zmian';
  statusSec.append(stTitle);

  const counts = getTotalPendingChanges();
  const statusCard = document.createElement('div');
  statusCard.className = 'status-summary-card';

  const draftSummaryParts = [];
  if (counts.modifiedPages) draftSummaryParts.push(`${counts.modifiedPages} zmodyfik. stron`);
  if (counts.newPages) draftSummaryParts.push(`${counts.newPages} nowych stron`);
  if (counts.deletedPages) draftSummaryParts.push(`${counts.deletedPages} do usunięcia`);
  if (counts.imagesCount) draftSummaryParts.push(`${counts.imagesCount} wgranych zdjęć`);
  if (counts.hasGlobals) draftSummaryParts.push('ustawienia globalne');

  const stDraft = document.createElement('div');
  stDraft.className = 'status-item';
  stDraft.innerHTML = `<strong>Szkic lokalny</strong><p>${
    counts.total === 0
      ? 'Brak niezopublikowanych zmian.'
      : draftSummaryParts.join(' · ') || 'Niezapisane zmiany w edytorze.'
  }</p>`;

  const stLive = document.createElement('div');
  stLive.className = 'status-item';
  stLive.innerHTML = `<strong>Ostatnia wersja publiczna</strong><p>${formatDateTimePl(
    state.manifest.generatedAt
  )} · tryb: ${config.mode === 'hosting' ? 'Hosting PHP' : 'GitHub Pages'}</p>`;

  statusCard.append(stDraft, stLive);
  statusSec.append(statusCard);
  body.append(statusSec);

  // Calming Safety & Support Quick Card
  const safetySec = document.createElement('div');
  safetySec.className = 'inspector-section';
  const safetyCard = document.createElement('div');
  safetyCard.className = 'safety-quick-card';

  const safetyHead = document.createElement('strong');
  safetyHead.textContent = 'Bezpieczeństwo i pomoc';
  const safetyNote = document.createElement('p');
  safetyNote.textContent =
    'Oryginalna wersja strony jest zawsze bezpieczna. W każdej chwili możesz ją przywrócić albo zadzwonić po pomoc.';

  const safetyBtns = document.createElement('div');
  safetyBtns.className = 'btn-stack';

  const openBackupsBtn = document.createElement('button');
  openBackupsBtn.type = 'button';
  openBackupsBtn.className = 'btn-secondary btn-full';
  openBackupsBtn.textContent = '🛡️ Kopie zapasowe i oryginał';
  openBackupsBtn.addEventListener('click', openBackupsDialog);

  const openSupportBtn = document.createElement('button');
  openSupportBtn.type = 'button';
  openSupportBtn.className = 'btn-secondary btn-full';
  openSupportBtn.textContent = '📞 Zadzwoń po pomoc';
  openSupportBtn.addEventListener('click', openSupportDialog);

  safetyBtns.append(openBackupsBtn, openSupportBtn);
  safetyCard.append(safetyHead, safetyNote, safetyBtns);
  safetySec.append(safetyCard);
  body.append(safetySec);

  // Advanced local draft tools (only in Admin/Advanced Mode — klient nie importuje plików .json)
  if (state.uiMode !== 'simple') {
    const backupSec = document.createElement('div');
    backupSec.className = 'inspector-section';

    const advDetails = document.createElement('details');
    advDetails.className = 'inspector-advanced';
    const advSummary = document.createElement('summary');
    advSummary.textContent = 'Narzędzia zaawansowane';

    const bkStack = document.createElement('div');
    bkStack.className = 'inspector-advanced-body';

    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'btn-secondary btn-full';
    exportBtn.textContent = 'Pobierz szkic do pliku (.json)';
    exportBtn.addEventListener('click', handleExportBackup);

    const importBtn = document.createElement('button');
    importBtn.type = 'button';
    importBtn.className = 'btn-secondary btn-full';
    importBtn.textContent = 'Wczytaj szkic z pliku (.json)';
    importBtn.addEventListener('click', () => $('import-backup-input').click());

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'mini-btn mini-btn-danger btn-full';
    clearBtn.style.height = '34px';
    clearBtn.style.justifyContent = 'center';
    clearBtn.textContent = 'Wyczyść cały szkic';
    clearBtn.disabled = counts.total === 0;
    clearBtn.addEventListener('click', handleClearAllDrafts);

    bkStack.append(exportBtn, importBtn, clearBtn);
    advDetails.append(advSummary, bkStack);
    backupSec.append(advDetails);
    body.append(backupSec);
  }
}

// Reusable searchable page link picker control
function createPageLinkControl({
  currentHref = '',
  currentTarget = '',
  currentText = '',
  showTextInput = false,
  showTargetCheckbox = true,
  pagePathForRelative = 'index.html',
  onChange,
}) {
  const wrap = document.createElement('div');
  wrap.className = 'btn-stack';

  let stateHref = currentHref;
  let stateTarget = currentTarget;
  let stateText = currentText;

  const emit = () => {
    onChange({ href: stateHref, target: stateTarget, text: stateText });
  };

  if (showTextInput) {
    const txtGroup = document.createElement('div');
    txtGroup.className = 'field-group';
    const txtLabel = document.createElement('label');
    txtLabel.className = 'field-label';
    txtLabel.textContent = 'Tekst przycisku / linku';
    const txtInput = document.createElement('input');
    txtInput.type = 'text';
    txtInput.className = 'input-field';
    txtInput.value = stateText;
    txtInput.addEventListener('input', () => {
      stateText = txtInput.value;
      emit();
    });
    txtGroup.append(txtLabel, txtInput);
    wrap.append(txtGroup);
  }

  // Searchable page selector
  const pickerGroup = document.createElement('div');
  pickerGroup.className = 'field-group page-picker-combo';
  const pickerLabel = document.createElement('label');
  pickerLabel.className = 'field-label';
  pickerLabel.textContent = 'Wybierz podstronę z witryny';

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'input-field';
  searchInput.placeholder = 'Wpisz nazwę podstrony, np. Okna PCV…';

  // Pre-fill friendly label if href matches a known page
  const allPages = getAllPagesMerged().filter((p) => !p.deleted);
  const currentRoot = toRootPath(stateHref, pagePathForRelative);
  const matchedPage = allPages.find((p) => p.path === currentRoot);
  if (matchedPage) {
    searchInput.value = `${matchedPage.label} (${matchedPage.path})`;
  }

  const dropdown = document.createElement('div');
  dropdown.className = 'page-picker-dropdown';
  dropdown.hidden = true;

  const hrefInput = document.createElement('input');

  const renderOptions = (filterText = '') => {
    dropdown.replaceChildren();
    const q = normalizeTextForSearch(filterText);
    const matches = allPages
      .filter((p) => {
        if (!q) return true;
        return normalizeTextForSearch(`${p.label} ${p.path}`).includes(q);
      })
      .slice(0, 30);

    if (!matches.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.style.padding = '0.6rem';
      empty.textContent = 'Brak pasujących podstron';
      dropdown.append(empty);
      return;
    }

    for (const p of matches) {
      const opt = document.createElement('button');
      opt.type = 'button';
      opt.className = 'page-picker-option';
      const st = document.createElement('strong');
      st.textContent = p.label;
      const sm = document.createElement('small');
      sm.textContent = p.path;
      opt.append(st, sm);
      opt.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const computed =
          pagePathForRelative === '__root__'
            ? p.path
            : toRelativeUrl(p.path, pagePathForRelative);
        stateHref = computed;
        hrefInput.value = computed;
        searchInput.value = `${p.label} (${p.path})`;
        dropdown.hidden = true;
        emit();
      });
      dropdown.append(opt);
    }
  };

  searchInput.addEventListener('focus', () => {
    renderOptions('');
    dropdown.hidden = false;
  });
  searchInput.addEventListener('input', () => {
    renderOptions(searchInput.value);
    dropdown.hidden = false;
  });
  searchInput.addEventListener('blur', () => {
    setTimeout(() => {
      dropdown.hidden = true;
    }, 150);
  });

  pickerGroup.append(pickerLabel, searchInput, dropdown);
  wrap.append(pickerGroup);

  // Manual URL input
  const urlGroup = document.createElement('div');
  urlGroup.className = 'field-group';
  const urlLabel = document.createElement('label');
  urlLabel.className = 'field-label';
  urlLabel.textContent = 'Adres URL / kotwica / tel: / mailto:';
  hrefInput.type = 'text';
  hrefInput.className = 'input-field';
  hrefInput.value = stateHref;
  hrefInput.placeholder = 'np. oferta/index.html, #kontakt, tel:+48534091021';
  hrefInput.addEventListener('input', () => {
    stateHref = hrefInput.value.trim();
    emit();
  });
  urlGroup.append(urlLabel, hrefInput);
  wrap.append(urlGroup);

  if (showTargetCheckbox) {
    const targetRow = document.createElement('label');
    targetRow.className = 'checkbox-row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = stateTarget === '_blank';
    cb.addEventListener('change', () => {
      stateTarget = cb.checked ? '_blank' : '';
      emit();
    });
    const span = document.createElement('span');
    span.textContent = 'Otwórz w nowej karcie';
    targetRow.append(cb, span);
    wrap.append(targetRow);
  }

  return wrap;
}

// ============================================================================
// BACKUP EXPORT / IMPORT / CLEAR / DISCARD PAGE
// ============================================================================

async function handleExportBackup() {
  await flushAutosaveIfNeeded();
  try {
    const json = await exportBackup();
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `wolbud-kopia-${dateStr}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Wyeksportowano kopię zapasową szkicu.');
  } catch (err) {
    console.error(err);
    showToast('Nie udało się wyeksportować kopii.', 'error');
  }
}

async function handleImportBackupFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const res = await importBackup(text);
    state.pageDrafts = await getAllPageDrafts();
    state.pendingImages = await getAllPendingImages();
    state.globalsDraft = await getGlobalsDraft();

    showToast(
      `Zaimportowano kopię: ${res.pagesCount} stron, ${res.imagesCount} zdjęć${res.hasGlobals ? ', ustawienia globalne' : ''}.`
    );
    await loadPage(state.currentPagePath, { skipFlush: true });
  } catch (err) {
    console.error(err);
    showToast('Błąd importu kopii: ' + (err?.message || 'nieprawidłowy plik JSON'), 'error', 5000);
  }
}

async function handleClearAllDrafts() {
  if (
    !window.confirm(
      'Czy na pewno usunąć WSZYSTKIE niezopublikowane zmiany (strony, zdjęcia i ustawienia menu)? Tej operacji nie można cofnąć.'
    )
  ) {
    return;
  }
  await clearAllDrafts();
  state.pageDrafts = {};
  state.pendingImages = {};
  state.globalsDraft = null;
  state.currentPageDirty = false;
  showToast('Wyczyszczono cały szkic lokalny.', 'warn');
  const existsInLive = state.manifest.pages.some((p) => p.path === state.currentPagePath);
  await loadPage(existsInLive ? state.currentPagePath : 'index.html', { skipFlush: true });
}

async function handleDiscardCurrentPage() {
  const draft = state.pageDrafts[state.currentPagePath];
  const isNew = Boolean(draft?.isNew);
  const msg = isNew
    ? 'Czy na pewno usunąć tę nowo utworzoną podstronę ze szkicu?'
    : 'Czy odrzucić wszystkie niezopublikowane zmiany na tej stronie i przywrócić wersję opublikowaną?';
  if (!window.confirm(msg)) return;

  clearTimeout(state.autosaveTimer);
  await deletePageDraft(state.currentPagePath);
  delete state.pageDrafts[state.currentPagePath];
  state.currentPageDirty = false;

  showToast(isNew ? 'Usunięto nową stronę.' : 'Przywrócono opublikowaną wersję strony.', 'warn');
  await loadPage(isNew ? 'index.html' : state.currentPagePath, { skipFlush: true });
}

// ============================================================================
// MODAL 1: MEDIA MANAGER
// ============================================================================

function openMediaDialog({ mode = 'browse', onPick = null } = {}) {
  state.media.mode = mode;
  state.media.onPick = onPick;
  state.media.query = '';
  $('media-search').value = '';

  $('media-dialog-title').textContent = mode === 'pick' ? 'Wybierz lub wgraj zdjęcie' : 'Biblioteka zdjęć';
  $('media-dialog-subtitle').textContent =
    mode === 'pick'
      ? 'Kliknij miniaturkę zdjęcia, aby wstawić je na stronę, albo wgraj nowe zdjęcie z komputera.'
      : 'Przeglądaj wszystkie zdjęcia witryny i wgrywaj nowe (automatyczna kompresja WebP).';

  renderMediaGrid();
  $('media-dialog').showModal();
}

function getAllMediaItems() {
  const list = [];

  // Pending uploaded images first
  for (const [repoPath, data] of Object.entries(state.pendingImages || {})) {
    const name = repoPath.split('/').pop() || repoPath;
    list.push({
      path: repoPath,
      folder: 'uploads',
      name,
      previewUrl: data.dataUrl,
      isPending: true,
      size: data.size,
      width: data.width,
      height: data.height,
    });
  }

  // Manifest images
  for (const img of state.manifest.images || []) {
    if (!img?.path) continue;
    if (state.pendingImages[img.path]) continue;
    list.push({
      path: img.path,
      folder: img.folder || 'root',
      name: img.name || img.path.split('/').pop(),
      previewUrl: new URL('../' + img.path, location.href).href,
      isPending: false,
      thumb: Boolean(img.thumb),
    });
  }

  return list;
}

function renderMediaGrid() {
  const grid = $('media-grid');
  if (!grid) return;
  grid.replaceChildren();

  const all = getAllMediaItems();
  const folder = state.media.folder;
  const q = normalizeTextForSearch(state.media.query);

  const filtered = all.filter((item) => {
    // Hide small internal thumbs unless explicitly searching
    if (item.thumb && !q) return false;
    if (folder !== 'all') {
      if (folder === 'uploads') {
        if (!item.isPending && item.folder !== 'uploads') return false;
      } else if (item.folder !== folder) {
        return false;
      }
    }
    if (q) {
      const hay = normalizeTextForSearch(`${item.name} ${item.path} ${item.folder}`);
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  $('media-count-info').textContent = `Wyświetlono ${filtered.length} zdjęć (${Object.keys(state.pendingImages).length} nowych do wysłania)`;

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.style.gridColumn = '1 / -1';
    empty.textContent =
      folder === 'uploads'
        ? 'Nie wgrano jeszcze nowych zdjęć. Przeciągnij plik powyżej, aby dodać zdjęcie.'
        : 'Brak zdjęć w tym folderze.';
    grid.append(empty);
    return;
  }

  for (const item of filtered) {
    const card = document.createElement('div');
    card.className = 'media-card';

    if (item.isPending) {
      const badge = document.createElement('span');
      badge.className = 'media-badge-pending';
      badge.textContent = 'Nowe WebP';
      card.append(badge);
    }

    const thumbBtn = document.createElement('button');
    thumbBtn.type = 'button';
    thumbBtn.className = 'media-thumb-btn';
    thumbBtn.title = state.media.mode === 'pick' ? `Wybierz: ${item.name}` : item.path;

    const img = document.createElement('img');
    img.src = item.previewUrl;
    img.alt = item.name;
    img.loading = 'lazy';
    img.decoding = 'async';
    thumbBtn.append(img);

    thumbBtn.addEventListener('click', () => {
      if (state.media.mode === 'pick' && typeof state.media.onPick === 'function') {
        const cb = state.media.onPick;
        $('media-dialog').close();
        cb(item.path, item.previewUrl);
      } else {
        navigator.clipboard?.writeText(item.path).then(
          () => showToast(`Skopiowano ścieżkę: ${item.path}`),
          () => showToast(`Ścieżka: ${item.path}`)
        );
      }
    });

    const foot = document.createElement('div');
    foot.className = 'media-card-foot';
    const nameEl = document.createElement('span');
    nameEl.className = 'media-card-name';
    nameEl.textContent = item.name;
    nameEl.title = item.path;
    foot.append(nameEl);

    if (item.isPending && state.media.mode === 'browse') {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'tiny-btn is-danger';
      delBtn.textContent = '🗑';
      delBtn.title = 'Usuń nowo wgrane zdjęcie';
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await deletePendingImage(item.path);
        delete state.pendingImages[item.path];
        state.canvas?.refreshPendingImages?.(getPendingImageUrlMap());
        renderMediaGrid();
        updateTopbarAndIndicators();
        showToast(`Usunięto zdjęcie „${item.name}”.`, 'warn');
      });
      foot.append(delBtn);
    }

    card.append(thumbBtn, foot);
    grid.append(card);
  }
}

async function handleMediaUploadFiles(fileList) {
  const files = Array.from(fileList || []).filter((f) => f && f.type.startsWith('image/'));
  if (!files.length) return;

  const statusEl = $('media-upload-status');
  statusEl.hidden = false;
  statusEl.textContent = `Optymalizowanie ${files.length} zdjęć…`;

  let uploadedCount = 0;
  let lastUploadedPath = null;
  let lastUploadedPreview = null;

  try {
    for (const file of files) {
      const compressed = await compressImageToWebP(file, {
        maxWidth: 1600,
        maxHeight: 1600,
        quality: 0.84,
      });

      const baseSuggested = compressed.suggestedName || `${slugifyFilename(file.name)}.${compressed.ext || 'webp'}`;
      let repoPath = `img/uploads/${baseSuggested}`;
      if (state.pendingImages[repoPath] || state.manifest.images.some((i) => i.path === repoPath)) {
        const dotIdx = baseSuggested.lastIndexOf('.');
        const stem = dotIdx > 0 ? baseSuggested.slice(0, dotIdx) : baseSuggested;
        const ext = dotIdx > 0 ? baseSuggested.slice(dotIdx) : '.webp';
        repoPath = `img/uploads/${stem}-${Date.now().toString(36).slice(-4)}${ext}`;
      }

      await savePendingImage(repoPath, compressed);
      state.pendingImages[repoPath] = compressed;
      uploadedCount += 1;
      lastUploadedPath = repoPath;
      lastUploadedPreview = compressed.dataUrl;
    }

    state.canvas?.refreshPendingImages?.(getPendingImageUrlMap());
    updateTopbarAndIndicators();

    // Switch filter to All or Uploads so newly uploaded image is visible at top
    if (state.media.folder !== 'all' && state.media.folder !== 'uploads') {
      setMediaFolder('uploads');
    } else {
      renderMediaGrid();
    }

    showToast(
      uploadedCount === 1
        ? `Wgrano i zoptymalizowano zdjęcie (${formatFileSize(state.pendingImages[lastUploadedPath]?.size)}).`
        : `Wgrano i zoptymalizowano ${uploadedCount} zdjęć do WebP.`
    );

    // If user uploaded a single image while in pick mode, let them see it at top or immediately pick?
    // Keeping it pinned at the top of the grid lets them verify and click, or if single file in pick mode, auto-select:
    if (state.media.mode === 'pick' && uploadedCount === 1 && typeof state.media.onPick === 'function') {
      const cb = state.media.onPick;
      $('media-dialog').close();
      cb(lastUploadedPath, lastUploadedPreview);
    }
  } catch (err) {
    console.error('Image upload error:', err);
    showToast('Nie udało się wgrać zdjęcia: ' + (err?.message || ''), 'error', 5000);
  } finally {
    statusEl.hidden = true;
    $('media-upload-input').value = '';
  }
}

function setMediaFolder(folder) {
  state.media.folder = folder;
  document.querySelectorAll('#media-folders .chip').forEach((c) => {
    c.classList.toggle('is-active', c.dataset.folder === folder);
  });
  renderMediaGrid();
}

// ============================================================================
// MODAL 2: NEW PAGE WIZARD
// ============================================================================

function openNewPageDialog() {
  state.newPage.templateId = PAGE_TEMPLATES[0]?.id || 'duplicate';
  state.newPage.slugTouched = false;

  $('np-heading').value = '';
  $('np-eyebrow').value = '';
  $('np-lead').value = '';
  $('np-slug').value = '';
  $('np-title').value = '';
  $('np-description').value = '';
  $('np-add-to-menu').checked = false;
  $('np-error').hidden = true;

  renderNewPageTemplates();
  applyTemplateDefaultFolder();
  updateNewPageUrlPreview();

  $('new-page-dialog').showModal();
  $('np-heading').focus();
}

function renderNewPageTemplates() {
  const wrap = $('new-page-templates');
  wrap.replaceChildren();

  const items = [
    ...(PAGE_TEMPLATES || []),
    {
      id: 'duplicate',
      name: 'Duplikat bieżącej strony',
      description: `Skopiuje cały układ i zawartość strony „${getPageEntry(state.currentPagePath).label}”.`,
      defaultFolder: state.currentPagePath.includes('/')
        ? state.currentPagePath.split('/')[0]
        : 'promocje',
    },
  ];

  for (const tpl of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `template-card${state.newPage.templateId === tpl.id ? ' is-selected' : ''}`;
    btn.addEventListener('click', () => {
      state.newPage.templateId = tpl.id;
      renderNewPageTemplates();
      applyTemplateDefaultFolder();
      updateNewPageUrlPreview();
    });

    const st = document.createElement('strong');
    st.textContent = tpl.name;
    const sm = document.createElement('small');
    sm.textContent = tpl.description || '';
    btn.append(st, sm);
    wrap.append(btn);
  }
}

function applyTemplateDefaultFolder() {
  const tpl = (PAGE_TEMPLATES || []).find((t) => t.id === state.newPage.templateId);
  const folderSelect = $('np-folder');
  const desired = tpl?.defaultFolder ?? 'promocje';
  if (Array.from(folderSelect.options).some((o) => o.value === desired)) {
    folderSelect.value = desired;
  }
}

function computeNewPagePath() {
  const folder = $('np-folder').value.trim().replace(/^\/+|\/+$/g, '');
  const slug = slugifyPath($('np-slug').value.trim()) || 'nowa-strona';
  return folder ? `${folder}/${slug}/index.html` : `${slug}/index.html`;
}

function updateNewPageUrlPreview() {
  const path = computeNewPagePath();
  $('np-url-preview').textContent = path;

  const exists = getAllPagesMerged().some((p) => p.path === path && !p.deleted);
  const errEl = $('np-error');
  if (exists) {
    errEl.textContent = `Strona pod adresem „${path}” już istnieje. Zmień slug lub folder.`;
    errEl.hidden = false;
  } else {
    errEl.hidden = true;
  }
}

function rebaseRelativeUrlsInHtml(html, fromPagePath, toPagePath) {
  const fromPrefix = depthPrefix(fromPagePath);
  const toPrefix = depthPrefix(toPagePath);
  if (fromPrefix === toPrefix) return html;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const attrs = [
      ['link[href]', 'href'],
      ['script[src]', 'src'],
      ['img[src]', 'src'],
      ['a[href]', 'href'],
      ['source[src]', 'src'],
    ];

    for (const [sel, attr] of attrs) {
      doc.querySelectorAll(sel).forEach((el) => {
        const val = el.getAttribute(attr);
        if (!val || /^(https?:|\/\/|tel:|mailto:|data:|blob:|#|javascript:)/i.test(val)) return;
        const rootPath = toRootPath(val, fromPagePath);
        if (rootPath) {
          el.setAttribute(attr, toRelativeUrl(rootPath, toPagePath));
        }
      });
    }
    return '<!doctype html>\n' + doc.documentElement.outerHTML;
  } catch {
    return html;
  }
}

async function handleCreateNewPageSubmit(e) {
  e.preventDefault();
  const heading = $('np-heading').value.trim();
  const rawSlug = $('np-slug').value.trim();
  const slug = slugifyPath(rawSlug || heading);
  if (!heading || !slug) {
    $('np-error').textContent = 'Podaj nazwę strony oraz prawidłowy adres URL (slug).';
    $('np-error').hidden = false;
    return;
  }

  $('np-slug').value = slug;
  const newPath = computeNewPagePath();
  const exists = getAllPagesMerged().some((p) => p.path === newPath && !p.deleted);
  if (exists) {
    $('np-error').textContent = `Strona „${newPath}” już istnieje. Wybierz inny adres URL.`;
    $('np-error').hidden = false;
    return;
  }

  const eyebrow = $('np-eyebrow').value.trim();
  const lead = $('np-lead').value.trim();
  const title = $('np-title').value.trim() || `${heading} | WOL-BUD Tarnów`;
  const description = $('np-description').value.trim() || lead || `${heading} — oferta WOL-BUD Tarnów.`;
  const globals = getActiveGlobals();

  let html = '';
  if (state.newPage.templateId === 'duplicate') {
    await flushAutosaveIfNeeded();
    const sourceHtml = safeSerializeHtml();
    const rebased = rebaseRelativeUrlsInHtml(sourceHtml, state.currentPagePath, newPath);
    const parser = new DOMParser();
    const doc = parser.parseFromString(rebased, 'text/html');
    doc.title = title;
    let metaDesc = doc.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = doc.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      doc.head.append(metaDesc);
    }
    metaDesc.setAttribute('content', description);
    const h1 = doc.querySelector('h1');
    if (h1) h1.textContent = heading;
    html = '<!doctype html>\n' + doc.documentElement.outerHTML;
  } else {
    const tpl = (PAGE_TEMPLATES || []).find((t) => t.id === state.newPage.templateId) || PAGE_TEMPLATES[0];
    html = tpl.createPageHtml({
      path: newPath,
      title,
      description,
      heading,
      eyebrow,
      lead,
      globals,
    });
  }

  const draft = {
    html,
    title,
    description,
    label: heading,
    group: inferPageGroup(newPath),
    isNew: true,
    deleted: false,
  };

  await savePageDraft(newPath, draft);
  state.pageDrafts[newPath] = draft;

  if ($('np-add-to-menu').checked) {
    const nextGlobals = normalizeGlobalsObj(getActiveGlobals());
    nextGlobals.menu.push({ label: heading, href: newPath, mobileHref: '' });
    await saveGlobalsDraft(nextGlobals);
    state.globalsDraft = nextGlobals;
  }

  $('new-page-dialog').close();
  showToast(`Utworzono nową podstronę „${heading}”.`);
  switchSidebarTab('structure');
  await loadPage(newPath);
}

// ============================================================================
// MODAL 3: GLOBAL SETTINGS (MENU, FOOTER, COMPANY DATA)
// ============================================================================

function openGlobalsDialog() {
  state.globalsEditor.working = normalizeGlobalsObj(getActiveGlobals());
  const g = state.globalsEditor.working;

  $('gl-phone-display').value = g.phoneDisplay;
  $('gl-phone-href').value = g.phoneHref;
  $('gl-email').value = g.email;
  $('gl-facebook').value = g.facebookUrl;
  $('gl-logo-alt').value = g.logoAlt;
  $('gl-logo-path').textContent = g.logoSrc;
  $('gl-logo-preview').src = resolveRepoImageUrl(g.logoSrc);
  $('gl-footer-copy').value = g.footerCopy;
  $('gl-discard-btn').hidden = !state.globalsDraft;

  renderGlobalsLinkList('gl-nav-list', g.menu);
  renderGlobalsLinkList('gl-footer-links-list', g.footerLinks);

  $('globals-dialog').showModal();
}

function renderGlobalsLinkList(containerId, items) {
  const container = $(containerId);
  container.replaceChildren();

  items.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'nav-edit-row';

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'input-field';
    labelInput.placeholder = 'Nazwa linku';
    labelInput.value = item.label || '';
    labelInput.addEventListener('input', () => {
      item.label = labelInput.value;
    });

    const hrefWrap = document.createElement('div');
    hrefWrap.style.display = 'flex';
    hrefWrap.style.gap = '0.3rem';

    const pageSelect = document.createElement('select');
    pageSelect.className = 'input-field';
    pageSelect.title = 'Wybierz stronę lub wpisz własny adres obok';
    pageSelect.style.maxWidth = '48%';

    const customOpt = document.createElement('option');
    customOpt.value = '';
    customOpt.textContent = '— Własny URL —';
    pageSelect.append(customOpt);

    const allPages = getAllPagesMerged().filter((p) => !p.deleted);
    for (const p of allPages) {
      const opt = document.createElement('option');
      opt.value = p.path;
      opt.textContent = p.label;
      if (p.path === item.href) opt.selected = true;
      pageSelect.append(opt);
    }

    const hrefInput = document.createElement('input');
    hrefInput.type = 'text';
    hrefInput.className = 'input-field';
    hrefInput.placeholder = 'np. oferta/index.html';
    hrefInput.value = item.href || '';

    pageSelect.addEventListener('change', () => {
      if (pageSelect.value) {
        item.href = pageSelect.value;
        hrefInput.value = pageSelect.value;
        if (!labelInput.value.trim()) {
          const found = allPages.find((p) => p.path === pageSelect.value);
          if (found) {
            item.label = found.label;
            labelInput.value = found.label;
          }
        }
      }
    });

    hrefInput.addEventListener('input', () => {
      item.href = hrefInput.value.trim();
      pageSelect.value = allPages.some((p) => p.path === item.href) ? item.href : '';
    });

    hrefWrap.append(pageSelect, hrefInput);

    const actions = document.createElement('div');
    actions.className = 'nav-edit-actions';

    const up = document.createElement('button');
    up.type = 'button';
    up.className = 'tiny-btn';
    up.textContent = '↑';
    up.disabled = idx === 0;
    up.addEventListener('click', () => {
      [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]];
      renderGlobalsLinkList(containerId, items);
    });

    const down = document.createElement('button');
    down.type = 'button';
    down.className = 'tiny-btn';
    down.textContent = '↓';
    down.disabled = idx === items.length - 1;
    down.addEventListener('click', () => {
      [items[idx + 1], items[idx]] = [items[idx], items[idx + 1]];
      renderGlobalsLinkList(containerId, items);
    });

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'tiny-btn is-danger';
    del.textContent = '🗑';
    del.addEventListener('click', () => {
      items.splice(idx, 1);
      renderGlobalsLinkList(containerId, items);
    });

    actions.append(up, down, del);
    row.append(labelInput, hrefWrap, actions);
    container.append(row);
  });
}

function applyGlobalsPreview(globals) {
  if (!state.canvas || !globals) return;
  const g = normalizeGlobalsObj(globals);
  state.isRestoringHistory = true;
  try {
    state.canvas.applyLiveGlobals?.(g);
    const doc = $('preview')?.contentDocument;
    if (doc) {
      // Update logo image preview
      const brandImg = doc.querySelector('header.bar a.brand img');
      if (brandImg && g.logoSrc) {
        brandImg.src = resolveRepoImageUrl(g.logoSrc);
        if (g.logoAlt) brandImg.alt = g.logoAlt;
      }
      // Update main navigation links preview
      const nav = doc.querySelector('#site-menu, nav.menu-panel');
      if (nav && Array.isArray(g.menu) && g.menu.length) {
        const closeBtn = nav.querySelector('.menu-close');
        const phoneLink = nav.querySelector('.menu-phone');
        nav.querySelectorAll(':scope > a:not(.menu-phone)').forEach((a) => a.remove());
        for (const item of g.menu) {
          const a = doc.createElement('a');
          const rel = toRelativeUrl(item.href, state.currentPagePath);
          a.setAttribute('href', rel);
          a.setAttribute('data-desktop-href', rel);
          if (item.mobileHref) a.setAttribute('data-mobile-home-href', item.mobileHref);
          a.textContent = item.label;
          if (phoneLink) nav.insertBefore(a, phoneLink);
          else nav.append(a);
        }
        if (closeBtn && !nav.contains(closeBtn)) nav.prepend(closeBtn);
      }
      // Update footer links preview
      const footerLinksEl = doc.querySelector('footer .footer-links');
      if (footerLinksEl && Array.isArray(g.footerLinks) && g.footerLinks.length) {
        footerLinksEl.replaceChildren();
        for (const item of g.footerLinks) {
          const a = doc.createElement('a');
          a.setAttribute('href', toRelativeUrl(item.href, state.currentPagePath));
          a.textContent = item.label;
          footerLinksEl.append(a);
        }
      }
    }
  } finally {
    state.isRestoringHistory = false;
  }
}

async function handleSaveGlobalsSubmit(e) {
  e.preventDefault();
  const g = state.globalsEditor.working;
  if (!g) return;

  g.phoneDisplay = $('gl-phone-display').value.trim() || DEFAULT_GLOBALS.phoneDisplay;
  g.phoneHref = $('gl-phone-href').value.trim() || `tel:+48${g.phoneDisplay.replace(/\D+/g, '')}`;
  g.email = $('gl-email').value.trim() || DEFAULT_GLOBALS.email;
  g.facebookUrl = $('gl-facebook').value.trim() || DEFAULT_GLOBALS.facebookUrl;
  g.facebookLabel = g.facebookUrl.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, '');
  g.logoAlt = $('gl-logo-alt').value.trim() || DEFAULT_GLOBALS.logoAlt;
  g.footerCopy = $('gl-footer-copy').value;
  g.menu = g.menu.filter((i) => i.label.trim() && i.href.trim());
  g.footerLinks = g.footerLinks.filter((i) => i.label.trim() && i.href.trim());

  await saveGlobalsDraft(g);
  state.globalsDraft = g;

  applyGlobalsPreview(g);

  $('globals-dialog').close();
  updateTopbarAndIndicators();
  if (!state.selectedDescriptor) renderPageSettingsInspector();
  showToast('Zapisano menu i dane firmy w szkicu (widoczne w podglądzie).');
}

async function handleDiscardGlobals() {
  if (!window.confirm('Odrzucić niezopublikowane zmiany w menu, stopce i danych firmy?')) return;
  await deleteGlobalsDraft();
  state.globalsDraft = null;
  applyGlobalsPreview(state.publishedGlobals);
  $('globals-dialog').close();
  updateTopbarAndIndicators();
  if (!state.selectedDescriptor) renderPageSettingsInspector();
  showToast('Przywrócono opublikowane ustawienia globalne.', 'warn');
}

// ============================================================================
// MODAL 4: PUBLICATION FLOW
// ============================================================================

async function openPublishDialog() {
  await flushAutosaveIfNeeded();

  const counts = getTotalPendingChanges();
  if (counts.total === 0) {
    showToast('Brak zmian do opublikowania.', 'warn');
    return;
  }

  renderPublishSummary();

  const hasHostingSession = config.mode === 'hosting' && Boolean(state.auth.csrfToken);
  const authBox = $('pub-auth-box');

  if (hasHostingSession) {
    if (authBox) authBox.hidden = true;
    $('pub-credential').required = false;
  } else {
    if (authBox) authBox.hidden = false;
    $('pub-credential').required = true;
    // Configure auth copy for github vs hosting
    if (config.mode === 'hosting') {
      $('pub-cred-label').textContent = 'Hasło edytora';
      $('pub-cred-help').textContent = 'Wpisz hasło edytora otrzymane od administratora serwera.';
      $('pub-credential').placeholder = 'Wpisz hasło edytora…';
      $('pub-credential').autocomplete = 'current-password';
    } else {
      $('pub-cred-label').textContent = 'Klucz publikacji (GitHub Token)';
      $('pub-cred-help').textContent = 'Wklej token GitHub z uprawnieniem zapisu (Contents: Read and write).';
      $('pub-credential').placeholder = 'github_pat_… lub ghp_…';
      $('pub-credential').autocomplete = 'off';
    }
  }

  const cred = getCredential();
  state.savedCredential = cred;
  $('pub-credential').value = cred.value || '';
  $('pub-remember').checked = Boolean(cred.remembered);
  $('pub-clear-cred').hidden = !cred.value;

  $('pub-error').hidden = true;
  if ($('pub-help-row')) $('pub-help-row').hidden = true;
  $('pub-progress-wrap').hidden = true;
  $('pub-progress-bar').style.width = '0%';
  $('pub-submit-btn').disabled = false;
  $('pub-cancel-btn').disabled = false;
  $('pub-commit-message').value = '';

  $('publish-dialog').showModal();
  if (!hasHostingSession && !cred.value) $('pub-credential').focus();
}

function renderPublishSummary() {
  const container = $('pub-changes-list');
  container.replaceChildren();

  const drafts = Object.entries(state.pageDrafts || {});
  const modified = drafts.filter(([, d]) => d && !d.deleted && !d.isNew);
  const created = drafts.filter(([, d]) => d && !d.deleted && d.isNew);
  const deleted = drafts.filter(([, d]) => d && d.deleted && !d.isNew);
  const images = Object.entries(state.pendingImages || {});

  const addGroup = (title, items) => {
    if (!items.length) return;
    const block = document.createElement('div');
    const h = document.createElement('div');
    h.className = 'pub-group-title';
    h.textContent = `${title} (${items.length})`;
    const ul = document.createElement('ul');
    ul.className = 'pub-item-list';
    for (const [label, sub] of items) {
      const li = document.createElement('li');
      const sp = document.createElement('span');
      sp.textContent = label;
      const cd = document.createElement('code');
      cd.textContent = sub;
      li.append(sp, cd);
      ul.append(li);
    }
    block.append(h, ul);
    container.append(block);
  };

  addGroup(
    'Zmienione strony',
    modified.map(([path, d]) => [d.label || path, path])
  );
  addGroup(
    'Nowe podstrony',
    created.map(([path, d]) => [d.label || path, path])
  );
  addGroup(
    'Usunięte podstrony',
    deleted.map(([path, d]) => [d.label || path, path])
  );
  addGroup(
    'Nowe zdjęcia (WebP)',
    images.map(([path, data]) => [path.split('/').pop(), formatFileSize(data.size)])
  );
  if (state.globalsDraft) {
    addGroup('Ustawienia globalne', [['Menu główne, stopka i dane firmy', 'assets/site-globals.json']]);
  }
}

function buildUpdatedManifest(nextRevision) {
  const pagesMap = new Map();
  for (const p of state.manifest.pages || []) {
    if (p?.path) pagesMap.set(p.path, { ...p });
  }

  for (const [path, draft] of Object.entries(state.pageDrafts || {})) {
    if (!draft) continue;
    if (draft.deleted) {
      pagesMap.delete(path);
    } else {
      const prev = pagesMap.get(path);
      pagesMap.set(path, {
        path,
        label: draft.label || prev?.label || path,
        title: draft.title ?? prev?.title ?? '',
        description: draft.description ?? prev?.description ?? '',
        group: draft.group || prev?.group || inferPageGroup(path),
      });
    }
  }

  const imagesMap = new Map();
  for (const img of state.manifest.images || []) {
    if (img?.path) imagesMap.set(img.path, { ...img });
  }
  for (const repoPath of Object.keys(state.pendingImages || {})) {
    const parts = repoPath.split('/');
    imagesMap.set(repoPath, {
      path: repoPath,
      folder: parts.length > 2 ? parts[1] : 'uploads',
      name: parts[parts.length - 1],
      thumb: false,
    });
  }

  return {
    version: state.manifest.version || 2,
    revision: nextRevision,
    generatedAt: new Date().toISOString(),
    pages: Array.from(pagesMap.values()),
    images: Array.from(imagesMap.values()),
  };
}

async function handlePublishSubmit(e) {
  e.preventDefault();
  if (state.isPublishing) return;

  const hasHostingSession = config.mode === 'hosting' && Boolean(state.auth.csrfToken);
  const credential = $('pub-credential').value.trim();
  const remember = $('pub-remember').checked;
  if (!hasHostingSession && !credential) {
    $('pub-error').textContent = 'Podaj klucz publikacji przed wysłaniem zmian.';
    $('pub-error').hidden = false;
    $('pub-credential').focus();
    return;
  }

  if (credential) {
    saveCredential(credential, remember);
    state.savedCredential = getCredential();
    $('pub-clear-cred').hidden = false;
  }

  const files = [];
  const deletions = [];

  for (const [path, draft] of Object.entries(state.pageDrafts || {})) {
    if (!draft) continue;
    if (draft.deleted) {
      if (!draft.isNew) deletions.push(path);
    } else if (typeof draft.html === 'string' && draft.html.trim()) {
      files.push({
        path,
        content: stripCmsBaseTag(draft.html),
        encoding: 'utf-8',
      });
    }
  }

  for (const [repoPath, imgData] of Object.entries(state.pendingImages || {})) {
    if (imgData?.base64) {
      files.push({
        path: repoPath,
        content: imgData.base64,
        encoding: 'base64',
      });
    }
  }

  if (state.globalsDraft) {
    files.push({
      path: 'assets/site-globals.json',
      content: JSON.stringify(state.globalsDraft, null, 2) + '\n',
      encoding: 'utf-8',
    });
  }

  const nextRevision = crypto.randomUUID ? crypto.randomUUID() : `rev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const nextManifest = buildUpdatedManifest(nextRevision);
  files.push({
    path: 'assets/cms-manifest.json',
    content: JSON.stringify(nextManifest, null, 2) + '\n',
    encoding: 'utf-8',
  });

  const commitMessage =
    $('pub-commit-message').value.trim() ||
    `Aktualizacja strony ${siteProfile.brandName || 'CMS'} (${files.length} plików)`;

  state.isPublishing = true;
  $('pub-error').hidden = true;
  if ($('pub-help-row')) $('pub-help-row').hidden = true;
  $('pub-progress-wrap').hidden = false;
  $('pub-submit-btn').disabled = true;
  $('pub-cancel-btn').disabled = true;
  updateTopbarAndIndicators();

  const setProgress = (msg, pct) => {
    $('pub-progress-text').textContent = msg;
    if (typeof pct === 'number') {
      $('pub-progress-bar').style.width = `${Math.min(100, Math.max(0, pct))}%`;
    }
  };

  try {
    setProgress('Sprawdzanie bieżącej wersji i wysyłanie plików…', 15);
    await savePendingRevision(nextRevision);

    await publishChanges({
      files,
      deletions,
      expectedRevision: state.manifest.revision,
      nextRevision,
      commitMessage,
      credential,
      csrfToken: state.auth.csrfToken || '',
      onProgress: (msg, pct) => setProgress(msg, pct),
    });

    setProgress('Zmiany wysłane! Oczekiwanie na pojawienie się nowej wersji na stronie…', 90);
    const liveManifest = await waitForPublication(nextRevision, {
      onPoll: (elapsedMs) => {
        const sec = Math.round(elapsedMs / 1000);
        setProgress(`Wdrażanie zmian na stronie publicznej… (${sec} s)`, 94);
      },
    });

    setProgress('Opublikowano pomyślnie!', 100);

    // Clear all local drafts & update state to live
    await clearAllDrafts();
    await savePendingRevision(null);

    state.manifest = liveManifest || nextManifest;
    if (state.globalsDraft) {
      state.publishedGlobals = normalizeGlobalsObj(state.globalsDraft);
    }
    state.globalsDraft = null;
    state.pageDrafts = {};
    state.pendingImages = {};
    state.pendingRevision = null;
    state.currentPageDirty = false;

    $('publish-dialog').close();
    showToast('Zmiany zostały opublikowane na stronie publicznej!', 'success', 5000);

    const stillExists = state.manifest.pages.some((p) => p.path === state.currentPagePath);
    await loadPage(stillExists ? state.currentPagePath : 'index.html', { skipFlush: true });
  } catch (err) {
    console.error('Publish failed:', err);
    state.lastError = err?.message || 'Błąd publikacji';
    $('pub-error').textContent = err?.message || 'Nie udało się opublikować zmian.';
    $('pub-error').hidden = false;
    if ($('pub-help-row')) $('pub-help-row').hidden = false;

    if (err instanceof SecurityError) {
      showToast('Publikacja zablokowana przez filtr bezpieczeństwa.', 'error', 5500);
    } else if (err instanceof AccessError) {
      if ($('pub-auth-box')) $('pub-auth-box').hidden = false;
      $('pub-credential').focus();
      $('pub-credential').select();
    } else if (err instanceof ConflictError) {
      showToast('Wykryto nowszą wersję na serwerze. Szkic pozostał bezpiecznie zapisany.', 'warn', 5000);
    }
  } finally {
    state.isPublishing = false;
    $('pub-submit-btn').disabled = false;
    $('pub-cancel-btn').disabled = false;
    updateTopbarAndIndicators();
  }
}

// ============================================================================
// WHITE-LABEL BRANDING, LOGIN GATE, BACKUPS & SUPPORT MODALS
// ============================================================================

function applySiteProfileBranding() {
  const brand = siteProfile.brandName || 'CMS';
  const studioTitle = siteProfile.studioTitle || `${brand} Studio`;
  document.title = `${studioTitle} · Kreator Stron`;

  const rootStyle = document.documentElement.style;
  if (siteProfile.accentColor) {
    rootStyle.setProperty('--brand', siteProfile.accentColor);
    rootStyle.setProperty('--brand-accent', siteProfile.accentColor);
  }
  if (siteProfile.accentLight) {
    rootStyle.setProperty('--brand-hover', siteProfile.accentLight);
  }

  const logoUrl = siteProfile.logoSrc ? `../${String(siteProfile.logoSrc).replace(/^\/+/, '')}` : '';
  if (logoUrl) {
    const topLogo = $('brand-logo-img');
    if (topLogo) {
      topLogo.src = logoUrl;
      topLogo.alt = brand;
    }
    const loginLogo = $('login-logo-img');
    if (loginLogo) {
      loginLogo.src = logoUrl;
      loginLogo.alt = brand;
    }
  }

  const shortTag = studioTitle.replace(brand, '').trim() || 'Studio';
  if ($('brand-studio-tag')) $('brand-studio-tag').textContent = shortTag;
  if ($('login-studio-tag')) $('login-studio-tag').textContent = shortTag;

  if (siteProfile.faviconSrc) {
    const iconLink = document.querySelector('link[rel="icon"]');
    if (iconLink) {
      iconLink.setAttribute('href', `../${String(siteProfile.faviconSrc).replace(/^\/+/, '')}`);
    }
  }

  const aiHeading = document.querySelector('#ai-drawer .ai-drawer-brand h2');
  if (aiHeading) aiHeading.textContent = `Asystent AI · ${brand}`;

  // Populate support modal from siteProfile.support
  const sup = siteProfile.support || {};
  if ($('support-role') && sup.role) $('support-role').textContent = sup.role;
  if ($('support-name') && sup.name) $('support-name').textContent = sup.name;
  if ($('support-note') && sup.note) $('support-note').textContent = sup.note;
  if ($('support-phone-text') && sup.phoneDisplay) $('support-phone-text').textContent = sup.phoneDisplay;
  if ($('support-call-link') && sup.phoneHref) {
    $('support-call-link').setAttribute('href', sanitizeUrl(sup.phoneHref, { allowRelative: false }));
  }
  if ($('support-email-link') && sup.email) {
    $('support-email-link').setAttribute('href', sanitizeUrl(`mailto:${sup.email}`, { allowRelative: false }));
    $('support-email-link').textContent = `✉ ${sup.email}`;
  }
  if ($('support-hours')) {
    $('support-hours').textContent = sup.hours ? `Godziny wsparcia: ${sup.hours}` : '';
  }

  // Refresh AI welcome card with white-label suggestions
  renderAiWelcomeCard();
}

function showLoginGate() {
  const gate = $('login-gate');
  const app = $('studio-app');
  if (gate) gate.hidden = false;
  if (app) app.hidden = true;
  if ($('login-error')) $('login-error').hidden = true;
  if ($('login-password')) {
    $('login-password').value = '';
    setTimeout(() => $('login-password')?.focus(), 60);
  }
}

function hideLoginGate() {
  const gate = $('login-gate');
  const app = $('studio-app');
  if (gate) gate.hidden = true;
  if (app) app.hidden = false;
}

let pendingLoginResolver = null;

function waitForHostingLogin() {
  showLoginGate();
  return new Promise((resolve) => {
    pendingLoginResolver = resolve;
  });
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const pwInput = $('login-password');
  const errBox = $('login-error');
  const btn = $('login-submit-btn');
  const password = pwInput?.value || '';

  if (!password.trim()) {
    if (errBox) {
      errBox.textContent = 'Wpisz hasło dostępu do panelu.';
      errBox.hidden = false;
    }
    pwInput?.focus();
    return;
  }

  if (errBox) errBox.hidden = true;
  if (btn) btn.disabled = true;

  try {
    const authRes = await loginHosting(password);
    state.auth = {
      authenticated: Boolean(authRes?.authenticated),
      csrfToken: authRes?.csrfToken || null,
    };
    if ($('btn-logout')) $('btn-logout').hidden = false;
    hideLoginGate();
    showToast('Zalogowano bezpiecznie do panelu.');
    if (typeof pendingLoginResolver === 'function') {
      const r = pendingLoginResolver;
      pendingLoginResolver = null;
      r(state.auth);
    }
  } catch (err) {
    state.lastError = err?.message || 'Błąd logowania';
    if (errBox) {
      errBox.textContent = err?.message || 'Nieprawidłowe hasło dostępu.';
      errBox.hidden = false;
    }
    pwInput?.focus();
    pwInput?.select();
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function handleLogoutClick() {
  if (!window.confirm('Czy na pewno wylogować się z panelu edycji?')) return;
  try {
    await logoutHosting(state.auth.csrfToken || '');
  } catch (err) {
    console.warn('Logout warning:', err);
  }
  state.auth = { authenticated: false, csrfToken: null };
  location.reload();
}

async function openBackupsDialog() {
  const dlg = $('backups-dialog');
  if (!dlg) return;
  const createBtn = $('btn-create-backup');
  if (createBtn) {
    createBtn.hidden = config.mode !== 'hosting';
  }
  if ($('backups-error')) $('backups-error').hidden = true;
  dlg.showModal();
  await refreshBackupsList();
}

async function refreshBackupsList() {
  const listEl = $('backups-list');
  const errEl = $('backups-error');
  if (!listEl) return;

  listEl.innerHTML = '<div class="empty-state">Wczytywanie kopii zapasowych…</div>';
  if (errEl) errEl.hidden = true;

  try {
    const res = await listBackups({
      credential: state.savedCredential?.value || '',
      csrfToken: state.auth.csrfToken || '',
    });
    renderBackupsList(res?.backups || [], res?.mode || config.mode);
  } catch (err) {
    state.lastError = err?.message || 'Błąd odczytu kopii zapasowych';
    listEl.innerHTML = '<div class="empty-state">Nie udało się pobrać listy kopii zapasowych.</div>';
    if (errEl) {
      errEl.textContent = err?.message || 'Nie udało się pobrać listy kopii zapasowych.';
      errEl.hidden = false;
    }
  }
}

function renderBackupsList(backups, mode) {
  const listEl = $('backups-list');
  if (!listEl) return;
  listEl.replaceChildren();

  if (!Array.isArray(backups) || backups.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent =
      mode === 'hosting'
        ? 'Brak zapisanych kopii zapasowych na serwerze. Pierwsza kopia oryginalna utworzy się automatycznie przy pierwszej publikacji lub kliknięciu przycisku powyżej.'
        : 'Brak zapisanej historii wersji do wyświetlenia.';
    listEl.append(empty);
    return;
  }

  for (const item of backups) {
    const isOriginal = Boolean(item.immutable || item.id === 'original');
    const card = document.createElement('div');
    card.className = `backup-card${isOriginal ? ' backup-card--original' : ''}`;

    const meta = document.createElement('div');
    meta.className = 'backup-card-meta';

    const titleRow = document.createElement('div');
    titleRow.className = 'backup-card-title-row';

    const title = document.createElement('strong');
    title.textContent =
      item.label || (isOriginal ? 'Oryginalna wersja strony (fabryczna)' : `Kopia ${item.id}`);
    titleRow.append(title);

    if (isOriginal) {
      const badge = document.createElement('span');
      badge.className = 'backup-badge-immutable';
      badge.textContent = 'Nieusuwalny oryginał';
      titleRow.append(badge);
    }

    const sub = document.createElement('small');
    const parts = [];
    if (item.createdAt) parts.push(formatDateTimePl(item.createdAt));
    if (typeof item.filesCount === 'number' && item.filesCount > 0) {
      parts.push(`${item.filesCount} plików`);
    }
    if (item.sha) parts.push(`wersja ${String(item.sha).slice(0, 7)}`);
    sub.textContent = parts.join(' · ') || 'Punkt przywracania';

    meta.append(titleRow, sub);

    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = isOriginal ? 'btn-primary mini-btn' : 'btn-secondary mini-btn';
    actionBtn.textContent = isOriginal ? 'Przywróć oryginał' : 'Przywróć tę wersję';
    actionBtn.addEventListener('click', () => handleRestoreBackup(item, actionBtn));

    card.append(meta, actionBtn);
    listEl.append(card);
  }
}

async function handleCreateBackup() {
  const btn = $('btn-create-backup');
  const errEl = $('backups-error');
  if (errEl) errEl.hidden = true;
  if (btn) btn.disabled = true;

  try {
    const label = window.prompt('Opcjonalna nazwa punktu przywracania:', 'Ręczna kopia zapasowa');
    if (label === null) return;
    await createBackup({
      label: label.trim() || 'Ręczna kopia zapasowa',
      credential: state.savedCredential?.value || '',
      csrfToken: state.auth.csrfToken || '',
    });
    showToast('Zapisano nowy punkt przywracania na serwerze.');
    await refreshBackupsList();
  } catch (err) {
    state.lastError = err?.message || 'Błąd tworzenia kopii';
    if (errEl) {
      errEl.textContent = err?.message || 'Nie udało się zapisać kopii zapasowej.';
      errEl.hidden = false;
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function handleRestoreBackup(item, triggerBtn) {
  const isOriginal = Boolean(item.immutable || item.id === 'original');
  const confirmMsg = isOriginal
    ? 'Czy na pewno przywrócić ORYGINALNĄ (fabryczną) wersję strony? Aktualny stan zostanie najpierw bezpiecznie zapisany jako punkt przywracania.'
    : `Czy na pewno przywrócić wersję „${item.label || item.id}”? Obecny szkic lokalny zostanie wyczyszczony.`;
  if (!window.confirm(confirmMsg)) return;

  const errEl = $('backups-error');
  if (errEl) errEl.hidden = true;

  let credential = state.savedCredential?.value || '';
  if (config.mode !== 'hosting' && !credential) {
    const prompted = window.prompt(
      'Podaj klucz publikacji (GitHub Token), aby przywrócić wybraną wersję strony:'
    );
    if (!prompted || !prompted.trim()) return;
    credential = prompted.trim();
  }

  if (triggerBtn) {
    triggerBtn.disabled = true;
    triggerBtn.textContent = 'Przywracanie…';
  }

  try {
    const res = await restoreBackup({
      id: item.id,
      sha: item.sha || '',
      credential,
      csrfToken: state.auth.csrfToken || '',
    });

    await clearAllDrafts();
    state.pageDrafts = {};
    state.pendingImages = {};
    state.globalsDraft = null;
    state.currentPageDirty = false;

    if (res?.revision) {
      try {
        const freshManifest = await waitForPublication(res.revision, { timeoutMs: 25000 });
        if (freshManifest?.pages) state.manifest = freshManifest;
      } catch {
        // Odśwież stronę mimo buforowania
      }
    }

    $('backups-dialog')?.close();
    showToast('Przywrócono wybraną kopię zapasową! Odświeżam stronę…', 'success', 4500);
    await loadPage('index.html', { skipFlush: true });
    renderPagesList();
    updateTopbarAndIndicators();
  } catch (err) {
    state.lastError = err?.message || 'Błąd przywracania kopii';
    if (errEl) {
      errEl.textContent = err?.message || 'Nie udało się przywrócić kopii zapasowej.';
      errEl.hidden = false;
    }
    showToast('Nie udało się przywrócić kopii zapasowej.', 'error', 4500);
  } finally {
    if (triggerBtn) {
      triggerBtn.disabled = false;
      triggerBtn.textContent = isOriginal ? 'Przywróć oryginał' : 'Przywróć tę wersję';
    }
  }
}

function openSupportDialog() {
  $('support-dialog')?.showModal();
}

async function copySupportPhone() {
  const phone = siteProfile.support?.phoneDisplay || '';
  if (!phone) return;
  try {
    await navigator.clipboard.writeText(phone);
    showToast(`Skopiowano numer: ${phone}`);
  } catch {
    showToast(`Numer telefonu: ${phone}`);
  }
}

async function copyDiagnosticReport() {
  const counts = getTotalPendingChanges();
  // Raport w 100% bezpieczny — celowo ZERO haseł, kluczy API, tokenów i ciasteczek
  const report = [
    `=== Raport diagnostyczny ${siteProfile.studioTitle || 'CMS Studio'} ===`,
    `Data: ${new Date().toISOString()}`,
    `Strona: ${state.currentPagePath}`,
    `Tryb: ${config.mode}`,
    `Wersja manifestu: ${state.manifest?.revision || 'brak'} (${state.manifest?.generatedAt || 'brak'})`,
    `Liczba zmian w szkicu: ${counts.total} (strony: ${counts.modifiedPages + counts.newPages + counts.deletedPages}, zdjęcia: ${counts.imagesCount}, menu: ${counts.hasGlobals ? 'tak' : 'nie'})`,
    `Asystent AI: ${state.ai.settings?.provider || 'brak'} / ${state.ai.settings?.model || 'brak'} (gotowy: ${isAiReady() ? 'tak' : 'nie'})`,
    `Ostatni błąd: ${state.lastError || 'brak'}`,
    `Przeglądarka: ${navigator.userAgent}`,
  ].join('\n');

  try {
    await navigator.clipboard.writeText(report);
    showToast('Skopiowano bezpieczny raport diagnostyczny (bez haseł i kluczy).');
  } catch {
    window.prompt('Skopiuj raport diagnostyczny:', report);
  }
}

// ============================================================================
// KEYBOARD SHORTCUTS & VIEWPORT SWITCHER
// ============================================================================

function isTypingInPanelInput(target) {
  if (!target || target.ownerDocument !== document) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function handleGlobalKeydown(e) {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();

  if (mod && key === 's') {
    e.preventDefault();
    saveCurrentPageDraft({ silent: false });
    return;
  }

  if (mod && key === 'z' && !e.shiftKey) {
    if (isTypingInPanelInput(e.target)) return;
    e.preventDefault();
    performUndo();
    return;
  }

  if ((mod && key === 'y') || (mod && e.shiftKey && key === 'z')) {
    if (isTypingInPanelInput(e.target)) return;
    e.preventDefault();
    performRedo();
    return;
  }

  if (e.key === 'Escape') {
    const morePop = $('more-menu-popover');
    if (morePop && !morePop.hidden) {
      toggleMoreMenu(false);
      return;
    }
    const anyModalOpen = document.querySelector('dialog[open]');
    if (!anyModalOpen && state.ai.open) {
      setAiDrawerOpen(false);
      return;
    }
    if (!anyModalOpen && $('panel-left')?.classList.contains('is-drawer-open')) {
      closeSimpleLeftDrawer();
      return;
    }
    if (!anyModalOpen && $('panel-right')?.classList.contains('is-drawer-open')) {
      closeSimpleInspector();
      state.canvas?.clearSelection();
      handleCanvasSelect(null);
      return;
    }
    if (!anyModalOpen && state.selectedDescriptor) {
      state.canvas?.clearSelection();
      handleCanvasSelect(null);
    }
  }
}

function setViewportMode(mode) {
  state.viewport = mode;
  const vp = $('stage-viewport');
  vp.classList.remove('view-desktop', 'view-tablet', 'view-mobile');
  vp.classList.add(`view-${mode}`);

  document.querySelectorAll('.vp-btn').forEach((btn) => {
    const active = btn.dataset.viewport === mode;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

// ============================================================================
// AI ASSISTANT: SETTINGS, DRAWER UI, MARKDOWN & 27 TOOLS
// ============================================================================

const AI_MODEL_LABELS = {
  'gemini-3-flash-preview': 'Gemini 3 Flash',
  'gemini-3.8-flash': 'Gemini 3.8 Flash',
  'gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
  'gpt-4.1-mini': 'GPT-4.1 mini',
  'gpt-4.1': 'GPT-4.1',
  'gpt-4o-mini': 'GPT-4o mini',
};

const AI_TOOL_LABELS = {
  get_page_structure: 'Sprawdzam strukturę strony',
  get_element_details: 'Odczytuję szczegóły elementu',
  update_element_text: 'Edytuję tekst na stronie',
  update_element_link: 'Aktualizuję odnośnik',
  update_element_image: 'Podmieniam zdjęcie',
  update_review_stars: 'Zmieniam ocenę gwiazdkową',
  move_element: 'Zmieniam kolejność elementu',
  toggle_element_visibility: 'Zmieniam widoczność elementu',
  duplicate_element: 'Duplikuję element',
  delete_element: 'Usuwam element',
  add_section: 'Dodaję nową sekcję',
  add_item: 'Dodaję nowy kafelek',
  add_text_block: 'Dodaję blok tekstu',
  set_page_meta: 'Aktualizuję tytuł i opis SEO',
  list_pages: 'Przeglądam listę podstron',
  open_page: 'Otwieram podstronę',
  create_page: 'Tworzę nową podstronę',
  search_images: 'Szukam zdjęć w bibliotece',
  get_globals: 'Odczytuję menu i dane firmy',
  update_globals: 'Aktualizuję menu i dane firmy',
  undo_last_change: 'Cofam ostatnią zmianę',
  delete_page: 'Oznaczam podstronę do usunięcia',
  update_section_id: 'Ustawiam kotwicę #id sekcji',
  reorder_element_to_index: 'Ustawiam dokładną pozycję elementu',
  update_section_style: 'Zmieniam styl wizualny sekcji',
  list_backups: 'Sprawdzam kopie zapasowe strony',
  discard_page_draft: 'Przywracam opublikowaną wersję strony',
};

const AI_CHIP_ICONS = ['✨', '📄', '❓', '🛠️'];
const AI_WELCOME_SUGGESTIONS = (
  Array.isArray(siteProfile.aiSuggestions) && siteProfile.aiSuggestions.length > 0
    ? siteProfile.aiSuggestions
    : [
        'Stwórz nową podstronę promocji i podepnij ją w menu',
        'Dodaj sekcję FAQ z 3 pytaniami dla klientów',
        'Popraw teksty na stronie głównej na bardziej czytelne',
        'Jak dodać zdjęcia i opublikować zmiany?',
      ]
).map((prompt, idx) => ({
  icon: AI_CHIP_ICONS[idx % AI_CHIP_ICONS.length],
  prompt: String(prompt),
}));

function getFriendlyAiModelName(modelId) {
  const id = String(modelId || '').trim();
  if (!id) return '';
  return AI_MODEL_LABELS[id] || id;
}

function isAiReady() {
  const s = state.ai.settings || DEFAULT_AI_SETTINGS;
  if (s.provider === 'proxy') {
    return Boolean(state.ai.proxyStatus?.configured);
  }
  return Boolean(String(s.apiKey || '').trim());
}

function updateAiUiStatus() {
  const s = state.ai.settings || DEFAULT_AI_SETTINGS;
  const ready = isAiReady();
  const dot = $('ai-status-dot');
  const badge = $('ai-mode-badge');
  const setupBanner = $('ai-setup-banner');

  if (dot) {
    dot.classList.remove('is-ready', 'is-unconfigured', 'is-busy');
    if (state.ai.isRunning) {
      dot.classList.add('is-busy');
      dot.title = 'Asystent AI wykonuje polecenie…';
    } else if (ready) {
      dot.classList.add('is-ready');
      dot.title = 'Asystent AI gotowy do pracy';
    } else {
      dot.classList.add('is-unconfigured');
      dot.title = 'Asystent AI wymaga konfiguracji';
    }
  }

  if (badge) {
    badge.classList.remove('is-ready', 'is-unconfigured');
    if (s.provider === 'proxy') {
      if (state.ai.proxyStatus?.configured) {
        const proxyModel = state.ai.proxyStatus.model ? getFriendlyAiModelName(state.ai.proxyStatus.model) : '';
        const isLocalProxy = Boolean(document.querySelector('meta[name="cms-local-proxy"]'));
        badge.textContent = isLocalProxy
          ? proxyModel || 'Gemini AI · gotowy'
          : `Serwer${proxyModel ? ` · ${proxyModel}` : ''}`;
        badge.classList.add('is-ready');
      } else {
        badge.textContent = 'Wymaga konfiguracji';
        badge.classList.add('is-unconfigured');
      }
    } else if (ready) {
      badge.textContent = getFriendlyAiModelName(s.model) || (s.provider === 'openai' ? 'OpenAI' : 'Gemini');
      badge.classList.add('is-ready');
    } else {
      badge.textContent = 'Wymaga konfiguracji';
      badge.classList.add('is-unconfigured');
    }
  }

  if (setupBanner) {
    setupBanner.hidden = ready;
  }

  // W trybie prostym ukryj przycisk „⚙ Ustawienia” klucza API, gdy AI jest już podłączone (klient tego nie rusza)
  const aiSettingsBtn = $('ai-open-settings');
  if (aiSettingsBtn) {
    aiSettingsBtn.hidden = state.uiMode === 'simple' && ready;
  }
}

function setAiDrawerOpen(open) {
  state.ai.open = Boolean(open);
  if (state.ai.open && state.uiMode === 'simple') {
    toggleMoreMenu(false);
    closeSimpleLeftDrawer();
    closeSimpleInspector();
  }
  const drawer = $('ai-drawer');
  const btn = $('btn-ai');
  if (drawer) {
    drawer.classList.toggle('is-open', state.ai.open);
    drawer.setAttribute('aria-hidden', String(!state.ai.open));
  }
  if (btn) {
    btn.classList.toggle('is-open', state.ai.open);
    btn.setAttribute('aria-expanded', String(state.ai.open));
  }
  if (state.ai.open) {
    setTimeout(() => $('ai-input')?.focus(), 140);
  }
}

function populateAiModelDatalist(provider) {
  const datalist = $('ai-model-list');
  if (!datalist) return;
  datalist.replaceChildren();
  const list =
    provider === 'openai'
      ? AI_MODELS.openai || []
      : provider === 'gemini'
        ? AI_MODELS.gemini || []
        : [...(AI_MODELS.gemini || []), ...(AI_MODELS.openai || [])];

  for (const modelId of list) {
    const opt = document.createElement('option');
    opt.value = modelId;
    if (AI_MODEL_LABELS[modelId]) {
      opt.label = AI_MODEL_LABELS[modelId];
    }
    datalist.append(opt);
  }
}

function syncAiSettingsFormVisibility(provider, { updateModelIfDefault = false } = {}) {
  const isProxy = provider === 'proxy';
  const apiKeyGroup = $('ai-api-key-group');
  const proxyGroup = $('ai-proxy-group');
  const apiKeyHelp = $('ai-api-key-help');
  const modelInput = $('ai-model');

  if (apiKeyGroup) apiKeyGroup.hidden = isProxy;
  if (proxyGroup) proxyGroup.hidden = !isProxy;

  populateAiModelDatalist(provider);

  if (updateModelIfDefault && modelInput) {
    const cur = modelInput.value.trim();
    const allKnown = [...(AI_MODELS.gemini || []), ...(AI_MODELS.openai || [])];
    if (!cur || allKnown.includes(cur)) {
      if (provider === 'openai') {
        modelInput.value = AI_MODELS.openai?.[0] || 'gpt-4.1-mini';
      } else if (provider === 'gemini') {
        modelInput.value = AI_MODELS.gemini?.[0] || 'gemini-2.5-flash';
      } else if (state.ai.proxyStatus?.model) {
        modelInput.value = state.ai.proxyStatus.model;
      }
    }
  }

  if (apiKeyHelp) {
    if (provider === 'openai') {
      apiKeyHelp.innerHTML =
        'Klucz jest zapisywany wyłącznie lokalnie w Twojej przeglądarce. Klucz OpenAI utworzysz w <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" class="ai-help-link">panelu OpenAI ↗</a>.';
    } else {
      apiKeyHelp.innerHTML =
        'Klucz jest zapisywany wyłącznie lokalnie w Twojej przeglądarce. Darmowy klucz Google Gemini wygenerujesz w <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" class="ai-help-link">Google AI Studio ↗</a>.';
    }
  }
}

async function refreshProxyStatusInModal(proxyUrl) {
  const statusEl = $('ai-proxy-status');
  if (statusEl) {
    statusEl.className = 'ai-proxy-status';
    statusEl.textContent = 'Sprawdzanie połączenia z serwerem PHP…';
  }
  const info = await checkProxyStatus(proxyUrl || DEFAULT_AI_SETTINGS.proxyUrl);
  state.ai.proxyStatus = info;
  updateAiUiStatus();

  if (!statusEl) return info;
  if (info?.configured) {
    const details = [info.provider, info.model].filter(Boolean).join(' · ');
    statusEl.className = 'ai-proxy-status is-ok';
    statusEl.textContent = `✓ Wykryto skonfigurowane proxy PHP${details ? ` (${details})` : ''} — gotowe do pracy bez klucza u klienta.`;
  } else {
    statusEl.className = 'ai-proxy-status is-warn';
    statusEl.textContent =
      'Proxy PHP nie odpowiedziało statusem gotowości (brak pliku ai-proxy.php lub klucza AI na serwerze). Na GitHub Pages wybierz tryb Google Gemini API.';
  }
  return info;
}

function openAiSettingsDialog() {
  const s = state.ai.settings || loadAiSettings(config.mode === 'hosting' ? 'proxy' : 'gemini');
  $('ai-provider').value = s.provider || 'gemini';
  $('ai-model').value = s.model || DEFAULT_AI_SETTINGS.model;
  $('ai-api-key').value = s.apiKey || '';
  $('ai-proxy-url').value = s.proxyUrl || DEFAULT_AI_SETTINGS.proxyUrl;

  syncAiSettingsFormVisibility(s.provider || 'gemini', { updateModelIfDefault: false });
  $('ai-settings-dialog').showModal();

  if ((s.provider || 'gemini') === 'proxy') {
    refreshProxyStatusInModal($('ai-proxy-url').value.trim());
  }
}

async function handleSaveAiSettingsSubmit(e) {
  e.preventDefault();
  const provider = $('ai-provider').value;
  const model = $('ai-model').value.trim();
  const apiKey = $('ai-api-key').value.trim();
  const proxyUrl = $('ai-proxy-url').value.trim() || DEFAULT_AI_SETTINGS.proxyUrl;

  state.ai.settings = saveAiSettings({ provider, model, apiKey, proxyUrl });
  if (provider === 'proxy') {
    await refreshProxyStatusInModal(proxyUrl);
  }
  updateAiUiStatus();
  $('ai-settings-dialog').close();
  showToast('Zapisano ustawienia Asystenta AI.');
}

// ============================================================================
// AI ASSISTANT: SAFE SIMPLE MARKDOWN RENDERER & CHAT UI HELPERS
// ============================================================================

function escapeHtmlSafe(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInlineMarkdown(escapedLine) {
  return escapedLine
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s.,!?:;)]|$)/g, '$1<em>$2</em>');
}

function renderSimpleMarkdown(rawText) {
  const lines = escapeHtmlSafe(String(rawText || '').trim()).split(/\r?\n/);
  const parts = [];
  let inUl = false;
  let inOl = false;
  let paraBuf = [];

  const flushPara = () => {
    if (!paraBuf.length) return;
    parts.push(`<p>${paraBuf.map(renderInlineMarkdown).join('<br>')}</p>`);
    paraBuf = [];
  };
  const closeLists = () => {
    if (inUl) {
      parts.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      parts.push('</ol>');
      inOl = false;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushPara();
      closeLists();
      continue;
    }

    const hMatch = trimmed.match(/^#{1,4}\s+(.+)$/);
    if (hMatch) {
      flushPara();
      closeLists();
      parts.push(`<h4>${renderInlineMarkdown(hMatch[1])}</h4>`);
      continue;
    }

    const ulMatch = trimmed.match(/^[-*•]\s+(.+)$/);
    if (ulMatch) {
      flushPara();
      if (inOl) {
        parts.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        parts.push('<ul>');
        inUl = true;
      }
      parts.push(`<li>${renderInlineMarkdown(ulMatch[1])}</li>`);
      continue;
    }

    const olMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (olMatch) {
      flushPara();
      if (inUl) {
        parts.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        parts.push('<ol>');
        inOl = true;
      }
      parts.push(`<li>${renderInlineMarkdown(olMatch[1])}</li>`);
      continue;
    }

    closeLists();
    paraBuf.push(trimmed);
  }

  flushPara();
  closeLists();

  return parts.join('') || '<p>Gotowe.</p>';
}

function scrollAiMessagesToBottom() {
  const box = $('ai-messages');
  if (box) {
    box.scrollTop = box.scrollHeight;
  }
}

function renderAiWelcomeCard() {
  const container = $('ai-messages');
  if (!container) return;
  container.replaceChildren();

  const card = document.createElement('div');
  card.className = 'ai-welcome';

  const badge = document.createElement('div');
  badge.className = 'ai-welcome-badge';
  badge.textContent = `✨ Twój asystent w ${siteProfile.studioTitle || 'CMS Studio'}`;

  const h3 = document.createElement('h3');
  h3.textContent = 'W czym mogę dziś pomóc na stronie?';

  const p = document.createElement('p');
  p.textContent =
    'Mogę tworzyć nowe podstrony, dodawać sekcje i kafelki oferty, poprawiać teksty, zdjęcia, SEO oraz aktualizować menu główne.';

  const list = document.createElement('div');
  list.className = 'ai-suggestions';

  for (const item of AI_WELCOME_SUGGESTIONS) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'ai-suggestion-chip';
    chip.dataset.prompt = item.prompt;

    const icon = document.createElement('span');
    icon.className = 'ai-chip-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = item.icon;

    const label = document.createElement('span');
    label.textContent = item.prompt;

    chip.append(icon, label);
    list.append(chip);
  }

  card.append(badge, h3, p, list);
  container.append(card);
}

function formatToolPillLabel(name, args = {}) {
  const base = AI_TOOL_LABELS[name] || `Wykonuję: ${name}`;
  if (!args || typeof args !== 'object') return base;
  if (name === 'create_page' && args.heading) return `${base}: „${args.heading}”`;
  if (name === 'open_page' && args.pagePath) return `${base}: ${args.pagePath}`;
  if (name === 'add_section' && args.templateId) {
    const tpl = (SECTION_TEMPLATES || []).find((t) => t.id === args.templateId);
    return `${base}: ${tpl?.name || args.templateId}`;
  }
  if (name === 'search_images' && args.query) return `${base}: „${args.query}”`;
  if (name === 'update_element_text' && args.fieldKey) return `${base} (${args.fieldKey})`;
  return base;
}

function autoResizeAiInput() {
  const ta = $('ai-input');
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = `${Math.min(148, Math.max(54, ta.scrollHeight))}px`;
}

// ============================================================================
// AI ASSISTANT: CONTEXT SUMMARY & ALL 21 TOOL EXECUTORS
// ============================================================================

function buildAiContextSummary() {
  const entry = getPageEntry(state.currentPagePath);
  const meta = state.canvas?.getMeta?.() || {
    title: entry.title || '',
    description: entry.description || '',
  };
  const globals = getActiveGlobals();
  const counts = getTotalPendingChanges();

  const sections = state.structure.map((sec) => ({
    uid: sec.uid,
    label: sec.label,
    id: sec.id || undefined,
    hidden: sec.hidden || undefined,
    repeaters: sec.repeaters.map((rep) => ({
      repeaterUid: rep.uid,
      itemType: rep.itemType,
      label: rep.label,
      count: rep.count,
      items: rep.items.map((it) => ({
        uid: it.uid,
        label: it.label,
        hidden: it.hidden || undefined,
      })),
    })),
  }));

  return JSON.stringify({
    currentPage: {
      path: state.currentPagePath,
      label: entry.label,
      group: entry.group,
      meta,
      isNew: Boolean(entry.isNew),
      isModified: Boolean(entry.isModified || state.currentPageDirty),
    },
    selectedUid: state.selectedDescriptor?.uid || null,
    sections,
    availableSectionTemplates: (SECTION_TEMPLATES || []).map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
    })),
    availablePageTemplates: (PAGE_TEMPLATES || []).map((t) => ({
      id: t.id,
      name: t.name,
      defaultFolder: t.defaultFolder,
    })),
    menuCount: globals.menu?.length || 0,
    totalPagesCount: getAllPagesMerged().filter((p) => !p.deleted).length,
    pendingDraftChanges: counts.total,
    hostingMode: config.mode,
  });
}

function formatDescriptorForAi(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const freshStruct = normalizeStructure(state.canvas?.getStructure?.());
  const repByUid = new Map();
  for (const sec of freshStruct) {
    for (const rep of sec.repeaters) {
      repByUid.set(rep.uid, rep);
    }
  }

  const childRepeaters = (raw.childRepeaters || []).map((r) => {
    const uid = r.repeaterUid || r.uid;
    const fromStruct = repByUid.get(uid);
    return {
      repeaterUid: uid,
      itemType: r.itemType || fromStruct?.itemType || '',
      label: r.label || fromStruct?.label || 'Elementy',
      count: fromStruct?.count ?? r.count ?? 0,
      items: fromStruct?.items || [],
    };
  });

  return {
    uid: raw.uid,
    kind: raw.kind,
    tag: raw.tag,
    label: raw.label,
    id: raw.id || '',
    hidden: Boolean(raw.hidden),
    textFields: (raw.textFields || []).map((f) => ({
      key: f.key,
      label: f.label,
      value: f.value,
      multiline: Boolean(f.multiline),
    })),
    links: (raw.links || []).map((l) => ({
      index: l.index,
      label: l.label,
      href: l.href,
      rootPath: l.rootPath || '',
      target: l.target || '',
      text: l.text || '',
    })),
    image: raw.image
      ? {
          rootPath: raw.image.rootPath || '',
          src: raw.image.src || '',
          alt: raw.image.alt || '',
        }
      : null,
    stars: raw.stars ?? null,
    repeaterContext: raw.repeaterContext || null,
    childRepeaters,
  };
}

function resolveTextFieldKey(textFields, requestedKey) {
  const fields = Array.isArray(textFields) ? textFields : [];
  if (!fields.length) return null;

  const req = String(requestedKey || '').trim();
  if (req) {
    // 1. Exact key match
    const exact = fields.find((f) => f.key === req);
    if (exact) return exact.key;

    // 2. Case-insensitive key match
    const lowerReq = req.toLowerCase();
    const ci = fields.find((f) => String(f.key).toLowerCase() === lowerReq);
    if (ci) return ci.key;

    // 3. Normalized Polish label match (exact or partial)
    const normReq = normalizeTextForSearch(req);
    const byLabelExact = fields.find((f) => normalizeTextForSearch(f.label) === normReq);
    if (byLabelExact) return byLabelExact.key;

    const byLabelPart = fields.find(
      (f) =>
        normalizeTextForSearch(f.label).includes(normReq) ||
        normReq.includes(normalizeTextForSearch(f.label))
    );
    if (byLabelPart) return byLabelPart.key;

    // 4. Semantic alias matching
    const aliasGroups = [
      ['title', 'heading', 'h1', 'h2', 'h3', 'name', 'question', 'summary', 'naglowek', 'tytul', 'pytanie'],
      ['body', 'desc', 'description', 'text', 'content', 'answer', 'quote', 'lead', 'opis', 'tresc', 'odpowiedz', 'akapit'],
      ['eyebrow', 'kicker', 'tag', 'nadtytul', 'etykieta'],
      ['cta', 'button', 'link', 'przycisk'],
      ['source', 'author', 'zrodlo', 'autor'],
    ];
    for (const group of aliasGroups) {
      if (group.includes(normReq)) {
        const matched = fields.find((f) => group.includes(normalizeTextForSearch(f.key)));
        if (matched) return matched.key;
      }
    }
  }

  // 5. Fallback when element has exactly 1 text field
  if (fields.length === 1) {
    return fields[0].key;
  }

  return null;
}

function syncUiAfterAiMutation() {
  if (state.canvas) {
    state.structure = normalizeStructure(state.canvas.getStructure?.());
    state.selectedDescriptor = normalizeDescriptor(state.canvas.getSelectedDescriptor?.());
  }
  state.currentPageDirty = true;
  pushUndoSnapshot(false);
  renderStructureTree();
  renderInspector();
  updateTopbarAndIndicators();
  scheduleAutosave();
}

async function executeAiTool(name, rawArgs = {}) {
  const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};

  // Strażnik bezpieczeństwa wywołań narzędzi AI (blast radius, ochrona stron, blokada XSS/URL)
  const guard = aiGuardrails.checkToolCall(name, args);
  if (!guard.allowed) {
    return {
      ok: false,
      blockedBySecurity: true,
      error: guard.reason || 'Operacja zablokowana przez zabezpieczenia panelu.',
    };
  }
  if (guard.requiresConfirm) {
    const targetDesc = args.pagePath || args.path || name;
    const confirmed = window.confirm(
      `Asystent AI prosi o potwierdzenie operacji „${name}” dla „${targetDesc}”. Czy zezwalasz?`
    );
    if (!confirmed) {
      return {
        ok: false,
        error: 'Użytkownik nie wyraził zgody na wykonanie tej operacji.',
      };
    }
  }

  // Helper ensuring canvas is ready for page-level DOM tools
  const requireCanvas = () => {
    if (!state.canvas) {
      return { ok: false, error: 'Podgląd strony nie jest jeszcze załadowany.' };
    }
    return null;
  };

  switch (name) {
    // 1. get_page_structure
    case 'get_page_structure': {
      const err = requireCanvas();
      if (err) return err;
      state.structure = normalizeStructure(state.canvas.getStructure?.());
      return {
        ok: true,
        pagePath: state.currentPagePath,
        meta: state.canvas.getMeta?.() || { title: '', description: '' },
        selectedUid: state.selectedDescriptor?.uid || null,
        sections: state.structure,
      };
    }

    // 2. get_element_details
    case 'get_element_details': {
      const err = requireCanvas();
      if (err) return err;
      const uid = String(args.uid || '').trim();
      if (!uid) return { ok: false, error: 'Brak wymaganego parametru uid.' };
      const raw = state.canvas.selectByUid(uid, { scroll: false }) || state.canvas.getSelectedDescriptor?.();
      if (!raw || raw.uid !== uid) {
        return { ok: false, error: `Nie znaleziono elementu o uid „${uid}” na bieżącej stronie.` };
      }
      return {
        ok: true,
        ...formatDescriptorForAi(raw),
      };
    }

    // 3. update_element_text (obsługuje pojedyncze fieldKey+value ORAZ wsadowe fields: { k: v, ... })
    case 'update_element_text': {
      const err = requireCanvas();
      if (err) return err;
      const uid = String(args.uid || '').trim();
      if (!uid) return { ok: false, error: 'Brak wymaganego parametru uid.' };

      const raw = state.canvas.selectByUid(uid, { scroll: false });
      if (!raw || raw.uid !== uid) {
        return { ok: false, error: `Nie znaleziono elementu o uid „${uid}”.` };
      }

      // Tryb wsadowy: wiele pól tekstu naraz w jednym wywołaniu
      if (args.fields && typeof args.fields === 'object' && !Array.isArray(args.fields)) {
        const entries = Object.entries(args.fields).filter(([, v]) => v !== undefined && v !== null);
        if (entries.length === 0) {
          return { ok: false, error: 'Obiekt fields nie zawiera żadnych pól do aktualizacji.' };
        }
        state.lastMutateTime = 0;
        const updatedKeys = [];
        const skippedKeys = [];
        for (const [reqKey, val] of entries) {
          const resolvedKey = resolveTextFieldKey(raw.textFields, reqKey);
          if (resolvedKey && state.canvas.updateField(uid, resolvedKey, String(val))) {
            updatedKeys.push(resolvedKey);
          } else {
            skippedKeys.push(reqKey);
          }
        }
        if (updatedKeys.length === 0) {
          return {
            ok: false,
            error: `Nie dopasowano żadnego pola z fields. Dostępne pola: ${
              (raw.textFields || []).map((f) => `${f.key} (${f.label})`).join(', ') || 'brak'
            }.`,
          };
        }
        syncUiAfterAiMutation();
        const freshRaw = state.canvas.selectByUid(uid, { scroll: false });
        return {
          ok: true,
          uid,
          updatedKeys,
          ...(skippedKeys.length ? { skippedKeys } : {}),
          details: formatDescriptorForAi(freshRaw),
        };
      }

      if (args.value === undefined || args.value === null) {
        return { ok: false, error: 'Brak nowej treści tekstowej (value lub fields).' };
      }

      const nextValue = String(args.value);
      const resolvedKey = resolveTextFieldKey(raw.textFields, args.fieldKey);
      state.lastMutateTime = 0;

      if (resolvedKey) {
        const updated = state.canvas.updateField(uid, resolvedKey, nextValue);
        if (!updated) {
          return {
            ok: false,
            error: `Nie udało się zaktualizować pola „${resolvedKey}” w elemencie „${uid}”.`,
          };
        }
        syncUiAfterAiMutation();
        const freshRaw = state.canvas.selectByUid(uid, { scroll: false });
        return {
          ok: true,
          uid,
          fieldKey: resolvedKey,
          value: nextValue,
          details: formatDescriptorForAi(freshRaw),
        };
      }

      // Fallback dla pojedynczego bloku tekstowego (np. akapit/punkt listy dodany przez add_text_block)
      const doc = $('preview')?.contentDocument;
      const domEl = doc?.querySelector(`[data-cms-uid="${CSS.escape(uid)}"]`);
      if (domEl && /^(P|H1|H2|H3|H4|LI|SPAN|BLOCKQUOTE)$/i.test(domEl.tagName)) {
        domEl.textContent = nextValue;
        syncUiAfterAiMutation();
        return { ok: true, uid, fieldKey: 'text', value: nextValue };
      }

      return {
        ok: false,
        error: `Nie znaleziono pola „${args.fieldKey || ''}” w elemencie „${uid}”. Dostępne pola: ${
          (raw.textFields || []).map((f) => `${f.key} (${f.label})`).join(', ') || 'brak'
        }.`,
      };
    }

    // 4. update_element_link
    case 'update_element_link': {
      const err = requireCanvas();
      if (err) return err;
      const uid = String(args.uid || '').trim();
      if (!uid) return { ok: false, error: 'Brak wymaganego parametru uid.' };

      const raw = state.canvas.selectByUid(uid, { scroll: false });
      if (!raw || raw.uid !== uid) {
        return { ok: false, error: `Nie znaleziono elementu o uid „${uid}”.` };
      }

      const payload = {};
      if (args.href !== undefined && args.href !== null) {
        const trimmedHref = String(args.href).trim();
        if (!trimmedHref || /^(https?:|\/\/|tel:|mailto:|#|javascript:)/i.test(trimmedHref)) {
          payload.href = trimmedHref;
        } else {
          const cleanRoot = trimmedHref.replace(/^\/+/, '');
          payload.href = toRelativeUrl(cleanRoot, state.currentPagePath);
        }
      }
      if (args.target !== undefined) payload.target = String(args.target || '');
      if (args.text !== undefined) payload.text = String(args.text);
      if (Number.isInteger(args.linkIndex)) payload.index = args.linkIndex;

      state.lastMutateTime = 0;
      const updated = state.canvas.updateLink(uid, payload);
      if (!updated) {
        return { ok: false, error: `Element „${uid}” nie posiada edytowalnego odnośnika.` };
      }
      syncUiAfterAiMutation();
      const freshRaw = state.canvas.selectByUid(uid, { scroll: false });
      return {
        ok: true,
        uid,
        href: payload.href ?? null,
        details: formatDescriptorForAi(freshRaw),
      };
    }

    // 5. update_element_image
    case 'update_element_image': {
      const err = requireCanvas();
      if (err) return err;
      const uid = String(args.uid || '').trim();
      if (!uid) return { ok: false, error: 'Brak wymaganego parametru uid.' };

      const raw = state.canvas.selectByUid(uid, { scroll: false });
      if (!raw || raw.uid !== uid) {
        return { ok: false, error: `Nie znaleziono elementu o uid „${uid}”.` };
      }

      const imgPayload = {};
      let cleanPath = '';
      if (args.imagePath) {
        cleanPath = String(args.imagePath).trim().replace(/^\/+/, '').replace(/^(\.\.\/)+/, '');
        const pendingItem = state.pendingImages[cleanPath];
        const previewUrl = pendingItem?.dataUrl || toRelativeUrl(cleanPath, state.currentPagePath);
        if (pendingItem?.dataUrl) {
          state.canvas.refreshPendingImages?.(getPendingImageUrlMap());
        }
        imgPayload.rootPath = cleanPath;
        imgPayload.src = previewUrl;
      }
      if (args.alt !== undefined) {
        imgPayload.alt = String(args.alt);
      }

      state.lastMutateTime = 0;
      const updated = state.canvas.updateImage(uid, imgPayload);
      if (!updated) {
        return { ok: false, error: `Element „${uid}” nie zawiera zdjęcia do podmiany.` };
      }
      syncUiAfterAiMutation();
      const freshRaw = state.canvas.selectByUid(uid, { scroll: false });
      return {
        ok: true,
        uid,
        imagePath: cleanPath || undefined,
        alt: args.alt,
        details: formatDescriptorForAi(freshRaw),
      };
    }

    // 6. update_review_stars
    case 'update_review_stars': {
      const err = requireCanvas();
      if (err) return err;
      const uid = String(args.uid || '').trim();
      if (!uid) return { ok: false, error: 'Brak wymaganego parametru uid.' };
      state.canvas.selectByUid(uid, { scroll: false });
      const starsCount = Math.min(5, Math.max(1, Math.round(Number(args.stars) || 5)));
      state.lastMutateTime = 0;
      const updated = state.canvas.updateStars(uid, starsCount);
      if (!updated) {
        return { ok: false, error: `Element „${uid}” nie posiada oceny gwiazdkowej.` };
      }
      syncUiAfterAiMutation();
      return { ok: true, uid, stars: starsCount };
    }

    // 7. move_element
    case 'move_element': {
      const err = requireCanvas();
      if (err) return err;
      const uid = String(args.uid || '').trim();
      const direction = args.direction;
      if (!uid || !direction) return { ok: false, error: 'Wymagane parametry: uid oraz direction.' };
      state.canvas.selectByUid(uid, { scroll: false });
      state.lastMutateTime = 0;
      const moved = state.canvas.moveNode(uid, direction);
      if (!moved) {
        return {
          ok: false,
          error: `Nie można przesunąć elementu „${uid}” w kierunku „${direction}” (może być już na skraju).`,
        };
      }
      syncUiAfterAiMutation();
      return { ok: true, uid, direction, structure: state.structure };
    }

    // 8. toggle_element_visibility
    case 'toggle_element_visibility': {
      const err = requireCanvas();
      if (err) return err;
      const uid = String(args.uid || '').trim();
      if (!uid) return { ok: false, error: 'Brak wymaganego parametru uid.' };
      state.canvas.selectByUid(uid, { scroll: false });
      state.lastMutateTime = 0;
      const ok = state.canvas.toggleHidden(uid);
      if (!ok) return { ok: false, error: `Nie znaleziono elementu o uid „${uid}”.` };
      syncUiAfterAiMutation();
      const freshRaw = state.canvas.selectByUid(uid, { scroll: false });
      return { ok: true, uid, hidden: Boolean(freshRaw?.hidden) };
    }

    // 9. duplicate_element
    case 'duplicate_element': {
      const err = requireCanvas();
      if (err) return err;
      const uid = String(args.uid || '').trim();
      if (!uid) return { ok: false, error: 'Brak wymaganego parametru uid.' };
      state.canvas.selectByUid(uid, { scroll: false });
      state.lastMutateTime = 0;
      const newUid = state.canvas.duplicateNode(uid);
      if (!newUid) return { ok: false, error: `Nie udało się zduplikować elementu „${uid}”.` };
      syncUiAfterAiMutation();
      const freshRaw = state.canvas.selectByUid(newUid, { scroll: true });
      return {
        ok: true,
        newUid,
        details: formatDescriptorForAi(freshRaw),
      };
    }

    // 10. delete_element
    case 'delete_element': {
      const err = requireCanvas();
      if (err) return err;
      const uid = String(args.uid || '').trim();
      if (!uid) return { ok: false, error: 'Brak wymaganego parametru uid.' };
      state.lastMutateTime = 0;
      const ok = state.canvas.deleteNode(uid);
      if (!ok) return { ok: false, error: `Nie udało się usunąć elementu „${uid}”.` };
      syncUiAfterAiMutation();
      return { ok: true, deletedUid: uid, structure: state.structure };
    }

    // 11. add_section
    case 'add_section': {
      const err = requireCanvas();
      if (err) return err;
      const templateId = String(args.templateId || '').trim();
      const tpl = (SECTION_TEMPLATES || []).find((t) => t.id === templateId);
      if (!tpl) {
        return {
          ok: false,
          error: `Nieznany szablon sekcji „${templateId}”. Dostępne: ${(SECTION_TEMPLATES || []).map((t) => t.id).join(', ')}.`,
        };
      }
      state.lastMutateTime = 0;
      const newUid = state.canvas.insertSection(templateId, args.afterSectionUid || null);
      if (!newUid) {
        return { ok: false, error: `Nie udało się dodać sekcji „${templateId}”.` };
      }
      syncUiAfterAiMutation();
      const freshRaw = state.canvas.selectByUid(newUid, { scroll: true });
      return {
        ok: true,
        newUid,
        templateId,
        details: formatDescriptorForAi(freshRaw),
        structure: state.structure,
      };
    }

    // 12. add_item
    case 'add_item': {
      const err = requireCanvas();
      if (err) return err;
      const repeaterUid = String(args.repeaterUid || '').trim();
      if (!repeaterUid) return { ok: false, error: 'Brak wymaganego parametru repeaterUid.' };
      state.lastMutateTime = 0;
      const newUid = state.canvas.insertItem(repeaterUid, args.itemType || null);
      if (!newUid) {
        return {
          ok: false,
          error: `Nie udało się dodać elementu do kontenera „${repeaterUid}”. Sprawdź repeaterUid przez get_page_structure.`,
        };
      }
      state.expandedRepeaters.add(repeaterUid);
      syncUiAfterAiMutation();
      const freshRaw = state.canvas.selectByUid(newUid, { scroll: true });
      return {
        ok: true,
        newUid,
        repeaterUid,
        details: formatDescriptorForAi(freshRaw),
      };
    }

    // 13. add_text_block
    case 'add_text_block': {
      const err = requireCanvas();
      if (err) return err;
      const uid = String(args.uid || '').trim();
      const blockType = args.blockType || 'paragraph';
      const text = args.text !== undefined && args.text !== null ? String(args.text) : '';
      state.lastMutateTime = 0;

      const newUid = state.canvas.insertBlockInside(uid || null, blockType);
      if (!newUid) {
        return { ok: false, error: `Nie udało się dodać bloku tekstu do „${uid}”.` };
      }

      if (text.trim()) {
        const fresh = state.canvas.selectByUid(newUid, { scroll: false });
        if (fresh?.textFields?.length > 0) {
          state.canvas.updateField(newUid, fresh.textFields[0].key, text);
        } else {
          const doc = $('preview')?.contentDocument;
          const insertedEl = doc?.querySelector(`[data-cms-uid="${CSS.escape(newUid)}"]`);
          if (insertedEl) {
            insertedEl.textContent = text;
          }
        }
      }

      syncUiAfterAiMutation();
      const finalRaw = state.canvas.selectByUid(newUid, { scroll: true });
      return {
        ok: true,
        newUid,
        blockType,
        text,
        details: formatDescriptorForAi(finalRaw),
      };
    }

    // 14. set_page_meta
    case 'set_page_meta': {
      const err = requireCanvas();
      if (err) return err;
      const metaPatch = {};
      if (args.title !== undefined) metaPatch.title = String(args.title);
      if (args.description !== undefined) metaPatch.description = String(args.description);
      state.lastMutateTime = 0;
      state.canvas.setMeta(metaPatch);
      syncUiAfterAiMutation();
      return {
        ok: true,
        pagePath: state.currentPagePath,
        meta: state.canvas.getMeta?.() || metaPatch,
      };
    }

    // 15. list_pages
    case 'list_pages': {
      const q = normalizeTextForSearch(args.query || '');
      const group = String(args.group || 'all').trim();
      const all = getAllPagesMerged().filter((p) => !p.deleted);
      const filtered = all.filter((p) => {
        if (group === 'changed') {
          if (!p.isModified && !p.isNew) return false;
        } else if (group === 'glowne') {
          if (p.group !== 'home' && p.group !== 'glowne') return false;
        } else if (group && group !== 'all') {
          if (p.group !== group) return false;
        }
        if (q) {
          const hay = normalizeTextForSearch(`${p.label} ${p.title} ${p.path}`);
          if (!hay.includes(q)) return false;
        }
        return true;
      });
      return {
        ok: true,
        total: filtered.length,
        pages: filtered.slice(0, 40).map((p) => ({
          path: p.path,
          label: p.label,
          group: p.group,
          isNew: Boolean(p.isNew),
          dirty: Boolean(p.isModified || (p.path === state.currentPagePath && state.currentPageDirty)),
        })),
      };
    }

    // 16. open_page
    case 'open_page': {
      const rawPath = String(args.pagePath || '').trim().replace(/^\/+/, '');
      if (!rawPath) return { ok: false, error: 'Podaj ścieżkę podstrony (pagePath).' };
      const all = getAllPagesMerged().filter((p) => !p.deleted);
      const found =
        all.find((p) => p.path === rawPath) ||
        all.find((p) => p.path === `${rawPath.replace(/\/+$/, '')}/index.html`);
      if (!found) {
        return {
          ok: false,
          error: `Nie znaleziono podstrony „${rawPath}”. Użyj narzędzia list_pages, aby sprawdzić dostępne adresy.`,
        };
      }
      await loadPage(found.path);
      return {
        ok: true,
        pagePath: state.currentPagePath,
        meta: state.canvas?.getMeta?.() || { title: found.title, description: found.description },
        sections: state.structure,
      };
    }

    // 17. create_page
    case 'create_page': {
      const heading = String(args.heading || '').trim();
      if (!heading) return { ok: false, error: 'Podaj nagłówek nowej podstrony (heading).' };

      const reqTplId = String(args.templateId || 'info').trim();
      const tpl =
        reqTplId === 'duplicate'
          ? null
          : (PAGE_TEMPLATES || []).find((t) => t.id === reqTplId) ||
            (PAGE_TEMPLATES || []).find((t) => t.id === 'info') ||
            PAGE_TEMPLATES[0];

      const folderRaw =
        args.folder !== undefined && args.folder !== null
          ? String(args.folder).trim().replace(/^\/+|\/+$/g, '')
          : tpl?.defaultFolder ?? 'promocje';

      const slug = slugifyPath(String(args.slug || heading).trim()) || `strona-${Date.now().toString(36)}`;
      const newPath = folderRaw ? `${folderRaw}/${slug}/index.html` : `${slug}/index.html`;

      const exists = getAllPagesMerged().some((p) => p.path === newPath && !p.deleted);
      if (exists) {
        return {
          ok: false,
          error: `Strona pod adresem „${newPath}” już istnieje. Wybierz inny slug lub otwórz ją przez open_page.`,
        };
      }

      const eyebrow = String(args.eyebrow || '').trim();
      const lead = String(args.lead || '').trim();
      const brandLabel = siteProfile.brandName || 'Strona';
      const title = String(args.title || '').trim() || `${heading} | ${brandLabel}`;
      const description =
        String(args.description || '').trim() || lead || `${heading} — oferta ${brandLabel}.`;
      const globals = getActiveGlobals();

      let html = '';
      if (reqTplId === 'duplicate' && state.canvas) {
        await flushAutosaveIfNeeded();
        const sourceHtml = safeSerializeHtml();
        const rebased = rebaseRelativeUrlsInHtml(sourceHtml, state.currentPagePath, newPath);
        const parser = new DOMParser();
        const doc = parser.parseFromString(rebased, 'text/html');
        doc.title = title;
        let metaDesc = doc.querySelector('meta[name="description"]');
        if (!metaDesc) {
          metaDesc = doc.createElement('meta');
          metaDesc.setAttribute('name', 'description');
          doc.head.append(metaDesc);
        }
        metaDesc.setAttribute('content', description);
        const h1 = doc.querySelector('h1');
        if (h1) h1.textContent = heading;
        html = '<!doctype html>\n' + doc.documentElement.outerHTML;
      } else {
        html = tpl.createPageHtml({
          path: newPath,
          title,
          description,
          heading,
          eyebrow,
          lead,
          globals,
        });
      }

      const draft = {
        html,
        title,
        description,
        label: heading,
        group: inferPageGroup(newPath),
        isNew: true,
        deleted: false,
      };

      await savePageDraft(newPath, draft);
      state.pageDrafts[newPath] = draft;

      let addedToMenu = false;
      if (args.addToMenu) {
        const nextGlobals = normalizeGlobalsObj(getActiveGlobals());
        if (!nextGlobals.menu.some((m) => m.href === newPath)) {
          nextGlobals.menu.push({ label: heading, href: newPath, mobileHref: '' });
          await saveGlobalsDraft(nextGlobals);
          state.globalsDraft = nextGlobals;
          addedToMenu = true;
        }
      }

      await loadPage(newPath);
      const editableSections = (state.structure || []).slice(0, 8).map((sec) => {
        const det = state.canvas?.selectByUid?.(sec.uid, { scroll: false });
        return {
          uid: sec.uid,
          label: sec.label,
          textFields: (det?.textFields || []).map((f) => ({ key: f.key, label: f.label, value: f.value })),
        };
      });
      state.canvas?.clearSelection?.();
      return {
        ok: true,
        pagePath: newPath,
        addedToMenu,
        meta: state.canvas?.getMeta?.() || { title, description },
        sections: state.structure,
        editableSections,
      };
    }

    // 18. search_images (inteligentne wyszukiwanie wielowyrazowe z punktacją)
    case 'search_images': {
      const q = normalizeTextForSearch(args.query || '');
      const tokens = q.split(/\s+/).filter((t) => t.length >= 2);
      const folder = String(args.folder || 'all').trim();
      const limit = Math.min(50, Math.max(1, Number(args.limit) || 20));
      const includeThumbs = q.includes('thumb') || q.includes('miniatur');

      const all = getAllMediaItems();
      const scored = [];
      for (const item of all) {
        if (item.thumb && !includeThumbs) continue;
        if (folder && folder !== 'all') {
          if (folder === 'uploads') {
            if (!item.isPending && item.folder !== 'uploads') continue;
          } else if (item.folder !== folder) {
            continue;
          }
        }
        if (tokens.length > 0) {
          const hay = normalizeTextForSearch(`${item.name} ${item.path} ${item.folder}`);
          let hits = 0;
          for (const tok of tokens) {
            if (hay.includes(tok)) hits += 1;
          }
          if (hits === 0) continue;
          scored.push({ item, score: hits + (hay.includes(q) ? 5 : 0) });
        } else {
          scored.push({ item, score: 1 });
        }
      }
      scored.sort((a, b) => b.score - a.score);
      const filtered = scored.map((s) => s.item);

      return {
        ok: true,
        total: filtered.length,
        images: filtered.slice(0, limit).map((i) => ({
          path: i.path,
          folder: i.folder,
          name: i.name,
          isPending: Boolean(i.isPending),
        })),
      };
    }

    // 19. get_globals
    case 'get_globals': {
      return {
        ok: true,
        globals: getActiveGlobals(),
        hasDraft: Boolean(state.globalsDraft),
      };
    }

    // 20. update_globals
    case 'update_globals': {
      const g = normalizeGlobalsObj(getActiveGlobals());

      if (typeof args.phoneDisplay === 'string' && args.phoneDisplay.trim()) {
        g.phoneDisplay = args.phoneDisplay.trim();
        if (!args.phoneHref) {
          const digits = g.phoneDisplay.replace(/[^\d+]/g, '');
          if (digits) {
            g.phoneHref = digits.startsWith('+')
              ? `tel:${digits}`
              : digits.length === 9
                ? `tel:+48${digits}`
                : `tel:${digits}`;
          }
        }
      }
      if (typeof args.phoneHref === 'string' && args.phoneHref.trim()) {
        g.phoneHref = args.phoneHref.trim();
      }
      if (typeof args.email === 'string' && args.email.trim()) {
        g.email = args.email.trim();
      }
      if (typeof args.facebookUrl === 'string' && args.facebookUrl.trim()) {
        g.facebookUrl = args.facebookUrl.trim();
        g.facebookLabel = g.facebookUrl.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, '');
      }
      if (typeof args.footerCopy === 'string') {
        g.footerCopy = args.footerCopy;
      }

      if (Array.isArray(args.menu)) {
        g.menu = args.menu
          .filter((i) => i && String(i.label || '').trim() && String(i.href || '').trim())
          .map((i) => ({
            label: String(i.label).trim(),
            href: String(i.href).trim().replace(/^\/+/, ''),
            mobileHref: i.mobileHref ? String(i.mobileHref).trim() : '',
          }));
      }

      if (Array.isArray(args.footerLinks)) {
        g.footerLinks = args.footerLinks
          .filter((i) => i && String(i.label || '').trim() && String(i.href || '').trim())
          .map((i) => ({
            label: String(i.label).trim(),
            href: String(i.href).trim().replace(/^\/+/, ''),
          }));
      }

      if (args.addMenuItem && typeof args.addMenuItem === 'object') {
        const lbl = String(args.addMenuItem.label || '').trim();
        const href = String(args.addMenuItem.href || '').trim().replace(/^\/+/, '');
        const mobileHref = args.addMenuItem.mobileHref ? String(args.addMenuItem.mobileHref).trim() : '';
        if (lbl && href) {
          const existingIdx = g.menu.findIndex((m) => m.href === href);
          if (existingIdx >= 0) {
            g.menu[existingIdx] = { label: lbl, href, mobileHref };
          } else {
            g.menu.push({ label: lbl, href, mobileHref });
          }
        }
      }

      if (typeof args.removeMenuHref === 'string' && args.removeMenuHref.trim()) {
        const targetHref = args.removeMenuHref.trim().replace(/^\/+/, '');
        const normTarget = normalizeTextForSearch(targetHref);
        g.menu = g.menu.filter(
          (m) =>
            m.href.replace(/^\/+/, '') !== targetHref &&
            normalizeTextForSearch(m.label) !== normTarget
        );
      }

      await saveGlobalsDraft(g);
      state.globalsDraft = g;
      applyGlobalsPreview(g);
      updateTopbarAndIndicators();
      if (!state.selectedDescriptor) {
        renderPageSettingsInspector();
      }
      return { ok: true, globals: g };
    }

    // 21. undo_last_change
    case 'undo_last_change': {
      const err = requireCanvas();
      if (err) return err;
      const steps = Math.min(10, Math.max(1, Math.round(Number(args.steps) || 1)));
      let undone = 0;
      for (let i = 0; i < steps; i += 1) {
        if (state.undoStack.length === 0) break;
        performUndo();
        undone += 1;
      }
      if (undone === 0) {
        return { ok: false, error: 'Brak wcześniejszych zmian do cofnięcia na bieżącej stronie.' };
      }
      return {
        ok: true,
        undoneSteps: undone,
        remainingUndoSteps: state.undoStack.length,
        structure: state.structure,
      };
    }

    // 22. delete_page
    case 'delete_page': {
      const rawPath = String(args.pagePath || '').trim().replace(/^\/+/, '');
      if (!rawPath) return { ok: false, error: 'Podaj ścieżkę podstrony (pagePath).' };
      if (CORE_PROTECTED_PAGES.has(rawPath)) {
        return {
          ok: false,
          blockedBySecurity: true,
          error: `Strona „${rawPath}” jest chroniona i nie może zostać usunięta.`,
        };
      }
      const all = getAllPagesMerged();
      const page = all.find((p) => p.path === rawPath && !p.deleted);
      if (!page) {
        return { ok: false, error: `Nie znaleziono podstrony „${rawPath}” do usunięcia.` };
      }

      if (page.isNew) {
        await deletePageDraft(page.path);
        delete state.pageDrafts[page.path];
      } else {
        const deletedDraft = {
          html: '',
          title: page.title,
          description: page.description,
          label: page.label,
          group: page.group,
          isNew: false,
          deleted: true,
        };
        await savePageDraft(page.path, deletedDraft);
        state.pageDrafts[page.path] = deletedDraft;
      }

      if (state.currentPagePath === page.path) {
        await loadPage('index.html', { skipFlush: true });
      } else {
        renderPagesList();
        updateTopbarAndIndicators();
      }
      return {
        ok: true,
        deletedPagePath: page.path,
        wasNewDraft: Boolean(page.isNew),
        currentPagePath: state.currentPagePath,
      };
    }

    // 23. update_section_id
    case 'update_section_id': {
      const err = requireCanvas();
      if (err) return err;
      const uid = String(args.uid || '').trim();
      const rawId = String(args.sectionId || '').trim().replace(/^#+/, '');
      if (!uid) return { ok: false, error: 'Brak wymaganego parametru uid.' };
      const cleanId = slugifyPath(rawId);
      if (!cleanId) return { ok: false, error: 'Podaj poprawny identyfikator kotwicy (np. promocje, faq).' };
      state.lastMutateTime = 0;
      const ok = state.canvas.updateSectionId(uid, cleanId);
      if (!ok) {
        return { ok: false, error: `Nie udało się ustawić kotwicy #${cleanId} dla sekcji „${uid}”.` };
      }
      syncUiAfterAiMutation();
      return {
        ok: true,
        uid,
        sectionId: cleanId,
        anchorHref: `#${cleanId}`,
      };
    }

    // 24. reorder_element_to_index
    case 'reorder_element_to_index': {
      const err = requireCanvas();
      if (err) return err;
      const uid = String(args.uid || '').trim();
      const index = Number(args.index);
      if (!uid) return { ok: false, error: 'Brak wymaganego parametru uid.' };
      if (!Number.isInteger(index) || index < 0) {
        return { ok: false, error: 'Parametr index musi być liczbą całkowitą >= 0.' };
      }
      state.lastMutateTime = 0;
      const ok = state.canvas.moveNodeToIndex(uid, index);
      if (!ok) {
        return { ok: false, error: `Nie udało się przenieść elementu „${uid}” na pozycję ${index}.` };
      }
      syncUiAfterAiMutation();
      return {
        ok: true,
        uid,
        index,
        structure: state.structure,
      };
    }

    // 25. update_section_style
    case 'update_section_style': {
      const err = requireCanvas();
      if (err) return err;
      const uid = String(args.uid || '').trim();
      if (!uid) return { ok: false, error: 'Brak wymaganego parametru uid.' };
      const patch = {};
      if (args.tone !== undefined) patch.tone = String(args.tone);
      if (args.align !== undefined) patch.align = String(args.align);
      if (args.spacing !== undefined) patch.spacing = String(args.spacing);
      state.lastMutateTime = 0;
      const ok = state.canvas.updateSectionStyle?.(uid, patch);
      if (!ok) {
        return { ok: false, error: `Nie udało się zmienić stylu sekcji „${uid}”.` };
      }
      syncUiAfterAiMutation();
      const freshRaw = state.canvas.selectByUid(uid, { scroll: false });
      return {
        ok: true,
        uid,
        sectionStyle: freshRaw?.sectionStyle || patch,
      };
    }

    // 26. list_backups
    case 'list_backups': {
      try {
        const res = await listBackups({
          credential: state.savedCredential?.value || '',
          csrfToken: state.auth.csrfToken || '',
        });
        return {
          ok: true,
          mode: res?.mode || config.mode,
          backupsCount: Array.isArray(res?.backups) ? res.backups.length : 0,
          backups: (res?.backups || []).slice(0, 12).map((b) => ({
            id: b.id,
            label: b.label,
            createdAt: b.createdAt || null,
            immutable: Boolean(b.immutable),
          })),
          note: 'Przywracanie kopii zapasowej może wykonać wyłącznie człowiek w oknie „Kopie zapasowe” (🛡️ Kopie).',
        };
      } catch (err) {
        return { ok: false, error: err?.message || 'Nie udało się odczytać listy kopii zapasowych.' };
      }
    }

    // 27. discard_page_draft
    case 'discard_page_draft': {
      const draft = state.pageDrafts[state.currentPagePath];
      if (!draft && !state.currentPageDirty) {
        return { ok: true, message: 'Bieżąca strona nie ma żadnych niezopublikowanych zmian w szkicu.' };
      }
      const isNew = Boolean(draft?.isNew);
      clearTimeout(state.autosaveTimer);
      await deletePageDraft(state.currentPagePath);
      delete state.pageDrafts[state.currentPagePath];
      state.currentPageDirty = false;
      await loadPage(isNew ? 'index.html' : state.currentPagePath, { skipFlush: true });
      return {
        ok: true,
        discardedPage: state.currentPagePath,
        wasNewDraft: isNew,
        structure: state.structure,
      };
    }

    default:
      return { ok: false, error: `Nieznane narzędzie Asystenta AI: ${name}` };
  }
}

// ============================================================================
// AI ASSISTANT: CHAT EXECUTION LOOP
// ============================================================================

async function sendAiPrompt(rawPrompt) {
  const userMessage = String(rawPrompt || '').trim();
  if (!userMessage || state.ai.isRunning) return;

  if (!isAiReady()) {
    openAiSettingsDialog();
    showToast('Skonfiguruj klucz API lub połączenie proxy, aby korzystać z Asystenta AI.', 'warn', 4200);
    return;
  }

  const messagesEl = $('ai-messages');
  if (!messagesEl) return;

  // Usuń kartę powitalną przy pierwszej wiadomości
  messagesEl.querySelector('.ai-welcome')?.remove();

  // Dodaj bąbelek użytkownika
  const userWrap = document.createElement('div');
  userWrap.className = 'ai-msg ai-msg--user';
  const userBubble = document.createElement('div');
  userBubble.className = 'ai-msg-bubble';
  userBubble.textContent = userMessage;
  userWrap.append(userBubble);
  messagesEl.append(userWrap);

  // Przygotuj kontener odpowiedzi asystenta ze zwijanym podsumowaniem kroków + spinnerem
  const botWrap = document.createElement('div');
  botWrap.className = 'ai-msg ai-msg--assistant';

  const toolsDetails = document.createElement('details');
  toolsDetails.className = 'ai-tools-details';
  toolsDetails.hidden = true;
  const toolsSummary = document.createElement('summary');
  toolsSummary.className = 'ai-tools-summary';
  toolsSummary.textContent = 'Wykonuję kroki…';
  const toolsList = document.createElement('div');
  toolsList.className = 'ai-tools-list';
  toolsDetails.append(toolsSummary, toolsList);

  const thinkingEl = document.createElement('div');
  thinkingEl.className = 'ai-thinking';
  thinkingEl.innerHTML = '<span class="ai-thinking-spinner" aria-hidden="true"></span><span>Analizuję stronę i przygotowuję odpowiedź…</span>';

  const botBubble = document.createElement('div');
  botBubble.className = 'ai-msg-bubble ai-md';
  botBubble.hidden = true;

  botWrap.append(toolsDetails, thinkingEl, botBubble);
  messagesEl.append(botWrap);
  scrollAiMessagesToBottom();

  let doneStepsCount = 0;
  let totalStepsCount = 0;
  const updateToolsSummaryText = (finished = false) => {
    const n = totalStepsCount;
    const plural = n === 1 ? 'krok' : n >= 2 && n <= 4 ? 'kroki' : 'kroków';
    toolsSummary.textContent = finished
      ? `✓ Wykonano ${n} ${plural} (szczegóły)`
      : `⏳ Krok ${doneStepsCount}/${n}…`;
  };

  const toolPillsById = new Map();
  const controller = new AbortController();
  state.ai.isRunning = true;
  state.ai.abortController = controller;

  $('ai-send').hidden = true;
  $('ai-stop').hidden = false;
  $('ai-input').disabled = true;
  updateAiUiStatus();

  await flushAutosaveIfNeeded();
  const turnCheckpoint = captureAiTurnCheckpoint();
  let aiDidMutate = false;

  const attachAiUndoButtonIfMutated = () => {
    if (!aiDidMutate) return;
    state.aiUndoStack.push(turnCheckpoint);
    if (state.aiUndoStack.length > 20) state.aiUndoStack.shift();
    updateUndoRedoButtons();

    const bar = document.createElement('div');
    bar.className = 'ai-undo-bar';
    const undoBtn = document.createElement('button');
    undoBtn.type = 'button';
    undoBtn.className = 'ai-undo-turn-btn';
    undoBtn.textContent = '↶ Cofnij tę zmianę AI';
    undoBtn.addEventListener('click', async () => {
      undoBtn.disabled = true;
      const ok = await restoreAiTurnCheckpoint(turnCheckpoint);
      if (ok) {
        undoBtn.textContent = '✓ Cofnięto zmianę AI';
      } else {
        undoBtn.disabled = false;
      }
    });
    bar.append(undoBtn);
    botBubble.append(bar);
  };

  try {
    aiGuardrails.reset();
    const historySnapshot = [...state.ai.history];
    const result = await runAiTurn({
      userMessage,
      history: historySnapshot,
      contextSummary: buildAiContextSummary(),
      settings: state.ai.settings,
      csrfToken: state.auth.csrfToken || '',
      toolExecutor: executeAiTool,
      onToolCall: (callInfo) => {
        const id = callInfo?.id || `${callInfo?.name || 'tool'}_${toolPillsById.size}`;
        const toolName = callInfo?.name || '';
        const toolArgs = callInfo?.args || {};

        toolsDetails.hidden = false;
        totalStepsCount += 1;
        updateToolsSummaryText(false);
        const pill = document.createElement('div');
        pill.className = 'ai-tool-pill is-running';

        const icon = document.createElement('span');
        icon.className = 'ai-tool-pill-icon';
        icon.setAttribute('aria-hidden', 'true');

        const label = document.createElement('span');
        label.className = 'ai-tool-pill-label';
        label.textContent = formatToolPillLabel(toolName, toolArgs);

        pill.append(icon, label);
        toolsList.append(pill);
        toolPillsById.set(id, { pill, icon, label });
        scrollAiMessagesToBottom();
      },
      onToolResult: (resInfo) => {
        const id = resInfo?.id;
        const entry = id ? toolPillsById.get(id) : null;
        const ok = resInfo?.ok !== false && resInfo?.result?.ok !== false;
        if (ok && resInfo?.name && !AI_READ_ONLY_TOOLS.has(resInfo.name)) {
          aiDidMutate = true;
        }
        doneStepsCount += 1;
        updateToolsSummaryText(false);
        if (!entry) return;
        entry.pill.classList.remove('is-running');
        entry.pill.classList.add(ok ? 'is-done' : 'is-error');
        entry.icon.textContent = ok ? '✓' : '✕';
        if (!ok && resInfo?.result?.error) {
          entry.pill.title = String(resInfo.result.error);
        }
        scrollAiMessagesToBottom();
      },
      signal: controller.signal,
    });

    thinkingEl.remove();
    if (totalStepsCount > 0) {
      updateToolsSummaryText(true);
      toolsDetails.open = false;
    }
    const replyText = String(result?.reply || '').trim() || 'Gotowe! Zmiany zostały wprowadzone w szkicu.';
    botBubble.innerHTML = renderSimpleMarkdown(replyText);
    attachAiUndoButtonIfMutated();
    botBubble.hidden = false;

    state.ai.history.push(
      { role: 'user', text: userMessage },
      { role: 'assistant', text: replyText }
    );
    if (state.ai.history.length > 24) {
      state.ai.history = state.ai.history.slice(-24);
    }

    await flushAutosaveIfNeeded();
  } catch (err) {
    thinkingEl.remove();
    const isAbort = err?.name === 'AbortError';
    if (isAbort) {
      botBubble.innerHTML = renderSimpleMarkdown('Zatrzymano wykonywanie polecenia.');
      attachAiUndoButtonIfMutated();
      botBubble.hidden = false;
    } else {
      botWrap.classList.add('ai-msg--error');
      const errMsg = err?.message || 'Wystąpił błąd podczas komunikacji z Asystentem AI.';
      state.lastError = errMsg;
      botBubble.innerHTML = renderSimpleMarkdown(errMsg);
      attachAiUndoButtonIfMutated();
      if (/klucz|autoryzac|proxy|konfigurac/i.test(errMsg)) {
        const act = document.createElement('div');
        act.className = 'ai-error-action';
        const cfgBtn = document.createElement('button');
        cfgBtn.type = 'button';
        cfgBtn.className = 'btn-secondary mini-btn';
        cfgBtn.textContent = '⚙ Otwórz ustawienia AI';
        cfgBtn.addEventListener('click', openAiSettingsDialog);
        act.append(cfgBtn);
        botBubble.append(act);
      }
      botBubble.hidden = false;
    }
    await flushAutosaveIfNeeded();
  } finally {
    state.ai.isRunning = false;
    state.ai.abortController = null;
    $('ai-send').hidden = false;
    $('ai-stop').hidden = true;
    $('ai-input').disabled = false;
    updateAiUiStatus();
    scrollAiMessagesToBottom();
    if (state.ai.open) {
      $('ai-input')?.focus();
    }
  }
}

function clearAiChat() {
  if (state.ai.isRunning) {
    state.ai.abortController?.abort();
  }
  state.ai.history = [];
  renderAiWelcomeCard();
  showToast('Wyczyszczono historię czatu AI.');
}

// ============================================================================
// EVENT WIRING
// ============================================================================

function bindUIEvents() {
  // Topbar actions
  $('page-switcher-btn').addEventListener('click', () => {
    if (state.uiMode === 'simple') {
      const leftPanel = $('panel-left');
      if (leftPanel?.classList.contains('is-drawer-open') && state.activeTab === 'pages') {
        closeSimpleLeftDrawer();
      } else {
        openSimpleLeftDrawer('pages', 'Wybierz lub utwórz stronę');
        $('pages-search')?.focus();
      }
      return;
    }
    switchSidebarTab('pages');
    $('pages-search').focus();
  });

  $('btn-mode-edit')?.addEventListener('click', () => {
    setCanvasBrowseMode(false);
    showToast('Tryb edycji: kliknij tekst lub zdjęcie na stronie, żeby je zmienić.');
  });
  $('btn-mode-browse')?.addEventListener('click', () => {
    setCanvasBrowseMode(true);
    showToast('Tryb przeglądania: wszystkie przyciski i linki działają jak na normalnej stronie.');
  });

  $('btn-simple-add-block')?.addEventListener('click', () => {
    const leftPanel = $('panel-left');
    if (leftPanel?.classList.contains('is-drawer-open') && state.activeTab === 'blocks') {
      closeSimpleLeftDrawer();
    } else {
      state.pendingInsertAfterUid = null;
      openSimpleLeftDrawer('blocks', 'Dodaj nową sekcję');
      updateBlocksInsertBanner();
    }
  });

  $('btn-close-left-drawer')?.addEventListener('click', closeSimpleLeftDrawer);
  $('btn-close-inspector')?.addEventListener('click', () => {
    closeSimpleInspector();
    state.canvas?.clearSelection();
    handleCanvasSelect(null);
  });

  $('btn-dismiss-hint')?.addEventListener('click', () => {
    if ($('simple-hint-bar')) $('simple-hint-bar').hidden = true;
    try {
      localStorage.setItem('cms_hint_dismissed', '1');
    } catch {
      // ignore
    }
  });

  // Simple Mode „Więcej ▾” popover menu
  $('btn-more-menu')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMoreMenu();
  });
  document.addEventListener('click', (e) => {
    const pop = $('more-menu-popover');
    if (!pop || pop.hidden) return;
    if (!e.target.closest('.more-menu-wrap')) {
      toggleMoreMenu(false);
    }
  });
  $('more-undo')?.addEventListener('click', () => {
    toggleMoreMenu(false);
    performUndo();
  });
  $('more-globals')?.addEventListener('click', () => {
    toggleMoreMenu(false);
    openGlobalsDialog();
  });
  $('more-media')?.addEventListener('click', () => {
    toggleMoreMenu(false);
    openMediaDialog({ mode: 'browse' });
  });
  $('more-vp-desktop')?.addEventListener('click', () => {
    toggleMoreMenu(false);
    setViewportMode('desktop');
  });
  $('more-vp-mobile')?.addEventListener('click', () => {
    toggleMoreMenu(false);
    setViewportMode('mobile');
  });
  $('more-backups')?.addEventListener('click', () => {
    toggleMoreMenu(false);
    openBackupsDialog();
  });
  $('more-discard')?.addEventListener('click', () => {
    toggleMoreMenu(false);
    handleDiscardCurrentPage();
  });
  $('more-toggle-mode')?.addEventListener('click', () => {
    setUiMode('advanced');
    updateAiUiStatus();
    renderInspector();
    showToast('Przełączono na tryb administratora.');
  });
  $('btn-simple-mode-back')?.addEventListener('click', () => {
    setUiMode('simple');
    updateAiUiStatus();
    renderInspector();
    showToast('Wrócono do trybu prostego.');
  });

  $('btn-undo').addEventListener('click', performUndo);
  $('btn-simple-undo')?.addEventListener('click', performUndo);
  $('btn-redo').addEventListener('click', performRedo);

  document.querySelectorAll('.vp-btn').forEach((btn) => {
    btn.addEventListener('click', () => setViewportMode(btn.dataset.viewport));
  });

  $('btn-globals').addEventListener('click', openGlobalsDialog);
  $('btn-media').addEventListener('click', () => openMediaDialog({ mode: 'browse' }));
  $('btn-ai').addEventListener('click', () => setAiDrawerOpen(!state.ai.open));
  $('btn-backups')?.addEventListener('click', openBackupsDialog);
  $('btn-support')?.addEventListener('click', openSupportDialog);
  $('btn-logout')?.addEventListener('click', handleLogoutClick);
  $('btn-save-draft').addEventListener('click', () => saveCurrentPageDraft({ silent: false }));
  $('btn-publish').addEventListener('click', openPublishDialog);

  // Login gate events
  $('login-form')?.addEventListener('submit', handleLoginSubmit);
  $('login-support-btn')?.addEventListener('click', openSupportDialog);

  // Backups modal events
  $('btn-create-backup')?.addEventListener('click', handleCreateBackup);
  $('btn-refresh-backups')?.addEventListener('click', refreshBackupsList);
  $('backups-export-json')?.addEventListener('click', handleExportBackup);
  $('backups-import-json')?.addEventListener('click', () => $('import-backup-input').click());
  $('backups-support-btn')?.addEventListener('click', () => {
    $('backups-dialog')?.close();
    openSupportDialog();
  });

  // Support modal events
  $('support-copy-phone')?.addEventListener('click', copySupportPhone);
  $('support-open-backups')?.addEventListener('click', () => {
    $('support-dialog')?.close();
    openBackupsDialog();
  });
  $('support-copy-diag')?.addEventListener('click', copyDiagnosticReport);
  $('pub-help-btn')?.addEventListener('click', () => {
    $('publish-dialog')?.close();
    openSupportDialog();
  });

  // AI Assistant drawer & settings modal events
  $('ai-close-drawer').addEventListener('click', () => setAiDrawerOpen(false));
  $('ai-open-settings').addEventListener('click', openAiSettingsDialog);
  $('ai-setup-btn').addEventListener('click', openAiSettingsDialog);
  $('ai-clear-chat').addEventListener('click', clearAiChat);

  $('ai-messages').addEventListener('click', (e) => {
    const chip = e.target.closest('.ai-suggestion-chip');
    if (!chip) return;
    const prompt = chip.dataset.prompt || chip.textContent.trim();
    if (!prompt) return;
    if (!isAiReady()) {
      $('ai-input').value = prompt;
      autoResizeAiInput();
      openAiSettingsDialog();
      showToast('Skonfiguruj połączenie AI, a potem wyślij przygotowane polecenie.', 'warn', 4200);
      return;
    }
    sendAiPrompt(prompt);
  });

  $('ai-chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('ai-input');
    const text = input.value.trim();
    if (!text || state.ai.isRunning) return;
    input.value = '';
    autoResizeAiInput();
    sendAiPrompt(text);
  });

  $('ai-input').addEventListener('input', autoResizeAiInput);
  $('ai-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      $('ai-chat-form').requestSubmit();
    }
  });

  $('ai-stop').addEventListener('click', () => {
    state.ai.abortController?.abort();
  });

  $('ai-provider').addEventListener('change', (e) => {
    const provider = e.target.value;
    syncAiSettingsFormVisibility(provider, { updateModelIfDefault: true });
    if (provider === 'proxy') {
      refreshProxyStatusInModal($('ai-proxy-url').value.trim());
    }
  });

  $('ai-check-proxy').addEventListener('click', () => {
    refreshProxyStatusInModal($('ai-proxy-url').value.trim());
  });

  $('ai-settings-form').addEventListener('submit', handleSaveAiSettingsSubmit);

  // Left sidebar tabs
  document.querySelectorAll('.sidebar-tab').forEach((btn) => {
    btn.addEventListener('click', () => switchSidebarTab(btn.dataset.tab));
  });

  $('btn-go-blocks').addEventListener('click', () => {
    state.pendingInsertAfterUid = null;
    switchSidebarTab('blocks');
    updateBlocksInsertBanner();
  });

  $('blocks-insert-clear').addEventListener('click', () => {
    state.pendingInsertAfterUid = null;
    updateBlocksInsertBanner();
  });

  $('blocks-search').addEventListener('input', (e) => {
    state.blocksQuery = e.target.value;
    renderBlocksCatalog();
  });

  // Pages tab controls
  $('btn-open-new-page').addEventListener('click', openNewPageDialog);
  $('pages-search').addEventListener('input', (e) => {
    state.pagesQuery = e.target.value;
    renderPagesList();
  });

  document.querySelectorAll('#pages-filter-bar .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      state.pagesFilterGroup = chip.dataset.group;
      document.querySelectorAll('#pages-filter-bar .chip').forEach((c) => {
        c.classList.toggle('is-active', c === chip);
      });
      renderPagesList();
    });
  });

  // Stage bar buttons
  $('btn-deselect').addEventListener('click', () => {
    state.canvas?.clearSelection();
    handleCanvasSelect(null);
  });
  $('btn-discard-page').addEventListener('click', handleDiscardCurrentPage);

  // Backup file input
  $('import-backup-input').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    handleImportBackupFile(file);
  });

  // Dialog generic close buttons
  document.querySelectorAll('[data-close-dialog]').forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.closest('dialog')?.close();
    });
  });

  // Media modal events
  const dropzone = $('media-dropzone');
  const uploadInput = $('media-upload-input');
  dropzone.addEventListener('click', () => uploadInput.click());
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      uploadInput.click();
    }
  });
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('is-dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('is-dragover');
    handleMediaUploadFiles(e.dataTransfer?.files);
  });
  uploadInput.addEventListener('change', (e) => handleMediaUploadFiles(e.target.files));

  document.querySelectorAll('#media-folders .chip').forEach((chip) => {
    chip.addEventListener('click', () => setMediaFolder(chip.dataset.folder));
  });
  $('media-search').addEventListener('input', (e) => {
    state.media.query = e.target.value;
    renderMediaGrid();
  });

  // New page modal events
  $('np-heading').addEventListener('input', () => {
    if (!state.newPage.slugTouched) {
      $('np-slug').value = slugifyPath($('np-heading').value);
    }
    updateNewPageUrlPreview();
  });
  $('np-slug').addEventListener('input', () => {
    state.newPage.slugTouched = true;
    updateNewPageUrlPreview();
  });
  $('np-folder').addEventListener('change', updateNewPageUrlPreview);
  $('new-page-form').addEventListener('submit', handleCreateNewPageSubmit);

  // Globals modal events
  $('gl-add-nav').addEventListener('click', () => {
    if (!state.globalsEditor.working) return;
    state.globalsEditor.working.menu.push({ label: '', href: 'index.html', mobileHref: '' });
    renderGlobalsLinkList('gl-nav-list', state.globalsEditor.working.menu);
  });
  $('gl-add-footer-link').addEventListener('click', () => {
    if (!state.globalsEditor.working) return;
    state.globalsEditor.working.footerLinks.push({ label: '', href: 'index.html' });
    renderGlobalsLinkList('gl-footer-links-list', state.globalsEditor.working.footerLinks);
  });
  $('gl-pick-logo').addEventListener('click', () => {
    openMediaDialog({
      mode: 'pick',
      onPick: (repoPath, previewUrl) => {
        if (!state.globalsEditor.working) return;
        state.globalsEditor.working.logoSrc = repoPath;
        $('gl-logo-path').textContent = repoPath;
        $('gl-logo-preview').src = previewUrl || resolveRepoImageUrl(repoPath);
      },
    });
  });
  $('gl-discard-btn').addEventListener('click', handleDiscardGlobals);
  $('globals-form').addEventListener('submit', handleSaveGlobalsSubmit);

  // Publish modal events
  $('pub-clear-cred').addEventListener('click', () => {
    clearCredential();
    state.savedCredential = { value: '', remembered: false };
    $('pub-credential').value = '';
    $('pub-remember').checked = false;
    $('pub-clear-cred').hidden = true;
    showToast('Usunięto zapamiętany klucz z tej przeglądarki.');
  });
  $('publish-form').addEventListener('submit', handlePublishSubmit);

  // Global keyboard shortcuts & unsaved exit guard
  window.addEventListener('keydown', handleGlobalKeydown);
  window.addEventListener('beforeunload', (e) => {
    if (state.currentPageDirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

// ============================================================================
// BOOTSTRAP
// ============================================================================

async function bootstrap() {
  applySiteProfileBranding();
  // Przywróć zapisany tryb widoku (domyślnie zawsze ultra-prosty; ?admin=1 otwiera tryb administratora)
  let savedMode = 'simple';
  try {
    const bootParams = new URLSearchParams(location.search);
    if (bootParams.get('admin') === '1') {
      savedMode = 'advanced';
    } else {
      const storedMode = localStorage.getItem('cms_ui_mode');
      if (storedMode === 'advanced' || storedMode === 'simple') savedMode = storedMode;
    }
    if (localStorage.getItem('cms_hint_dismissed') === '1' && $('simple-hint-bar')) {
      $('simple-hint-bar').hidden = true;
    }
  } catch {
    // ignore storage errors
  }
  setUiMode(savedMode, { persist: false });

  bindUIEvents();
  renderBlocksCatalog();

  // W trybie hostingu PHP z wymaganym logowaniem sprawdź sesję przed wczytaniem panelu
  if (config.mode === 'hosting' && config.requireLogin) {
    try {
      const authStatus = await checkAuthStatus();
      if (authStatus?.authenticated) {
        state.auth = {
          authenticated: true,
          csrfToken: authStatus.csrfToken || null,
        };
        if ($('btn-logout')) $('btn-logout').hidden = false;
        hideLoginGate();
      } else {
        await waitForHostingLogin();
      }
    } catch (err) {
      console.warn('Nie udało się sprawdzić statusu logowania PHP:', err);
      state.lastError = err?.message || 'Błąd sprawdzania sesji';
      await waitForHostingLogin();
    }
  }

  // Initialize AI Assistant settings & check PHP / local dev proxy availability
  const hasLocalDevProxy = Boolean(document.querySelector('meta[name="cms-local-proxy"]'));
  state.ai.settings = loadAiSettings(config.mode === 'hosting' || hasLocalDevProxy ? 'proxy' : 'gemini');
  updateAiUiStatus();
  if (config.mode === 'hosting' || hasLocalDevProxy || state.ai.settings.provider === 'proxy') {
    checkProxyStatus(state.ai.settings.proxyUrl || DEFAULT_AI_SETTINGS.proxyUrl)
      .then((proxyInfo) => {
        state.ai.proxyStatus = proxyInfo;
        if (proxyInfo?.configured) {
          const hasOwnKey = Boolean(String(state.ai.settings?.apiKey || '').trim());
          if (!hasOwnKey || state.ai.settings.provider === 'proxy') {
            state.ai.settings = {
              ...state.ai.settings,
              provider: 'proxy',
              model: proxyInfo.model || state.ai.settings.model,
            };
          }
        }
        updateAiUiStatus();
      })
      .catch(() => {
        state.ai.proxyStatus = { configured: false };
        updateAiUiStatus();
      });
  }

  try {
    await initStorage();
    const [pageDrafts, pendingImages, globalsDraft, pendingRevision] = await Promise.all([
      getAllPageDrafts(),
      getAllPendingImages(),
      getGlobalsDraft(),
      getPendingRevision(),
    ]);

    state.pageDrafts = pageDrafts || {};
    state.pendingImages = pendingImages || {};
    state.globalsDraft = globalsDraft ? normalizeGlobalsObj(globalsDraft) : null;
    state.pendingRevision = pendingRevision || null;
    state.savedCredential = getCredential();
  } catch (err) {
    console.warn('Inicjalizacja pamięci lokalnej nie powiodła się:', err);
    showToast('Tryb awaryjny zapisu lokalnego.', 'warn');
  }

  // Fetch live manifest and globals in parallel
  const [manifestRes, globalsRes] = await Promise.allSettled([
    fetchManifest({ fresh: false }),
    fetchGlobals({ fresh: false }),
  ]);

  if (manifestRes.status === 'fulfilled' && manifestRes.value?.pages) {
    state.manifest = manifestRes.value;
    if (state.pendingRevision && state.pendingRevision === state.manifest.revision) {
      await savePendingRevision(null);
      state.pendingRevision = null;
    }
  } else {
    console.warn('Nie udało się pobrać manifestu:', manifestRes.reason);
    showToast('Nie udało się pobrać pełnej listy stron (używam wersji podstawowej).', 'warn', 4500);
  }

  if (globalsRes.status === 'fulfilled' && globalsRes.value) {
    state.publishedGlobals = normalizeGlobalsObj(globalsRes.value);
  }

  renderPagesList();
  updateTopbarAndIndicators();

  // Resolve initial page & optional section from URL params (?strona=...&sekcja=...)
  const params = new URLSearchParams(location.search);
  const requestedPage = (params.get('strona') || 'index.html').replace(/^\/+/, '');
  const requestedSection = params.get('sekcja') || null;

  const allPages = getAllPagesMerged();
  const validPage = allPages.some((p) => p.path === requestedPage && !p.deleted)
    ? requestedPage
    : 'index.html';

  await loadPage(validPage, { focusSectionId: requestedSection, skipFlush: true });
}

bootstrap().catch((err) => {
  console.error('Krytyczny błąd startu WOL-BUD Studio:', err);
  showToast('Błąd uruchamiania kreatora: ' + (err?.message || ''), 'error', 6000);
});
