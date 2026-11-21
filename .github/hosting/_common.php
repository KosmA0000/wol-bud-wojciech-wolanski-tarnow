<?php
declare(strict_types=1);

/**
 * Wspólny rdzeń bezpieczeństwa i kopii zapasowych dla endpointów CMS Studio (PHP 8.1+).
 * Umieszczany na hostingu jako: panel/_common.php
 *
 * UWAGA: Ten plik nie może być wywoływany bezpośrednio przez HTTP (403 Forbidden).
 */

if (basename((string) ($_SERVER['SCRIPT_FILENAME'] ?? '')) === '_common.php') {
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Forbidden';
    exit;
}

const CMS_SESSION_NAME = 'CMS_STUDIO_SID';
const CMS_SESSION_TIMEOUT = 14400;        // 4 godziny bezczynności
const CMS_AUTH_MAX_FAILURES = 5;          // maks. 5 nieudanych prób na IP
const CMS_AUTH_WINDOW_SECONDS = 900;      // okno 15 minut
const CMS_AUTH_LOCKOUT_SECONDS = 900;     // blokada 15 minut
const CMS_AUDIT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB przed rotacją
const CMS_AUTO_BACKUPS_KEEP = 10;         // liczba zachowywanych automatycznych kopii

const CMS_BACKUP_ID_REGEX = '/\A(?:original|(?:auto|manual)-\d{8}-\d{6}(?:-[a-f0-9]{4})?)\z/';
const CMS_BACKUP_EXCLUDED_TOP_DIRS = ['panel', '.git', '.github', 'cgi-bin', 'img', 'node_modules'];

/**
 * Wysyła standardowe nagłówki JSON i bezpieczeństwa dla wszystkich endpointów API.
 */
function sendSecurityHeaders(): void {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('Pragma: no-cache');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');
    header('X-Robots-Tag: noindex, nofollow');
}

/**
 * Wysyła odpowiedź JSON i natychmiast kończy wykonanie skryptu.
 */
function reply(int $status, array $payload = []): never {
    http_response_code($status);
    $body = array_merge(['ok' => $status >= 200 && $status < 300], $payload);
    $json = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    echo $json !== false ? $json : '{"ok":false,"error":"Błąd serializacji odpowiedzi JSON."}';
    exit;
}

/**
 * Wykrywa, czy bieżące żądanie przyszło po HTTPS (w tym za reverse proxy / LiteSpeed / Cloudflare).
 */
function isHttpsRequest(): bool {
    $https = strtolower((string) ($_SERVER['HTTPS'] ?? ''));
    if ($https !== '' && $https !== 'off' && $https !== '0') {
        return true;
    }
    if ((int) ($_SERVER['SERVER_PORT'] ?? 0) === 443) {
        return true;
    }
    $forwardedProto = strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
    if ($forwardedProto === 'https' || str_starts_with($forwardedProto, 'https,')) {
        return true;
    }
    if (strtolower((string) ($_SERVER['HTTP_X_FORWARDED_SSL'] ?? '')) === 'on') {
        return true;
    }
    $cfVisitor = (string) ($_SERVER['HTTP_CF_VISITOR'] ?? '');
    if ($cfVisitor !== '' && str_contains($cfVisitor, '"https"')) {
        return true;
    }
    return false;
}

function normalizeHostPort(string $host, ?string $scheme = null): string {
    $host = strtolower(trim($host));
    if ($scheme === 'https' && str_ends_with($host, ':443')) {
        return substr($host, 0, -4);
    }
    if ($scheme === 'http' && str_ends_with($host, ':80')) {
        return substr($host, 0, -3);
    }
    return $host;
}

function isSameOrigin(string $origin, string $host): bool {
    $parsed = parse_url($origin);
    if (!is_array($parsed)) {
        return false;
    }
    $scheme = isset($parsed['scheme']) ? strtolower((string) $parsed['scheme']) : '';
    $originHost = isset($parsed['host']) ? strtolower((string) $parsed['host']) : '';
    if ($originHost === '' || ($scheme !== 'http' && $scheme !== 'https')) {
        return false;
    }
    $originWithPort = isset($parsed['port']) ? ($originHost . ':' . $parsed['port']) : $originHost;
    return normalizeHostPort($originWithPort, $scheme) === normalizeHostPort($host, $scheme);
}

/**
 * Obsługuje nagłówki CORS wyłącznie dla tej samej domeny (Same-Origin).
 * Zwraca false, jeśli przeglądarka wysłała nagłówek Origin z obcej domeny.
 */
function handleCorsHeaders(string $allowMethods = 'GET, POST, OPTIONS'): bool {
    $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    $host = (string) ($_SERVER['HTTP_HOST'] ?? '');
    if ($origin === '') {
        return true;
    }
    if ($host !== '' && isSameOrigin($origin, $host)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Access-Control-Allow-Credentials: true');
        header('Vary: Origin');
        header('Access-Control-Allow-Methods: ' . $allowMethods);
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-CMS-CSRF-Token');
        header('Access-Control-Max-Age: 600');
        return true;
    }
    return false;
}

/**
 * Zwraca bezpieczny adres IP klienta (wyłącznie z REMOTE_ADDR, odporny na spoofing nagłówków).
 */
function getClientIp(): string {
    $ip = trim((string) ($_SERVER['REMOTE_ADDR'] ?? ''));
    return $ip !== '' ? $ip : 'unknown';
}

/**
 * Ustala ścieżkę katalogu publicznego witryny ($siteRoot) oraz katalogu prywatnego poziom wyżej ($privateDir).
 */
function resolveSitePaths(): array {
    $siteRoot = realpath(dirname(__DIR__));
    if ($siteRoot === false || !is_dir($siteRoot)) {
        reply(503, ['error' => 'Nie można ustalić katalogu głównego witryny na serwerze.']);
    }
    $privateDir = dirname($siteRoot);
    return [
        'siteRoot' => $siteRoot,
        'privateDir' => $privateDir,
    ];
}

/**
 * Wyszukuje i wczytuje konfigurację prywatną spoza public_html:
 * najpierw cms-editor-config.php, a w razie braku wolbud-editor-config.php.
 */
function loadEditorConfig(string $privateDir): array {
    $candidates = [
        $privateDir . DIRECTORY_SEPARATOR . 'cms-editor-config.php',
        $privateDir . DIRECTORY_SEPARATOR . 'wolbud-editor-config.php',
    ];

    $foundPath = null;
    foreach ($candidates as $candidate) {
        if (is_file($candidate) && is_readable($candidate)) {
            $foundPath = $candidate;
            break;
        }
    }

    if ($foundPath === null) {
        return [
            'found' => false,
            'path' => null,
            'passwordHash' => null,
            'ai' => null,
            'raw' => null,
            'error' => 'Brak pliku konfiguracyjnego cms-editor-config.php (ani wolbud-editor-config.php) poza katalogiem public_html.',
        ];
    }

    try {
        $configValue = require $foundPath;
    } catch (Throwable) {
        return [
            'found' => false,
            'path' => $foundPath,
            'passwordHash' => null,
            'ai' => null,
            'raw' => null,
            'error' => 'Błąd odczytu pliku konfiguracyjnego edytora na serwerze.',
        ];
    }

    $passwordHash = null;
    $ai = null;

    if (is_string($configValue)) {
        $trimmed = trim($configValue);
        $passwordHash = $trimmed !== '' ? $trimmed : null;
    } elseif (is_array($configValue)) {
        if (is_string($configValue['passwordHash'] ?? null)) {
            $trimmed = trim($configValue['passwordHash']);
            $passwordHash = $trimmed !== '' ? $trimmed : null;
        }
        if (isset($configValue['ai']) && is_array($configValue['ai'])) {
            $ai = $configValue['ai'];
        }
    }

    return [
        'found' => true,
        'path' => $foundPath,
        'passwordHash' => $passwordHash,
        'ai' => $ai,
        'raw' => $configValue,
        'error' => null,
    ];
}

