<?php
declare(strict_types=1);

/**
 * Bezpieczne, autoryzowane proxy PHP dla Asystenta AI panelu CMS Studio (PHP 8.1+ + cURL).
 * Umieszczane na hostingu (cyber_Folks / LH / Home / dHosting) jako: panel/ai-proxy.php
 *
 * Korzysta z panel/_common.php oraz pliku konfiguracyjnego poza katalogiem public_html:
 *   dirname($siteRoot) . '/cms-editor-config.php' (fallback: '/wolbud-editor-config.php')
 *
 * Obsługiwane żądania:
 *   - GET  ?status=1  -> { ok: true, configured: bool, authenticated: bool, provider: ?string, model: ?string }
 *   - POST (JSON)     -> WYMAGA autoryzacji (sesja + CSRF lub Basic Auth)!
 *                        Zwraca: { ok: true, provider: string, model: string, text: string, toolCalls: [...] }
 */

require_once __DIR__ . '/_common.php';

const AI_MAX_REQUEST_BYTES = 3 * 1024 * 1024; // 3 MB (wiadomość może zawierać do 3 zrzutów zaznaczonych elementów)

/** Zrzuty ekranu zaznaczonych elementów: maks. 3, JPEG/PNG/WebP, każdy do ~800 KB base64. */
function sanitizeMessageImages(mixed $images): array {
    if (!is_array($images)) {
        return [];
    }
    $out = [];
    foreach (array_slice($images, 0, 3) as $img) {
        if (!is_array($img)) {
            continue;
        }
        $mime = is_string($img['mimeType'] ?? null) ? strtolower(trim($img['mimeType'])) : '';
        $data = is_string($img['data'] ?? null) ? trim($img['data']) : '';
        if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
            continue;
        }
        if ($data === '' || strlen($data) > 800 * 1024 || preg_match('/\A[A-Za-z0-9+\/=]+\z/', $data) !== 1) {
            continue;
        }
        $out[] = ['mimeType' => $mime, 'data' => $data];
    }
    return $out;
}
const AI_RATE_LIMIT_MAX = 120;           // maks. 120 zapytań (jedno polecenie klienta to kilka rund narzędzi)
const AI_RATE_LIMIT_WINDOW = 60;         // w oknie 60 sekund na IP
const AI_CURL_CONNECT_TIMEOUT = 15;      // 15 s na połączenie
const AI_CURL_TIMEOUT = 45;              // 45 s na odpowiedź modelu
const AI_MAX_MESSAGES = 120;
const AI_MAX_TOOLS = 120;

const AI_SUPPORTED_PROVIDERS = ['gemini', 'openai'];
const AI_DEFAULT_MODELS = [
    // Domyślnie Gemini 4 Hydrogen z myśleniem HIGH (decyzja właściciela) — tak samo jak panel z kluczem w przeglądarce
    'gemini' => 'gemini-4-hydrogen',
    'openai' => 'gpt-4.1-mini',
];
const AI_GEMINI_FALLBACK_MODELS = [
    'gemini-3-flash-preview',
    'gemini-3.8-flash',
    'gemini-3.1-flash-lite',
];

sendSecurityHeaders();

function extractAiConfig(array $editorConfig): array {
    if (!$editorConfig['found']) {
        return [
            'configured' => false,
            'provider' => null,
            'apiKey' => null,
            'model' => null,
            'reason' => $editorConfig['error'] ?? 'Brak pliku konfiguracyjnego edytora poza katalogiem public_html.',
        ];
    }

    $ai = $editorConfig['ai'] ?? null;
    if (!is_array($ai)) {
        return [
            'configured' => false,
            'provider' => null,
            'apiKey' => null,
            'model' => null,
            'reason' => 'Brak sekcji "ai" w pliku konfiguracyjnym edytora na serwerze.',
        ];
    }

    $provider = is_string($ai['provider'] ?? null) ? strtolower(trim($ai['provider'])) : '';
    if (!in_array($provider, AI_SUPPORTED_PROVIDERS, true)) {
        return [
            'configured' => false,
            'provider' => null,
            'apiKey' => null,
            'model' => null,
            'reason' => 'Nieprawidłowy dostawca AI w konfiguracji serwera. Dozwolone wartości: gemini lub openai.',
        ];
    }

    $apiKey = is_string($ai['apiKey'] ?? null) ? trim($ai['apiKey']) : '';
    if (isPlaceholderSecret($apiKey)) {
        return [
            'configured' => false,
            'provider' => null,
            'apiKey' => null,
            'model' => null,
            'reason' => 'Klucz API AI nie został jeszcze wpisany w pliku konfiguracyjnym serwera.',
        ];
    }

    $rawModel = is_string($ai['model'] ?? null) ? trim($ai['model']) : '';
    $model = $rawModel !== '' ? $rawModel : AI_DEFAULT_MODELS[$provider];
    if (preg_match('/\A[a-zA-Z0-9._:-]{1,100}\z/', $model) !== 1) {
        return [
            'configured' => false,
            'provider' => null,
            'apiKey' => null,
            'model' => null,
            'reason' => 'Nieprawidłowa nazwa modelu AI w konfiguracji serwera.',
        ];
    }

    return [
        'configured' => true,
        'provider' => $provider,
        'apiKey' => $apiKey,
        'model' => $model,
        'reason' => null,
    ];
}

