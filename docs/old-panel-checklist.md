# Lista kontrolna funkcji starego panelu

Źródło: `~/OpenBot/Shared/wolbud/rekonesans/old-panel-features.md` (Tester, Z-001, `e5651c3`).
Stary panel (`panel/editor.js`, `canvas.js`, `templates.js` i reszta) usuwamy dopiero, gdy każdy wiersz ma status „pokryte” (z testem E2E) albo „odrzucone” (z uzasadnieniem).
Status: `do zrobienia` / `pokryte (<test>)` / `odrzucone (<D-nr>)`.

| # | Funkcja starego panelu | Gdzie dziś | Nowy moduł (plan) | Status |
|---|---|---|---|---|
| 1 | Tryby pracy `github` / `hosting` | config.js | publish/ | do zrobienia |
| 2 | Profil white-label (marka, chronione strony, punkt bazowy, kontekst AI, sugestie) | site-profile.js | zachowany plik + ai/ | do zrobienia |
| 3 | Sanityzacja URL, tekstu, atrybutów i fragmentów HTML | sanitizer.js:12–670 | core/sanitize | do zrobienia |
| 4 | Twarda walidacja serializowanego HTML przed publikacją | sanitizer.js:672–860 | core/validate | do zrobienia |
| 5 | Walidacja ścieżek (traversal, blokada `panel/`, `.github/`) | sanitizer.js:862–975 | core/paths | do zrobienia |
| 6 | Limity operacji AI na turę (usuwanie, zmiany globalne) | sanitizer.js:977–1121 (martwy kod) | ai/ strażnik zakresu + CONFIRM | do zrobienia |
| 7 | Adres bazowy i URL kanoniczny | seo.js:1–60 | core/seo | do zrobienia |
| 8 | Generator i walidator `sitemap.xml` (bez przekierowań) | seo.js:94–168 | core/seo | do zrobienia |
| 9 | Generator i walidator `robots.txt` | seo.js:170–218 | core/seo | do zrobienia |
| 10 | Szkice stron w IndexedDB z zapasowym localStorage | storage.js:1–370 | storage/ | do zrobienia |
| 11 | Oczekujące zdjęcia przed publikacją | storage.js:372–505 | storage/, ui/media | do zrobienia |
| 12 | Szkic danych globalnych | storage.js:507–605 | storage/ | do zrobienia |
| 13 | Przechowywanie tokenu GitHub i klucza AI | storage.js:607–725 | storage/ (L-005: klucz AI tylko na serwerze w trybie hosting) | do zrobienia |
| 14 | Śledzenie rewizji publikacji, czyszczenie szkiców | storage.js:727–825 | publish/ | do zrobienia |
| 15 | Eksport i import kopii szkiców (JSON) | storage.js:827–995 | storage/ | do zrobienia |
| 16 | Nazwy plików i kompresja zdjęć do WebP | storage.js:997–1217 | ui/media (SVG odrzucone, D-005) | do zrobienia |
| 17 | Pobieranie manifestu i danych globalnych | publish.js:1–145 | core/model | do zrobienia |
| 18 | Logowanie na hostingu z CSRF i limitem 429 | publish.js:147–340 | publish/, PHP | do zrobienia |
| 19 | Atomowa publikacja (GitHub Git Data API, `force:false`; PHP) | publish.js:342–830 | publish/ (L-002, L-008) | do zrobienia |
| 20 | Kopie zapasowe i przywracanie oryginału | publish.js:832–1120 | publish/ (L-009: tylko pliki treści) | do zrobienia |
| 21 | Oczekiwanie na rozpropagowanie publikacji | publish.js:1122–1226 | publish/ | do zrobienia |
| 22 | Ścieżki względne i slugi (polskie znaki) | templates.js:1–115 | core/paths | do zrobienia |
| 23 | 12 szablonów sekcji | templates.js:117–770 | core/catalog (z katalogu komponentów) | do zrobienia |
| 24 | 20 szablonów elementów powtarzalnych | templates.js:772–1095 | core/catalog | do zrobienia |
| 25 | 5 szablonów podstron + duplikacja strony | templates.js:1097–1527 | core/recipes | do zrobienia |
| 26 | Podgląd w iframe i podpięcie edytora | canvas.js:1–620 | ui/canvas (L-004: sandbox) | do zrobienia |
| 27 | Edycja tekstu w miejscu i zaznaczanie | canvas.js:622–1450 | ui/canvas, ui/text | do zrobienia |
| 28 | Tryb „Klocki”: swobodne położenie, rozmiar, warstwy w pikselach | canvas.js:1452–2280 | — | odrzucone (D-007) |
| 29 | Tryb „Przeglądaj” | canvas.js:2282–2410 | ui/canvas | do zrobienia |
| 30 | Paski akcji sekcji i elementów (góra/dół, duplikuj, usuń, przeciąganie) | canvas.js:2412–3080 | ui/canvas + core/recipes | do zrobienia |
| 31 | 20 typów list powtarzalnych | canvas.js:3082–3620 | core/catalog | do zrobienia |
| 32 | Kliknięcie w telefon/stopkę/logo otwiera dane globalne | canvas.js:3622–3835 | ui/globals | do zrobienia |
| 33 | Wybór fragmentu dla AI (kliknięcie, ramka) | canvas.js:3837–4165 | ui/ai | do zrobienia |
| 34 | Odczyt stylów przycisków i sekcji ze strony | canvas.js:4167–4360 | core/catalog | do zrobienia |
| 35 | Czysta serializacja HTML, cofnij i ponów | canvas.js:4362–4755 | core/model, ui/history | do zrobienia |
| 36 | Tryb prosty i tryb administratora | editor.js:1–620 | ui/shell | do zrobienia |
| 37 | Przełącznik i lista stron (bez przekierowań) | editor.js:622–1280 | ui/pages | do zrobienia |
| 38 | Drzewo struktury i „Dodaj blok” | editor.js:1282–1820 | ui/sections | do zrobienia |
| 39 | Podgląd komputer / tablet / telefon | editor.js:1822–1945 | ui/canvas | do zrobienia |
| 40 | Inspektor elementu (tekst, link, obraz, styl przycisku, odstępy) | editor.js:1947–2920 | ui/inspector | do zrobienia |
| 41 | Edytor SEO strony z podglądem Google | editor.js:2922–3210 | ui/seo | do zrobienia |
| 42 | Menu, stopka i dane firmy, zmiana zbiorcza | editor.js:3212–3890 | ui/globals + silnik synchronizacji | do zrobienia |
| 43 | Biblioteka zdjęć (przegląd, szukanie, wgrywanie, podmiana) | editor.js:3892–4360 | ui/media | do zrobienia |
| 44 | Kreator nowej podstrony i usuwanie | editor.js:4362–4675 | ui/pages + core/recipes | do zrobienia |
| 45 | Ustawienia AI (dostawca, model, klucz, proxy) | editor.js:4677–4895 (błąd `[object Object]`) | ui/ai | do zrobienia |
| 46 | Okno kopii zapasowych i okno pomocy z raportem diagnostycznym | editor.js:4897–5310 | ui/backups, ui/support | do zrobienia |
| 47 | Okno publikacji z podsumowaniem, regeneracja sitemap i manifestu | editor.js:5312–5624 | ui/publish | do zrobienia |
| 48 | 37 operacji wysokiego poziomu dla AI (martwy kod) | editor.js:5625–7305 | core/recipes | do zrobienia |
| 49 | Surowe narzędzia AI `list_files`, `read_file`, `write_file` | ai-agent.js:26–55, editor.js:7274 | — | odrzucone (D-008, L-001) |
| 50 | Szuflada AI (czat, sugestie, przypinanie fragmentu, potwierdzenie, historia, cofnięcie tury) | editor.js:7307–8180 | ui/ai | do zrobienia |
| 51 | Skróty klawiszowe i ostrzeżenie przed wyjściem | editor.js:8182–8453 | ui/shell | do zrobienia |
| 52 | Ciche przełączanie modelu przy 404/429/503 | ai-agent.js:153–193 | — | odrzucone (zasada „bez cichej zmiany modelu”) |