/**
 * Sprawdza, czy wpisany sekret jest wciąż wartością przykładową z szablonu.
 */
function isPlaceholderSecret(string $value): bool {
    $trimmed = trim($value);
    if ($trimmed === '' || strlen($trimmed) < 8) {
        return true;
    }
    $upper = strtoupper($trimmed);
    return str_starts_with($upper, 'WKLEJ_')
        || str_starts_with($upper, 'YOUR_')
        || str_starts_with($upper, 'TUTAJ_')
        || $upper === 'API_KEY';
}

/**
 * Bezpieczna inicjalizacja sesji PHP dla CMS Studio (HttpOnly, SameSite=Strict, Secure na HTTPS, timeout 4h).
 */
function initCmsSession(): void {
    if (session_status() === PHP_SESSION_NONE) {
        @ini_set('session.use_strict_mode', '1');
        @ini_set('session.use_only_cookies', '1');
        @ini_set('session.cookie_httponly', '1');
        @ini_set('session.gc_maxlifetime', (string) CMS_SESSION_TIMEOUT);

        session_name(CMS_SESSION_NAME);
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            'domain' => '',
            'secure' => isHttpsRequest(),
            'httponly' => true,
            'samesite' => 'Strict',
        ]);
        @session_start();
    }

    if (!empty($_SESSION['cms_auth'])) {
        $lastActivity = (int) ($_SESSION['cms_last_activity'] ?? 0);
        if ($lastActivity > 0 && (time() - $lastActivity) > CMS_SESSION_TIMEOUT) {
            $_SESSION = [];
            return;
        }
        $_SESSION['cms_last_activity'] = time();
        if (!is_string($_SESSION['cms_csrf'] ?? null) || strlen((string) $_SESSION['cms_csrf']) < 32) {
            $_SESSION['cms_csrf'] = bin2hex(random_bytes(32));
        }
    }
}

/**
 * Zwraca istniejący lub nowo wygenerowany 256-bitowy token CSRF w bieżącej sesji.
 */
function ensureCsrfToken(): string {
    initCmsSession();
    if (!is_string($_SESSION['cms_csrf'] ?? null) || strlen((string) $_SESSION['cms_csrf']) < 32) {
        $_SESSION['cms_csrf'] = bin2hex(random_bytes(32));
    }
    return (string) $_SESSION['cms_csrf'];
}

/**
 * Czy bieżąca sesja ma ważne, nieprzeterminowane logowanie edytora.
 */
function isSessionAuthenticated(): bool {
    initCmsSession();
    if (($_SESSION['cms_auth'] ?? false) !== true) {
        return false;
    }
    $lastActivity = (int) ($_SESSION['cms_last_activity'] ?? 0);
    if ($lastActivity > 0 && (time() - $lastActivity) > CMS_SESSION_TIMEOUT) {
        $_SESSION = [];
        return false;
    }
    return true;
}

/**
 * Bezpiecznie niszczy sesję PHP oraz usuwa ciasteczko sesyjne w przeglądarce.
 */
function destroyCmsSession(): void {
    initCmsSession();
    $_SESSION = [];

    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 42000,
            'path' => $params['path'] ?: '/',
            'domain' => $params['domain'] ?: '',
            'secure' => (bool) ($params['secure'] ?? isHttpsRequest()),
            'httponly' => true,
            'samesite' => 'Strict',
        ]);
    }

    if (session_status() === PHP_SESSION_ACTIVE) {
        @session_destroy();
    }
}

/**
 * Usuwa potencjalnie wrażliwe pola z metadanych przed zapisem do logu audytowego.
 */
function sanitizeAuditData(mixed $value, int $depth = 0): mixed {
    if ($depth > 4) {
        return '[...]';
    }
    if (is_array($value)) {
        $out = [];
        foreach ($value as $k => $v) {
            $keyStr = strtolower((string) $k);
            if (
                str_contains($keyStr, 'pass') ||
                str_contains($keyStr, 'secret') ||
                str_contains($keyStr, 'token') ||
                str_contains($keyStr, 'apikey') ||
                str_contains($keyStr, 'api_key') ||
                str_contains($keyStr, 'authorization') ||
                str_contains($keyStr, 'cookie') ||
                str_contains($keyStr, 'hash')
            ) {
                $out[$k] = '[UKRYTO]';
                continue;
            }
            $out[$k] = sanitizeAuditData($v, $depth + 1);
        }
        return $out;
    }
    if (is_string($value)) {
        if (strlen($value) > 400) {
            return substr($value, 0, 397) . '...';
        }
        return $value;
    }
    if (is_int($value) || is_float($value) || is_bool($value) || $value === null) {
        return $value;
    }
    return (string) $value;
}

/**
 * Zapisuje wpis zdarzenia bezpieczeństwa w formacie JSONL do pliku poza public_html.
 * Automatycznie wykonuje rotację logu po przekroczeniu 5 MB.
 */
function auditLog(string $privateDir, string $event, array $data = []): void {
    $baseDir = (is_dir($privateDir) && is_writable($privateDir))
        ? $privateDir
        : sys_get_temp_dir();

    if (!is_string($baseDir) || $baseDir === '' || !is_dir($baseDir) || !is_writable($baseDir)) {
        return;
    }

    $logPath = rtrim($baseDir, '/\\') . DIRECTORY_SEPARATOR . 'cms-audit.log';

    clearstatcache(true, $logPath);
    if (is_file($logPath)) {
        $size = @filesize($logPath);
        if (is_int($size) && $size > CMS_AUDIT_MAX_BYTES) {
            @rename($logPath, $logPath . '.1');
        }
    }

    $record = [
        'ts' => gmdate('c'),
        'ip' => getClientIp(),
        'event' => $event,
        'data' => sanitizeAuditData($data),
    ];

    $line = json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    if (!is_string($line)) {
        return;
    }

    @file_put_contents($logPath, $line . "\n", FILE_APPEND | LOCK_EX);
    @chmod($logPath, 0600);
}

/**
 * Ustala ścieżkę pliku rate-limitera logowania (preferuje katalog prywatny poza public_html).
 */
function getAuthRateLimitFile(string $privateDir): ?string {
    if (is_dir($privateDir) && is_writable($privateDir)) {
        return rtrim($privateDir, '/\\') . DIRECTORY_SEPARATOR . 'cms-auth-ratelimit.json';
    }
    $tempDir = sys_get_temp_dir();
    if (is_string($tempDir) && $tempDir !== '' && is_dir($tempDir) && is_writable($tempDir)) {
        return rtrim($tempDir, '/\\') . DIRECTORY_SEPARATOR . 'cms-auth-ratelimit.json';
    }
    return null;
}

/**
 * Wewnętrzna operacja atomowa na pliku rate-limitera z wyłączną blokadą flock(LOCK_EX).
 */