function checkAiRateLimit(string $privateDir): void {
    $baseDir = (is_dir($privateDir) && is_writable($privateDir)) ? $privateDir : sys_get_temp_dir();
    if (!is_string($baseDir) || $baseDir === '' || !is_dir($baseDir) || !is_writable($baseDir)) {
        return;
    }

    $clientIp = getClientIp();
    $bucketKey = substr(hash('sha256', 'cms-ai-proxy-rl:' . $clientIp), 0, 24);
    $filePath = rtrim($baseDir, '/\\') . DIRECTORY_SEPARATOR . '.cms-ai-rl-' . $bucketKey . '.json';

    $fp = @fopen($filePath, 'c+');
    if ($fp === false) {
        return;
    }

    try {
        if (!flock($fp, LOCK_EX)) {
            return;
        }

        $now = time();
        $cutoff = $now - AI_RATE_LIMIT_WINDOW;

        rewind($fp);
        $raw = stream_get_contents($fp);
        $timestamps = [];
        if (is_string($raw) && $raw !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                foreach ($decoded as $ts) {
                    if (is_int($ts) && $ts > $cutoff && $ts <= $now + 5) {
                        $timestamps[] = $ts;
                    }
                }
            }
        }

        if (count($timestamps) >= AI_RATE_LIMIT_MAX) {
            sort($timestamps);
            $oldest = $timestamps[0] ?? $now;
            $retryAfter = max(1, AI_RATE_LIMIT_WINDOW - ($now - $oldest));
            header('Retry-After: ' . $retryAfter);
            header('X-RateLimit-Limit: ' . AI_RATE_LIMIT_MAX);
            header('X-RateLimit-Remaining: 0');
            flock($fp, LOCK_UN);
            fclose($fp);
            $fp = null;
            reply(429, [
                'error' => 'Zbyt wiele zapytań do Asystenta AI (limit ' . AI_RATE_LIMIT_MAX . ' na minutę). Odczekaj ' . $retryAfter . ' s i spróbuj ponownie.',
            ]);
        }

        $timestamps[] = $now;
        $remaining = max(0, AI_RATE_LIMIT_MAX - count($timestamps));
        header('X-RateLimit-Limit: ' . AI_RATE_LIMIT_MAX);
        header('X-RateLimit-Remaining: ' . $remaining);

        rewind($fp);
        ftruncate($fp, 0);
        $encodedTimestamps = json_encode($timestamps);
        if (is_string($encodedTimestamps)) {
            fwrite($fp, $encodedTimestamps);
        }
        fflush($fp);
        @chmod($filePath, 0600);
    } finally {
        if (is_resource($fp)) {
            flock($fp, LOCK_UN);
            fclose($fp);
        }
    }
}

function scrubSecret(string $text, string $apiKey): string {
    if ($apiKey === '') {
        return $text;
    }
    $clean = str_replace([$apiKey, rawurlencode($apiKey)], '[UKRYTO]', $text);
    return preg_replace('/([?&]key=)[^&\s"\']+/i', '$1[UKRYTO]', $clean) ?? $clean;
}

function toJsonObject(mixed $value): array|stdClass {
    if ($value instanceof stdClass) {
        return $value;
    }
    if (is_array($value)) {
        if ($value === []) {
            return new stdClass();
        }
        return array_is_list($value) ? ['value' => $value] : $value;
    }
    return new stdClass();
}

function decodeToolArgs(mixed $rawArgs): array|stdClass {
    if (is_string($rawArgs)) {
        $trimmed = trim($rawArgs);
        if ($trimmed === '' || $trimmed === '{}') {
            return new stdClass();
        }
        $decoded = json_decode($trimmed, true);
        if (is_array($decoded)) {
            return toJsonObject($decoded);
        }
        return new stdClass();
    }
    if (is_array($rawArgs)) {
        return toJsonObject($rawArgs);
    }
    return new stdClass();
}

