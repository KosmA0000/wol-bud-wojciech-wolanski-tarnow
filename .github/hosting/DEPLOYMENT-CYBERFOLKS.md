# Wdrożenie CMS Studio na hostingu cyber_Folks (5 minut)

Instrukcja krok po kroku dla hostingu współdzielonego **cyber_Folks** (LiteSpeed + DirectAdmin) — działa identycznie również na **LH.pl, Home.pl i dHosting**.

> **Wymagania na hostingu:** PHP **8.1+** (zalecane 8.2 lub 8.3) z włączonym rozszerzeniem `curl` (standardowo aktywne w cyber_Folks) oraz certyfikat SSL (HTTPS).

---

## Docelowa struktura katalogów na serwerze

Na cyber_Folks każda domena ma własny katalog w DirectAdmin. Plik z hasłem, logi oraz nieusuwalne kopie zapasowe leżą **poziom wyżej niż `public_html/`** — dzięki temu są w **100% niedostępne z internetu**!

```text
/home/<konto>/domains/<twoja-domena.pl>/
├── cms-editor-config.php          <-- PRYWATNA konfiguracja (CHMOD 0600, poza internetem!)
├── cms-backups/                   <-- Tworzone automatycznie: nieusuwalny backup "original" + historia wersji
├── cms-audit.log                  <-- Tworzone automatycznie: log zdarzeń bezpieczeństwa (JSONL)
├── cms-auth-ratelimit.json        <-- Tworzone automatycznie: ochrona przed brute-force
└── public_html/                   <-- Katalog publiczny witryny
    ├── index.html
    ├── assets/
    ├── img/
    │   └── uploads/
    │       └── .htaccess          <-- Skopiowane z .github/hosting/uploads.htaccess (blokada PHP!)
    └── panel/
        ├── .htaccess              <-- Skopiowane z .github/hosting/panel.htaccess
        ├── _common.php            <-- Skopiowane z .github/hosting/_common.php
        ├── auth.php               <-- Skopiowane z .github/hosting/auth.php
        ├── api.php                <-- Skopiowane z .github/hosting/api.php
        ├── ai-proxy.php           <-- Skopiowane z .github/hosting/ai-proxy.php
        ├── backups.php            <-- Skopiowane z .github/hosting/backups.php
        ├── config.js              <-- Ustawione mode: 'hosting' i requireLogin: true
        └── index.html, editor.js, ...
```

---

## Krok 1: Wgraj witrynę i pliki PHP (2 min)

1. Połącz się z kontem cyber_Folks przez **FTP/SFTP** (FileZilla / WinSCP) albo **Menedżer plików** w DirectAdmin.
2. Wgraj całą zawartość repozytorium (wszystkie foldery witryny, `assets/`, `img/`, `panel/`, `index.html`) do katalogu `public_html/`.
   - **Nie wgrywaj** na serwer folderów `.git/` ani `.github/`.
3. Skopiuj z repozytorium `.github/hosting/` następujące pliki do **`public_html/panel/`**:
   - `_common.php`
   - `auth.php`
   - `api.php`
   - `ai-proxy.php`
   - `backups.php`
   - `panel.htaccess` → zmień nazwę po wgraniu na **`.htaccess`** (w katalogu `public_html/panel/.htaccess`)
4. Utwórz katalog `public_html/img/uploads/` (jeśli jeszcze nie istnieje) i wgraj tam plik `.github/hosting/uploads.htaccess`, zmieniając jego nazwę na **`.htaccess`** (`public_html/img/uploads/.htaccess`).

---

## Krok 2: Wygeneruj hash hasła edytora (30 s)

Nigdy nie wpisuj hasła otwartym tekstem. Wygeneruj bezpieczny hash `bcrypt` jednym poleceniem PHP (przez SSH w cyber_Folks albo na swoim komputerze):

```bash
php -r 'echo password_hash("WpiszTutajSilneHaslo123!", PASSWORD_DEFAULT) . PHP_EOL;'
```

Skopiuj wynikowy ciąg zaczynający się od `$2y$10$...` (ok. 60 znaków).

---

## Krok 3: Utwórz prywatny plik `cms-editor-config.php` poza `public_html/` (1 min)

1. Przejdź **jeden poziom wyżej niż `public_html/`** (np. `/home/<konto>/domains/<twoja-domena.pl>/`).
2. Utwórz tam plik o nazwie **`cms-editor-config.php`** na podstawie `.github/hosting/wolbud-editor-config.example.php`:

```php
<?php
declare(strict_types=1);

return [
    'passwordHash' => '$2y$10$TUTAJ_WKLEJ_WYGENEROWANY_HASH_HASLA',

    'ai' => [
        'provider' => 'gemini',
        'apiKey'   => 'AIza...TUTAJ_WKLEJ_KLUCZ_GOOGLE_AI_STUDIO',
        'model'    => 'gemini-3-flash-preview',
    ],
];
```