function withAuthRateLimitStore(string $privateDir, callable $callback): mixed {
    $filePath = getAuthRateLimitFile($privateDir);
    if ($filePath === null) {
        $empty = [];
        return $callback($empty, false);
    }

    $fp = @fopen($filePath, 'c+');
    if ($fp === false) {
        $empty = [];
        return $callback($empty, false);
    }

    try {
        if (!flock($fp, LOCK_EX)) {
            $empty = [];
            return $callback($empty, false);
        }

        rewind($fp);
        $raw = stream_get_contents($fp);
        $store = [];
        if (is_string($raw) && trim($raw) !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                $store = $decoded;
            }
        }

        // Czyszczenie wygasłych wpisów wszystkich IP, aby plik nie rósł w nieskończoność
        $now = time();
        $cutoff = $now - CMS_AUTH_WINDOW_SECONDS;
        $cleaned = [];
        foreach ($store as $key => $entry) {
            if (!is_string($key) || !is_array($entry)) {
                continue;
            }
            $lockedUntil = (int) ($entry['lockedUntil'] ?? 0);
            $failures = [];
            if (isset($entry['failures']) && is_array($entry['failures'])) {
                foreach ($entry['failures'] as $ts) {
                    if (is_int($ts) && $ts > $cutoff && $ts <= $now + 10) {
                        $failures[] = $ts;
                    }
                }
            }
            if ($lockedUntil > $now || $failures !== []) {
                $cleaned[$key] = [
                    'failures' => $failures,
                    'lockedUntil' => $lockedUntil > $now ? $lockedUntil : 0,
                ];
            }
        }

        $dirty = false;
        $result = $callback($cleaned, $dirty);

        if ($dirty) {
            rewind($fp);
            ftruncate($fp, 0);
            $encoded = json_encode($cleaned, JSON_UNESCAPED_SLASHES);
            if (is_string($encoded)) {
                fwrite($fp, $encoded);
            }
            fflush($fp);
            @chmod($filePath, 0600);
        }

        return $result;
    } finally {
        flock($fp, LOCK_UN);
        fclose($fp);
    }
}

/**
 * Sprawdza, czy bieżący adres IP jest zablokowany po przekroczeniu limitu błędnych haseł.
 */
function checkAuthLockout(string $privateDir, ?string $ip = null): array {
    $ipKey = hash('sha256', 'cms-auth-ip:' . ($ip ?? getClientIp()));
    return withAuthRateLimitStore($privateDir, static function (array &$store, bool &$dirty) use ($ipKey): array {
        $now = time();
        $entry = $store[$ipKey] ?? ['failures' => [], 'lockedUntil' => 0];
        $lockedUntil = (int) ($entry['lockedUntil'] ?? 0);
        $attempts = is_array($entry['failures'] ?? null) ? count($entry['failures']) : 0;

        if ($lockedUntil > $now) {
            return [
                'locked' => true,
                'retryAfter' => max(1, $lockedUntil - $now),
                'attempts' => $attempts,
            ];
        }

        return [
            'locked' => false,
            'retryAfter' => 0,
            'attempts' => $attempts,
        ];
    });
}

/**
 * Rejestruje błędną próbę uwierzytelnienia; po 5 próbach w 15 min blokuje IP na 15 min.
 */
function recordAuthFailure(string $privateDir, ?string $ip = null): array {
    $ipKey = hash('sha256', 'cms-auth-ip:' . ($ip ?? getClientIp()));
    $result = withAuthRateLimitStore($privateDir, static function (array &$store, bool &$dirty) use ($ipKey): array {
        $now = time();
        $entry = $store[$ipKey] ?? ['failures' => [], 'lockedUntil' => 0];
        $failures = is_array($entry['failures'] ?? null) ? $entry['failures'] : [];
        $failures[] = $now;

        $justLocked = false;
        $lockedUntil = (int) ($entry['lockedUntil'] ?? 0);
        if (count($failures) >= CMS_AUTH_MAX_FAILURES && $lockedUntil <= $now) {
            $lockedUntil = $now + CMS_AUTH_LOCKOUT_SECONDS;
            $justLocked = true;
        }

        $store[$ipKey] = [
            'failures' => $failures,
            'lockedUntil' => $lockedUntil,
        ];
        $dirty = true;

        $isLocked = $lockedUntil > $now;
        return [
            'locked' => $isLocked,
            'justLocked' => $justLocked,
            'retryAfter' => $isLocked ? max(1, $lockedUntil - $now) : 0,
            'attempts' => count($failures),
        ];
    });

    if (!empty($result['justLocked'])) {
        auditLog($privateDir, 'auth_lockout', [
            'attempts' => $result['attempts'],
            'lockoutSeconds' => CMS_AUTH_LOCKOUT_SECONDS,
        ]);
    }

    return $result;
}

/**
 * Zeruje licznik błędnych prób po poprawnym zalogowaniu z danego IP.
 */
function clearAuthFailures(string $privateDir, ?string $ip = null): void {
    $ipKey = hash('sha256', 'cms-auth-ip:' . ($ip ?? getClientIp()));
    withAuthRateLimitStore($privateDir, static function (array &$store, bool &$dirty) use ($ipKey): void {
        if (isset($store[$ipKey])) {
            unset($store[$ipKey]);
            $dirty = true;
        }
    });
}

/**
 * Wyciąga poświadczenia HTTP Basic Auth (z obsługą PHP_AUTH_USER, HTTP_AUTHORIZATION i REDIRECT_HTTP_AUTHORIZATION).
 */
function extractBasicAuthCredentials(): ?array {
    $user = $_SERVER['PHP_AUTH_USER'] ?? null;
    $password = $_SERVER['PHP_AUTH_PW'] ?? null;
    if (is_string($user) && $user !== '') {
        return ['user' => $user, 'password' => (string) ($password ?? '')];
    }

    $authHeader = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    if ($authHeader === '' && function_exists('apache_request_headers')) {
        $headers = @apache_request_headers();
        if (is_array($headers)) {
            foreach ($headers as $k => $v) {
                if (strcasecmp((string) $k, 'Authorization') === 0 && is_string($v)) {
                    $authHeader = $v;
                    break;
                }
            }
        }
    }

    if (str_starts_with($authHeader, 'Basic ')) {
        $decoded = base64_decode(substr($authHeader, 6), true);
        if ($decoded !== false && str_contains($decoded, ':')) {
            [$decodedUser, $decodedPass] = explode(':', $decoded, 2);
            return ['user' => $decodedUser, 'password' => $decodedPass];
        }
    }

    return null;
}

/**
 * Wymaga uwierzytelnionego edytora:
 *  - ALBO aktywna sesja PHP ($_SESSION['cms_auth'] === true) + ważny nagłówek X-CMS-CSRF-Token dla metod modyfikujących
 *  - ALBO nagłówek Authorization: Basic (editor:<hasło>) weryfikowany przez password_verify z ochroną brute-force.
 */