function sanitizeGeminiSchema(mixed $schema): ?array {
    if (!is_array($schema) || $schema === []) {
        return null;
    }

    $out = [];
    if (isset($schema['type']) && is_string($schema['type'])) {
        $out['type'] = strtolower(trim($schema['type']));
    }
    if (isset($schema['description']) && is_string($schema['description']) && $schema['description'] !== '') {
        $out['description'] = $schema['description'];
    }
    if (isset($schema['enum']) && is_array($schema['enum']) && count($schema['enum']) > 0) {
        $enumValues = [];
        foreach ($schema['enum'] as $item) {
            if (is_scalar($item)) {
                $val = (string) $item;
                if ($val !== '') {
                    $enumValues[] = $val;
                }
            }
        }
        if ($enumValues !== []) {
            $out['enum'] = $enumValues;
        }
    }
    if (isset($schema['nullable']) && is_bool($schema['nullable'])) {
        $out['nullable'] = $schema['nullable'];
    }

    $type = $out['type'] ?? '';

    if ($type === 'array') {
        $items = sanitizeGeminiSchema($schema['items'] ?? null);
        $out['items'] = $items ?? ['type' => 'string'];
    }

    if ($type === 'object' || isset($schema['properties'])) {
        $out['type'] = 'object';
        $cleanProps = [];
        if (isset($schema['properties']) && is_array($schema['properties'])) {
            foreach ($schema['properties'] as $propName => $propSchema) {
                if (!is_string($propName) || $propName === '') {
                    continue;
                }
                $sanitizedProp = sanitizeGeminiSchema($propSchema);
                if ($sanitizedProp !== null) {
                    $cleanProps[$propName] = $sanitizedProp;
                }
            }
        }
        if ($cleanProps !== []) {
            $out['properties'] = $cleanProps;
            if (isset($schema['required']) && is_array($schema['required'])) {
                $cleanRequired = [];
                foreach ($schema['required'] as $reqField) {
                    if (is_string($reqField) && isset($cleanProps[$reqField])) {
                        $cleanRequired[] = $reqField;
                    }
                }
                if ($cleanRequired !== []) {
                    $out['required'] = array_values(array_unique($cleanRequired));
                }
            }
        }
    }

    return $out !== [] ? $out : null;
}

function sanitizeOpenAiSchema(mixed $schema): array {
    if (!is_array($schema) || $schema === []) {
        return [
            'type' => 'object',
            'properties' => new stdClass(),
        ];
    }

    $clean = $schema;
    if (!isset($clean['type']) || !is_string($clean['type'])) {
        $clean['type'] = 'object';
    }

    if ($clean['type'] === 'object') {
        if (!isset($clean['properties']) || !is_array($clean['properties']) || $clean['properties'] === []) {
            $clean['properties'] = new stdClass();
        } else {
            foreach ($clean['properties'] as $k => $v) {
                if (is_array($v) && ($v['type'] ?? '') === 'object') {
                    $clean['properties'][$k] = sanitizeOpenAiSchema($v);
                }
            }
        }
    }

    return $clean;
}

function appendGeminiTurn(array &$contents, string $role, array $parts): void {
    if ($parts === []) {
        return;
    }
    $lastIndex = count($contents) - 1;
    if ($lastIndex >= 0 && $contents[$lastIndex]['role'] === $role) {
        foreach ($parts as $part) {
            $contents[$lastIndex]['parts'][] = $part;
        }
        return;
    }
    $contents[] = [
        'role' => $role,
        'parts' => $parts,
    ];
}

function parseToolResultForGemini(mixed $content): array|stdClass {
    if (is_array($content)) {
        if ($content === []) {
            return ['ok' => true];
        }
        return array_is_list($content) ? ['result' => $content] : $content;
    }
    if (is_string($content)) {
        $trimmed = trim($content);
        if ($trimmed === '') {
            return ['result' => ''];
        }
        $decoded = json_decode($trimmed, true);
        if (json_last_error() === JSON_ERROR_NONE) {
            if (is_array($decoded)) {
                if ($decoded === []) {
                    return ['ok' => true];
                }
                return array_is_list($decoded) ? ['result' => $decoded] : $decoded;
            }
            return ['result' => $decoded];
        }
        return ['result' => $content];
    }
    return ['result' => $content];
}

