<?php
declare(strict_types=1);

/**
 * Atomowy, utwardzony endpoint publikacji panelu CMS Studio (PHP 8.1+).
 * Umieszczany na hostingu jako: panel/api.php
 *
 * Korzysta z:
 *  - panel/_common.php (sesja, CSRF, brute-force lockout, skaner HTML/XSS, audyt, auto-backupy)
 *  - ../cms-editor-config.php (lub fallback ../wolbud-editor-config.php) poza katalogiem public_html
 */

require_once __DIR__ . '/_common.php';

const MAX_REQUEST_BYTES = 25 * 1024 * 1024; // 25 MB dla całego żądania
const MAX_FILE_BYTES = 6 * 1024 * 1024;     // 6 MB dla pojedynczego pliku
const MAX_FILES_COUNT = 200;
const MAX_DELETIONS_COUNT = 100;

const ALLOWED_EXTENSIONS = ['html', 'json', 'webp', 'png', 'jpg', 'jpeg', 'gif', 'svg'];
const ALLOWED_ROOT_SEO_FILES = ['sitemap.xml', 'robots.txt'];
const FORBIDDEN_TOP_DIRS = ['panel', '.github', '.git', 'cgi-bin', 'backups', 'cms-backups'];
const FORBIDDEN_EXACT_PATHS = [
    'assets/site.js',
    'assets/site.css',
    'assets/home-page.js',
    'assets/home-content.js',
    'assets/home-content.css',
];
const PROTECTED_DELETE_PREFIXES = ['assets/', 'panel/'];
const PROTECTED_EMPTY_DIRS = ['assets', 'img', 'panel', 'css', 'js'];

sendSecurityHeaders();
$originAllowed = handleCorsHeaders('POST, OPTIONS');

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? ''));
if ($method === 'OPTIONS') {
    header('Allow: POST, OPTIONS');
    http_response_code(204);
    exit;
}

if ($method !== 'POST') {
    header('Allow: POST, OPTIONS');
    reply(405, ['error' => 'Niedozwolona metoda HTTP. Oczekiwano POST.']);
}

if (!$originAllowed) {
    reply(403, ['error' => 'Żądanie z niedozwolonego źródła (Origin).']);
}

$paths = resolveSitePaths();
$siteRoot = $paths['siteRoot'];
$privateDir = $paths['privateDir'];

$config = loadEditorConfig($privateDir);
if (!$config['found']) {
    reply(503, ['error' => $config['error'] ?? 'Brak konfiguracji dostępu edytora na serwerze.']);
}

// Wymagana aktywna sesja + CSRF albo nagłówek Basic Auth (z ochroną brute-force)
$auth = requireAuthenticated($config, true, $privateDir);

// Kontrola rozmiaru żądania
$contentLength = isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : 0;
if ($contentLength > MAX_REQUEST_BYTES) {
    reply(413, ['error' => 'Żądanie przekracza maksymalny limit rozmiaru (25 MB).']);
}

$rawBody = file_get_contents('php://input', false, null, 0, MAX_REQUEST_BYTES + 1);
if ($rawBody === false) {
    reply(400, ['error' => 'Nie udało się odczytać treści żądania.']);
}
if (strlen($rawBody) > MAX_REQUEST_BYTES) {
    reply(413, ['error' => 'Żądanie przekracza maksymalny limit rozmiaru (25 MB).']);
}

try {
    $request = json_decode($rawBody, true, 64, JSON_THROW_ON_ERROR);
} catch (JsonException) {
    reply(400, ['error' => 'Nieprawidłowy format JSON żądania.']);
}

if (!is_array($request)) {
    reply(400, ['error' => 'Oczekiwano obiektu JSON z danymi publikacji.']);
}

function isValidRevision(mixed $value): bool {
    return is_string($value) && $value !== '' && strlen($value) <= 128
        && preg_match('/\A[a-zA-Z0-9._-]+\z/', $value) === 1;
}