function requireAuthenticated(array $config, bool $requireCsrf = true, ?string $privateDir = null): array {
    if ($privateDir === null) {
        $paths = resolveSitePaths();
        $privateDir = $paths['privateDir'];
    }

    initCmsSession();

    // 1. Aktywna sesja PHP
    if (isSessionAuthenticated()) {
        $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
        $isMutating = in_array($method, ['POST', 'PUT', 'DELETE', 'PATCH'], true);
        $expectedCsrf = ensureCsrfToken();

        if ($requireCsrf && $isMutating) {
            $providedCsrf = trim((string) ($_SERVER['HTTP_X_CMS_CSRF_TOKEN'] ?? ''));
            if ($providedCsrf === '' || !hash_equals($expectedCsrf, $providedCsrf)) {
                auditLog($privateDir, 'csrf_rejected', [
                    'endpoint' => basename((string) ($_SERVER['SCRIPT_NAME'] ?? '')),
                    'method' => $method,
                ]);
                reply(403, [
                    'error' => 'Nieprawidłowy lub brakujący token bezpieczeństwa CSRF. Odśwież panel i spróbuj ponownie.',
                ]);
            }
        }

        return [
            'method' => 'session',
            'user' => (string) ($_SESSION['cms_user'] ?? 'editor'),
            'csrfToken' => $expectedCsrf,
        ];
    }

    // 2. Fallback: HTTP Basic Auth (editor:<hasło>) z pełną ochroną brute-force
    $basic = extractBasicAuthCredentials();
    if ($basic !== null) {
        $lock = checkAuthLockout($privateDir);
        if ($lock['locked']) {
            header('Retry-After: ' . $lock['retryAfter']);
            auditLog($privateDir, 'auth_blocked', [
                'via' => 'basic',
                'retryAfter' => $lock['retryAfter'],
            ]);
            reply(429, [
                'error' => 'Zbyt wiele nieudanych prób logowania. Odczekaj ' . $lock['retryAfter'] . ' s i spróbuj ponownie.',
                'retryAfter' => $lock['retryAfter'],
            ]);
        }

        $passwordHash = is_string($config['passwordHash'] ?? null) ? $config['passwordHash'] : '';
        if ($passwordHash === '' || isPlaceholderSecret($passwordHash)) {
            reply(503, ['error' => 'Nieprawidłowa konfiguracja hasła edytora na serwerze.']);
        }

        if (hash_equals('editor', $basic['user']) && password_verify($basic['password'], $passwordHash)) {
            clearAuthFailures($privateDir);
            return [
                'method' => 'basic',
                'user' => 'editor',
                'csrfToken' => null,
            ];
        }

        $failure = recordAuthFailure($privateDir);
        auditLog($privateDir, 'auth_failed', [
            'via' => 'basic',
            'attempts' => $failure['attempts'],
            'locked' => $failure['locked'],
        ]);

        if ($failure['locked']) {
            header('Retry-After: ' . $failure['retryAfter']);
            reply(429, [
                'error' => 'Zbyt wiele nieudanych prób logowania. Dostęp zablokowany na ' . $failure['retryAfter'] . ' s.',
                'retryAfter' => $failure['retryAfter'],
            ]);
        }

        reply(401, ['error' => 'Nieprawidłowe hasło edytora lub brak autoryzacji.']);
    }

    // 3. Brak uwierzytelnienia
    auditLog($privateDir, 'auth_missing', [
        'endpoint' => basename((string) ($_SERVER['SCRIPT_NAME'] ?? '')),
        'method' => (string) ($_SERVER['REQUEST_METHOD'] ?? ''),
    ]);
    reply(401, ['error' => 'Wymagane zalogowanie do panelu CMS.']);
}

/**
 * Skaner bezpieczeństwa dokumentów HTML chroniący przed wstrzyknięciem PHP, XSS i obcych skryptów.
 * Zwraca ['ok' => bool, 'error' => ?string].
 */
function validateSafeHtmlDocument(string $html): array {
    if (str_contains($html, "\0")) {
        return ['ok' => false, 'error' => 'Dokument HTML zawiera niedozwolone bajty zerowe.'];
    }

    // 1. Zakaz tagów PHP / ASP
    if (preg_match('/<\?(?:php|=|\s)|<%/i', $html) === 1) {
        return ['ok' => false, 'error' => 'Wykryto niedozwolone tagi serwerowe PHP/ASP w dokumencie HTML.'];
    }

    // 2. Zakaz niebezpiecznych elementów osadzających oraz przejęcia ścieżki <base> / formularzy
    if (preg_match('/<\s*(?:iframe|object|embed|applet|base|form)\b/i', $html) === 1) {
        return ['ok' => false, 'error' => 'Wykryto zabroniony element HTML (iframe, object, embed, applet, base lub form).'];
    }

    // 3. Zakaz meta http-equiv="refresh"
    if (preg_match('/<\s*meta\b[^>]*\bhttp-equiv\s*=\s*(?:"|\')?\s*refresh\b/i', $html) === 1) {
        return ['ok' => false, 'error' => 'Wykryto zabronione przekierowanie meta http-equiv="refresh".'];
    }

    // 4. Analiza wszystkich tagów otwierających pod kątem atrybutów on*= oraz niebezpiecznych schematów URL
    if (preg_match_all('/<([a-zA-Z][a-zA-Z0-9:-]*)(\s+(?:"[^"]*"|\'[^\']*\'|[^>"\'])*)?\s*\/?>/s', $html, $tagMatches, PREG_SET_ORDER) !== false) {
        foreach ($tagMatches as $tagMatch) {
            $attrChunk = $tagMatch[2] ?? '';
            if ($attrChunk === '') {
                continue;
            }

            if (preg_match_all('/\s+([a-zA-Z_:][a-zA-Z0-9:._-]*)(?:\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s"\'=<>`]+)))?/s', $attrChunk, $attrMatches, PREG_SET_ORDER) !== false) {
                foreach ($attrMatches as $attr) {
                    $attrName = strtolower($attr[1]);
                    $hasValue = isset($attr[2]) || isset($attr[3]) || isset($attr[4]);
                    $rawVal = '';
                    if (isset($attr[2]) && $attr[2] !== '') {
                        $rawVal = $attr[2];
                    } elseif (isset($attr[3]) && $attr[3] !== '') {
                        $rawVal = $attr[3];
                    } elseif (isset($attr[4]) && $attr[4] !== '') {
                        $rawVal = $attr[4];
                    }

                    // Atrybuty zdarzeń (onerror=, onclick=, onload=, itd.)
                    if (preg_match('/\Aon[a-z]+\z/i', $attrName) === 1) {
                        return [
                            'ok' => false,
                            'error' => 'Wykryto zabroniony atrybut zdarzenia HTML: ' . $attrName . '.',
                        ];
                    }

                    // Zabronione schematy w atrybutach (odporne na encje HTML i znaki kontrolne/spacje)
                    if ($hasValue && $rawVal !== '') {
                        $decodedVal = html_entity_decode($rawVal, ENT_QUOTES | ENT_HTML5, 'UTF-8');
                        $normalizedVal = preg_replace('/[\x00-\x20]+/', '', $decodedVal) ?? $decodedVal;
                        if (preg_match('/(?:javascript|vbscript):|data:(?:text\/html|image\/svg|application\/)|expression\s*\(/i', $normalizedVal) === 1) {
                            return [
                                'ok' => false,
                                'error' => 'Wykryto niebezpieczny schemat lub wyrażenie (javascript:, vbscript:, data:text/html, data:image/svg) w atrybucie ' . $attrName . '.',
                            ];
                        }
                    }
                }
            }
        }
    }

    // 5. Ścisła biała lista tagów <script>
    $totalScriptOpens = preg_match_all('/<\s*script\b/i', $html);
    if ($totalScriptOpens === false) {
        return ['ok' => false, 'error' => 'Nie udało się zweryfikować tagów <script> w dokumencie HTML.'];
    }

    if ($totalScriptOpens > 0) {
        $pairedCount = preg_match_all('/<\s*script\b([^>]*)>(.*?)<\s*\/\s*script\s*>/is', $html, $scriptMatches, PREG_SET_ORDER);
        if ($pairedCount === false || $pairedCount !== $totalScriptOpens) {
            return ['ok' => false, 'error' => 'Wykryto nieprawidłowy lub niedomknięty tag <script>.'];
        }

        foreach ($scriptMatches as $scriptMatch) {
            $attrs = $scriptMatch[1] ?? '';
            $innerBody = trim((string) ($scriptMatch[2] ?? ''));

            if ($innerBody !== '') {
                return ['ok' => false, 'error' => 'Wykryto niedozwolony kod inline wewnątrz tagu <script>.'];
            }

            if (preg_match_all('/\bsrc\s*=/i', $attrs) !== 1) {
                return ['ok' => false, 'error' => 'Tag <script> musi posiadać dokładnie jeden atrybut src.'];
            }

            $srcValue = null;
            if (preg_match('/\bsrc\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s"\'=<>`]+))/i', $attrs, $srcMatch) === 1) {
                $srcValue = $srcMatch[1] !== ''
                    ? $srcMatch[1]
                    : (($srcMatch[2] ?? '') !== '' ? $srcMatch[2] : ($srcMatch[3] ?? ''));
            }

            if ($srcValue === null || trim($srcValue) === '') {
                return ['ok' => false, 'error' => 'Tag <script> bez dozwolonego atrybutu src jest zabroniony.'];
            }

            $srcTrimmed = trim($srcValue);
            // Wyłącznie lokalne skrypty witryny: assets/site.js lub assets/home-page.js (z opcjonalnym ../ lub ./ oraz ?v=...)
            if (preg_match('/\A(?:\.\/|(?:\.\.\/)*)assets\/(?:site|home-page)\.js(?:\?v=[a-zA-Z0-9._-]+)?\z/', $srcTrimmed) !== 1) {
                return [
                    'ok' => false,
                    'error' => 'Tag <script> wskazuje na niedozwolony skrypt spoza białej listy: ' . $srcTrimmed,
                ];
            }
        }
    }

    return ['ok' => true, 'error' => null];
}

