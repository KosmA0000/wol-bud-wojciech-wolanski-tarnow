<?php
declare(strict_types=1);

/**
 * Endpoint nieusuwalnej kopii fabrycznej ("original") oraz historii wersji dla CMS Studio (PHP 8.1+).
 * Umieszczany na hostingu jako: panel/backups.php
 *
 * Wszystkie kopie zapasowe przechowywane są POZA public_html w: dirname($siteRoot) . '/cms-backups/'
 *
 * Obsługiwane żądania (wymagają zalogowanej sesji lub Basic Auth):
 *  - GET                                      -> { ok: true, backups: [...] }
 *  - POST { action: 'create', label?: '...' } -> { ok: true, created: {...}, backups: [...] }
 *  - POST { action: 'restore', id: '...' }    -> { ok: true, restoredId, revision, restoredFiles, removedFiles, preRestoreBackupId, backups: [...] }
 *
 * UWAGA: Endpoint celowo NIE udostępnia akcji usuwania kopii (szczególnie kopii "original").
 */

require_once __DIR__ . '/_common.php';

const BACKUPS_MAX_REQUEST_BYTES = 32 * 1024; // 32 KB

sendSecurityHeaders();
$originAllowed = handleCorsHeaders('GET, POST, OPTIONS');

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

if ($method === 'OPTIONS') {
    header('Allow: GET, POST, OPTIONS');
    http_response_code(204);
    exit;
}

if ($method !== 'GET' && $method !== 'POST') {
    header('Allow: GET, POST, OPTIONS');
    reply(405, ['error' => 'Niedozwolona metoda HTTP. Oczekiwano GET lub POST.']);
}

if ($method === 'POST' && !$originAllowed) {
    reply(403, ['error' => 'Żądanie z niedozwolonego źródła (Origin).']);
}

$paths = resolveSitePaths();
$siteRoot = $paths['siteRoot'];
$privateDir = $paths['privateDir'];

$config = loadEditorConfig($privateDir);
if (!$config['found']) {
    reply(503, ['error' => $config['error'] ?? 'Brak konfiguracji dostępu edytora na serwerze.']);
}

requireAuthenticated($config, $method === 'POST', $privateDir);

// Lista stron w ORYGINALE (pierwsza wersja witryny): GET ?originalPages=1
if ($method === 'GET' && isset($_GET['originalPages'])) {
    try {
        ensureOriginalBackup($siteRoot, $privateDir);
        reply(200, ['pages' => listOriginalPages($privateDir)]);
    } catch (RuntimeException $e) {
        $code = $e->getCode();
        reply(($code >= 400 && $code < 600) ? $code : 500, ['error' => $e->getMessage()]);
    } catch (Throwable) {
        reply(500, ['error' => 'Nie udało się odczytać listy stron oryginału.']);
    }
}

// Historia pojedynczej strony: GET ?page=<ścieżka> (lista) albo ?page=<ścieżka>&version=<id|original> (treść HTML)
if ($method === 'GET' && isset($_GET['page'])) {
    try {
        ensureOriginalBackup($siteRoot, $privateDir);
        $pagePath = (string) $_GET['page'];
        if (isset($_GET['version'])) {
            $html = readPageVersion($privateDir, $pagePath, (string) $_GET['version']);
            reply(200, ['page' => $pagePath, 'version' => (string) $_GET['version'], 'html' => $html]);
        }
        reply(200, ['page' => $pagePath] + listPageHistory($privateDir, $pagePath));
    } catch (RuntimeException $e) {
        $code = $e->getCode();
        reply(($code >= 400 && $code < 600) ? $code : 500, ['error' => $e->getMessage()]);
    } catch (Throwable) {
        reply(500, ['error' => 'Nie udało się odczytać historii strony.']);
    }
}

if ($method === 'GET') {
    try {
        ensureOriginalBackup($siteRoot, $privateDir);
        $backups = listBackups($privateDir);
        reply(200, ['backups' => $backups]);
    } catch (RuntimeException $e) {
        $code = $e->getCode();
        reply(($code >= 400 && $code < 600) ? $code : 500, ['error' => $e->getMessage()]);
    } catch (Throwable) {
        reply(500, ['error' => 'Nie udało się odczytać listy kopii zapasowych.']);
    }
}

// Obsługa POST (create / restore)
$contentLength = isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : 0;
if ($contentLength > BACKUPS_MAX_REQUEST_BYTES) {
    reply(413, ['error' => 'Żądanie jest zbyt duże.']);
}

$rawBody = file_get_contents('php://input', false, null, 0, BACKUPS_MAX_REQUEST_BYTES + 1);
if ($rawBody === false) {
    reply(400, ['error' => 'Nie udało się odczytać treści żądania.']);
}
if (strlen($rawBody) > BACKUPS_MAX_REQUEST_BYTES) {
    reply(413, ['error' => 'Żądanie jest zbyt duże.']);
}

try {
    $request = json_decode($rawBody, true, 16, JSON_THROW_ON_ERROR);
} catch (JsonException) {
    reply(400, ['error' => 'Nieprawidłowy format JSON żądania.']);
}

if (!is_array($request)) {
    reply(400, ['error' => 'Oczekiwano obiektu JSON z polem action.']);
}

$action = is_string($request['action'] ?? null) ? strtolower(trim($request['action'])) : '';

try {
    if ($action === 'create') {
        $label = is_string($request['label'] ?? null) && trim($request['label']) !== ''
            ? trim($request['label'])
            : 'Kopia ręczna';
        $created = createBackupSnapshot($siteRoot, $privateDir, 'manual', $label);
        reply(200, [
            'created' => $created,
            'backups' => listBackups($privateDir),
        ]);
    }

    if ($action === 'restore') {
        $id = is_string($request['id'] ?? null) ? trim($request['id']) : '';
        if ($id === '') {
            reply(400, ['error' => 'Podaj identyfikator kopii zapasowej (pole id) do przywrócenia.']);
        }
        $result = restoreBackupSnapshot($siteRoot, $privateDir, $id);
        reply(200, [
            'restoredId' => $result['restoredId'],
            'revision' => $result['revision'],
            'restoredFiles' => $result['restoredFiles'],
            'removedFiles' => $result['removedFiles'],
            'preRestoreBackupId' => $result['preRestoreBackupId'],
            'backups' => listBackups($privateDir),
        ]);
    }

    reply(400, ['error' => 'Nieobsługiwana akcja. Dozwolone wartości: create, restore.']);
} catch (RuntimeException $e) {
    $code = $e->getCode();
    reply(($code >= 400 && $code < 600) ? $code : 500, ['error' => $e->getMessage()]);
} catch (Throwable) {
    reply(500, ['error' => 'Wewnętrzny błąd serwera podczas operacji na kopiach zapasowych.']);
}
