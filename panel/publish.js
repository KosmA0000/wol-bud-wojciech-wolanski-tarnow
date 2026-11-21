import { config } from './config.js';
import { siteProfile } from './site-profile.js';
import { validateRepoPath, assertSafeSerializedHtml } from './sanitizer.js';

export class AccessError extends Error {
  name = 'AccessError';
}

export class ConflictError extends Error {
  name = 'ConflictError';
}

export class SecurityError extends Error {
  name = 'SecurityError';
}

const CONFLICT_MESSAGE =
  'Na stronie opublikowano nowsze zmiany z innego okna. Odśwież panel przed publikacją.';
const GITHUB_API_BASE = 'https://api.github.com';
const BLOB_BATCH_SIZE = 5;
const POLL_INTERVAL_MS = 2500;

function createTimeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), ms);
  if (typeof timer?.unref === 'function') timer.unref();
  return controller.signal;
}

function reportProgress(onProgress, message, percent) {
  if (typeof onProgress === 'function') {
    onProgress(message, percent);
  }
}

function toBase64Utf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function decodeBase64Utf8(base64) {
  const cleaned = String(base64 || '').replace(/\s+/g, '');
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

function formatRetryAfterPolish(seconds) {
  const sec = Math.max(1, Math.ceil(Number(seconds) || 0));
  if (sec < 60) {
    return `${sec} s`;
  }
  const mins = Math.ceil(sec / 60);
  if (mins === 1) return '1 minutę';
  if (mins >= 2 && mins <= 4) return `${mins} minuty`;
  return `${mins} minut`;
}

function parseRetryAfterSeconds(response, payload) {
  const fromPayload = Number(payload?.retryAfter ?? payload?.retryAfterSeconds);
  if (Number.isFinite(fromPayload) && fromPayload > 0) {
    return Math.ceil(fromPayload);
  }
  const headerVal = response?.headers?.get?.('Retry-After');
  if (!headerVal) return null;
  const numeric = Number(headerVal);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.ceil(numeric);
  }
  const parsedDate = Date.parse(headerVal);
  if (!Number.isNaN(parsedDate)) {
    const diffSec = Math.ceil((parsedDate - Date.now()) / 1000);
    return diffSec > 0 ? diffSec : 1;
  }
  return null;
}

function buildHostingAuthHeaders({ credential = '', csrfToken = '', json = false } = {}) {
  const headers = {
    Accept: 'application/json',
  };
  if (json) {
    headers['Content-Type'] = 'application/json';
  }
  const cleanCsrf = typeof csrfToken === 'string' ? csrfToken.trim() : '';
  const cleanCred = typeof credential === 'string' ? credential.trim() : '';
  if (cleanCsrf) {
    headers['X-CMS-CSRF-Token'] = cleanCsrf;
  }
  if (cleanCred) {
    headers.Authorization = `Basic ${toBase64Utf8(`editor:${cleanCred}`)}`;
  }
  return headers;
}

function prepareAndValidateChanges(files, deletions) {
  if (!Array.isArray(files) || !Array.isArray(deletions)) {
    throw new Error('Nieprawidłowa lista plików do publikacji.');
  }

  const protectedPages = siteProfile.protectedPages || [];
  const fileMap = new Map();

  for (const item of files) {
    if (!item || typeof item !== 'object') {
      throw new Error('Nieprawidłowy wpis na liście plików do publikacji.');
    }
    const rawPath = typeof item.path === 'string' ? item.path.trim() : '';
    const pathCheck = validateRepoPath(rawPath, { protectedPages });
    if (!pathCheck.ok) {
      throw new SecurityError(
        pathCheck.reason || `Niedozwolona ścieżka pliku do publikacji: „${rawPath}”.`
      );
    }

    const encoding = item.encoding ?? 'utf-8';
    if (encoding !== 'utf-8' && encoding !== 'base64') {
      throw new Error(`Nieobsługiwane kodowanie pliku „${rawPath}”: ${encoding}.`);
    }
    if (typeof item.content !== 'string') {
      throw new Error(`Brak zawartości tekstowej/base64 dla pliku „${rawPath}”.`);
    }

    const content = encoding === 'base64' ? item.content.replace(/\s+/g, '') : item.content;

    if (rawPath.toLowerCase().endsWith('.html')) {
      let htmlToInspect = content;
      if (encoding === 'base64') {
        try {
          htmlToInspect = decodeBase64Utf8(content);
        } catch {
          throw new SecurityError(
            `Zablokowano publikację pliku „${rawPath}”: nieprawidłowe kodowanie base64 dokumentu HTML.`
          );
        }
      }
      const scan = assertSafeSerializedHtml(htmlToInspect);
      if (!scan.ok) {
        throw new SecurityError(
          `Zablokowano publikację ze względów bezpieczeństwa: ${scan.violations.join('; ')}`
        );
      }
    }

    fileMap.set(rawPath, { path: rawPath, content, encoding });
  }

  const deletionSet = new Set();
  for (const rawItem of deletions) {
    const rawPath = typeof rawItem === 'string' ? rawItem.trim() : '';
    const deleteCheck = validateRepoPath(rawPath, {
      allowDelete: true,
      protectedPages,
    });
    if (!deleteCheck.ok) {
      throw new SecurityError(
        deleteCheck.reason || `Niedozwolone usunięcie pliku: „${rawPath}”.`
      );
    }
    if (!fileMap.has(rawPath)) {
      deletionSet.add(rawPath);
    }
  }

  return {
    normalizedFiles: Array.from(fileMap.values()),
    normalizedDeletions: Array.from(deletionSet),
  };
}