/**
 * Sprawdza, czy ścieżka $candidate leży bezpiecznie wewnątrz katalogu $root.
 */
function isPathInsideRoot(string $root, string $candidate): bool {
    return $candidate === $root || str_starts_with($candidate, $root . DIRECTORY_SEPARATOR);
}

/**
 * Tworzy podkatalogi wewnątrz $siteRoot z ochroną przed symlinkami i traversalem.
 */
function ensureSafeDirectory(string $siteRoot, string $relativeDir): string {
    if ($relativeDir === '' || $relativeDir === '.') {
        return $siteRoot;
    }

    $current = $siteRoot;
    foreach (explode('/', $relativeDir) as $segment) {
        if ($segment === '' || $segment === '.' || $segment === '..' || str_starts_with($segment, '.')) {
            throw new RuntimeException('Niedozwolony segment katalogu: ' . $relativeDir, 403);
        }
        $next = $current . DIRECTORY_SEPARATOR . $segment;
        if (is_link($next)) {
            throw new RuntimeException('Niedozwolone dowiązanie symboliczne w ścieżce docelowej.', 403);
        }
        if (file_exists($next)) {
            if (!is_dir($next)) {
                throw new RuntimeException('Konflikt ścieżki: oczekiwano katalogu dla ' . $relativeDir, 400);
            }
        } else {
            if (!mkdir($next, 0755, false) && !is_dir($next)) {
                throw new RuntimeException('Nie udało się utworzyć katalogu: ' . $relativeDir, 500);
            }
        }
        $current = $next;
    }

    $resolved = realpath($current);
    if ($resolved === false || !isPathInsideRoot($siteRoot, $resolved)) {
        throw new RuntimeException('Ścieżka docelowa wykracza poza katalog witryny.', 403);
    }
    return $resolved;
}

/**
 * Usuwa puste katalogi nadrzędne po usunięciu pliku (nie dotyka katalogów chronionych).
 */
function cleanupEmptyParentDirs(string $siteRoot, string $relativePath, array $protectedDirs = ['assets', 'img', 'panel', 'css', 'js']): void {
    $dirRel = dirname($relativePath);
    while ($dirRel !== '' && $dirRel !== '.') {
        $top = strtolower(explode('/', $dirRel)[0]);
        if (in_array($top, $protectedDirs, true)) {
            break;
        }
        $fullDir = $siteRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $dirRel);
        if (!is_dir($fullDir) || is_link($fullDir)) {
            break;
        }
        $resolved = realpath($fullDir);
        if ($resolved === false || $resolved === $siteRoot || !isPathInsideRoot($siteRoot, $resolved)) {
            break;
        }
        $entries = scandir($resolved);
        if ($entries === false || count($entries) > 2) {
            break;
        }
        if (!@rmdir($resolved)) {
            break;
        }
        $dirRel = dirname($dirRel);
    }
}

/**
 * Zapisuje plik atomowo wewnątrz $siteRoot (plik tymczasowy + chmod 0644 + rename).
 */
function writeFileAtomically(string $siteRoot, string $relativePath, string $bytes): void {
    $relativeDir = dirname($relativePath);
    $baseName = basename($relativePath);

    $safeDir = ensureSafeDirectory($siteRoot, $relativeDir);
    $targetPath = $safeDir . DIRECTORY_SEPARATOR . $baseName;

    if (is_link($targetPath) || is_dir($targetPath)) {
        throw new RuntimeException('Nie można nadpisać ścieżki (katalog lub symlink): ' . $relativePath, 403);
    }

    $tempPath = $safeDir . DIRECTORY_SEPARATOR . '.cms-' . bin2hex(random_bytes(10)) . '.tmp';
    try {
        $written = file_put_contents($tempPath, $bytes, LOCK_EX);
        if ($written === false || $written !== strlen($bytes)) {
            throw new RuntimeException('Błąd zapisu pliku tymczasowego dla: ' . $relativePath, 500);
        }

        if (!@chmod($tempPath, 0644)) {
            throw new RuntimeException('Nie udało się ustawić uprawnień dla pliku: ' . $relativePath, 500);
        }

        if (!@rename($tempPath, $targetPath)) {
            throw new RuntimeException('Nie udało się atomowo podmienić pliku: ' . $relativePath, 500);
        }
    } catch (Throwable $e) {
        if (is_file($tempPath)) {
            @unlink($tempPath);
        }
        throw $e;
    }
}

/**
 * Generuje losowy UUIDv4 (używany m.in. jako nowa rewizja manifestu po przywróceniu kopii).
 */
