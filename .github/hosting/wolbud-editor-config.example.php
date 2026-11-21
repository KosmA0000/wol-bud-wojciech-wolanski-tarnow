<?php
declare(strict_types=1);

/**
 * Prywatny plik konfiguracyjny CMS Studio dla hostingu PHP 8.1+ (cyber_Folks / LH / Home / dHosting).
 *
 * GDZIE UMIEŚCIĆ:
 *   Skopiuj ten plik POZA katalog publiczny witryny (dokładnie jeden poziom wyżej niż public_html/),
 *   pod nazwą:
 *     cms-editor-config.php   (zalecana nazwa uniwersalna)
 *   lub:
 *     wolbud-editor-config.php (obsługiwana automatycznie jako fallback)
 *
 *   Przykład na cyber_Folks (DirectAdmin):
 *     /home/<twoje-konto>/domains/<twoja-domena.pl>/cms-editor-config.php
 *     (obok katalogu /home/<twoje-konto>/domains/<twoja-domena.pl>/public_html/)
 *
 * UPRAWNIENIA PLIKU:
 *   Ustaw CHMOD 0600 (czytelny wyłącznie dla właściciela / procesu PHP).
 *
 * KORZYSTAJĄ Z NIEGO WSZYSTKIE ENDPOINTY W panel/:
 *  - panel/auth.php      (logowanie sesyjne + CSRF + blokada brute-force)
 *  - panel/api.php       (publikacja zmian + skaner HTML/XSS + auto-backup)
 *  - panel/backups.php   (nieusuwalna kopia fabryczna "original" i historia wersji)
 *  - panel/ai-proxy.php  (autoryzowane proxy Asystenta AI — klucz API nie trafia nigdy do przeglądarki)
 */

return [
    // Hash hasła edytora wygenerowany poleceniem PHP (NIE wpisuj hasła otwartym tekstem!):
    // php -r 'echo password_hash("TWOJE_SILNE_HASLO", PASSWORD_DEFAULT) . PHP_EOL;'
    'passwordHash' => 'WKLEJ_HASH_HASLA_EDYTORA',

    // Konfiguracja Asystenta AI (opcjonalna — jeśli nie używasz AI, usuń całą tablicę 'ai').
    'ai' => [
        // Dostawca modelu: 'gemini' (Google AI Studio) albo 'openai' (OpenAI API)
        'provider' => 'gemini',

        // Tajny klucz API dostawcy (np. AIza... dla Gemini lub sk-... dla OpenAI)
        'apiKey' => 'WKLEJ_KLUCZ_API_AI',

        // Domyślny model Gemini z automatycznym fallbackiem przy 503/404:
        // gemini-3-flash-preview -> gemini-3.8-flash -> gemini-3.1-flash-lite
        // Dla OpenAI zalecany model: 'gpt-4.1-mini'
        'model' => 'gemini-3-flash-preview',
    ],
];