function isAbortLikeError(error) {
  return error?.name === 'AbortError' || error?.name === 'TimeoutError';
}

async function safeFetch(url, options) {
  try {
    return await fetch(url, options);
  } catch (error) {
    if (isAbortLikeError(error)) {
      throw new Error(
        'Przekroczono czas oczekiwania na odpowiedź serwera. Sprawdź połączenie z internetem i spróbuj ponownie.'
      );
    }
    throw new Error(
      'Brak połączenia z serwerem. Sprawdź dostęp do internetu i spróbuj ponownie.'
    );
  }
}

async function readErrorPayload(response) {
  try {
    const text = await response.text();
    if (!text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function buildPublicAssetUrl(relativePath, fresh) {
  const url = new URL(relativePath, import.meta.url);
  if (fresh) {
    url.searchParams.set('sprawdz', `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  }
  return url;
}

async function fetchPublicJson(relativePath, { fresh = false, signal } = {}, label) {
  const url = buildPublicAssetUrl(relativePath, fresh);
  const response = await safeFetch(url, {
    cache: 'no-store',
    signal: signal ?? createTimeoutSignal(12000),
  });

  if (!response.ok) {
    throw new Error(`Nie udało się pobrać ${label} (HTTP ${response.status}).`);
  }

  try {
    return await response.json();
  } catch {
    throw new Error(`Otrzymano uszkodzony plik JSON dla ${label}.`);
  }
}

export async function fetchManifest({ fresh = false, signal } = {}) {
  return fetchPublicJson('../assets/cms-manifest.json', { fresh, signal }, 'manifestu witryny');
}

export async function fetchGlobals({ fresh = false, signal } = {}) {
  return fetchPublicJson('../assets/site-globals.json', { fresh, signal }, 'ustawień globalnych witryny');
}

// ============================================================================
// AUTORYZACJA SESYJNA NA HOSTINGU PHP (auth.php)
// ============================================================================

export async function checkAuthStatus() {
  if (config.mode !== 'hosting') {
    return {
      authenticated: true,
      csrfToken: null,
      mode: config.mode,
    };
  }

  const endpointUrl = new URL(config.authEndpoint || './auth.php', import.meta.url);
  endpointUrl.searchParams.set('status', '1');

  const response = await safeFetch(endpointUrl, {
    method: 'GET',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
    signal: createTimeoutSignal(12000),
  });

  if (response.status === 401 || response.status === 403) {
    return {
      authenticated: false,
      csrfToken: null,
      mode: 'hosting',
    };
  }

  const data = await readErrorPayload(response);
  if (!response.ok) {
    const serverMsg =
      typeof data?.error === 'string' && data.error.trim() ? data.error.trim() : null;
    throw new Error(
      serverMsg || `Nie udało się sprawdzić statusu sesji (HTTP ${response.status}).`
    );
  }

  return {
    authenticated: Boolean(data?.authenticated),
    csrfToken:
      typeof data?.csrfToken === 'string' && data.csrfToken.trim() ? data.csrfToken.trim() : null,
    mode: 'hosting',
  };
}

export async function loginHosting(password) {
  const cleanPassword = typeof password === 'string' ? password : '';
  if (!cleanPassword.trim()) {
    throw new AccessError('Podaj hasło dostępu do panelu.');
  }

  const endpointUrl = new URL(config.authEndpoint || './auth.php', import.meta.url);
  const response = await safeFetch(endpointUrl, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      action: 'login',
      password: cleanPassword,
    }),
    cache: 'no-store',
    signal: createTimeoutSignal(15000),
  });

  const payload = await readErrorPayload(response);

  if (response.status === 429) {
    const retrySec = parseRetryAfterSeconds(response, payload);
    const waitInfo = retrySec
      ? ` Spróbuj ponownie za ${formatRetryAfterPolish(retrySec)}.`
      : ' Odczekaj chwilę i spróbuj ponownie.';
    const error = new Error(
      `Zbyt wiele nieudanych prób logowania — aktywna blokada brute-force.${waitInfo}`
    );
    if (retrySec) {
      error.retryAfter = retrySec;
    }
    throw error;
  }

  if (response.status === 401 || response.status === 403) {
    const serverMsg =
      typeof payload?.error === 'string' && payload.error.trim() ? payload.error.trim() : null;
    throw new AccessError(
      serverMsg || 'Nieprawidłowe hasło dostępu do panelu. Spróbuj ponownie.'
    );
  }

  if (!response.ok) {
    const serverMsg =
      typeof payload?.error === 'string' && payload.error.trim() ? payload.error.trim() : null;
    throw new Error(
      serverMsg || `Nie udało się zalogować na serwerze (HTTP ${response.status}).`
    );
  }

  if (payload?.authenticated === false) {
    throw new AccessError(
      payload?.error || 'Nie udało się uwierzytelnić sesji. Spróbuj ponownie.'
    );
  }

  return {
    authenticated: true,
    csrfToken: typeof payload?.csrfToken === 'string' ? payload.csrfToken : '',
  };
}

export async function logoutHosting(csrfToken = '') {
  const endpointUrl = new URL(config.authEndpoint || './auth.php', import.meta.url);
  const headers = buildHostingAuthHeaders({ csrfToken, json: true });

  const response = await safeFetch(endpointUrl, {
    method: 'POST',
    credentials: 'same-origin',
    headers,
    body: JSON.stringify({ action: 'logout' }),
    cache: 'no-store',
    signal: createTimeoutSignal(12000),
  });

  if (!response.ok && response.status !== 401) {
    const payload = await readErrorPayload(response);
    const serverMsg =
      typeof payload?.error === 'string' && payload.error.trim() ? payload.error.trim() : null;
    throw new Error(
      serverMsg || `Nie udało się wylogować z panelu (HTTP ${response.status}).`
    );
  }
}

// ============================================================================
// GITHUB API — PUBLIKACJA I KOPIE ZAPASOWE
// ============================================================================

function assertGitHubAccess(response, { allow404 = false, writeContext = false } = {}) {
  if (response.status === 401) {
    throw new AccessError(
      'Nieprawidłowy lub wygasły token GitHub. Wklej aktualny klucz dostępu i spróbuj ponownie.'
    );
  }
  if (response.status === 403) {
    throw new AccessError(
      writeContext
        ? 'Brak uprawnień do zapisu w repozytorium GitHub. Upewnij się, że token ma uprawnienie „Contents: Read and write”.'
        : 'Brak dostępu do repozytorium GitHub (HTTP 403). Sprawdź uprawnienia tokenu.'
    );
  }
  if (response.status === 404 && !allow404) {
    throw new AccessError(
      'Nie znaleziono repozytorium lub gałęzi GitHub, albo token nie ma do nich dostępu.'
    );
  }
}

async function githubRequest(path, { method = 'GET', headers, body, timeoutMs = 25000 } = {}) {
  const url = `${GITHUB_API_BASE}${path}`;
  const init = {
    method,
    headers,
    cache: 'no-store',
    signal: createTimeoutSignal(timeoutMs),
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return safeFetch(url, init);
}

function encodeBranchName(branch) {
  return String(branch || 'main')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

async function publishViaGitHub({
  files,
  deletions,
  expectedRevision,
  nextRevision,
  commitMessage,
  credential,
  onProgress,
}) {
  const repo = config.repository;
  const encodedBranch = encodeBranchName(config.branch);

  const baseHeaders = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${credential}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const jsonHeaders = {
    ...baseHeaders,
    'Content-Type': 'application/json',
  };

  // 1. Sprawdzenie dostępu i pobranie SHA gałęzi
  reportProgress(onProgress, 'Sprawdzanie dostępu i gałęzi GitHub…', 10);
  const refResponse = await githubRequest(
    `/repos/${repo}/git/ref/heads/${encodedBranch}`,
    { headers: baseHeaders }
  );
  assertGitHubAccess(refResponse);
  if (!refResponse.ok) {
    throw new Error(`Nie udało się odczytać gałęzi GitHub (HTTP ${refResponse.status}).`);
  }
  const refData = await refResponse.json();
  const headSha = refData?.object?.sha;
  if (!headSha) {
    throw new Error('GitHub nie zwrócił identyfikatora ostatniego commita na gałęzi.');
  }

  // 2. Pobranie drzewa bazowego commita
  const commitResponse = await githubRequest(
    `/repos/${repo}/git/commits/${encodeURIComponent(headSha)}`,
    { headers: baseHeaders }
  );
  assertGitHubAccess(commitResponse);
  if (!commitResponse.ok) {
    throw new Error(`Nie udało się odczytać bazowego drzewa plików (HTTP ${commitResponse.status}).`);
  }
  const commitData = await commitResponse.json();
  const baseTreeSha = commitData?.tree?.sha;
  if (!baseTreeSha) {
    throw new Error('GitHub nie zwrócił identyfikatora drzewa plików dla commita.');
  }

  // 3. Opcjonalna weryfikacja wersji manifestu przed wysłaniem plików
  if (expectedRevision !== null && expectedRevision !== undefined && expectedRevision !== '') {
    reportProgress(onProgress, 'Sprawdzanie aktualnej wersji witryny…', 20);
    const manifestResponse = await githubRequest(
      `/repos/${repo}/contents/assets/cms-manifest.json?ref=${encodeURIComponent(config.branch)}`,
      { headers: baseHeaders }
    );
    assertGitHubAccess(manifestResponse, { allow404: true });

    if (manifestResponse.ok) {
      const manifestEntry = await manifestResponse.json();
      let rawJson = '';
      if (typeof manifestEntry?.content === 'string' && manifestEntry.content.length > 0) {
        rawJson = decodeBase64Utf8(manifestEntry.content);
      } else if (manifestEntry?.sha) {
        const blobRes = await githubRequest(
          `/repos/${repo}/git/blobs/${encodeURIComponent(manifestEntry.sha)}`,
          { headers: baseHeaders }
        );
        assertGitHubAccess(blobRes);
        if (blobRes.ok) {
          const blobData = await blobRes.json();
          if (typeof blobData?.content === 'string') {
            rawJson =
              blobData.encoding === 'base64'
                ? decodeBase64Utf8(blobData.content)
                : blobData.content;
          }
        }
      }

      if (rawJson) {
        let remoteManifest = null;
        try {
          remoteManifest = JSON.parse(rawJson);
        } catch {
          remoteManifest = null;
        }
        if (
          remoteManifest &&
          typeof remoteManifest.revision === 'string' &&
          remoteManifest.revision !== expectedRevision
        ) {
          throw new ConflictError(CONFLICT_MESSAGE);
        }
      }
    } else if (manifestResponse.status !== 404) {
      throw new Error(
        `Nie udało się zweryfikować wersji manifestu na GitHubie (HTTP ${manifestResponse.status}).`
      );
    }
  }

  // 4. Tworzenie blobów w paczkach po 5 równolegle (postęp 30% -> 75%)
  reportProgress(onProgress, 'Wysyłanie zmienionych plików i zdjęć…', 30);
  const uploadedBlobs = [];
  const totalFiles = files.length;
  let completedFiles = 0;

  for (let i = 0; i < totalFiles; i += BLOB_BATCH_SIZE) {
    const batch = files.slice(i, i + BLOB_BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (file) => {
        const blobResponse = await githubRequest(`/repos/${repo}/git/blobs`, {
          method: 'POST',
          headers: jsonHeaders,
          body: {
            content: file.content,
            encoding: file.encoding,
          },
          timeoutMs: 45000,
        });
        assertGitHubAccess(blobResponse, { writeContext: true });
        if (!blobResponse.ok) {
          const payload = await readErrorPayload(blobResponse);
          const detail = payload?.message ? ` (${payload.message})` : '';
          throw new Error(
            `Nie udało się wysłać pliku „${file.path}” na GitHub (HTTP ${blobResponse.status})${detail}.`
          );
        }
        const blobData = await blobResponse.json();
        if (!blobData?.sha) {
          throw new Error(`GitHub nie zwrócił identyfikatora dla pliku „${file.path}”.`);
        }

        completedFiles += 1;
        const pct = 30 + Math.round((completedFiles / totalFiles) * 45);
        reportProgress(
          onProgress,
          `Wysyłanie zmienionych plików i zdjęć (${completedFiles}/${totalFiles})…`,
          Math.min(75, pct)
        );

        return { path: file.path, sha: blobData.sha };
      })
    );
    uploadedBlobs.push(...batchResults);
  }

  // 5. Tworzenie nowego drzewa Git (dodania/modyfikacje + usunięcia)
  reportProgress(onProgress, 'Tworzenie nowej wersji witryny…', 80);
  const treeEntries = [
    ...uploadedBlobs.map(({ path, sha }) => ({
      path,
      mode: '100644',
      type: 'blob',
      sha,
    })),
    ...deletions.map((path) => ({
      path,
      mode: '100644',
      type: 'blob',
      sha: null,
    })),
  ];

  const treeResponse = await githubRequest(`/repos/${repo}/git/trees`, {
    method: 'POST',
    headers: jsonHeaders,
    body: {
      base_tree: baseTreeSha,
      tree: treeEntries,
    },
    timeoutMs: 30000,
  });
  assertGitHubAccess(treeResponse, { writeContext: true });
  if (!treeResponse.ok) {
    const payload = await readErrorPayload(treeResponse);
    const detail = payload?.message ? ` (${payload.message})` : '';
    throw new Error(
      `Nie udało się utworzyć nowej struktury plików na GitHubie (HTTP ${treeResponse.status})${detail}.`
    );
  }
  const treeData = await treeResponse.json();
  const newTreeSha = treeData?.sha;
  if (!newTreeSha) {
    throw new Error('GitHub nie zwrócił identyfikatora nowego drzewa plików.');
  }

  // 6. Utworzenie pojedynczego atomowego commita
  const newCommitResponse = await githubRequest(`/repos/${repo}/git/commits`, {
    method: 'POST',
    headers: jsonHeaders,
    body: {
      message: commitMessage,
      tree: newTreeSha,
      parents: [headSha],
    },
  });
  assertGitHubAccess(newCommitResponse, { writeContext: true });
  if (!newCommitResponse.ok) {
    const payload = await readErrorPayload(newCommitResponse);
    const detail = payload?.message ? ` (${payload.message})` : '';
    throw new Error(
      `Nie udało się zapisać nowej wersji (commita) na GitHubie (HTTP ${newCommitResponse.status})${detail}.`
    );
  }
  const newCommitData = await newCommitResponse.json();
  const newCommitSha = newCommitData?.sha;
  if (!newCommitSha) {
    throw new Error('GitHub nie zwrócił identyfikatora nowego commita.');
  }

  // 7. Atomowe przesunięcie wskaźnika gałęzi (bez force)
  const updateRefResponse = await githubRequest(
    `/repos/${repo}/git/refs/heads/${encodedBranch}`,
    {
      method: 'PATCH',
      headers: jsonHeaders,
      body: {
        sha: newCommitSha,
        force: false,
      },
    }
  );
  assertGitHubAccess(updateRefResponse, { writeContext: true });
  if (updateRefResponse.status === 409 || updateRefResponse.status === 422) {
    throw new ConflictError(CONFLICT_MESSAGE);
  }
  if (!updateRefResponse.ok) {
    const payload = await readErrorPayload(updateRefResponse);
    const detail = payload?.message ? ` (${payload.message})` : '';
    throw new Error(
      `Nie udało się zaktualizować gałęzi GitHub (HTTP ${updateRefResponse.status})${detail}.`
    );
  }

  // 8. Zakończenie publikacji na GitHub
  reportProgress(onProgress, 'Wysłano na GitHub. Oczekiwanie na wdrożenie strony…', 90);
  return {
    revision: nextRevision,
    commitSha: newCommitSha,
  };
}

async function publishViaHosting({
  files,
  deletions,
  expectedRevision,
  nextRevision,
  commitMessage,
  credential = '',
  csrfToken = '',
  onProgress,
}) {
  reportProgress(onProgress, 'Wysyłanie zmienionych plików na serwer…', 30);
  const endpointUrl = new URL(config.apiEndpoint || './api.php', import.meta.url);
  const headers = buildHostingAuthHeaders({ credential, csrfToken, json: true });

  const response = await safeFetch(endpointUrl, {
    method: 'POST',
    credentials: 'same-origin',
    headers,
    body: JSON.stringify({
      files,
      deletions,
      expectedRevision,
      nextRevision,
      commitMessage,
    }),
    cache: 'no-store',
    signal: createTimeoutSignal(60000),
  });

  const payload = await readErrorPayload(response);
  const serverMsg =
    typeof payload?.error === 'string' && payload.error.trim() ? payload.error.trim() : null;

  if (response.status === 401 || response.status === 403) {
    throw new AccessError(
      serverMsg ||
        'Brak dostępu do publikacji na serwerze. Zaloguj się ponownie lub sprawdź hasło edytora.'
    );
  }
  if (response.status === 409) {
    throw new ConflictError(serverMsg || CONFLICT_MESSAGE);
  }
  if (response.status === 413) {
    throw new Error(
      serverMsg ||
        'Przekroczono dopuszczalny rozmiar wysyłanych plików. Zmniejsz zdjęcia i spróbuj ponownie.'
    );
  }
  if (
    (response.status === 400 || response.status === 422) &&
    (payload?.code === 'SECURITY_ERROR' || payload?.securityViolation)
  ) {
    throw new SecurityError(
      serverMsg || 'Serwer zablokował publikację ze względów bezpieczeństwa.'
    );
  }

  if (!response.ok) {
    throw new Error(
      serverMsg || `Serwer nie zapisał publikacji (HTTP ${response.status}). Spróbuj ponownie.`
    );
  }

  reportProgress(onProgress, 'Zapisano na serwerze. Weryfikacja opublikowanej strony…', 90);
  return {
    revision: payload?.revision ?? nextRevision,
    commitSha: null,
  };
}

export async function publishChanges({
  files = [],
  deletions = [],
  expectedRevision = null,
  nextRevision,
  commitMessage = 'Publikacja zmian z panelu WOL-BUD',
  credential = '',
  csrfToken = '',
  onProgress,
} = {}) {
  // 1. Kluczowa walidacja bezpieczeństwa ścieżek, usunięć i zserializowanego HTML przed wysłaniem
  const { normalizedFiles, normalizedDeletions } = prepareAndValidateChanges(files, deletions);

  const cleanCredential = typeof credential === 'string' ? credential.trim() : '';
  const cleanCsrfToken = typeof csrfToken === 'string' ? csrfToken.trim() : '';

  // 2. Weryfikacja danych uwierzytelniających zależnie od trybu
  if (config.mode === 'hosting') {
    if (!cleanCsrfToken && !cleanCredential) {
      throw new AccessError(
        'Zaloguj się do panelu lub podaj hasło dostępu przed publikacją.'
      );
    }
  } else if (config.mode === 'github') {
    if (!cleanCredential) {
      throw new AccessError('Podaj klucz dostępu GitHub przed publikacją.');
    }
  } else {
    throw new Error(`Nieznany tryb publikacji w konfiguracji: „${config.mode}”.`);
  }

  if (normalizedFiles.length === 0 && normalizedDeletions.length === 0) {
    throw new Error('Brak zmian do opublikowania.');
  }

  const cleanMessage =
    typeof commitMessage === 'string' && commitMessage.trim()
      ? commitMessage.trim()
      : 'Publikacja zmian z panelu WOL-BUD';

  if (config.mode === 'hosting') {
    return publishViaHosting({
      files: normalizedFiles,
      deletions: normalizedDeletions,
      expectedRevision,
      nextRevision,
      commitMessage: cleanMessage,
      credential: cleanCredential,
      csrfToken: cleanCsrfToken,
      onProgress,
    });
  }

  return publishViaGitHub({
    files: normalizedFiles,
    deletions: normalizedDeletions,
    expectedRevision,
    nextRevision,
    commitMessage: cleanMessage,
    credential: cleanCredential,
    onProgress,
  });
}

// ============================================================================
// SYSTEM NIEUSUWALNYCH KOPII ZAPASOWYCH (listBackups / createBackup / restoreBackup)
// ============================================================================

export async function listBackups({ credential = '', csrfToken = '' } = {}) {
  const cleanCredential = typeof credential === 'string' ? credential.trim() : '';
  const cleanCsrfToken = typeof csrfToken === 'string' ? csrfToken.trim() : '';

  if (config.mode === 'hosting') {
    const endpointUrl = new URL(config.backupsEndpoint || './backups.php', import.meta.url);
    const headers = buildHostingAuthHeaders({
      credential: cleanCredential,
      csrfToken: cleanCsrfToken,
      json: false,
    });

    const response = await safeFetch(endpointUrl, {
      method: 'GET',
      credentials: 'same-origin',
      headers,
      cache: 'no-store',
      signal: createTimeoutSignal(15000),
    });

    const payload = await readErrorPayload(response);
    const serverMsg =
      typeof payload?.error === 'string' && payload.error.trim() ? payload.error.trim() : null;

    if (response.status === 401 || response.status === 403) {
      throw new AccessError(
        serverMsg || 'Brak dostępu do listy kopii zapasowych. Zaloguj się ponownie.'
      );
    }
    if (!response.ok) {
      throw new Error(
        serverMsg || `Nie udało się pobrać listy kopii zapasowych (HTTP ${response.status}).`
      );
    }

    return {
      mode: 'hosting',
      backups: Array.isArray(payload?.backups) ? payload.backups : [],
    };
  }

  // Tryb GitHub: pierwsza pozycja to zawsze nieusuwalna oryginalna wersja fabryczna
  const baselineSha =
    typeof siteProfile.baselineCommitSha === 'string' ? siteProfile.baselineCommitSha.trim() : '';

  const backups = [
    {
      id: 'original',
      sha: baselineSha,
      label: 'Oryginalna wersja strony (fabryczna — nieusuwalna)',
      createdAt: null,
      immutable: true,
    },
  ];

  // Opcjonalnie pobierz ostatnie commity z GitHub jako punkty przywracania (cichy fallback przy limicie)
  try {
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (cleanCredential) {
      headers.Authorization = `Bearer ${cleanCredential}`;
    }

    const commitsUrl = `${GITHUB_API_BASE}/repos/${config.repository}/commits?per_page=8&sha=${encodeURIComponent(
      config.branch || 'main'
    )}`;
    const response = await fetch(commitsUrl, {
      method: 'GET',
      headers,
      cache: 'no-store',
      signal: createTimeoutSignal(8000),
    });

    if (response.ok) {
      const commits = await response.json();
      if (Array.isArray(commits)) {
        for (const commit of commits) {
          const sha = typeof commit?.sha === 'string' ? commit.sha.trim() : '';
          if (!sha || (baselineSha && sha === baselineSha)) {
            continue;
          }
          const rawMessage = String(commit?.commit?.message || '');
          const firstLine = rawMessage.split('\n')[0].trim();
          const createdAt =
            commit?.commit?.committer?.date || commit?.commit?.author?.date || null;

          backups.push({
            id: sha,
            sha,
            label: firstLine || `Wersja ${sha.slice(0, 7)}`,
            createdAt,
            immutable: false,
          });
        }
      }
    }
  } catch {
    // Cichy fallback przy limicie zapytań GitHub API bez tokena lub chwilowym braku sieci.
  }

  return {
    mode: 'github',
    backups,
  };
}

export async function createBackup({ label = '', credential = '', csrfToken = '' } = {}) {
  const cleanLabel = typeof label === 'string' ? label.trim() : '';
  const cleanCredential = typeof credential === 'string' ? credential.trim() : '';
  const cleanCsrfToken = typeof csrfToken === 'string' ? csrfToken.trim() : '';

  if (config.mode === 'hosting') {
    if (!cleanCsrfToken && !cleanCredential) {
      throw new AccessError(
        'Zaloguj się do panelu lub podaj hasło dostępu, aby utworzyć kopię zapasową.'
      );
    }

    const endpointUrl = new URL(config.backupsEndpoint || './backups.php', import.meta.url);
    const headers = buildHostingAuthHeaders({
      credential: cleanCredential,
      csrfToken: cleanCsrfToken,
      json: true,
    });

    const response = await safeFetch(endpointUrl, {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      body: JSON.stringify({
        action: 'create',
        label: cleanLabel,
      }),
      cache: 'no-store',
      signal: createTimeoutSignal(30000),
    });

    const payload = await readErrorPayload(response);
    const serverMsg =
      typeof payload?.error === 'string' && payload.error.trim() ? payload.error.trim() : null;

    if (response.status === 401 || response.status === 403) {
      throw new AccessError(
        serverMsg || 'Brak dostępu do tworzenia kopii zapasowych. Zaloguj się ponownie.'
      );
    }
    if (!response.ok) {
      throw new Error(
        serverMsg || `Nie udało się utworzyć kopii zapasowej (HTTP ${response.status}).`
      );
    }

    return {
      ok: true,
      backups: Array.isArray(payload?.backups) ? payload.backups : [],
      ...(payload?.backup ? { backup: payload.backup } : {}),
    };
  }

  const { backups } = await listBackups({
    credential: cleanCredential,
    csrfToken: cleanCsrfToken,
  });

  return {
    ok: true,
    backups,
    message:
      'W trybie GitHub każda publikacja automatycznie tworzy punkt przywracania w historii commitów, a oryginalna wersja strony jest zapisana na stałe.',
  };
}

export async function restoreBackup({ id, sha = '', credential = '', csrfToken = '' } = {}) {
  const cleanId = typeof id === 'string' ? id.trim() : '';
  if (!cleanId) {
    throw new Error('Nie wskazano kopii zapasowej do przywrócenia.');
  }

  const cleanCredential = typeof credential === 'string' ? credential.trim() : '';
  const cleanCsrfToken = typeof csrfToken === 'string' ? csrfToken.trim() : '';

  if (config.mode === 'hosting') {
    if (!cleanCsrfToken && !cleanCredential) {
      throw new AccessError(
        'Zaloguj się do panelu lub podaj hasło dostępu, aby przywrócić kopię zapasową.'
      );
    }

    const endpointUrl = new URL(config.backupsEndpoint || './backups.php', import.meta.url);
    const headers = buildHostingAuthHeaders({
      credential: cleanCredential,
      csrfToken: cleanCsrfToken,
      json: true,
    });

    const response = await safeFetch(endpointUrl, {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      body: JSON.stringify({
        action: 'restore',
        id: cleanId,
      }),
      cache: 'no-store',
      signal: createTimeoutSignal(45000),
    });

    const payload = await readErrorPayload(response);
    const serverMsg =
      typeof payload?.error === 'string' && payload.error.trim() ? payload.error.trim() : null;

    if (response.status === 401 || response.status === 403) {
      throw new AccessError(
        serverMsg || 'Brak dostępu do przywracania kopii zapasowych. Zaloguj się ponownie.'
      );
    }
    if (response.status === 404) {
      throw new Error(serverMsg || 'Nie znaleziono wybranej kopii zapasowej na serwerze.');
    }
    if (!response.ok) {
      throw new Error(
        serverMsg || `Nie udało się przywrócić kopii zapasowej (HTTP ${response.status}).`
      );
    }

    return {
      ok: true,
      restoredId: cleanId,
      revision: typeof payload?.revision === 'string' ? payload.revision : null,
    };
  }

  // Tryb GitHub: tworzy nowy czysty commit z drzewem docelowej kopii (force: false — historia nigdy nie ginie)
  if (!cleanCredential) {
    throw new AccessError(
      'Podaj klucz dostępu GitHub (PAT), aby przywrócić wybraną kopię zapasową.'
    );
  }

  const cleanSha = typeof sha === 'string' ? sha.trim() : '';
  const targetSha =
    cleanId === 'original'
      ? typeof siteProfile.baselineCommitSha === 'string'
        ? siteProfile.baselineCommitSha.trim()
        : ''
      : cleanSha || cleanId;

  if (!targetSha || !/^[0-9a-f]{7,40}$/i.test(targetSha)) {
    throw new Error('Nieprawidłowy identyfikator (SHA) docelowego punktu przywracania.');
  }

  const repo = config.repository;
  const encodedBranch = encodeBranchName(config.branch);

  const baseHeaders = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${cleanCredential}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const jsonHeaders = {
    ...baseHeaders,
    'Content-Type': 'application/json',
  };

  // 1. Odczyt tree.sha docelowego commita kopii zapasowej
  const targetCommitRes = await githubRequest(
    `/repos/${repo}/git/commits/${encodeURIComponent(targetSha)}`,
    { headers: baseHeaders }
  );
  assertGitHubAccess(targetCommitRes);
  if (!targetCommitRes.ok) {
    throw new Error(
      `Nie udało się odczytać kopii zapasowej z GitHub (HTTP ${targetCommitRes.status}).`
    );
  }
  const targetCommitData = await targetCommitRes.json();
  const targetTreeSha = targetCommitData?.tree?.sha;
  if (!targetTreeSha) {
    throw new Error('GitHub nie zwrócił struktury plików (tree.sha) dla wybranej kopii zapasowej.');
  }

  // 2. Pobranie bieżącego HEAD gałęzi
  const refRes = await githubRequest(`/repos/${repo}/git/ref/heads/${encodedBranch}`, {
    headers: baseHeaders,
  });
  assertGitHubAccess(refRes);
  if (!refRes.ok) {
    throw new Error(`Nie udało się odczytać gałęzi GitHub (HTTP ${refRes.status}).`);
  }
  const refData = await refRes.json();
  const headSha = refData?.object?.sha;
  if (!headSha) {
    throw new Error('GitHub nie zwrócił identyfikatora bieżącego commita na gałęzi.');
  }

  // 3. Utworzenie nowego czystego commita przywracającego drzewo kopii (bez niszczenia historii)
  const newCommitRes = await githubRequest(`/repos/${repo}/git/commits`, {
    method: 'POST',
    headers: jsonHeaders,
    body: {
      message: `Przywrócenie kopii zapasowej (${cleanId})`,
      tree: targetTreeSha,
      parents: [headSha],
    },
  });
  assertGitHubAccess(newCommitRes, { writeContext: true });
  if (!newCommitRes.ok) {
    const payload = await readErrorPayload(newCommitRes);
    const detail = payload?.message ? ` (${payload.message})` : '';
    throw new Error(
      `Nie udało się utworzyć commita przywracającego na GitHubie (HTTP ${newCommitRes.status})${detail}.`
    );
  }
  const newCommitData = await newCommitRes.json();
  const newCommitSha = newCommitData?.sha;
  if (!newCommitSha) {
    throw new Error('GitHub nie zwrócił identyfikatora nowego commita przywracającego.');
  }

  // 4. Przesunięcie gałęzi (force: false — historia nigdy nie ginie)
  const updateRefRes = await githubRequest(
    `/repos/${repo}/git/refs/heads/${encodedBranch}`,
    {
      method: 'PATCH',
      headers: jsonHeaders,
      body: {
        sha: newCommitSha,
        force: false,
      },
    }
  );
  assertGitHubAccess(updateRefRes, { writeContext: true });
  if (updateRefRes.status === 409 || updateRefRes.status === 422) {
    throw new ConflictError(CONFLICT_MESSAGE);
  }
  if (!updateRefRes.ok) {
    const payload = await readErrorPayload(updateRefRes);
    const detail = payload?.message ? ` (${payload.message})` : '';
    throw new Error(
      `Nie udało się zaktualizować gałęzi GitHub po przywróceniu kopii (HTTP ${updateRefRes.status})${detail}.`
    );
  }

  return {
    ok: true,
    restoredId: cleanId,
    revision: null,
    commitSha: newCommitSha,
  };
}

export async function waitForPublication(revision, { onPoll, timeoutMs } = {}) {
  const effectiveTimeout =
    typeof timeoutMs === 'number' && timeoutMs > 0
      ? timeoutMs
      : config.mode === 'hosting'
        ? 20000
        : 130000;

  const startedAt = Date.now();
  const deadline = startedAt + effectiveTimeout;

  while (true) {
    try {
      const manifest = await fetchManifest({
        fresh: true,
        signal: createTimeoutSignal(6000),
      });
      if (manifest && manifest.revision === revision) {
        return manifest;
      }
    } catch {
      // Chwilowy błąd sieci lub przebudowy nie przerywa oczekiwania na wdrożenie.
    }

    const elapsedMs = Date.now() - startedAt;
    if (typeof onPoll === 'function') {
      onPoll(elapsedMs);
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, Math.min(POLL_INTERVAL_MS, remainingMs)));
  }

  if (config.mode === 'hosting') {
    throw new Error(
      'Zmiany zostały zapisane na serwerze, ale nie udało się jeszcze potwierdzić nowej wersji na stronie publicznej. Odśwież stronę za chwilę (możliwe buforowanie serwera).'
    );
  }

  throw new Error(
    'Commit został wysłany na GitHub, ale strona publiczna jeszcze się buduje — GitHub Pages czasem potrzebuje 2–3 minut na wdrożenie. Otwórz stronę publiczną za chwilę i sprawdź zmiany.'
  );
}
