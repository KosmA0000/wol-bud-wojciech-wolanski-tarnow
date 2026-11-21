/**
 * WOL-BUD Tarnów CMS — warstwa trwałego zapisu (IndexedDB + fallback pamięciowy/localStorage),
 * zarządzanie poświadczeniami, kopiami zapasowymi JSON oraz optymalizacją obrazów do WebP.
 *
 * Moduł ES bez zewnętrznych zależności — działa bezpośrednio w przeglądarce.
 */

const DB_NAME = 'wolbud-cms-v2';
const DB_VERSION = 1;

const STORE_PAGE_DRAFTS = 'pageDrafts';
const STORE_PENDING_IMAGES = 'pendingImages';
const STORE_META = 'meta';

const META_KEY_GLOBALS = 'globalsDraft';
const META_KEY_PENDING_REVISION = 'pendingRevision';

const CREDENTIAL_KEY = 'wolbud:cms:cred';

const FALLBACK_KEY_META = 'wolbud:cms:fallback:meta';
const FALLBACK_KEY_PAGES = 'wolbud:cms:fallback:pageDrafts';
const FALLBACK_KEY_IMAGES = 'wolbud:cms:fallback:pendingImages';
const FALLBACK_MAX_LOCAL_BYTES = 2 * 1024 * 1024;

const BACKUP_FORMAT = 'wolbud-cms-backup';
const BACKUP_VERSION = 2;

const POLISH_CHAR_MAP = {
  ą: 'a',
  ć: 'c',
  ę: 'e',
  ł: 'l',
  ń: 'n',
  ó: 'o',
  ś: 's',
  ź: 'z',
  ż: 'z',
  Ą: 'a',
  Ć: 'c',
  Ę: 'e',
  Ł: 'l',
  Ń: 'n',
  Ó: 'o',
  Ś: 's',
  Ź: 'z',
  Ż: 'z'
};

let dbInstance = null;
let initPromise = null;
let useFallback = false;

const memoryStore = {
  [STORE_PAGE_DRAFTS]: new Map(),
  [STORE_PENDING_IMAGES]: new Map(),
  [STORE_META]: new Map()
};

let memoryCredential = { value: '', remembered: false };

function getWebStorage(type) {
  try {
    const storage = globalThis?.[type];
    if (!storage) return null;
    const probeKey = '__wolbud_cms_probe__';
    storage.setItem(probeKey, '1');
    storage.removeItem(probeKey);
    return storage;
  } catch {
    return null;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneValue(value) {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // Fallback do klonowania JSON
    }
  }
  return JSON.parse(JSON.stringify(value));
}

function loadFallbackFromLocalStorage() {
  const ls = getWebStorage('localStorage');
  if (!ls) return;

  const hydrateMap = (storageKey, targetMap, keyProp) => {
    try {
      const raw = ls.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      for (const item of parsed) {
        if (item && typeof item === 'object' && typeof item[keyProp] === 'string' && item[keyProp]) {
          targetMap.set(item[keyProp], item);
        }
      }
    } catch {
      // Ignoruj uszkodzony wpis fallbacku
    }
  };

  hydrateMap(FALLBACK_KEY_META, memoryStore[STORE_META], 'key');
  hydrateMap(FALLBACK_KEY_PAGES, memoryStore[STORE_PAGE_DRAFTS], 'path');
  hydrateMap(FALLBACK_KEY_IMAGES, memoryStore[STORE_PENDING_IMAGES], 'path');
}

function persistFallbackStore(storeName) {
  const ls = getWebStorage('localStorage');
  if (!ls) return;

  const keyMap = {
    [STORE_META]: FALLBACK_KEY_META,
    [STORE_PAGE_DRAFTS]: FALLBACK_KEY_PAGES,
    [STORE_PENDING_IMAGES]: FALLBACK_KEY_IMAGES
  };

  const storageKey = keyMap[storeName];
  if (!storageKey) return;

  try {
    const entries = Array.from(memoryStore[storeName].values());
    if (entries.length === 0) {
      ls.removeItem(storageKey);
      return;
    }
    const serialized = JSON.stringify(entries);
    if (storeName === STORE_PENDING_IMAGES && serialized.length > FALLBACK_MAX_LOCAL_BYTES) {
      // Duże obrazy trzymamy wyłącznie w pamięci, aby nie przekroczyć limitu localStorage
      return;
    }
    ls.setItem(storageKey, serialized);
  } catch {
    // QuotaExceededError lub blokada localStorage — dane pozostają w pamięci RAM
  }
}