function buildGeminiPayload(string $systemPrompt, array $messages, array $tools): array {
    $contents = [];
    $toolCallIdToName = [];

    foreach ($messages as $msg) {
        if (!is_array($msg)) {
            continue;
        }
        $role = is_string($msg['role'] ?? null) ? strtolower(trim($msg['role'])) : '';

        if ($role === 'user') {
            $text = is_string($msg['content'] ?? null) ? $msg['content'] : '';
            $parts = $text !== '' ? [['text' => $text]] : [];
            foreach (sanitizeMessageImages($msg['images'] ?? null) as $img) {
                $parts[] = ['inlineData' => ['mimeType' => $img['mimeType'], 'data' => $img['data']]];
            }
            if ($parts) {
                appendGeminiTurn($contents, 'user', $parts);
            }
            continue;
        }

        if ($role === 'assistant' || $role === 'model') {
            $parts = [];
            $text = is_string($msg['content'] ?? null) ? $msg['content'] : '';
            if ($text !== '') {
                $parts[] = ['text' => $text];
            }

            $toolCalls = $msg['tool_calls'] ?? $msg['toolCalls'] ?? [];
            if (is_array($toolCalls)) {
                foreach ($toolCalls as $tc) {
                    if (!is_array($tc)) {
                        continue;
                    }
                    // Obsługa zarówno formatu zagnieżdżonego (OpenAI: function.{name,arguments}) jak i płaskiego ({name,args})
                    $fn = is_array($tc['function'] ?? null) ? $tc['function'] : $tc;
                    $name = is_string($fn['name'] ?? null) ? trim($fn['name']) : '';
                    if ($name === '') {
                        continue;
                    }
                    $tcId = is_string($tc['id'] ?? null) ? $tc['id'] : '';
                    if ($tcId !== '') {
                        $toolCallIdToName[$tcId] = $name;
                    }
                    $args = decodeToolArgs($fn['args'] ?? $fn['arguments'] ?? $tc['args'] ?? $tc['arguments'] ?? []);
                    $part = [
                        'functionCall' => [
                            'name' => $name,
                            'args' => $args,
                        ],
                    ];
                    if (isset($tc['thoughtSignature']) && is_string($tc['thoughtSignature']) && $tc['thoughtSignature'] !== '') {
                        $part['thoughtSignature'] = $tc['thoughtSignature'];
                    }
                    $parts[] = $part;
                }
            }

            appendGeminiTurn($contents, 'model', $parts);
            continue;
        }

        if ($role === 'tool') {
            $tcId = is_string($msg['tool_call_id'] ?? null)
                ? $msg['tool_call_id']
                : (is_string($msg['toolCallId'] ?? null) ? $msg['toolCallId'] : '');
            $name = is_string($msg['name'] ?? null) ? trim($msg['name']) : '';
            if ($name === '' && $tcId !== '' && isset($toolCallIdToName[$tcId])) {
                $name = $toolCallIdToName[$tcId];
            }
            if ($name === '') {
                $name = 'unknown_tool';
            }

            $responseObj = parseToolResultForGemini($msg['content'] ?? '');
            appendGeminiTurn($contents, 'user', [
                [
                    'functionResponse' => [
                        'name' => $name,
                        'response' => $responseObj,
                    ],
                ],
            ]);
        }
    }

    if ($contents === []) {
        reply(400, ['error' => 'Lista wiadomości nie zawiera żadnej poprawnej treści do wysłania.']);
    }

    $payload = [
        'contents' => $contents,
    ];

    if ($systemPrompt !== '') {
        $payload['systemInstruction'] = [
            'parts' => [
                ['text' => $systemPrompt],
            ],
        ];
    }

    if ($tools !== []) {
        $declarations = [];
        foreach ($tools as $tool) {
            if (!is_array($tool)) {
                continue;
            }
            // Obsługa zarówno formatu zagnieżdżonego (OpenAI: type=function, function={...}) jak i płaskiego ({name, description, parameters})
            $fn = is_array($tool['function'] ?? null) ? $tool['function'] : $tool;
            $name = is_string($fn['name'] ?? null) ? trim($fn['name']) : '';
            if ($name === '') {
                continue;
            }
            $decl = [
                'name' => $name,
                'description' => is_string($fn['description'] ?? null) ? $fn['description'] : '',
            ];
            $sanitizedParams = sanitizeGeminiSchema($fn['parameters'] ?? null);
            // Gemini odrzuca puste "properties" dla typu OBJECT — pomijamy pole parameters dla funkcji bez argumentów
            if ($sanitizedParams !== null && !empty($sanitizedParams['properties'])) {
                $decl['parameters'] = $sanitizedParams;
            }
            $declarations[] = $decl;
        }
        if ($declarations !== []) {
            $payload['tools'] = [
                ['functionDeclarations' => $declarations],
            ];
        }
    }

    return $payload;
}

function parseGeminiResponse(array $data): array {
    $candidates = $data['candidates'] ?? null;
    if (!is_array($candidates) || $candidates === []) {
        $blockReason = $data['promptFeedback']['blockReason'] ?? null;
        if (is_string($blockReason) && $blockReason !== '') {
            throw new RuntimeException('Model AI odrzucił zapytanie ze względów bezpieczeństwa (' . $blockReason . ').', 400);
        }
        throw new RuntimeException('Model AI zwrócił pustą odpowiedź. Spróbuj sformułować polecenie inaczej.', 502);
    }

    $candidate = is_array($candidates[0] ?? null) ? $candidates[0] : [];
    $parts = $candidate['content']['parts'] ?? [];
    if (!is_array($parts)) {
        $parts = [];
    }

    $textParts = [];
    $toolCalls = [];
    $callIndex = 0;

    foreach ($parts as $part) {
        if (!is_array($part)) {
            continue;
        }
        // Pomijamy wewnętrzne myśli modeli z reasoningiem (Gemini thinking)
        if (!empty($part['thought'])) {
            continue;
        }
        if (isset($part['text']) && is_string($part['text']) && $part['text'] !== '') {
            $textParts[] = $part['text'];
        }
        if (isset($part['functionCall']) && is_array($part['functionCall'])) {
            $fc = $part['functionCall'];
            $name = is_string($fc['name'] ?? null) ? trim($fc['name']) : '';
            if ($name === '') {
                continue;
            }
            $callIndex++;
            $tcId = is_string($fc['id'] ?? null) && $fc['id'] !== '' ? $fc['id'] : ('call_' . $callIndex);
            $call = [
                'id' => $tcId,
                'name' => $name,
                'args' => decodeToolArgs($fc['args'] ?? []),
            ];
            if (isset($part['thoughtSignature']) && is_string($part['thoughtSignature']) && $part['thoughtSignature'] !== '') {
                $call['thoughtSignature'] = $part['thoughtSignature'];
            }
            $toolCalls[] = $call;
        }
    }

    $text = trim(implode("\n", $textParts));
    if ($text === '' && $toolCalls === []) {
        $finishReason = is_string($candidate['finishReason'] ?? null) ? $candidate['finishReason'] : '';
        if ($finishReason === 'SAFETY' || $finishReason === 'RECITATION') {
            throw new RuntimeException('Model AI przerwał odpowiedź ze względów bezpieczeństwa (' . $finishReason . ').', 400);
        }
    }

    return [
        'text' => $text,
        'toolCalls' => $toolCalls,
    ];
}