function validateSafePath(mixed $path, bool $isDeletion = false): string {
    if (!is_string($path) || $path === '' || strlen($path) > 255) {
        reply(400, ['error' => 'Nieprawidłowa lub pusta ścieżka pliku.']);
    }

    if (
        str_contains($path, "\0") ||
        str_contains($path, '\\') ||
        str_contains($path, '..') ||
        str_starts_with($path, '/') ||
        str_ends_with($path, '/') ||
        str_contains($path, '//')
    ) {
        reply(400, ['error' => 'Niedozwolona ścieżka pliku: ' . $path]);
    }

    if (preg_match('/\A[a-zA-Z0-9\/._-]+\z/', $path) !== 1) {
        reply(400, ['error' => 'Ścieżka pliku zawiera niedozwolone znaki: ' . $path]);
    }

    $segments = explode('/', $path);
    foreach ($segments as $segment) {
        if ($segment === '' || $segment === '.' || $segment === '..' || str_starts_with($segment, '.')) {
            reply(403, ['error' => 'Niedozwolony segment ścieżki (pliki lub katalogi ukryte): ' . $path]);
        }
    }

    $topDir = strtolower($segments[0]);
    if (in_array($topDir, FORBIDDEN_TOP_DIRS, true)) {
        reply(403, ['error' => 'Zapis i usuwanie w tym katalogu są zabronione: ' . $path]);
    }

    $lowerPath = strtolower($path);
    if (in_array($lowerPath, FORBIDDEN_EXACT_PATHS, true)) {
        reply(403, ['error' => 'Modyfikacja chronionego zasobu systemowego jest zabroniona: ' . $path]);
    }

    if (preg_match('/\.(?:php\d*|phtml|phar|pht|shtml|cgi|pl|py|rb|sh|bash|exe|bat|cmd|htaccess|htpasswd|ini|env|js|mjs|cjs|css)(?:\.|\z)/i', $path) === 1) {
        reply(403, ['error' => 'Niedozwolony typ pliku: ' . $path]);
    }

    $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
    $isRootSeoFile = in_array($lowerPath, ALLOWED_ROOT_SEO_FILES, true);
    if (!$isRootSeoFile && ($ext === '' || !in_array($ext, ALLOWED_EXTENSIONS, true))) {
        reply(403, ['error' => 'Niedozwolone rozszerzenie pliku: ' . $path]);
    }

    if ($isDeletion) {
        if ($lowerPath === 'index.html' || $isRootSeoFile) {
            reply(403, ['error' => 'Nie można usunąć chronionego pliku głównego: ' . $path]);
        }
        foreach (PROTECTED_DELETE_PREFIXES as $prefix) {
            if (str_starts_with($lowerPath, $prefix)) {
                reply(403, ['error' => 'Nie można usunąć chronionego pliku: ' . $path]);
            }
        }
    }

    return $path;
}

function validateSafeSvgDocument(string $svg): array {
    if (preg_match('/<\?(?:php|=|\s)|<%/i', $svg) === 1) {
        return ['ok' => false, 'error' => 'Wykryto niedozwolony kod serwerowy w pliku SVG.'];
    }
    if (preg_match('/<\s*(?:script|foreignObject|iframe|object|embed)\b/i', $svg) === 1) {
        return ['ok' => false, 'error' => 'Plik SVG zawiera zabroniony element (script, foreignObject lub iframe).'];
    }
    if (preg_match('/\son[a-z]+\s*=/i', $svg) === 1) {
        return ['ok' => false, 'error' => 'Plik SVG zawiera zabroniony atrybut zdarzenia (on*=).'];
    }
    if (preg_match('/(?:javascript|vbscript):|data:text\/html/i', $svg) === 1) {
        return ['ok' => false, 'error' => 'Plik SVG zawiera zabroniony schemat URL.'];
    }
    return ['ok' => true, 'error' => null];
}

