<?php
declare(strict_types=1);

/**
 * Endpoint logowania sesyjnego, tokenu CSRF i ochrony brute-force dla CMS Studio (PHP 8.1+).
 * Umieszczany na hostingu jako: panel/auth.php
 *
 * Obsługiwane żądania:
 *  - GET  ?status=1 -> { ok: true, authenticated: bool, csrfToken: ?string, mode: 'hosting' }
 *  - POST { action: 'login', password: '...' } -> { ok: true, authenticated: true, csrfToken: string, mode: 'hosting' }
 *  - POST { action: 'logout' } -> { ok: true, authenticated: false, csrfToken: null, mode: 'hosting' }
 */

require_once __DIR__ . '/_common.php';

const AUTH_MAX_REQUEST_BYTES = 16 * 1024; // 16 KB

sendSecurityHeaders();
$originAllowed = handleCorsHeaders('GET, POST, OPTIONS');

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

if ($method === 'OPTIONS') {
    header('Allow: GET, POST, OPTIONS');
    http_response_code(204);
    exit;
}

if ($method === 'GET') {
    initCmsSession();
    $authenticated = isSessionAuthenticated();
    reply(200, [
        'authenticated' => $authenticated,
        'csrfToken' => $authenticated ? ensureCsrfToken() : null,
        'mode' => 'hosting',
    ]);
}

if ($method !== 'POST') {
    header('Allow: GET, POST, OPTIONS');
    reply(405, ['error' => 'Niedozwolona metoda HTTP. Oczekiwano GET lub POST.']);
}

if (!$originAllowed) {
    reply(403, ['error' => 'Żądanie z niedozwolonego źródła (Origin).']);
}

$paths = resolveSitePaths();
$privateDir = $paths['privateDir'];

$contentLength = isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : 0;
if ($contentLength > AUTH_MAX_REQUEST_BYTES) {
    reply(413, ['error' => 'Żądanie logowania jest zbyt duże.']);
}

$rawBody = file_get_contents('php://input', false, null, 0, AUTH_MAX_REQUEST_BYTES + 1);
if ($rawBody === false) {
    reply(400, ['error' => 'Nie udało się odczytać treści żądania.']);
}
if (strlen($rawBody) > AUTH_MAX_REQUEST_BYTES) {
    reply(413, ['error' => 'Żądanie logowania jest zbyt duże.']);
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

if ($action === 'logout') {
    destroyCmsSession();
    auditLog($privateDir, 'logout', ['user' => 'editor']);
    reply(200, [
        'authenticated' => false,
        'csrfToken' => null,
        'mode' => 'hosting',
    ]);
}

if ($action !== 'login') {
    reply(400, ['error' => 'Nieobsługiwana akcja. Dozwolone wartości: login, logout.']);
}

$config = loadEditorConfig($privateDir);
if (!$config['found']) {
    reply(503, ['error' => $config['error'] ?? 'Brak konfiguracji dostępu edytora na serwerze.']);
}

$passwordHash = is_string($config['passwordHash'] ?? null) ? $config['passwordHash'] : '';
if ($passwordHash === '' || isPlaceholderSecret($passwordHash)) {
    reply(503, ['error' => 'Hasło edytora nie zostało jeszcze poprawnie skonfigurowane w pliku konfiguracyjnym poza public_html.']);
}

// 1. Sprawdzenie aktywnej blokady brute-force na IP
$lock = checkAuthLockout($privateDir);
if ($lock['locked']) {
    header('Retry-After: ' . $lock['retryAfter']);
    auditLog($privateDir, 'login_blocked', [
        'retryAfter' => $lock['retryAfter'],
        'attempts' => $lock['attempts'],
    ]);
    reply(429, [
        'error' => 'Zbyt wiele nieudanych prób logowania. Spróbuj ponownie za ' . $lock['retryAfter'] . ' s.',
        'retryAfter' => $lock['retryAfter'],
    ]);
}

$password = is_string($request['password'] ?? null) ? $request['password'] : '';
$username = is_string($request['username'] ?? null) ? trim($request['username']) : 'editor';

if ($password === '' || strlen($password) > 1024 || !hash_equals('editor', $username) || !password_verify($password, $passwordHash)) {
    $failure = recordAuthFailure($privateDir);
    auditLog($privateDir, 'login_failed', [
        'attempts' => $failure['attempts'],
        'locked' => $failure['locked'],
    ]);

    if ($failure['locked']) {
        header('Retry-After: ' . $failure['retryAfter']);
        reply(429, [
            'error' => 'Przekroczono limit 5 nieudanych prób logowania. Dostęp został zablokowany na ' . $failure['retryAfter'] . ' s.',
            'retryAfter' => $failure['retryAfter'],
        ]);
    }

    $remaining = max(0, CMS_AUTH_MAX_FAILURES - $failure['attempts']);
    reply(401, [
        'error' => 'Nieprawidłowe hasło edytora.',
        'remainingAttempts' => $remaining,
    ]);
}

// 2. Poprawne logowanie -> wyzerowanie licznika błędów, regeneracja ID sesji i świeży token CSRF
clearAuthFailures($privateDir);
initCmsSession();
@session_regenerate_id(true);

$csrfToken = bin2hex(random_bytes(32));
$_SESSION['cms_auth'] = true;
$_SESSION['cms_user'] = 'editor';
$_SESSION['cms_auth_at'] = time();
$_SESSION['cms_last_activity'] = time();
$_SESSION['cms_csrf'] = $csrfToken;

auditLog($privateDir, 'login_ok', ['user' => 'editor']);

reply(200, [
    'authenticated' => true,
    'csrfToken' => $csrfToken,
    'mode' => 'hosting',
]);