3. Ustaw uprawnienia pliku na **`0600`** (w FileZilla / DirectAdmin: odczyt i zapis wyłącznie dla Właściciela).

> **Wskazówka:** System zachowuje pełną kompatybilność wsteczną — jeśli istnieje plik `wolbud-editor-config.php`, zostanie użyty jako fallback.

---

## Krok 4: Przełącz `panel/config.js` na tryb `hosting` (30 s)

Otwórz plik `public_html/panel/config.js` i ustaw tryb hostingu z wymaganym logowaniem sesyjnym:

```js
export const config = Object.freeze({
  mode: 'hosting',
  requireLogin: true,
  apiEndpoint: './api.php',
  authEndpoint: './auth.php',
  aiEndpoint: './ai-proxy.php',
  backupsEndpoint: './backups.php',
});
```

---

## Krok 5: Szybka weryfikacja po wdrożeniu (1 min)

Sprawdź w przeglądarce po kolei 5 rzeczy (użyj swojej domeny z `https://`):

1. **Blokada `_common.php`:** Wejdź na `https://twoja-domena.pl/panel/_common.php` → serwer **MUSI** zwrócić `403 Forbidden`.
2. **Status logowania:** Wejdź na `https://twoja-domena.pl/panel/auth.php?status=1` → odpowiedź JSON:
   ```json
   {"ok":true,"authenticated":false,"csrfToken":null,"mode":"hosting"}
   ```
3. **Logowanie w panelu:** Otwórz `https://twoja-domena.pl/panel/` i zaloguj się hasłem edytora.
   - Po 5 błędnych hasłach serwer automatycznie zablokuje IP na 15 minut (`HTTP 429`).
4. **Asystent AI:** Po zalogowaniu wyślij krótkie polecenie w zakładce AI — odpowiedź powinna wrócić z modelu `gemini-3-flash-preview` (a w razie chwilowego przeciążenia 503 proxy automatycznie przełączy się na `gemini-3.8-flash` lub `gemini-3.1-flash-lite`).
5. **Publikacja i nieusuwalna kopia oryginalna:**
   - Wprowadź drobną zmianę tekstową i kliknij **Opublikuj**.
   - Sprawdź, że poza `public_html/` powstał katalog `cms-backups/original/` (nieusuwalna kopia fabryczna) oraz kopia `cms-backups/auto-...`.
   - Otwórz zakładkę **Kopie zapasowe / Historia wersji** i przetestuj przywrócenie wersji fabrycznej (`original`) — przed przywróceniem system automatycznie zapisze bieżący stan, więc nawet przywrócenie można cofnąć jednym kliknięciem!

---

## Wbudowane zabezpieczenia (co działa automatycznie)

- **Sesje PHP + CSRF:** Cookie `CMS_STUDIO_SID` z flagami `HttpOnly`, `SameSite=Strict`, `Secure` (na HTTPS), wygasanie po 4 h bezczynności + 256-bitowy token `X-CMS-CSRF-Token`.
- **Ochrona Brute-Force:** Maks. 5 nieudanych prób logowania w 15 min → blokada 15 min (`HTTP 429` + `Retry-After`) z zapisem w `cms-audit.log`.
- **Autoryzacja AI Proxy:** Nikt spoza zalogowanego panelu nie może użyć ani wyczerpać klucza API klienta (`POST /panel/ai-proxy.php` zwraca `401 Unauthorized` bez sesji).
- **Skaner bezpieczeństwa HTML/XSS:** Każda publikacja jest skanowana po stronie serwera — blokowane są tagi PHP/ASP, `<iframe>`, `<object>`, `<embed>`, `<applet>`, `meta refresh`, atrybuty `on*=`, schematy `javascript:` / `vbscript:` / `data:text/html` oraz wszelkie obce lub inline `<script>`.
- **Brak możliwości wgrania PHP:** Katalog `img/uploads/.htaccess` całkowicie wyłącza wykonywanie PHP i CGI, a `api.php` pozwala wyłącznie na bezpieczne rozszerzenia witryny i blokuje modyfikację `panel/`, `assets/site.js` oraz `assets/site.css`.
- **Nieusuwalny backup fabryczny:** Pierwsze otwarcie historii wersji lub pierwsza publikacja tworzy niemodyfikowalną kopię `cms-backups/original` poza `public_html/`. Endpoint `backups.php` celowo nie posiada akcji kasowania.
- **Audyt bezpieczeństwa:** Każde logowanie, błędne hasło, blokada IP, odrzucona próba XSS, publikacja oraz przywrócenie kopii są zapisywane w `../cms-audit.log` (z automatyczną rotacją przy 5 MB, bez żadnych haseł i kluczy API).