function decodeFilePayload(array $item, string $privateDir): array {
    $path = validateSafePath($item['path'] ?? null, false);
    $encoding = $item['encoding'] ?? 'utf-8';
    $content = $item['content'] ?? null;

    if (!is_string($content)) {
        reply(400, ['error' => 'Brak zawartości dla pliku: ' . $path]);
    }

    if ($encoding === 'base64') {
        $cleaned = preg_replace('/\s+/', '', $content);
        if (!is_string($cleaned)) {
            reply(400, ['error' => 'Nieprawidłowe dane base64 dla pliku: ' . $path]);
        }
        $bytes = base64_decode($cleaned, true);
        if ($bytes === false) {
            reply(400, ['error' => 'Uszkodzone kodowanie base64 dla pliku: ' . $path]);
        }
    } elseif ($encoding === 'utf-8') {
        if (preg_match('//u', $content) !== 1) {
            reply(400, ['error' => 'Nieprawidłowe kodowanie UTF-8 w pliku: ' . $path]);
        }
        $bytes = $content;
    } else {
        reply(400, ['error' => 'Nieobsługiwane kodowanie pliku: ' . $path]);
    }

    if (strlen($bytes) > MAX_FILE_BYTES) {
        reply(413, ['error' => 'Plik przekracza maksymalny rozmiar 6 MB: ' . $path]);
    }

    $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));

    if ($ext === 'html') {
        $scan = validateSafeHtmlDocument($bytes);
        if (!$scan['ok']) {
            auditLog($privateDir, 'publish_rejected_security', [
                'path' => $path,
                'reason' => $scan['error'],
            ]);
            reply(400, [
                'error' => 'Publikacja odrzucona ze względów bezpieczeństwa (' . $path . '): ' . $scan['error'],
            ]);
        }
    } elseif ($ext === 'svg') {
        $scan = validateSafeSvgDocument($bytes);
        if (!$scan['ok']) {
            auditLog($privateDir, 'publish_rejected_security', [
                'path' => $path,
                'reason' => $scan['error'],
            ]);
            reply(400, [
                'error' => 'Publikacja odrzucona ze względów bezpieczeństwa (' . $path . '): ' . $scan['error'],
            ]);
        }
    } elseif ($ext === 'json') {
        if (preg_match('/<\?(?:php|=|\s)/i', $bytes) === 1) {
            auditLog($privateDir, 'publish_rejected_security', [
                'path' => $path,
                'reason' => 'Tagi PHP w pliku JSON',
            ]);
            reply(400, ['error' => 'Wykryto niedozwolony kod serwerowy w pliku: ' . $path]);
        }
        try {
            json_decode($bytes, true, 128, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            reply(400, ['error' => 'Plik JSON ma niepoprawną składnię: ' . $path]);
        }
    } elseif (strtolower($path) === 'sitemap.xml') {
        if (
            preg_match('/<\?(?:php|=)|<script\b|<!ENTITY\b|<!DOCTYPE\b|javascript:/i', $bytes) === 1 ||
            !str_starts_with(ltrim($bytes), '<?xml') ||
            !str_contains($bytes, '<urlset') ||
            preg_match('/<loc>[^<]*\/panel(?:\/|<)/i', $bytes) === 1
        ) {
            auditLog($privateDir, 'publish_rejected_security', [
                'path' => $path,
                'reason' => 'Nieprawidłowa lub niebezpieczna zawartość sitemap.xml',
            ]);
            reply(400, ['error' => 'Publikacja odrzucona: nieprawidłowy plik sitemap.xml.']);
        }
    } elseif (strtolower($path) === 'robots.txt') {
        if (
            preg_match('/<\?(?:php|=)|<script\b/i', $bytes) === 1 ||
            preg_match('/^\s*Disallow\s*:\s*\/\s*$/im', $bytes) === 1 ||
            preg_match('/^\s*Disallow\s*:\s*\/panel\/?\s*$/im', $bytes) !== 1
        ) {
            auditLog($privateDir, 'publish_rejected_security', [
                'path' => $path,
                'reason' => 'Nieprawidłowa lub niebezpieczna zawartość robots.txt',
            ]);
            reply(400, ['error' => 'Publikacja odrzucona: robots.txt musi blokować /panel/ i nie może blokować całej witryny.']);
        }
    }

    return [
        'path' => $path,
        'bytes' => $bytes,
    ];
}

$rawFiles = $request['files'] ?? [];
$rawDeletions = $request['deletions'] ?? [];
$expectedRevision = $request['expectedRevision'] ?? null;
$nextRevision = $request['nextRevision'] ?? null;

if (!is_array($rawFiles) || !array_is_list($rawFiles) || !is_array($rawDeletions) || !array_is_list($rawDeletions)) {
    reply(400, ['error' => 'Pola files oraz deletions muszą być listami.']);
}
if (count($rawFiles) > MAX_FILES_COUNT || count($rawDeletions) > MAX_DELETIONS_COUNT) {
    reply(400, ['error' => 'Przekroczono maksymalną liczbę plików w jednej publikacji.']);
}
if (count($rawFiles) === 0 && count($rawDeletions) === 0) {
    reply(400, ['error' => 'Brak zmian do opublikowania.']);
}
if ($expectedRevision !== null && !isValidRevision($expectedRevision)) {
    reply(400, ['error' => 'Nieprawidłowy format expectedRevision.']);
}
if ($nextRevision !== null && !isValidRevision($nextRevision)) {
    reply(400, ['error' => 'Nieprawidłowy format nextRevision.']);
}

// Dekodowanie i skanowanie bezpieczeństwa CAŁEJ paczki PRZED założeniem blokady i zapisem czegokolwiek
$preparedFiles = [];
$writtenPathsMap = [];
foreach ($rawFiles as $item) {
    if (!is_array($item)) {
        reply(400, ['error' => 'Nieprawidłowy wpis w liście files.']);
    }
    $decoded = decodeFilePayload($item, $privateDir);
    $preparedFiles[$decoded['path']] = $decoded;
    $writtenPathsMap[$decoded['path']] = true;
}

$preparedDeletions = [];
foreach ($rawDeletions as $rawPath) {
    $path = validateSafePath($rawPath, true);
    if (!isset($writtenPathsMap[$path])) {
        $preparedDeletions[$path] = $path;
    }
}