function activateFallback() {
  if (!useFallback) {
    useFallback = true;
    dbInstance = null;
    loadFallbackFromLocalStorage();
  }
}

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined' || !indexedDB || typeof indexedDB.open !== 'function') {
      reject(new Error('IndexedDB jest niedostępne w tej przeglądarce.'));
      return;
    }

    let settled = false;
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(error);
      return;
    }

    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('Przekroczono czas oczekiwania na otwarcie bazy IndexedDB.'));
      }
    }, 5000);

    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      fn(arg);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_PAGE_DRAFTS)) {
        db.createObjectStore(STORE_PAGE_DRAFTS, { keyPath: 'path' });
      }
      if (!db.objectStoreNames.contains(STORE_PENDING_IMAGES)) {
        db.createObjectStore(STORE_PENDING_IMAGES, { keyPath: 'path' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      const db = event.target.result;
      db.onversionchange = () => {
        try {
          db.close();
        } catch {
          // Ignoruj błąd zamknięcia
        }
        if (dbInstance === db) {
          dbInstance = null;
          initPromise = null;
        }
      };
      db.onclose = () => {
        if (dbInstance === db) {
          dbInstance = null;
          initPromise = null;
        }
      };
      finish(resolve, db);
    };

    request.onerror = () => {
      finish(reject, request.error || new Error('Nie udało się otworzyć bazy IndexedDB.'));
    };

    request.onblocked = () => {
      finish(reject, new Error('Otwarcie bazy IndexedDB zostało zablokowane przez inną kartę.'));
    };
  });
}

/**
 * Inicjalizuje bazę IndexedDB `wolbud-cms-v2` (wersja 1) ze store'ami:
 * `pageDrafts`, `pendingImages`, `meta`. W przypadku niedostępności IndexedDB
 * przełącza warstwę zapisu na fallback w pamięci i `localStorage`.
 *
 * @returns {Promise<void>}
 */
export function initStorage() {
  if (dbInstance || useFallback) {
    return Promise.resolve();
  }
  if (initPromise) {
    return initPromise;
  }

  initPromise = openIndexedDB()
    .then((db) => {
      dbInstance = db;
      useFallback = false;
    })
    .catch(() => {
      activateFallback();
    });

  return initPromise;
}

async function ensureReady() {
  if (!dbInstance && !useFallback) {
    await initStorage();
  }
}

async function idbPut(storeName, record) {
  await ensureReady();
  const safeRecord = cloneValue(record);

  if (useFallback || !dbInstance) {
    const keyProp = storeName === STORE_META ? 'key' : 'path';
    memoryStore[storeName].set(safeRecord[keyProp], safeRecord);
    persistFallbackStore(storeName);
    return;
  }

  try {
    await new Promise((resolve, reject) => {
      const tx = dbInstance.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.put(safeRecord);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Błąd zapisu w bazie lokalnej.'));
      tx.onabort = () => reject(tx.error || new Error('Transakcja zapisu została przerwana.'));
    });
  } catch {
    activateFallback();
    const keyProp = storeName === STORE_META ? 'key' : 'path';
    memoryStore[storeName].set(safeRecord[keyProp], safeRecord);
    persistFallbackStore(storeName);
  }
}

async function idbGet(storeName, key) {
  await ensureReady();

  if (useFallback || !dbInstance) {
    const found = memoryStore[storeName].get(key);
    return found ? cloneValue(found) : null;
  }

  try {
    return await new Promise((resolve, reject) => {
      const tx = dbInstance.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error || new Error('Błąd odczytu z bazy lokalnej.'));
    });
  } catch {
    activateFallback();
    const found = memoryStore[storeName].get(key);
    return found ? cloneValue(found) : null;
  }
}

async function idbGetAll(storeName) {
  await ensureReady();

  if (useFallback || !dbInstance) {
    return Array.from(memoryStore[storeName].values()).map((item) => cloneValue(item));
  }

  try {
    return await new Promise((resolve, reject) => {
      const tx = dbInstance.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => reject(req.error || new Error('Błąd odczytu listy z bazy lokalnej.'));
    });
  } catch {
    activateFallback();
    return Array.from(memoryStore[storeName].values()).map((item) => cloneValue(item));
  }
}

