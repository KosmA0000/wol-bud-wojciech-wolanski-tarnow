# Panel CMS i publikacja witryny WOL‑BUD Tarnów

Panel CMS umożliwia wizualną edycję całej witryny statycznej **WOL‑BUD** (treści, kolejności sekcji, zdjęć, ustawień globalnych oraz tworzenia i usuwania podstron) bez znajomości kodu i bez ręcznego budowania projektu.

Wszystkie zmiany z jednej sesji są publikowane **atomowo** — na GitHub Pages jako pojedynczy commit (przez GitHub Git Data API), a na hostingu PHP przez bezpieczny endpoint `panel/api.php` z blokadą `flock` i kontrolą wersji w `assets/cms-manifest.json`.

---

## 1. Tryb GitHub Pages (domyślny)

Adres panelu:
`https://kosma0000.github.io/wol-bud-wojciech-wolanski-tarnow/panel/`

Konfiguracja domyślna w `panel/config.js`:

```js
export const config = Object.freeze({
  mode: 'github',
  repository: 'KosmA0000/wol-bud-wojciech-wolanski-tarnow',
  branch: 'main',
  apiEndpoint: './api.php',
});
```

### Jak wygenerować Fine‑Grained Personal Access Token (PAT)

1. Zaloguj się na konto GitHub z uprawnieniami zapisu do repozytorium i otwórz:
   **[GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens](https://github.com/settings/personal-access-tokens/new)**.
2. Wpisz nazwę tokenu (np. `WOL-BUD Panel CMS`) oraz wybierz termin ważności (**Expiration**).
3. Jako **Resource owner** wybierz `KosmA0000`.
4. W sekcji **Repository access** zaznacz **Only select repositories** i wybierz wyłącznie:
   `KosmA0000/wol-bud-wojciech-wolanski-tarnow`.
5. Rozwiń **Permissions → Repository permissions** i ustaw wyłącznie:
   - **Contents**: `Read and write`
   *(wszystkie pozostałe uprawnienia pozostaw jako `No access`)*.
6. Kliknij **Generate token**, skopiuj wygenerowany klucz (zaczyna się od `github_pat_...`) i przekaż osobie redagującej bezpiecznym kanałem.

### Jak działa publikacja na GitHub Pages

1. Przy pierwszej publikacji w otwartej karcie panel poprosi o wklejenie tokenu (klucz nie jest zapisywany na serwerze).
2. Silnik publikacji (`panel/publish.js`):
   - weryfikuje dostęp do gałęzi `main` oraz aktualną rewizję w `assets/cms-manifest.json` (chroni przed nadpisaniem zmian opublikowanych z innego okna — błąd konfliktu),
   - równolegle wysyła zmienione pliki HTML, JSON oraz obrazy jako obiekty Git (blobs),
   - buduje nowe drzewo plików (z uwzględnieniem usuniętych podstron) i tworzy **jeden atomowy commit** na gałęzi `main`.
3. Panel oczekuje na wdrożenie GitHub Pages (zwykle 30–120 s) i potwierdza sukces po odczytaniu nowej wartości `revision` z publicznego `assets/cms-manifest.json`.

---

## 2. Przeniesienie na hosting PHP (`wol-bud.com.pl`)

### Wymagania hostingu

- **PHP 8.1** lub nowsze (z włączonym rozszerzeniem JSON).
- Połączenie **HTTPS** (Basic Auth wymaga szyfrowania TLS).
- Przekazywanie nagłówka `Authorization` do PHP.
  Jeśli na LiteSpeed / Apache PHP nie otrzymuje nagłówka `Authorization`, dodaj w `.htaccess`:
  ```apache
  SetEnvIf Authorization "(.*)" HTTP_AUTHORIZATION=$1
  ```

### Krok po kroku — wdrożenie na `wol-bud.com.pl`

1. **Wgraj pliki witryny** do katalogu publicznego domeny (np. `public_html/`), zachowując strukturę katalogów (`index.html`, `assets/`, `img/`, `panel/`, podstrony).
2. **Skopiuj endpoint PHP**: umieść plik `.github/hosting/api.php` jako:
   `public_html/panel/api.php`
3. **Przełącz tryb w `panel/config.js`**:
   ```js
   export const config = Object.freeze({
     mode: 'hosting',
     repository: 'KosmA0000/wol-bud-wojciech-wolanski-tarnow',
     branch: 'main',
     apiEndpoint: './api.php',
   });
   ```
4. **Utwórz plik z hashem hasła poziom wyżej niż katalog publiczny** (np. `/home/<konto>/wolbud-editor-config.php`, czyli poza `public_html/`):
   Wygeneruj hash silnego hasła poleceniem PHP:
   ```bash
   php -r 'echo password_hash("TWOJE_DLUGIE_LOSOWE_HASLO", PASSWORD_DEFAULT) . PHP_EOL;'
   ```
   Zapisz plik `wolbud-editor-config.php` (wzór w `.github/hosting/wolbud-editor-config.example.php`):
   ```php
   <?php
   declare(strict_types=1);
   return [
       'passwordHash' => '$2y$10$...TUTAJ_WYGENEROWANY_HASH...',
       // Opcjonalnie — konfiguracja Asystenta AI (szczegóły w sekcji 4 poniżej):
       'ai' => [
           'provider' => 'gemini', // 'gemini' albo 'openai'
           'apiKey' => 'WKLEJ_KLUCZ_API_AI',
           'model' => 'gemini-2.5-flash', // lub np. 'gpt-4.1-mini'
       ],
   ];
   ```
   *(Dla samego `api.php` nadal działa też starszy format zwracający sam string z hashem hasła.)*
   Nadaj plikowi uprawnienia `0600` (lub `0640` czytelne wyłącznie dla procesu PHP).
5. **Uprawnienia katalogów i cache**:
   - Proces PHP musi mieć prawo zapisu w katalogu publicznym witryny (do atomowej podmiany stron, `assets/cms-manifest.json`, `assets/site-globals.json` oraz tworzenia nowych podstron i `img/uploads/`) oraz w katalogu nadrzędnym do utworzenia pliku blokady `wolbud-editor.lock`.
   - Wyłącz agresywne buforowanie po stronie serwera/CDN dla plików `assets/cms-manifest.json` oraz `assets/site-globals.json` (lub respektuj nagłówek `Cache-Control: no-store` i parametr `?sprawdz=...`).
6. **Zweryfikuj działanie**:
   Otwórz `https://wol-bud.com.pl/panel/`, wprowadź testową zmianę i opublikuj ją używając hasła edytora (nazwa użytkownika `editor` jest ustawiana automatycznie przez panel).

---

## 3. Wbudowane zabezpieczenia `api.php`

- **Uwierzytelnianie**: HTTP Basic Auth (`editor:<hasło>`) weryfikowane przez `hash_equals` + `password_verify` względem konfiguracji spoza katalogu publicznego.
- **Wyłączna blokada (`flock`)**: równoległe publikacje są kolejkowane przez `wolbud-editor.lock`, a niezgodność `expectedRevision` z `assets/cms-manifest.json` zwraca `409 Conflict`.
- **Walidacja ścieżek**: blokada `..`, bajtów zerowych, plików ukrytych (`.htaccess`, `.env`, `.git/`, `.github/`), katalogu `panel/`, symlinków oraz wszelkich rozszerzeń serwerowych (`.php`, `.phtml`, `.phar`, itp.).
- **Biała lista rozszerzeń zapisu**: wyłącznie `.html`, `.json`, `.webp`, `.png`, `.jpg`, `.jpeg`, `.svg` (z weryfikacją poprawności JSON i blokadą tagów PHP w plikach tekstowych).
- **Ochrona przed usunięciem kluczowych plików**: zakaz usuwania `index.html`, `assets/*` oraz `panel/*`.
- **Limity i atomowość**: maksymalnie **6 MB** na plik i **25 MB** na całe żądanie; każdy plik zapisywany jest przez plik tymczasowy (`chmod 0644` + `rename`), a `assets/cms-manifest.json` jest podmieniany jako ostatni.

---

## 4. Asystent AI na hostingu cyber_Folks / PHP

Panel CMS zawiera wbudowanego **Asystenta AI**, który może edytować treści, dodawać sekcje i pomagać w redakcji strony. Na hostingu współdzielonym PHP (cyber_Folks, LH, Home — PHP 8.1+ z włączonym rozszerzeniem `cURL`) cały ruch AI może przechodzić przez bezpieczne proxy `panel/ai-proxy.php`.

### Wdrożenie w 3 krokach

1. **Wgraj plik proxy**: skopiuj `.github/hosting/ai-proxy.php` do katalogu panelu jako:
   `public_html/panel/ai-proxy.php` (obok `api.php`).
2. **Dopisz sekcję `'ai'` w `wolbud-editor-config.php`** (poza `public_html/`, w tym samym pliku, z którego korzysta `api.php` — wzór w `.github/hosting/wolbud-editor-config.example.php`):
   ```php
   <?php
   declare(strict_types=1);

   return [
       'passwordHash' => '$2y$10$...HASH_HASLA_EDYTORA...',
       'ai' => [
           'provider' => 'gemini',          // 'gemini' albo 'openai'
           'apiKey' => 'AIza...TWOJ_KLUCZ', // klucz API (tylko po stronie serwera)
           'model' => 'gemini-2.5-flash',   // dla OpenAI np. 'gpt-4.1-mini'
       ],
   ];
   ```
3. **Gotowe — sprawdź status**: otwórz w przeglądarce `https://wol-bud.com.pl/panel/ai-proxy.php?status=1`. Powinieneś zobaczyć odpowiedź w formacie:
   ```json
   { "ok": true, "configured": true, "provider": "gemini", "model": "gemini-2.5-flash" }
   ```
   Endpoint statusu **nigdy nie ujawnia klucza API**.

### Zero konfiguracji po stronie klienta i bezpieczeństwo

- **Klient nie musi nic ustawiać ani znać klucza API**: po otwarciu panelu CMS na hostingu panel automatycznie wykrywa `ai-proxy.php?status=1` i uruchamia Asystenta AI przez serwer. Klucz API nigdy nie trafia do przeglądarki ani do repozytorium Git.
- **Zabezpieczenia `ai-proxy.php`**:
  - weryfikacja źródła żądania (same-origin `Origin` ↔ `Host`),
  - limit rozmiaru żądania **512 KB** (`413`),
  - bezbazowy **rate-limit per IP** w `sys_get_temp_dir()` — maksymalnie **30 zapytań / 60 s** (`429`),
  - timeout połączenia cURL **45 s** (`504`) i pełne maskowanie klucza API w komunikatach błędów.

### Tryb klucza API na GitHub Pages

GitHub Pages jest hostingiem wyłącznie statycznym (nie uruchamia PHP), dlatego `ai-proxy.php` nie jest tam dostępny. W trybie GitHub Pages osoba redagująca może wkleić własny klucz API **Gemini** lub **OpenAI** bezpośrednio w ustawieniach Asystenta AI w panelu — klucz zapisywany jest wyłącznie lokalnie w przeglądarce użytkownika, a zapytania wysyłane są bezpośrednio do API wybranego dostawcy.

---

## 5. Najczęstsze komunikaty

- **401 / 403 (Brak dostępu)**: sprawdź, czy token GitHub nie wygasł i posiada uprawnienie `Contents: Read and write` dla tego repozytorium (lub na hostingu PHP czy hasło zgadza się z `wolbud-editor-config.php` i serwer przekazuje nagłówek `Authorization`).
- **409 (Konflikt wersji)**: ktoś opublikował nowsze zmiany w innym oknie. Odśwież panel przed ponowną publikacją.
- **429 / 503 / 504 (Asystent AI)**: `429` oznacza przekroczenie limitu zapytań (30/min w proxy lub limitu u dostawcy AI), `503` — brak poprawnej sekcji `'ai'` w `wolbud-editor-config.php` lub brak rozszerzenia cURL, a `504` — przekroczenie 45 s oczekiwania na model AI.
- **Przekroczenie czasu oczekiwania na GitHub Pages**: commit został już zapisany w repozytorium; GitHub Pages czasem potrzebuje 2–3 minut na przebudowanie strony — odśwież stronę publiczną za chwilę.
