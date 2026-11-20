<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function reply(int $status): never {
    http_response_code($status);
    echo json_encode(['ok' => $status === 200]);
    exit;
}

function validRevision(mixed $revision): bool {
    return is_string($revision) && preg_match('/\A(?:original|[a-f0-9-]{36})\z/', $revision) === 1;
}

function validContent(mixed $value): bool {
    $limits = [
        'ofirmie' => ['heading' => 160, 'intro' => 800],
        'oferta' => ['heading' => 160, 'intro' => 500],
        'opinie' => ['heading' => 160, 'intro' => 500],
    ];
    if (!is_array($value) || ($value['version'] ?? null) !== 1 ||
        !validRevision($value['revision'] ?? null) || $value['revision'] === 'original' ||
        !is_array($value['order'] ?? null) || !array_is_list($value['order'])) {
        return false;
    }
    $order = $value['order'];
    $expectedSections = array_keys($limits);
    sort($order, SORT_STRING);
    sort($expectedSections, SORT_STRING);
    if ($order !== $expectedSections) {
        return false;
    }
    foreach ($limits as $section => $fields) {
        foreach ($fields as $field => $max) {
            $text = $value['fields'][$section][$field] ?? null;
            if (!is_string($text) || $text === '' ||
                preg_replace('/\s+/u', ' ', $text) !== trim($text)) {
                return false;
            }
            $length = preg_match_all('/./us', $text) + preg_match_all('/[\x{10000}-\x{10FFFF}]/u', $text);
            if ($length > $max) {
                return false;
            }
        }
    }
    return true;
}

if ($_SERVER['REQUEST_METHOD'] !== 'PUT') {
    header('Allow: PUT');
    reply(405);
}

$configPath = dirname(__DIR__, 2) . '/wolbud-editor-config.php';
if (!is_readable($configPath)) {
    reply(503);
}
$passwordHash = require $configPath;
$user = $_SERVER['PHP_AUTH_USER'] ?? '';
$password = $_SERVER['PHP_AUTH_PW'] ?? '';
$header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
if ($user === '' && str_starts_with($header, 'Basic ')) {
    $pair = base64_decode(substr($header, 6), true);
    if ($pair !== false && str_contains($pair, ':')) {
        [$user, $password] = explode(':', $pair, 2);
    }
}
if ($user !== 'editor' || !is_string($passwordHash) || !password_verify($password, $passwordHash)) {
    reply(401);
}

$request = json_decode(file_get_contents('php://input', false, null, 0, 16001), true);
$candidate = $request['candidate'] ?? null;
$allowed = $request['allowed'] ?? null;
if (!validContent($candidate) || !is_array($allowed) ||
    count($allowed) < 1 || count($allowed) > 2 || count(array_filter($allowed, 'validRevision')) !== count($allowed)) {
    reply(400);
}

$target = dirname(__DIR__) . '/assets/home-content.json';
$lock = fopen(dirname($configPath) . '/wolbud-editor.lock', 'c');
if ($lock === false || !flock($lock, LOCK_EX)) {
    reply(503);
}

$status = 500;
$temp = null;
try {
    $current = json_decode(file_get_contents($target), true);
    if (!validRevision($current['revision'] ?? null)) {
        $status = 503;
    } elseif (!in_array($current['revision'], $allowed, true)) {
        $status = 409;
    } else {
        $temp = dirname($target) . '/.wolbud-' . bin2hex(random_bytes(10));
        $payload = json_encode($candidate, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . "\n";
        if (file_put_contents($temp, $payload) === strlen($payload) && chmod($temp, 0644) && rename($temp, $target)) {
            $status = 200;
        }
    }
} finally {
    if ($temp !== null && is_file($temp)) {
        unlink($temp);
    }
    flock($lock, LOCK_UN);
    fclose($lock);
}
reply($status);