function buildOpenAiPayload(string $systemPrompt, array $messages, array $tools, string $model): array {
    $openAiMessages = [];
    $callCounter = 0;

    if ($systemPrompt !== '') {
        $openAiMessages[] = [
            'role' => 'system',
            'content' => $systemPrompt,
        ];
    }

    foreach ($messages as $msg) {
        if (!is_array($msg)) {
            continue;
        }
        $role = is_string($msg['role'] ?? null) ? strtolower(trim($msg['role'])) : '';

        if ($role === 'user') {
            $userText = is_string($msg['content'] ?? null) ? $msg['content'] : '';
            $userImages = sanitizeMessageImages($msg['images'] ?? null);
            if ($userImages) {
                $content = [['type' => 'text', 'text' => $userText]];
                foreach ($userImages as $img) {
                    $content[] = ['type' => 'image_url', 'image_url' => ['url' => 'data:' . $img['mimeType'] . ';base64,' . $img['data']]];
                }
            } else {
                $content = $userText;
            }
            $openAiMessages[] = [
                'role' => 'user',
                'content' => $content,
            ];
            continue;
        }

        if ($role === 'assistant' || $role === 'model') {
            $text = is_string($msg['content'] ?? null) ? $msg['content'] : '';
            $rawToolCalls = $msg['tool_calls'] ?? $msg['toolCalls'] ?? [];
            $mappedCalls = [];

            if (is_array($rawToolCalls)) {
                foreach ($rawToolCalls as $tc) {
                    if (!is_array($tc)) {
                        continue;
                    }
                    $fn = is_array($tc['function'] ?? null) ? $tc['function'] : $tc;
                    $name = is_string($fn['name'] ?? null) ? trim($fn['name']) : '';
                    if ($name === '') {
                        continue;
                    }
                    $callCounter++;
                    $tcId = is_string($tc['id'] ?? null) && $tc['id'] !== '' ? $tc['id'] : ('call_' . $callCounter);
                    $rawArgs = $fn['args'] ?? $fn['arguments'] ?? $tc['args'] ?? $tc['arguments'] ?? [];
                    if (is_string($rawArgs)) {
                        $argsJson = trim($rawArgs) !== '' ? $rawArgs : '{}';
                    } else {
                        $encoded = json_encode(toJsonObject($rawArgs), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                        $argsJson = $encoded !== false ? $encoded : '{}';
                    }
                    $mappedCalls[] = [
                        'id' => $tcId,
                        'type' => 'function',
                        'function' => [
                            'name' => $name,
                            'arguments' => $argsJson,
                        ],
                    ];
                }
            }

            if ($mappedCalls !== []) {
                $openAiMessages[] = [
                    'role' => 'assistant',
                    'content' => $text !== '' ? $text : null,
                    'tool_calls' => $mappedCalls,
                ];
            } else {
                $openAiMessages[] = [
                    'role' => 'assistant',
                    'content' => $text,
                ];
            }
            continue;
        }

        if ($role === 'tool') {
            $tcId = is_string($msg['tool_call_id'] ?? null)
                ? $msg['tool_call_id']
                : (is_string($msg['toolCallId'] ?? null) ? $msg['toolCallId'] : '');
            $content = $msg['content'] ?? '';
            if (!is_string($content)) {
                $encoded = json_encode($content, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                $content = $encoded !== false ? $encoded : '';
            }
            $openAiMessages[] = [
                'role' => 'tool',
                'tool_call_id' => $tcId,
                'content' => $content,
            ];
        }
    }

    if ($openAiMessages === []) {
        reply(400, ['error' => 'Lista wiadomości nie zawiera żadnej poprawnej treści do wysłania.']);
    }

    $payload = [
        'model' => $model,
        'messages' => $openAiMessages,
    ];

    if ($tools !== []) {
        $mappedTools = [];
        foreach ($tools as $tool) {
            if (!is_array($tool)) {
                continue;
            }
            $fn = is_array($tool['function'] ?? null) ? $tool['function'] : $tool;
            $name = is_string($fn['name'] ?? null) ? trim($fn['name']) : '';
            if ($name === '') {
                continue;
            }
            $mappedTools[] = [
                'type' => 'function',
                'function' => [
                    'name' => $name,
                    'description' => is_string($fn['description'] ?? null) ? $fn['description'] : '',
                    'parameters' => sanitizeOpenAiSchema($fn['parameters'] ?? null),
                ],
            ];
        }
        if ($mappedTools !== []) {
            $payload['tools'] = $mappedTools;
            $payload['tool_choice'] = 'auto';
        }
    }

    return $payload;
}

function parseOpenAiResponse(array $data): array {
    $choice = $data['choices'][0] ?? null;
    if (!is_array($choice) || !is_array($choice['message'] ?? null)) {
        throw new RuntimeException('Model OpenAI zwrócił pustą odpowiedź.', 502);
    }

    $message = $choice['message'];
    $text = is_string($message['content'] ?? null) ? trim($message['content']) : '';
    $toolCalls = [];
    $callIndex = 0;

    if (isset($message['tool_calls']) && is_array($message['tool_calls'])) {
        foreach ($message['tool_calls'] as $tc) {
            if (!is_array($tc)) {
                continue;
            }
            $fn = $tc['function'] ?? null;
            if (!is_array($fn)) {
                continue;
            }
            $name = is_string($fn['name'] ?? null) ? trim($fn['name']) : '';
            if ($name === '') {
                continue;
            }
            $callIndex++;
            $tcId = is_string($tc['id'] ?? null) && $tc['id'] !== '' ? $tc['id'] : ('call_' . $callIndex);
            $toolCalls[] = [
                'id' => $tcId,
                'name' => $name,
                'args' => decodeToolArgs($fn['arguments'] ?? '{}'),
            ];
        }
    }

    return [
        'text' => $text,
        'toolCalls' => $toolCalls,
    ];
}

function extractUpstreamErrorMessage(string $rawBody, string $apiKey): string {
    $decoded = json_decode($rawBody, true);
    if (!is_array($decoded)) {
        return '';
    }
    $msg = '';
    if (isset($decoded['error']['message']) && is_string($decoded['error']['message'])) {
        $msg = $decoded['error']['message'];
    } elseif (isset($decoded['message']) && is_string($decoded['message'])) {
        $msg = $decoded['message'];
    }
    $msg = trim(scrubSecret($msg, $apiKey));
    if (function_exists('mb_strimwidth')) {
        $msg = mb_strimwidth($msg, 0, 220, '...', 'UTF-8');
    } elseif (strlen($msg) > 220) {
        $msg = substr($msg, 0, 217) . '...';
    }
    return $msg;
}

/**
 * Wykonuje surowe żądanie cURL do API AI i zwraca wynik bez natychmiastowego exit (umożliwia fallback modelu).
 */
function executeUpstreamRequest(string $url, array $headers, array $payload, string $apiKey): array {
    $jsonBody = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($jsonBody === false) {
        return [
            'ok' => false,
            'httpCode' => 500,
            'replyStatus' => 500,
            'error' => 'Nie udało się przygotować zapytania JSON do usługi AI.',
            'retryableFallback' => false,
        ];
    }

    $ch = curl_init($url);
    if ($ch === false) {
        return [
            'ok' => false,
            'httpCode' => 503,
            'replyStatus' => 503,
            'error' => 'Nie udało się zainicjować połączenia cURL na serwerze.',
            'retryableFallback' => false,
        ];
    }

    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $jsonBody,
        CURLOPT_HTTPHEADER => array_merge(['Content-Type: application/json'], $headers),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => AI_CURL_CONNECT_TIMEOUT,
        CURLOPT_TIMEOUT => AI_CURL_TIMEOUT,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_USERAGENT => 'CMS-Studio-AI-Proxy/2.0',
    ]);

    $responseBody = curl_exec($ch);
    $curlErrno = curl_errno($ch);
    $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($responseBody === false || $curlErrno !== 0) {
        $isTimeout = $curlErrno === 28
            || (defined('CURLE_OPERATION_TIMEDOUT') && $curlErrno === CURLE_OPERATION_TIMEDOUT)
            || (defined('CURLE_OPERATION_TIMEOUTED') && $curlErrno === CURLE_OPERATION_TIMEOUTED);
        if ($isTimeout) {
            return [
                'ok' => false,
                'httpCode' => 504,
                'replyStatus' => 504,
                'error' => 'Przekroczono czas oczekiwania na odpowiedź modelu AI (45 s). Spróbuj ponownie.',
                'retryableFallback' => false,
            ];
        }
        return [
            'ok' => false,
            'httpCode' => 502,
            'replyStatus' => 502,
            'error' => 'Nie udało się połączyć z zewnętrznym API AI. Sprawdź łączność wychodzącą hostingu lub spróbuj za chwilę.',
            'retryableFallback' => false,
        ];
    }

    $upstreamDetail = extractUpstreamErrorMessage((string) $responseBody, $apiKey);

    if ($httpCode < 200 || $httpCode >= 300) {
        if ($httpCode === 401) {
            return [
                'ok' => false,
                'httpCode' => 401,
                'replyStatus' => 401,
                'error' => 'Klucz API AI skonfigurowany na serwerze jest nieprawidłowy lub wygasł.',
                'retryableFallback' => false,
            ];
        }
        if ($httpCode === 403) {
            return [
                'ok' => false,
                'httpCode' => 403,
                'replyStatus' => 403,
                'error' => 'Dostawca AI odrzucił dostęp (403). Sprawdź uprawnienia klucza API i dostępność wybranego modelu.',
                'retryableFallback' => false,
            ];
        }
        if ($httpCode === 404) {
            return [
                'ok' => false,
                'httpCode' => 404,
                'replyStatus' => 404,
                'error' => 'Wybrany model AI nie został znaleziony u dostawcy. Sprawdź pole "model" w konfiguracji serwera.',
                'retryableFallback' => true,
            ];
        }
        if ($httpCode === 429) {
            return [
                'ok' => false,
                'httpCode' => 429,
                'replyStatus' => 429,
                'error' => 'Przekroczono limit zapytań lub środków po stronie dostawcy AI (429). Odczekaj chwilę i spróbuj ponownie.',
                'retryableFallback' => false,
            ];
        }
        if ($httpCode === 400) {
            $msg = 'API AI odrzuciło treść zapytania (400).';
            if ($upstreamDetail !== '') {
                $msg .= ' Szczegóły: ' . $upstreamDetail;
            }
            return [
                'ok' => false,
                'httpCode' => 400,
                'replyStatus' => 400,
                'error' => $msg,
                'retryableFallback' => false,
            ];
        }
        if ($httpCode === 503) {
            return [
                'ok' => false,
                'httpCode' => 503,
                'replyStatus' => 502,
                'error' => 'Model AI jest chwilowo przeciążony po stronie dostawcy (HTTP 503). Spróbuj ponownie za chwilę.',
                'retryableFallback' => true,
            ];
        }
        if ($httpCode >= 500) {
            return [
                'ok' => false,
                'httpCode' => $httpCode,
                'replyStatus' => 502,
                'error' => 'Usługa AI jest chwilowo przeciążona lub niedostępna po stronie dostawcy (HTTP ' . $httpCode . '). Spróbuj ponownie za chwilę.',
                'retryableFallback' => false,
            ];
        }
        return [
            'ok' => false,
            'httpCode' => $httpCode,
            'replyStatus' => 502,
            'error' => 'Nieoczekiwany błąd dostawcy AI (HTTP ' . $httpCode . ').',
            'retryableFallback' => false,
        ];
    }

    try {
        $decoded = json_decode((string) $responseBody, true, 128, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        return [
            'ok' => false,
            'httpCode' => 502,
            'replyStatus' => 502,
            'error' => 'API AI zwróciło nieprawidłową odpowiedź JSON.',
            'retryableFallback' => false,
        ];
    }

    if (!is_array($decoded)) {
        return [
            'ok' => false,
            'httpCode' => 502,
            'replyStatus' => 502,
            'error' => 'API AI zwróciło nieoczekiwany format danych.',
            'retryableFallback' => false,
        ];
    }

    return [
        'ok' => true,
        'httpCode' => $httpCode,
        'data' => $decoded,
    ];
}

// --- Główny przepływ żądania ---

$originAllowed = handleCorsHeaders('GET, POST, OPTIONS');
$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

if ($method === 'OPTIONS') {
    header('Allow: GET, POST, OPTIONS');
    http_response_code(204);
    exit;
}

$paths = resolveSitePaths();
$privateDir = $paths['privateDir'];
$editorConfig = loadEditorConfig($privateDir);
$aiConfig = extractAiConfig($editorConfig);

if ($method === 'GET') {
    initCmsSession();
    $authenticated = isSessionAuthenticated();
    reply(200, [
        'configured' => (bool) $aiConfig['configured'],
        'authenticated' => $authenticated,
        'provider' => $aiConfig['configured'] ? $aiConfig['provider'] : null,
        'model' => $aiConfig['configured'] ? $aiConfig['model'] : null,
    ]);
}

if ($method !== 'POST') {
    header('Allow: GET, POST, OPTIONS');
    reply(405, ['error' => 'Niedozwolona metoda HTTP. Oczekiwano GET lub POST.']);
}

if (!$originAllowed) {
    reply(403, ['error' => 'Żądanie z niedozwolonego źródła (Origin).']);
}

// KRYTYCZNE: POST wymaga autoryzacji edytora (sesja + CSRF albo Basic Auth)!
requireAuthenticated($editorConfig, true, $privateDir);

if (!$aiConfig['configured']) {
    reply(503, [
        'error' => $aiConfig['reason'] ?? 'Asystent AI nie jest skonfigurowany na serwerze.',
    ]);
}

if (!function_exists('curl_init')) {
    reply(503, ['error' => 'Rozszerzenie PHP cURL nie jest dostępne na tym serwerze.']);
}

// Rate limit per IP
checkAiRateLimit($privateDir);

// Kontrola rozmiaru żądania (max 512 KB)
$contentLength = isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : 0;
if ($contentLength > AI_MAX_REQUEST_BYTES) {
    reply(413, ['error' => 'Żądanie przekracza maksymalny limit rozmiaru (512 KB).']);
}

$rawBody = file_get_contents('php://input', false, null, 0, AI_MAX_REQUEST_BYTES + 1);
if ($rawBody === false) {
    reply(400, ['error' => 'Nie udało się odczytać treści żądania.']);
}
if (strlen($rawBody) > AI_MAX_REQUEST_BYTES) {
    reply(413, ['error' => 'Żądanie przekracza maksymalny limit rozmiaru (512 KB).']);
}

try {
    $request = json_decode($rawBody, true, 64, JSON_THROW_ON_ERROR);
} catch (JsonException) {
    reply(400, ['error' => 'Nieprawidłowy format JSON żądania.']);
}

if (!is_array($request)) {
    reply(400, ['error' => 'Oczekiwano obiektu JSON z polami systemPrompt, messages i tools.']);
}

$systemPrompt = is_string($request['systemPrompt'] ?? null) ? trim($request['systemPrompt']) : '';
$messages = $request['messages'] ?? null;
$tools = $request['tools'] ?? [];

if (!is_array($messages) || !array_is_list($messages) || count($messages) === 0) {
    reply(400, ['error' => 'Pole "messages" musi być niepustą listą wiadomości.']);
}
if (count($messages) > AI_MAX_MESSAGES) {
    reply(400, ['error' => 'Przekroczono maksymalną liczbę wiadomości w jednym zapytaniu (' . AI_MAX_MESSAGES . ').']);
}
if (!is_array($tools) || !array_is_list($tools)) {
    reply(400, ['error' => 'Pole "tools" musi być listą definicji narzędzi.']);
}
if (count($tools) > AI_MAX_TOOLS) {
    reply(400, ['error' => 'Przekroczono maksymalną liczbę narzędzi w jednym zapytaniu (' . AI_MAX_TOOLS . ').']);
}

$provider = (string) $aiConfig['provider'];
$apiKey = (string) $aiConfig['apiKey'];
$model = (string) $aiConfig['model'];

try {
    if ($provider === 'gemini') {
        $payload = buildGeminiPayload($systemPrompt, $messages, $tools);

        // Lista modeli z automatycznym fallbackiem przy 503/404: najpierw skonfigurowany, potem zapasowe
        $candidateModels = array_values(array_unique(array_merge([$model], AI_GEMINI_FALLBACK_MODELS)));
        $usedModel = $model;
        $lastFailure = null;
        $upstreamData = null;

        foreach ($candidateModels as $index => $candidateModel) {
            $url = 'https://generativelanguage.googleapis.com/v1beta/models/'
                . rawurlencode($candidateModel)
                . ':generateContent?key='
                . rawurlencode($apiKey);

            // Hydrogen zawsze z myśleniem HIGH; modele zapasowe (Flash) bez dodatkowej konfiguracji
            $body = $payload;
            if (stripos($candidateModel, 'hydrogen') !== false) {
                $body['generationConfig'] = ['thinkingConfig' => ['thinkingLevel' => 'HIGH']];
            }
            $res = executeUpstreamRequest($url, [], $body, $apiKey);
            if (!empty($res['ok'])) {
                $usedModel = $candidateModel;
                $upstreamData = $res['data'];
                break;
            }

            $lastFailure = $res;
            $hasNext = ($index + 1) < count($candidateModels);
            if ($hasNext && !empty($res['retryableFallback'])) {
                continue;
            }
            break;
        }

        if ($upstreamData === null) {
            $status = (int) ($lastFailure['replyStatus'] ?? 502);
            $errMsg = (string) ($lastFailure['error'] ?? 'Nie udało się uzyskać odpowiedzi od modelu Gemini.');
            reply($status, ['error' => $errMsg]);
        }

        $parsed = parseGeminiResponse($upstreamData);
        $model = $usedModel;
    } elseif ($provider === 'openai') {
        $url = 'https://api.openai.com/v1/chat/completions';
        $payload = buildOpenAiPayload($systemPrompt, $messages, $tools, $model);
        $res = executeUpstreamRequest($url, ['Authorization: Bearer ' . $apiKey], $payload, $apiKey);
        if (empty($res['ok'])) {
            reply((int) ($res['replyStatus'] ?? 502), ['error' => (string) ($res['error'] ?? 'Błąd komunikacji z OpenAI.')]);
        }
        $parsed = parseOpenAiResponse($res['data']);
    } else {
        reply(503, ['error' => 'Nieobsługiwany dostawca AI w konfiguracji serwera.']);
    }

    reply(200, [
        'provider' => $provider,
        'model' => $model,
        'text' => $parsed['text'],
        'toolCalls' => $parsed['toolCalls'],
    ]);
} catch (RuntimeException $e) {
    $code = $e->getCode();
    $httpStatus = ($code >= 400 && $code < 600) ? $code : 502;
    reply($httpStatus, ['error' => scrubSecret($e->getMessage(), $apiKey)]);
} catch (Throwable) {
    reply(500, ['error' => 'Wewnętrzny błąd serwera podczas przetwarzania odpowiedzi AI.']);
}