// Ustawienie manifestu na sam koniec zapisu, aby stanowił atomowy sygnał gotowości publikacji
$manifestFile = null;
if (isset($preparedFiles['assets/cms-manifest.json'])) {
    $manifestFile = $preparedFiles['assets/cms-manifest.json'];
    unset($preparedFiles['assets/cms-manifest.json']);
}
$orderedFiles = array_values($preparedFiles);
$deletionsList = array_values($preparedDeletions);

// Wyłączna blokada publikacji (flock)
$lockPath = rtrim($privateDir, '/\\') . DIRECTORY_SEPARATOR . 'wolbud-editor.lock';
$lockHandle = @fopen($lockPath, 'c');
if ($lockHandle === false || !flock($lockHandle, LOCK_EX)) {
    if ($lockHandle !== false) {
        fclose($lockHandle);
    }
    reply(503, ['error' => 'Nie udało się uzyskać blokady zapisu na serwerze. Spróbuj ponownie.']);
}

$responseStatus = 500;
$responsePayload = ['error' => 'Wewnętrzny błąd serwera podczas publikacji.'];

try {
    // 1. Weryfikacja expectedRevision względem assets/cms-manifest.json (optimistic locking)
    $manifestTargetPath = $siteRoot . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'cms-manifest.json';
    if ($expectedRevision !== null && is_file($manifestTargetPath) && is_readable($manifestTargetPath)) {
        $currentRaw = file_get_contents($manifestTargetPath);
        if ($currentRaw !== false) {
            $currentData = json_decode($currentRaw, true);
            $currentRevision = is_array($currentData) ? ($currentData['revision'] ?? null) : null;
            if (is_string($currentRevision) && $currentRevision !== '' && $currentRevision !== $expectedRevision) {
                throw new RuntimeException(
                    'Na stronie opublikowano nowsze zmiany z innego okna. Odśwież panel przed publikacją.',
                    409
                );
            }
        }
    }

    // 2. Nieusuwalna kopia oryginalna + automatyczna kopia zapasowa PRZED jakimkolwiek zapisem
    ensureOriginalBackup($siteRoot, $privateDir);
    $autoBackup = createBackupSnapshot($siteRoot, $privateDir, 'auto', 'Automatyczna kopia przed publikacją');

    // 3. Atomowy zapis wszystkich plików
    $writtenCount = 0;
    foreach ($orderedFiles as $file) {
        if (str_ends_with(strtolower($file['path']), '.html')) {
            savePageHistory($siteRoot, $privateDir, $file['path']);
        }
        writeFileAtomically($siteRoot, $file['path'], $file['bytes']);
        $writtenCount++;
    }

    // 4. Bezpieczne usuwanie wskazanych plików
    $deletedCount = 0;
    foreach ($deletionsList as $relativePath) {
        $targetPath = $siteRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relativePath);
        if (!file_exists($targetPath) && !is_link($targetPath)) {
            continue;
        }
        if (is_link($targetPath) || !is_file($targetPath)) {
            throw new RuntimeException('Nie można usunąć nieprawidłowego celu: ' . $relativePath, 403);
        }
        $resolvedTarget = realpath($targetPath);
        if ($resolvedTarget === false || !isPathInsideRoot($siteRoot, $resolvedTarget)) {
            throw new RuntimeException('Ścieżka usuwania wykracza poza katalog witryny.', 403);
        }
        savePageHistory($siteRoot, $privateDir, $relativePath);
        if (!unlink($resolvedTarget)) {
            throw new RuntimeException('Nie udało się usunąć pliku: ' . $relativePath, 500);
        }
        $deletedCount++;
        cleanupEmptyParentDirs($siteRoot, $relativePath, PROTECTED_EMPTY_DIRS);
    }

    // 5. Zapis manifestu na samym końcu jako potwierdzenie zakończenia całej publikacji
    if ($manifestFile !== null) {
        writeFileAtomically($siteRoot, $manifestFile['path'], $manifestFile['bytes']);
        $writtenCount++;
    }

    auditLog($privateDir, 'publish_ok', [
        'revision' => $nextRevision,
        'written' => $writtenCount,
        'deleted' => $deletedCount,
        'backupId' => $autoBackup['id'],
        'authMethod' => $auth['method'],
    ]);

    $responseStatus = 200;
    $responsePayload = [
        'revision' => $nextRevision,
        'written' => $writtenCount,
        'deleted' => $deletedCount,
        'backupId' => $autoBackup['id'],
    ];
} catch (RuntimeException $e) {
    $code = $e->getCode();
    $responseStatus = ($code >= 400 && $code < 600) ? $code : 500;
    $responsePayload = ['error' => $e->getMessage()];
} catch (Throwable) {
    $responseStatus = 500;
    $responsePayload = ['error' => 'Nieoczekiwany błąd serwera podczas zapisywania zmian.'];
} finally {
    flock($lockHandle, LOCK_UN);
    fclose($lockHandle);
}

reply($responseStatus, $responsePayload);
