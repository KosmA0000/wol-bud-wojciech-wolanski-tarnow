# dev/ — serwer dev WOL-BUD Studio (tryb lokalny)

`npm run dev -- --port <port>` (domyślnie 4180) serwuje stronę z piaskownicy i panel ze źródła na `http://127.0.0.1:<port>/`.
Zapisy idą tylko do `.sandbox/<port>/site/` (poza gitem). Sterowanie i reset: `http://127.0.0.1:<port>/__dev/`.

Flagi: `--reset` (odtwórz piaskownicę portu i zakończ), `--keep` (wznów istniejącą piaskownicę zamiast świeżej kopii),
`--env-file <plik>` albo zmienna `WOLBUD_ENV_FILE` (domyślnie `~/OpenBot/Shared/wolbud/.env.local`), `--root`, `--sandbox-dir`, `--quiet`.
Zmienne w `.env.local`: `GEMINI_API_KEY`, `OPENAI_API_KEY`, `WOLBUD_AI_PROVIDER`, `WOLBUD_AI_MODEL`. Wartości nigdy nie są wypisywane.

Endpointy: `/panel/api.php`, `/panel/backups.php`, `/panel/auth.php`, `/panel/ai-proxy.php` (format jak PHP z `.github/hosting/`),
`GET /__dev/status`, `POST /__dev/reset` (nagłówek `X-CMS-CSRF-Token` z `GET /panel/auth.php?status=1`).

`npm run validate -- --root <katalog>`: na razie szkielet CLI (kod 0/1, raport JSON), bez reguł — reguły przyjdą z kontraktu walidatora w fazie 1.

## Pliki
- api-ai-proxy.js — emulacja ai-proxy.php: klucz po stronie serwera, jawny model, licznik wywołań, limit na minutę
- api-auth.js — emulacja auth.php: lokalna sesja bez hasła, token CSRF
- api-backups.js — emulacja backups.php: lista, kopia ręczna, przywracanie
- api-publish.js — emulacja api.php: publikacja paczki plików do piaskownicy
- ai-config.js — wybór dostawcy, modelu i klucza AI (bez listy zapasowej)
- ai-gemini.js — tłumaczenie żądań i odpowiedzi Gemini
- ai-openai.js — tłumaczenie żądań i odpowiedzi OpenAI
- ai-schema.js — argumenty narzędzi i czyszczenie schematów JSON
- ai-upstream.js — wywołanie dostawcy AI z limitem czasu i mapowaniem błędów
- args.js — argumenty wiersza poleceń serwera
- backup-restore.js — przywracanie kopii zapasowej
- backup-store.js — tworzenie i lista kopii zapasowych (original, auto-*, manual-*)
- check-size.js — npm run check:size: limity linii i README w katalogach nowego kodu
- content-checks.js — kontrola treści zapisywanych plików według rozszerzenia
- dev-page.js — strona sterowania /__dev/ z przyciskiem resetu
- env-file.js — odczyt .env.local i zmiennych środowiskowych
- fs-write.js — atomowy zapis i bezpieczne usuwanie w piaskownicy
- html-entities.js — dekoder encji HTML (encje ASCII z HTML5, kody liczbowe z bezpiecznym zakresem) dla skanera
- html-scan.js — skaner bezpieczeństwa HTML (port z _common.php)
- http-util.js — odpowiedzi JSON, błędy HTTP, odczyt treści z limitem
- log.js — logger JSON z maskowaniem kluczy
- publish-prepare.js — walidacja i dekodowanie paczki publikacji
- rate-limit.js — limit zapytań w oknie przesuwnym
- router.js — kontrola Host/Origin i rozdział żądań
- safe-path.js — ochrona ścieżek zapisu, biała lista rozszerzeń
- sandbox.js — tworzenie, reset i izolacja piaskownic per port
- server.js — punkt wejścia npm run dev
- static.js — serwowanie plików strony i panelu, znacznik trybu lokalnego
- validate.js — szkielet CLI walidatora