async function idbDelete(storeName, key) {
  await ensureReady();

  if (useFallback || !dbInstance) {
    memoryStore[storeName].delete(key);
    persistFallbackStore(storeName);
    return;
  }

  try {
    await new Promise((resolve, reject) => {
      const tx = dbInstance.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Błąd usuwania rekordu z bazy lokalnej.'));
      tx.onabort = () => reject(tx.error || new Error('Transakcja usuwania została przerwana.'));
    });
  } catch {
    activateFallback();
    memoryStore[storeName].delete(key);
    persistFallbackStore(storeName);
  }
}

async function idbClear(storeName) {
  await ensureReady();

  if (useFallback || !dbInstance) {
    memoryStore[storeName].clear();
    persistFallbackStore(storeName);
    return;
  }

  try {
    await new Promise((resolve, reject) => {
      const tx = dbInstance.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Błąd czyszczenia bazy lokalnej.'));
      tx.onabort = () => reject(tx.error || new Error('Transakcja czyszczenia została przerwana.'));
    });
  } catch {
    activateFallback();
    memoryStore[storeName].clear();
    persistFallbackStore(storeName);
  }
}

function normalizePathKey(pathValue, fieldLabel) {
  const normalized = typeof pathValue === 'string' ? pathValue.trim() : '';
  if (!normalized) {
    throw new Error(`Wymagana jest niepusta ścieżka (${fieldLabel}).`);
  }
  return normalized;
}

function normalizePageDraftRecord(pagePath, draft, preserveUpdatedAt = false) {
  const path = normalizePathKey(pagePath, 'pagePath');
  const source = isPlainObject(draft) ? draft : {};
  const updatedAt =
    preserveUpdatedAt && typeof source.updatedAt === 'string' && source.updatedAt.trim()
      ? source.updatedAt
      : new Date().toISOString();

  return {
    path,
    html: typeof source.html === 'string' ? source.html : '',
    title: typeof source.title === 'string' ? source.title : '',
    description: typeof source.description === 'string' ? source.description : '',
    label: typeof source.label === 'string' ? source.label : '',
    group: typeof source.group === 'string' ? source.group : '',
    isNew: Boolean(source.isNew),
    deleted: Boolean(source.deleted),
    updatedAt
  };
}

function extractBase64FromDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return '';
  const commaIdx = dataUrl.indexOf(',');
  return commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : '';
}

function base64ByteLength(base64) {
  if (typeof base64 !== 'string' || !base64) return 0;
  const cleaned = base64.replace(/\s+/g, '');
  const padding = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((cleaned.length * 3) / 4) - padding);
}

function normalizePendingImageRecord(repoPath, imageData, preserveUpdatedAt = false) {
  const path = normalizePathKey(repoPath, 'repoPath');
  const source = isPlainObject(imageData) ? imageData : {};

  let mimeType =
    typeof source.mimeType === 'string' && source.mimeType.trim()
      ? source.mimeType.trim()
      : 'application/octet-stream';

  let dataUrl = typeof source.dataUrl === 'string' ? source.dataUrl : '';
  let base64 = typeof source.base64 === 'string' ? source.base64 : '';

  if (!base64 && dataUrl) {
    base64 = extractBase64FromDataUrl(dataUrl);
  }
  if (!dataUrl && base64) {
    dataUrl = `data:${mimeType};base64,${base64}`;
  }
  if (mimeType === 'application/octet-stream' && dataUrl.startsWith('data:')) {
    const match = /^data:([^;,]+)/i.exec(dataUrl);
    if (match?.[1]) {
      mimeType = match[1];
    }
  }

  const parsedWidth = Number(source.width);
  const parsedHeight = Number(source.height);
  const parsedSize = Number(source.size);

  const updatedAt =
    preserveUpdatedAt && typeof source.updatedAt === 'string' && source.updatedAt.trim()
      ? source.updatedAt
      : new Date().toISOString();

  return {
    path,
    base64,
    dataUrl,
    mimeType,
    width: Number.isFinite(parsedWidth) && parsedWidth >= 0 ? parsedWidth : 0,
    height: Number.isFinite(parsedHeight) && parsedHeight >= 0 ? parsedHeight : 0,
    size: Number.isFinite(parsedSize) && parsedSize >= 0 ? parsedSize : base64ByteLength(base64),
    name: typeof source.name === 'string' ? source.name : '',
    folder: typeof source.folder === 'string' ? source.folder : '',
    updatedAt
  };
}