function generateUuidV4(): string {
    $data = random_bytes(16);
    $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
    $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

/**
 * Zwraca ścieżkę katalogu kopii zapasowych POZA public_html i dba o jego utworzenie.
 */
function ensureBackupsRoot(string $privateDir): string {
    $root = rtrim($privateDir, '/\\') . DIRECTORY_SEPARATOR . 'cms-backups';
    if (!is_dir($root)) {
        if (!@mkdir($root, 0750, true) && !is_dir($root)) {
            throw new RuntimeException('Nie udało się utworzyć prywatnego katalogu kopii zapasowych (cms-backups).', 500);
        }
    }
    return $root;
}

/**
 * Zbiera listę wszystkich plików .html oraz assets/*.json z witryny (bez panel/, img/, .git/).
 * Zwraca tablicę [relativePath => absolutePath].
 */
function collectSiteBackupFiles(string $siteRoot): array {
    $collected = [];

    $walk = static function (string $dir, string $prefix) use (&$walk, &$collected): void {
        $entries = @scandir($dir);
        if ($entries === false) {
            return;
        }
        foreach ($entries as $entry) {
            if ($entry === '.' || $entry === '..' || str_starts_with($entry, '.')) {
                continue;
            }
            $fullPath = $dir . DIRECTORY_SEPARATOR . $entry;
            if (is_link($fullPath)) {
                continue;
            }
            $relPath = $prefix === '' ? $entry : ($prefix . '/' . $entry);

            if (is_dir($fullPath)) {
                if ($prefix === '' && in_array(strtolower($entry), CMS_BACKUP_EXCLUDED_TOP_DIRS, true)) {
                    continue;
                }
                $walk($fullPath, $relPath);
                continue;
            }

            if (!is_file($fullPath) || !is_readable($fullPath)) {
                continue;
            }

            $ext = strtolower(pathinfo($entry, PATHINFO_EXTENSION));
            if ($ext === 'html') {
                $collected[$relPath] = $fullPath;
            } elseif ($ext === 'json' && strtolower($prefix) === 'assets') {
                $collected[$relPath] = $fullPath;
            }
        }
    };

    $walk($siteRoot, '');
    ksort($collected);
    return $collected;
}

/**
 * Rekurencyjnie usuwa katalog (używane WYŁĄCZNIE przy rotacji starych kopii auto-* lub czyszczeniu nieudanego zapisu).
 */
function deleteDirectoryRecursive(string $dirPath): void {
    if (!is_dir($dirPath) || is_link($dirPath)) {
        return;
    }
    $entries = @scandir($dirPath);
    if ($entries === false) {
        return;
    }
    foreach ($entries as $entry) {
        if ($entry === '.' || $entry === '..') {
            continue;
        }
        $full = $dirPath . DIRECTORY_SEPARATOR . $entry;
        if (is_dir($full) && !is_link($full)) {
            deleteDirectoryRecursive($full);
        } else {
            @unlink($full);
        }
    }
    @rmdir($dirPath);
}

/**
 * Zapisuje fizyczną migawkę plików witryny w katalogu $backupsRoot/$backupId.
 */
function writeBackupDirectory(string $siteRoot, string $backupsRoot, string $backupId, string $type, string $label, bool $immutable): array {
    $targetDir = $backupsRoot . DIRECTORY_SEPARATOR . $backupId;
    $tmpDir = $backupsRoot . DIRECTORY_SEPARATOR . '.tmp-' . $backupId . '-' . bin2hex(random_bytes(4));
    $filesRoot = $tmpDir . DIRECTORY_SEPARATOR . 'files';

    if (!@mkdir($filesRoot, 0750, true) && !is_dir($filesRoot)) {
        throw new RuntimeException('Nie udało się utworzyć katalogu roboczego kopii zapasowej.', 500);
    }

    try {
        $siteFiles = collectSiteBackupFiles($siteRoot);
        $totalBytes = 0;
        $savedPaths = [];

        foreach ($siteFiles as $relPath => $absSource) {
            $destPath = $filesRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relPath);
            $destDir = dirname($destPath);
            if (!is_dir($destDir) && !@mkdir($destDir, 0750, true) && !is_dir($destDir)) {
                throw new RuntimeException('Nie udało się utworzyć podkatalogu w kopii zapasowej: ' . $relPath, 500);
            }
            $data = @file_get_contents($absSource);
            if ($data === false) {
                throw new RuntimeException('Nie udało się odczytać pliku do kopii zapasowej: ' . $relPath, 500);
            }
            if (@file_put_contents($destPath, $data, LOCK_EX) === false) {
                throw new RuntimeException('Nie udało się zapisać pliku w kopii zapasowej: ' . $relPath, 500);
            }
            @chmod($destPath, 0640);
            $totalBytes += strlen($data);
            $savedPaths[] = $relPath;
        }

        $meta = [
            'id' => $backupId,
            'label' => $label,
            'createdAt' => gmdate('c'),
            'immutable' => $immutable,
            'type' => $type,
            'fileCount' => count($savedPaths),
            'sizeBytes' => $totalBytes,
            'files' => $savedPaths,
        ];

        $metaJson = json_encode($meta, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (!is_string($metaJson) || @file_put_contents($tmpDir . DIRECTORY_SEPARATOR . 'meta.json', $metaJson, LOCK_EX) === false) {
            throw new RuntimeException('Nie udało się zapisać metadanych kopii zapasowej.', 500);
        }
        @chmod($tmpDir . DIRECTORY_SEPARATOR . 'meta.json', 0640);

        if (!@rename($tmpDir, $targetDir)) {
            throw new RuntimeException('Nie udało się sfinalizować katalogu kopii zapasowej: ' . $backupId, 500);
        }

        return [
            'id' => $meta['id'],
            'label' => $meta['label'],
            'createdAt' => $meta['createdAt'],
            'immutable' => $meta['immutable'],
            'type' => $meta['type'],
            'fileCount' => $meta['fileCount'],
            'sizeBytes' => $meta['sizeBytes'],
        ];
    } catch (Throwable $e) {
        deleteDirectoryRecursive($tmpDir);
        throw $e;
    }
}

/**
 * Gwarantuje istnienie nieusuwalnej, fabrycznej kopii zapasowej "original".
 * Jeśli kopia "original" już istnieje — NIGDY jej nie nadpisuje i nie modyfikuje!
 */
function ensureOriginalBackup(string $siteRoot, string $privateDir): array {
    $backupsRoot = ensureBackupsRoot($privateDir);
    $originalMetaPath = $backupsRoot . DIRECTORY_SEPARATOR . 'original' . DIRECTORY_SEPARATOR . 'meta.json';

    if (is_file($originalMetaPath) && is_readable($originalMetaPath)) {
        $raw = @file_get_contents($originalMetaPath);
        if (is_string($raw)) {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                return [
                    'id' => 'original',
                    'label' => (string) ($decoded['label'] ?? 'Oryginalna wersja strony (fabryczna)'),
                    'createdAt' => (string) ($decoded['createdAt'] ?? ''),
                    'immutable' => true,
                    'type' => 'original',
                    'fileCount' => (int) ($decoded['fileCount'] ?? 0),
                    'sizeBytes' => (int) ($decoded['sizeBytes'] ?? 0),
                ];
            }
        }
    }

    $lockPath = $backupsRoot . DIRECTORY_SEPARATOR . '.backup.lock';
    $lockFp = @fopen($lockPath, 'c');
    if ($lockFp !== false) {
        flock($lockFp, LOCK_EX);
    }

    try {
        // Ponowne sprawdzenie pod blokadą (ochrona przed wyścigiem przy pierwszym starcie)
        if (is_file($originalMetaPath) && is_readable($originalMetaPath)) {
            $raw = @file_get_contents($originalMetaPath);
            $decoded = is_string($raw) ? json_decode($raw, true) : null;
            if (is_array($decoded)) {
                return [
                    'id' => 'original',
                    'label' => (string) ($decoded['label'] ?? 'Oryginalna wersja strony (fabryczna)'),
                    'createdAt' => (string) ($decoded['createdAt'] ?? ''),
                    'immutable' => true,
                    'type' => 'original',
                    'fileCount' => (int) ($decoded['fileCount'] ?? 0),
                    'sizeBytes' => (int) ($decoded['sizeBytes'] ?? 0),
                ];
            }
        }

        // Jeśli katalog original istnieje ale nie ma meta.json, nigdy go nie kasuj bezmyślnie
        if (is_dir($backupsRoot . DIRECTORY_SEPARATOR . 'original')) {
            throw new RuntimeException('Katalog kopii oryginalnej jest uszkodzony i wymaga weryfikacji administratora.', 500);
        }

        $meta = writeBackupDirectory(
            $siteRoot,
            $backupsRoot,
            'original',
            'original',
            'Oryginalna wersja strony (fabryczna)',
            true
        );

        auditLog($privateDir, 'backup_original_created', [
            'fileCount' => $meta['fileCount'],
            'sizeBytes' => $meta['sizeBytes'],
        ]);

        return $meta;
    } finally {
        if ($lockFp !== false) {
            flock($lockFp, LOCK_UN);
            fclose($lockFp);
        }
    }
}

