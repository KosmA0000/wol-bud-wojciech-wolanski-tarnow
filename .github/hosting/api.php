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

function blockId(mixed $id): bool {
    return is_string($id) && preg_match('/\A[a-z][a-z\d-]{0,89}\z/i', $id) === 1;
}

function blockOrder(mixed $order): bool {
    return is_array($order) && array_is_list($order) && count($order) <= 100 &&
        count(array_filter($order, 'blockId')) === count($order) &&
        count(array_unique($order)) === count($order);
}

function shortText(mixed $value, int $limit): bool {
    return is_string($value) && strlen($value) <= 4 * $limit &&
        preg_replace('/\s+/u', ' ', $value) === trim($value) &&
        preg_match_all('/./us', $value) + preg_match_all('/[\x{10000}-\x{10FFFF}]/u', $value) <= $limit;
}

function safeLink(mixed $url): bool {
    if (!is_string($url) || strlen($url) > 2000 || str_contains($url, '\\') ||
        str_starts_with($url, '//') || preg_match('/[\s\x00-\x1f\x7f]/u', $url)) {
        return false;
    }
    if (!preg_match('/\A[a-z][a-z\d+.-]*:/i', $url)) return true;
    $parts = parse_url($url);
    return $parts !== false && strtolower($parts['scheme'] ?? '') === 'https' &&
        isset($parts['host']) && !isset($parts['user']) && !isset($parts['pass']);
}

function safeImage(mixed $value): bool {
    return safeLink($value) || (is_string($value) && strlen($value) <= 240000 &&
        preg_match('~\Adata:image/(?:webp|png|jpeg);base64,[a-z0-9+/]+=*\z~i', $value) === 1);
}

function validContent(mixed $value): bool {
    if (!is_array($value) || ($value['version'] ?? null) !== 2 ||
        !validRevision($value['revision'] ?? null) || $value['revision'] === 'original' ||
        !blockOrder($value['order'] ?? null) || !is_array($value['lists'] ?? null) ||
        !is_array($value['texts'] ?? null) || !is_array($value['added'] ?? null) ||
        !is_array($value['media'] ?? null)) {
        return false;
    }
    foreach ($value['lists'] as $id => $order) {
        if (!blockId($id) || !blockOrder($order)) return false;
    }
    foreach ($value['texts'] as $id => $text) {
        if (!is_string($id) || !preg_match('/\A[a-z][a-z\d-]{0,89}:[a-z\d-]+\z/i', $id) ||
            !shortText($text, 2000)) return false;
    }
    foreach ($value['media'] as $id => $media) {
        if (!blockId($id) || !is_array($media) ||
            (isset($media['link']) && !safeLink($media['link'])) ||
            (isset($media['image']) && !safeImage($media['image']))) return false;
    }
    $sectionTypes = ['section-review', 'section-product', 'section-tile', 'section-text'];
    $itemTypes = ['review', 'product', 'tile', 'project', 'text', 'link', 'service', 'logo'];
    foreach ($value['added'] as $id => $item) {
        if (!is_string($id) || !preg_match('/\Ablok-[a-f0-9-]{36}\z/', $id) || !is_array($item) ||
            !blockId($item['group'] ?? null) || !shortText($item['title'] ?? null, 160) ||
            $item['title'] === '' || !shortText($item['body'] ?? null, 2000) ||
            !safeLink($item['link'] ?? null) || !safeImage($item['image'] ?? null) ||
            !is_int($item['rating'] ?? null) || $item['rating'] < 1 || $item['rating'] > 5) return false;
        $main = $item['group'] === 'main';
        $order = $main ? $value['order'] : ($value['lists'][$item['group']] ?? []);
        if (!in_array($item['type'] ?? null, $main ? $sectionTypes : $itemTypes, true) ||
            !in_array($id, $order, true)) return false;
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

$raw = file_get_contents('php://input', false, null, 0, 720001);
if ($raw === false || strlen($raw) > 720000) reply(413);
$request = json_decode($raw, true);
$candidate = $request['candidate'] ?? null;
$allowed = $request['allowed'] ?? null;
if (!validContent($candidate) || !is_array($allowed) ||
    count($allowed) < 1 || count($allowed) > 2 || count(array_filter($allowed, 'validRevision')) !== count($allowed)) {
    reply(400);
}

$root = dirname(__DIR__);
$path = $request['path'] ?? null;
if (!is_string($path) || !preg_match('~\Aassets/(?:home-content|page-data/[a-f0-9]{16})\.json\z~', $path)) {
    reply(400);
}
$catalog = json_decode(file_get_contents($root . '/assets/page-catalog.json'), true);
if (!is_array($catalog) || !in_array($path, array_column($catalog, 'content'), true)) {
    reply(400);
}
$target = $root . '/' . $path;
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
        foreach (['lists', 'added', 'texts', 'media'] as $field) $candidate[$field] = (object) $candidate[$field];
        $payload = json_encode($candidate, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
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