/**
 * Zapisuje szkic strony w store `pageDrafts`.
 *
 * @param {string} pagePath
 * @param {object} draft
 * @returns {Promise<void>}
 */
export async function savePageDraft(pagePath, draft) {
  const record = normalizePageDraftRecord(pagePath, draft, false);
  await idbPut(STORE_PAGE_DRAFTS, record);
}

/**
 * Pobiera pojedynczy szkic strony lub `null`, jeśli nie istnieje.
 *
 * @param {string} pagePath
 * @returns {Promise<object|null>}
 */
export async function getPageDraft(pagePath) {
  if (typeof pagePath !== 'string' || !pagePath.trim()) {
    return null;
  }
  return idbGet(STORE_PAGE_DRAFTS, pagePath.trim());
}

/**
 * Usuwa szkic strony ze store `pageDrafts`.
 *
 * @param {string} pagePath
 * @returns {Promise<void>}
 */
export async function deletePageDraft(pagePath) {
  if (typeof pagePath !== 'string' || !pagePath.trim()) {
    return;
  }
  await idbDelete(STORE_PAGE_DRAFTS, pagePath.trim());
}

/**
 * Zwraca słownik wszystkich zapisanych szkiców stron indeksowany ścieżką.
 *
 * @returns {Promise<Record<string, object>>}
 */
export async function getAllPageDrafts() {
  const rows = await idbGetAll(STORE_PAGE_DRAFTS);
  const result = {};
  for (const row of rows) {
    if (row && typeof row.path === 'string' && row.path) {
      result[row.path] = row;
    }
  }
  return result;
}

/**
 * Zapisuje oczekujące na publikację zdjęcie w store `pendingImages`.
 *
 * @param {string} repoPath
 * @param {object} imageData
 * @returns {Promise<void>}
 */
export async function savePendingImage(repoPath, imageData) {
  const record = normalizePendingImageRecord(repoPath, imageData, false);
  await idbPut(STORE_PENDING_IMAGES, record);
}

/**
 * Pobiera oczekujące zdjęcie po ścieżce repozytorium lub `null`.
 *
 * @param {string} repoPath
 * @returns {Promise<object|null>}
 */
export async function getPendingImage(repoPath) {
  if (typeof repoPath !== 'string' || !repoPath.trim()) {
    return null;
  }
  return idbGet(STORE_PENDING_IMAGES, repoPath.trim());
}

/**
 * Zwraca słownik wszystkich oczekujących zdjęć indeksowany ścieżką repozytorium.
 *
 * @returns {Promise<Record<string, object>>}
 */
export async function getAllPendingImages() {
  const rows = await idbGetAll(STORE_PENDING_IMAGES);
  const result = {};
  for (const row of rows) {
    if (row && typeof row.path === 'string' && row.path) {
      result[row.path] = row;
    }
  }
  return result;
}

/**
 * Usuwa oczekujące zdjęcie ze store `pendingImages`.
 *
 * @param {string} repoPath
 * @returns {Promise<void>}
 */
export async function deletePendingImage(repoPath) {
  if (typeof repoPath !== 'string' || !repoPath.trim()) {
    return;
  }
  await idbDelete(STORE_PENDING_IMAGES, repoPath.trim());
}

/**
 * Zapisuje szkic globalnych ustawień witryny w store `meta`.
 *
 * @param {object} globals
 * @returns {Promise<void>}
 */
export async function saveGlobalsDraft(globals) {
  if (globals === null || globals === undefined) {
    await deleteGlobalsDraft();
    return;
  }
  await idbPut(STORE_META, {
    key: META_KEY_GLOBALS,
    value: cloneValue(globals),
    updatedAt: new Date().toISOString()
  });
}

/**
 * Pobiera szkic globalnych ustawień witryny lub `null`.
 *
 * @returns {Promise<object|null>}
 */
export async function getGlobalsDraft() {
  const entry = await idbGet(STORE_META, META_KEY_GLOBALS);
  return entry && entry.value !== undefined ? entry.value : null;
}

/**
 * Usuwa szkic globalnych ustawień witryny ze store `meta`.
 *
 * @returns {Promise<void>}
 */
export async function deleteGlobalsDraft() {
  await idbDelete(STORE_META, META_KEY_GLOBALS);
}

