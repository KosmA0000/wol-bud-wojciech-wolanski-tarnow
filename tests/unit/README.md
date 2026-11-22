# tests/unit/ — testy jednostkowe Budowniczego (`npm test`, node:test, bez zależności)

- ai-proxy-limits.test.js — L-021: nagłówki limitu, kolejność limitu i braku klucza, liczniki, validate bez panelu
- ai-proxy.test.js — proxy AI: brak klucza, maskowanie, jawny model, brak fallbacku, limit
- api.test.js — api.php, backups.php, auth.php i /__dev/reset przez serwer na losowym porcie
- cli.test.js — validate, check:size i argumenty serwera
- content.test.js — skaner HTML, kontrola treści, formaty Gemini i OpenAI
- helpers.js — mini-strona tymczasowa i serwer testowy
- path-rules.test.js — wielkość liter (L-019), nazwy zarezerwowane Windows (L-020), typy plików (D-010)
- safe-path.test.js — ochrona ścieżek zapisu i odczytu
- sandbox.test.js — kopia, reset i izolacja piaskownic