/**
 * Tworzy kopię zapasową auto-YYYYMMDD-HHMMSS lub manual-YYYYMMDD-HHMMSS.
 * Dla kopii auto-* utrzymuje maksymalnie 10 najnowszych (NIGDY nie usuwa "original" ani "manual-*").
 */
function createBackupSnapshot(string $siteRoot, string $privateDir, string $idPrefix = 'auto', string $label = 'Automatyczna kopia zapasowa'): array {
    ensureOriginalBackup($siteRoot, $privateDir);
    $backupsRoot = ensureBackupsRoot($privateDir);

    $safePrefix = ($idPrefix === 'manual') ? 'manual' : 'auto';
    $cleanLabel = trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $label) ?? '');
    if ($cleanLabel === '') {
        $cleanLabel = $safePrefix === 'manual' ? 'Kopia ręczna' : 'Automatyczna kopia zapasowa';
    }
    if (function_exists('mb_substr')) {
        $cleanLabel = mb_substr($cleanLabel, 0, 120, 'UTF-8');
    } else {
        $cleanLabel = substr($cleanLabel, 0, 120);
    }

    $lockPath = $backupsRoot . DIRECTORY_SEPARATOR . '.backup.lock';
    $lockFp = @fopen($lockPath, 'c');
    if ($lockFp !== false) {
        flock($lockFp, LOCK_EX);
    }

    try {
        $baseId = $safePrefix . '-' . gmdate('Ymd-His');
        $backupId = $baseId;
        if (file_exists($backupsRoot . DIRECTORY_SEPARATOR . $backupId)) {
            $backupId = $baseId . '-' . bin2hex(random_bytes(2));
        }

        $meta = writeBackupDirectory($siteRoot, $backupsRoot, $backupId, $safePrefix, $cleanLabel, false);

        // Rotacja WYŁĄCZNIE kopii automatycznych auto-* powyżej limitu CMS_AUTO_BACKUPS_KEEP (10)
        if ($safePrefix === 'auto') {
            $entries = @scandir($backupsRoot);
            if ($entries !== false) {
                $autoIds = [];
                foreach ($entries as $entry) {
                    if ($entry === 'original' || str_starts_with($entry, '.')) {
                        continue;
                    }
                    if (preg_match('/\Aauto-\d{8}-\d{6}(?:-[a-f0-9]{4})?\z/', $entry) === 1) {
                        $full = $backupsRoot . DIRECTORY_SEPARATOR . $entry;
                        if (is_dir($full) && !is_link($full)) {
                            $autoIds[] = $entry;
                        }
                    }
                }
                rsort($autoIds, SORT_STRING);
                $toDelete = array_slice($autoIds, CMS_AUTO_BACKUPS_KEEP);
                foreach ($toDelete as $oldId) {
                    // Dodatkowa twarda strażnica: nigdy nie usuwaj 'original'
                    if ($oldId === 'original') {
                        continue;
                    }
                    deleteDirectoryRecursive($backupsRoot . DIRECTORY_SEPARATOR . $oldId);
                }
            }
        }

        auditLog($privateDir, 'backup_created', [
            'id' => $meta['id'],
            'type' => $safePrefix,
            'fileCount' => $meta['fileCount'],
            'sizeBytes' => $meta['sizeBytes'],
        ]);

        return $meta;
    } finally {
        if ($lockFp !== false) {
            flock($lockFp, LOCK_UN);
            fclose($lockFp);
        }
    }
}

/**
 * Zwraca listę wszystkich dostępnych kopii zapasowych (od najnowszej, z nieusuwalną kopią "original").
 */
function listBackups(string $privateDir): array {
    $backupsRoot = rtrim($privateDir, '/\\') . DIRECTORY_SEPARATOR . 'cms-backups';
    if (!is_dir($backupsRoot)) {
        return [];
    }

    $entries = @scandir($backupsRoot);
    if ($entries === false) {
        return [];
    }

    $items = [];
    foreach ($entries as $entry) {
        if (str_starts_with($entry, '.') || preg_match(CMS_BACKUP_ID_REGEX, $entry) !== 1) {
            continue;
        }
        $metaPath = $backupsRoot . DIRECTORY_SEPARATOR . $entry . DIRECTORY_SEPARATOR . 'meta.json';
        if (!is_file($metaPath) || !is_readable($metaPath)) {
            continue;
        }
        $raw = @file_get_contents($metaPath);
        if (!is_string($raw)) {
            continue;
        }
        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            continue;
        }

        $isOriginal = ($entry === 'original');
        $items[] = [
            'id' => $entry,
            'label' => (string) ($decoded['label'] ?? ($isOriginal ? 'Oryginalna wersja strony (fabryczna)' : $entry)),
            'createdAt' => (string) ($decoded['createdAt'] ?? ''),
            'immutable' => $isOriginal ? true : (bool) ($decoded['immutable'] ?? false),
            'type' => $isOriginal ? 'original' : (string) ($decoded['type'] ?? (str_starts_with($entry, 'manual-') ? 'manual' : 'auto')),
            'fileCount' => (int) ($decoded['fileCount'] ?? 0),
            'sizeBytes' => (int) ($decoded['sizeBytes'] ?? 0),
        ];
    }

    usort($items, static function (array $a, array $b): int {
        if ($a['id'] === 'original' && $b['id'] !== 'original') {
            return 1;
        }
        if ($b['id'] === 'original' && $a['id'] !== 'original') {
            return -1;
        }
        $cmp = strcmp($b['createdAt'], $a['createdAt']);
        return $cmp !== 0 ? $cmp : strcmp($b['id'], $a['id']);
    });

    return $items;
}

/**
 * Wyciąga z assets/cms-manifest.json względne ścieżki podstron (używane przy sprzątaniu stron dodanych po kopii).
 */
function extractManifestHtmlPaths(string $manifestPath): array {
    if (!is_file($manifestPath) || !is_readable($manifestPath)) {
        return [];
    }
    $raw = @file_get_contents($manifestPath);
    if (!is_string($raw)) {
        return [];
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded) || !isset($decoded['pages']) || !is_array($decoded['pages'])) {
        return [];
    }

    $paths = [];
    foreach ($decoded['pages'] as $page) {
        if (!is_array($page)) {
            continue;
        }
        $p = $page['path'] ?? null;
        if (
            is_string($p) &&
            $p !== '' &&
            strtolower($p) !== 'index.html' &&
            str_ends_with(strtolower($p), '.html') &&
            !str_contains($p, '..') &&
            !str_starts_with($p, '/') &&
            !str_starts_with(strtolower($p), 'assets/') &&
            !str_starts_with(strtolower($p), 'panel/')
        ) {
            $paths[$p] = true;
        }
    }
    return array_keys($paths);
}