/**
 * Zapisuje poświadczenie (klucz/hasło) zawsze w `sessionStorage`,
 * a gdy `remember === true` także w `localStorage` pod kluczem `wolbud:cms:cred`.
 * Gdy `remember === false`, usuwa wpis z `localStorage`.
 *
 * @param {string} credential
 * @param {boolean} [remember=false]
 * @returns {void}
 */
export function saveCredential(credential, remember = false) {
  const value = credential == null ? '' : String(credential);
  const shouldRemember = remember === true;

  const ss = getWebStorage('sessionStorage');
  const ls = getWebStorage('localStorage');

  if (!value) {
    clearCredential();
    return;
  }

  memoryCredential = { value, remembered: shouldRemember };

  if (ss) {
    try {
      ss.setItem(CREDENTIAL_KEY, value);
    } catch {
      // Ignoruj błąd zapisu w sessionStorage
    }
  }

  if (ls) {
    try {
      if (shouldRemember) {
        ls.setItem(CREDENTIAL_KEY, value);
      } else {
        ls.removeItem(CREDENTIAL_KEY);
      }
    } catch {
      // Ignoruj błąd zapisu w localStorage
    }
  }
}

/**
 * Odczytuje zapisane poświadczenie z `sessionStorage` lub `localStorage`.
 *
 * @returns {{ value: string, remembered: boolean }}
 */
export function getCredential() {
  const ss = getWebStorage('sessionStorage');
  const ls = getWebStorage('localStorage');

  let sessionValue = '';
  let localValue = '';

  if (ss) {
    try {
      sessionValue = ss.getItem(CREDENTIAL_KEY) || '';
    } catch {
      sessionValue = '';
    }
  }

  if (ls) {
    try {
      localValue = ls.getItem(CREDENTIAL_KEY) || '';
    } catch {
      localValue = '';
    }
  }

  if (sessionValue) {
    const remembered = Boolean(localValue && localValue === sessionValue);
    memoryCredential = { value: sessionValue, remembered };
    return { value: sessionValue, remembered };
  }

  if (localValue) {
    if (ss) {
      try {
        ss.setItem(CREDENTIAL_KEY, localValue);
      } catch {
        // Ignoruj błąd synchronizacji do sessionStorage
      }
    }
    memoryCredential = { value: localValue, remembered: true };
    return { value: localValue, remembered: true };
  }

  if (memoryCredential.value) {
    return { value: memoryCredential.value, remembered: memoryCredential.remembered };
  }

  return { value: '', remembered: false };
}

/**
 * Usuwa zapisane poświadczenie ze wszystkich magazynów przeglądarki i pamięci.
 *
 * @returns {void}
 */
export function clearCredential() {
  memoryCredential = { value: '', remembered: false };

  const ss = getWebStorage('sessionStorage');
  const ls = getWebStorage('localStorage');

  if (ss) {
    try {
      ss.removeItem(CREDENTIAL_KEY);
    } catch {
      // Ignoruj
    }
  }

  if (ls) {
    try {
      ls.removeItem(CREDENTIAL_KEY);
    } catch {
      // Ignoruj
    }
  }
}

/**
 * Zapisuje identyfikator oczekującej rewizji (np. SHA commitu/publikacji) w store `meta`.
 *
 * @param {string|null} revision
 * @returns {Promise<void>}
 */
export async function savePendingRevision(revision) {
  const normalized = revision == null ? '' : String(revision).trim();
  if (!normalized) {
    await idbDelete(STORE_META, META_KEY_PENDING_REVISION);
    return;
  }
  await idbPut(STORE_META, {
    key: META_KEY_PENDING_REVISION,
    value: normalized,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Zwraca zapisany identyfikator oczekującej rewizji lub `null`.
 *
 * @returns {Promise<string|null>}
 */
export async function getPendingRevision() {
  const entry = await idbGet(STORE_META, META_KEY_PENDING_REVISION);
  if (entry && typeof entry.value === 'string' && entry.value.trim()) {
    return entry.value;
  }
  return null;
}

/**
 * Czyści wszystkie szkice robocze (`pageDrafts`, `pendingImages`, `globalsDraft`, `pendingRevision`).
 *
 * @returns {Promise<void>}
 */
export async function clearAllDrafts() {
  await Promise.all([
    idbClear(STORE_PAGE_DRAFTS),
    idbClear(STORE_PENDING_IMAGES),
    idbDelete(STORE_META, META_KEY_GLOBALS),
    idbDelete(STORE_META, META_KEY_PENDING_REVISION)
  ]);
}

/**
 * Eksportuje wszystkie szkice stron, wgrane zdjęcia i ustawienia globalne do czytelnego JSON.
 *
 * @returns {Promise<string>}
 */
export async function exportBackup() {
  const [pages, images, globals] = await Promise.all([
    getAllPageDrafts(),
    getAllPendingImages(),
    getGlobalsDraft()
  ]);

  const payload = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    pages,
    images,
    globals: globals ?? null
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * Waliduje plik kopii zapasowej JSON i przywraca zapisane w nim szkice, zdjęcia oraz ustawienia globalne.
 *
 * @param {string} jsonString
 * @returns {Promise<{ pagesCount: number, imagesCount: number, hasGlobals: boolean }>}
 */
export async function importBackup(jsonString) {
  if (typeof jsonString !== 'string' || !jsonString.trim()) {
    throw new Error('Plik kopii zapasowej jest pusty lub ma nieprawidłowy typ.');
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error('Nie udało się odczytać pliku kopii zapasowej — nieprawidłowy format JSON.');
  }

  if (!isPlainObject(parsed)) {
    throw new Error('Nieprawidłowa struktura kopii zapasowej.');
  }

  if (parsed.format !== BACKUP_FORMAT) {
    throw new Error(
      `Nieprawidłowy format kopii zapasowej (oczekiwano "${BACKUP_FORMAT}").`
    );
  }

  if (parsed.version !== BACKUP_VERSION) {
    throw new Error(
      `Nieobsługiwana wersja kopii zapasowej: ${String(parsed.version)} (wymagana wersja ${BACKUP_VERSION}).`
    );
  }

  if (parsed.pages !== undefined && !isPlainObject(parsed.pages)) {
    throw new Error('Pole "pages" w kopii zapasowej musi być obiektem.');
  }

  if (parsed.images !== undefined && !isPlainObject(parsed.images)) {
    throw new Error('Pole "images" w kopii zapasowej musi być obiektem.');
  }

  if (parsed.globals !== undefined && parsed.globals !== null && !isPlainObject(parsed.globals)) {
    throw new Error('Pole "globals" w kopii zapasowej musi być obiektem lub wartością null.');
  }

  const pageRecords = [];
  if (isPlainObject(parsed.pages)) {
    for (const [key, value] of Object.entries(parsed.pages)) {
      const targetPath = typeof key === 'string' && key.trim() ? key.trim() : value?.path;
      if (!targetPath || !isPlainObject(value)) {
        throw new Error(`Nieprawidłowy wpis szkicu strony w kopii zapasowej ("${key}").`);
      }
      pageRecords.push(normalizePageDraftRecord(targetPath, value, true));
    }
  }

  const imageRecords = [];
  if (isPlainObject(parsed.images)) {
    for (const [key, value] of Object.entries(parsed.images)) {
      const targetPath = typeof key === 'string' && key.trim() ? key.trim() : value?.path;
      if (!targetPath || !isPlainObject(value)) {
        throw new Error(`Nieprawidłowy wpis zdjęcia w kopii zapasowej ("${key}").`);
      }
      imageRecords.push(normalizePendingImageRecord(targetPath, value, true));
    }
  }

  for (const pageRecord of pageRecords) {
    await idbPut(STORE_PAGE_DRAFTS, pageRecord);
  }

  for (const imageRecord of imageRecords) {
    await idbPut(STORE_PENDING_IMAGES, imageRecord);
  }

  const hasGlobals = isPlainObject(parsed.globals);
  if (hasGlobals) {
    await saveGlobalsDraft(parsed.globals);
  }

  return {
    pagesCount: pageRecords.length,
    imagesCount: imageRecords.length,
    hasGlobals
  };
}

/**
 * Zamienia nazwę pliku na bezpieczny slug (transliteracja polskich znaków,
 * małe litery, myślniki, bez rozszerzenia i bez ścieżki katalogów).
 *
 * @param {string} name
 * @returns {string}
 */
export function slugifyFilename(name) {
  if (typeof name !== 'string') {
    return 'obraz';
  }

  // Wytnij ewentualną ścieżkę katalogów (obsługa / i \)
  const baseName = name.trim().split(/[\\/]/).pop() || '';

  // Usuń ostatnie rozszerzenie (np. ".jpg", ".webp"), zachowując nazwy bez rozszerzenia
  const withoutExt = baseName.replace(/(?<=.)\.[^.]+$/, '');

  const transliterated = withoutExt
    .replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (ch) => POLISH_CHAR_MAP[ch] || ch)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

  return transliterated || 'obraz';
}

function buildSuggestedImageName(originalName, ext) {
  const slug = slugifyFilename(originalName || 'obraz');
  const now = new Date();
  const dateStamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('');
  return `${slug}-${dateStamp}.${ext}`;
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === 'undefined') {
      reject(new Error('Środowisko nie obsługuje odczytu plików (FileReader).'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Nie udało się odczytać pliku obrazu.'));
    reader.readAsDataURL(blob);
  });
}

function utf8ToBase64(text) {
  if (typeof TextEncoder !== 'undefined' && typeof btoa === 'function') {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(text, 'utf8').toString('base64');
  }
  throw new Error('Brak mechanizmu kodowania Base64.');
}

function parseSvgDimensions(svgText) {
  if (typeof svgText !== 'string') return { width: 0, height: 0 };
  const svgTagMatch = /<svg\b[^>]*>/i.exec(svgText);
  if (!svgTagMatch) return { width: 0, height: 0 };
  const tag = svgTagMatch[0];

  const widthMatch = /\bwidth\s*=\s*["']\s*([0-9.]+)(?:px)?\s*["']/i.exec(tag);
  const heightMatch = /\bheight\s*=\s*["']\s*([0-9.]+)(?:px)?\s*["']/i.exec(tag);

  let width = widthMatch ? Math.round(Number(widthMatch[1])) : 0;
  let height = heightMatch ? Math.round(Number(heightMatch[1])) : 0;

  if ((!width || !height)) {
    const viewBoxMatch = /\bviewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([0-9.]+)\s+([0-9.]+)\s*["']/i.exec(tag);
    if (viewBoxMatch) {
      width = width || Math.round(Number(viewBoxMatch[1]));
      height = height || Math.round(Number(viewBoxMatch[2]));
    }
  }

  return {
    width: Number.isFinite(width) && width > 0 ? width : 0,
    height: Number.isFinite(height) && height > 0 ? height : 0
  };
}

function loadImageViaElement(file) {
  return new Promise((resolve, reject) => {
    if (typeof Image === 'undefined') {
      reject(new Error('Przeglądarka nie obsługuje ładowania obrazów (Image).'));
      return;
    }

    const useObjectUrl = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';

    const attachHandlers = (img, cleanup) => {
      img.onload = () => {
        const width = img.naturalWidth || img.width || 0;
        const height = img.naturalHeight || img.height || 0;
        resolve({ source: img, width, height, cleanup });
      };
      img.onerror = () => {
        cleanup();
        reject(new Error('Nie udało się zdekodować pliku obrazu. Sprawdź, czy format jest obsługiwany przez przeglądarkę.'));
      };
    };

    if (useObjectUrl) {
      const objectUrl = URL.createObjectURL(file);
      const cleanup = () => {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          // Ignoruj
        }
      };
      const img = new Image();
      img.decoding = 'async';
      attachHandlers(img, cleanup);
      img.src = objectUrl;
      return;
    }

    readBlobAsDataUrl(file)
      .then((dataUrl) => {
        const img = new Image();
        img.decoding = 'async';
        attachHandlers(img, () => {});
        img.src = dataUrl;
      })
      .catch(reject);
  });
}

async function loadRasterImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width || 0,
        height: bitmap.height || 0,
        cleanup: () => {
          try {
            bitmap.close?.();
          } catch {
            // Ignoruj
          }
        }
      };
    } catch {
      // Fallback do <img> + ObjectURL (np. orientacja EXIF lub format częściowo wspierany)
    }
  }

  return loadImageViaElement(file);
}

/**
 * Kompresuje i skaluje obraz do formatu WebP (z automatycznym fallbackiem do JPEG,
 * a dla SVG z bezpośrednim odczytem bez rasteryzacji na canvas).
 *
 * @param {File|Blob} file
 * @param {{ maxWidth?: number, maxHeight?: number, quality?: number }} [options]
 * @returns {Promise<{ base64: string, dataUrl: string, mimeType: string, width: number, height: number, size: number, ext: string, suggestedName: string }>}
 */
export async function compressImageToWebP(
  file,
  { maxWidth = 1600, maxHeight = 1600, quality = 0.84 } = {}
) {
  if (!file || typeof file !== 'object') {
    throw new Error('Nie wybrano prawidłowego pliku obrazu.');
  }

  const fileName = typeof file.name === 'string' ? file.name : 'obraz';
  const fileType = typeof file.type === 'string' ? file.type.toLowerCase() : '';
  const isSvg = fileType === 'image/svg+xml' || (!fileType && /\.svg$/i.test(fileName));

  if (isSvg) {
    let svgText = '';
    if (typeof file.text === 'function') {
      svgText = await file.text();
    } else {
      const rawDataUrl = await readBlobAsDataUrl(file);
      const rawBase64 = extractBase64FromDataUrl(rawDataUrl);
      const mimeType = 'image/svg+xml';
      const dataUrl = `data:${mimeType};base64,${rawBase64}`;
      const size = Number.isFinite(Number(file.size)) && Number(file.size) > 0
        ? Number(file.size)
        : base64ByteLength(rawBase64);
      return {
        base64: rawBase64,
        dataUrl,
        mimeType,
        width: 0,
        height: 0,
        size,
        ext: 'svg',
        suggestedName: buildSuggestedImageName(fileName, 'svg')
      };
    }

    const base64 = utf8ToBase64(svgText);
    const mimeType = 'image/svg+xml';
    const dataUrl = `data:${mimeType};base64,${base64}`;
    const { width, height } = parseSvgDimensions(svgText);
    const size = base64ByteLength(base64);

    return {
      base64,
      dataUrl,
      mimeType,
      width,
      height,
      size,
      ext: 'svg',
      suggestedName: buildSuggestedImageName(fileName, 'svg')
    };
  }

  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    throw new Error('Kompresja obrazów rastrowych wymaga środowiska przeglądarki (canvas).');
  }

  const safeMaxWidth = Math.max(1, Number(maxWidth) || 1600);
  const safeMaxHeight = Math.max(1, Number(maxHeight) || 1600);
  const safeQuality = Math.min(1, Math.max(0.1, Number(quality) || 0.84));

  const loaded = await loadRasterImage(file);
  try {
    const srcWidth = loaded.width;
    const srcHeight = loaded.height;
    if (!srcWidth || !srcHeight) {
      throw new Error('Nie udało się odczytać wymiarów obrazu.');
    }

    // Zachowaj proporcje i nie powiększaj mniejszych zdjęć
    const scale = Math.min(1, safeMaxWidth / srcWidth, safeMaxHeight / srcHeight);
    const width = Math.max(1, Math.round(srcWidth * scale));
    const height = Math.max(1, Math.round(srcHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Przeglądarka nie udostępnia kontekstu 2D canvas.');
    }

    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) {
      ctx.imageSmoothingQuality = 'high';
    }
    ctx.drawImage(loaded.source, 0, 0, width, height);

    let dataUrl = canvas.toDataURL('image/webp', safeQuality);
    let mimeType = 'image/webp';
    let ext = 'webp';

    if (!dataUrl.startsWith('data:image/webp')) {
      // Fallback do JPEG wyłącznie dla bardzo starych przeglądarek bez WebP
      ctx.save();
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.restore();

      dataUrl = canvas.toDataURL('image/jpeg', safeQuality);
      mimeType = 'image/jpeg';
      ext = 'jpg';
    } else {
      // Adaptacyjna kompresja WebP dla dużych zdjęć (> 350 KB) — szybsze ładowanie i lepsze SEO (Core Web Vitals)
      const firstBytes = base64ByteLength(extractBase64FromDataUrl(dataUrl));
      if (firstBytes > 350 * 1024 && safeQuality > 0.72) {
        const tighter = canvas.toDataURL('image/webp', 0.74);
        if (tighter.startsWith('data:image/webp')) {
          dataUrl = tighter;
        }
      }
    }

    const base64 = extractBase64FromDataUrl(dataUrl);
    if (!base64) {
      throw new Error('Nie udało się zakodować przetworzonego obrazu.');
    }

    const size = base64ByteLength(base64);
    const originalSize = Number.isFinite(Number(file.size)) ? Number(file.size) : size;

    return {
      base64,
      dataUrl,
      mimeType,
      width,
      height,
      size,
      originalSize,
      ext,
      suggestedName: buildSuggestedImageName(fileName, ext)
    };
  } finally {
    loaded.cleanup();
  }
}