/**
 * Zbiera listę plików w katalogu files/ konkretnej kopii zapasowej.
 */
function collectSnapshotFiles(string $filesRoot): array {
    $collected = [];

    $walk = static function (string $dir, string $prefix) use (&$walk, &$collected): void {
        $entries = @scandir($dir);
        if ($entries === false) {
            return;
        }
        foreach ($entries as $entry) {
            if ($entry === '.' || $entry === '..' || str_starts_with($entry, '.')) {
                continue;
            }
            $fullPath = $dir . DIRECTORY_SEPARATOR . $entry;
            if (is_link($fullPath)) {
                continue;
            }
            $relPath = $prefix === '' ? $entry : ($prefix . '/' . $entry);
            if (is_dir($fullPath)) {
                $walk($fullPath, $relPath);
                continue;
            }
            if (is_file($fullPath) && is_readable($fullPath)) {
                $collected[$relPath] = $fullPath;
            }
        }
    };

    $walk($filesRoot, '');
    ksort($collected);
    return $collected;
}

/**
 * Atomowo przywraca wskazaną kopię zapasową (w tym "original").
 * Przed nadpisaniem automatycznie wykonuje kopię bezpieczeństwa bieżącego stanu!
 */
function restoreBackupSnapshot(string $siteRoot, string $privateDir, string $backupId): array {
    if (preg_match(CMS_BACKUP_ID_REGEX, $backupId) !== 1) {
        throw new RuntimeException('Nieprawidłowy identyfikator kopii zapasowej.', 400);
    }

    $backupsRoot = ensureBackupsRoot($privateDir);
    $snapshotDir = $backupsRoot . DIRECTORY_SEPARATOR . $backupId;
    $metaPath = $snapshotDir . DIRECTORY_SEPARATOR . 'meta.json';
    $filesRoot = $snapshotDir . DIRECTORY_SEPARATOR . 'files';

    if (!is_dir($snapshotDir) || !is_file($metaPath) || !is_dir($filesRoot)) {
        throw new RuntimeException('Wybrana kopia zapasowa nie istnieje na serwerze.', 404);
    }

    $lockPath = rtrim($privateDir, '/\\') . DIRECTORY_SEPARATOR . 'wolbud-editor.lock';
    $lockHandle = @fopen($lockPath, 'c');
    if ($lockHandle === false || !flock($lockHandle, LOCK_EX)) {
        if ($lockHandle !== false) {
            fclose($lockHandle);
        }
        throw new RuntimeException('Nie udało się uzyskać blokady zapisu na serwerze. Spróbuj ponownie.', 503);
    }

    try {
        // 1. Kopia bezpieczeństwa bieżącego stanu przed przywróceniem (zawsze można cofnąć!)
        ensureOriginalBackup($siteRoot, $privateDir);
        $preBackup = createBackupSnapshot(
            $siteRoot,
            $privateDir,
            'auto',
            'Kopia przed przywróceniem (' . $backupId . ')'
        );

        // 2. Wczytanie listy plików do przywrócenia oraz weryfikacja bezpieczeństwa
        $snapshotFiles = collectSnapshotFiles($filesRoot);
        if ($snapshotFiles === []) {
            throw new RuntimeException('Wybrana kopia zapasowa jest pusta i nie może zostać przywrócona.', 500);
        }

        $manifestPayload = null;
        $filesToWrite = [];

        foreach ($snapshotFiles as $relPath => $absSource) {
            if (
                str_contains($relPath, "\0") ||
                str_contains($relPath, '\\') ||
                str_contains($relPath, '..') ||
                str_starts_with($relPath, '/')
            ) {
                throw new RuntimeException('Nieprawidłowa ścieżka wewnątrz kopii zapasowej: ' . $relPath, 500);
            }
            $ext = strtolower(pathinfo($relPath, PATHINFO_EXTENSION));
            $isAllowed = ($ext === 'html') || ($ext === 'json' && str_starts_with(strtolower($relPath), 'assets/'));
            if (!$isAllowed) {
                continue;
            }

            $bytes = @file_get_contents($absSource);
            if ($bytes === false) {
                throw new RuntimeException('Nie udało się odczytać pliku z kopii zapasowej: ' . $relPath, 500);
            }

            if ($ext === 'html') {
                $check = validateSafeHtmlDocument($bytes);
                if (!$check['ok']) {
                    throw new RuntimeException('Plik w kopii nie przeszedł weryfikacji bezpieczeństwa (' . $relPath . '): ' . $check['error'], 500);
                }
            }

            if ($relPath === 'assets/cms-manifest.json') {
                $manifestPayload = $bytes;
                continue;
            }
            $filesToWrite[$relPath] = $bytes;
        }

        // Lista bieżących stron z manifestu sprzed przywrócenia (aby posprzątać podstrony dodane po backupie)
        $currentManifestPath = $siteRoot . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'cms-manifest.json';
        $previousManifestPages = extractManifestHtmlPaths($currentManifestPath);

        // 3. Atomowy zapis przywracanych plików (wszystko oprócz manifestu)
        $restoredCount = 0;
        foreach ($filesToWrite as $relPath => $bytes) {
            writeFileAtomically($siteRoot, $relPath, $bytes);
            $restoredCount++;
        }

        // 4. Usunięcie customowych podstron .html dodanych po dacie kopii (tylko z manifestu, nigdy index.html)
        $removedCount = 0;
        foreach ($previousManifestPages as $oldRelPath) {
            if (isset($filesToWrite[$oldRelPath])) {
                continue;
            }
            $targetPath = $siteRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $oldRelPath);
            if (!is_file($targetPath) || is_link($targetPath)) {
                continue;
            }
            $resolved = realpath($targetPath);
            if ($resolved !== false && isPathInsideRoot($siteRoot, $resolved)) {
                if (@unlink($resolved)) {
                    $removedCount++;
                    cleanupEmptyParentDirs($siteRoot, $oldRelPath);
                }
            }
        }

        // 5. Zapis assets/cms-manifest.json na samym końcu z nowym UUID w polu revision
        $newRevision = generateUuidV4();
        if ($manifestPayload !== null) {
            $decodedManifest = json_decode($manifestPayload, true);
            if (is_array($decodedManifest)) {
                $decodedManifest['revision'] = $newRevision;
                $decodedManifest['updatedAt'] = gmdate('c');
                $decodedManifest['restoredFrom'] = $backupId;
                $encodedManifest = json_encode($decodedManifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                if (is_string($encodedManifest)) {
                    $manifestPayload = $encodedManifest . "\n";
                }
            }
            writeFileAtomically($siteRoot, 'assets/cms-manifest.json', $manifestPayload);
            $restoredCount++;
        }

        auditLog($privateDir, 'backup_restored', [
            'backupId' => $backupId,
            'revision' => $newRevision,
            'restoredFiles' => $restoredCount,
            'removedFiles' => $removedCount,
            'preRestoreBackupId' => $preBackup['id'],
        ]);

        return [
            'restoredId' => $backupId,
            'revision' => $newRevision,
            'restoredFiles' => $restoredCount,
            'removedFiles' => $removedCount,
            'preRestoreBackupId' => $preBackup['id'],
        ];
    } finally {
        flock($lockHandle, LOCK_UN);
        fclose($lockHandle);
    }
}
