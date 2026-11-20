# Panel edycji Wol‑Bud

Panel działa na stronie głównej. Adres startowy na GitHub Pages to
[panel edycji](https://kosma0000.github.io/wol-bud-wojciech-wolanski-tarnow/panel/?sekcja=oferta).

Kliknij obramowany tekst w podglądzie i wpisz zmianę. Kolejność zmienisz uchwytem
w podglądzie lub na liście. Po zaznaczeniu sekcji możesz też użyć przycisków
„Przenieś wyżej” i „Przenieś niżej”. Przycisk „Telefon” zawęża tę samą stronę do
390 px na komputerze. Szkic jest dostępny po odświeżeniu w tej przeglądarce
i w tym samym profilu. Po publikacji możesz sprawdzić efekt przez „Otwórz stronę publiczną”.

## GitHub Pages

Administrator w [ustawieniach GitHuba](https://github.com/settings/personal-access-tokens/new)
tworzy klucz typu fine-grained dla właściciela `KosmA0000`, wybiera wyłącznie
repozytorium `wol-bud-wojciech-wolanski-tarnow` i nadaje uprawnienie
**Repository permissions → Contents → Read and write**. Klucz musi być ważny i należeć
do konta z prawem zapisu do repozytorium. Przy pierwszej publikacji w otwartym panelu
klient wkleja klucz otrzymany od administratora. Panel trzyma go w pamięci bieżącej karty.

Publikacja aktualizuje `assets/home-content.json` na gałęzi `main` i uruchamia
istniejące wdrożenie GitHub Pages. Panel potwierdza sukces po odczytaniu identyfikatora nowej
wersji z publicznej strony. Oczekiwanie zwykle trwa tyle, ile wdrożenie GitHub Pages.
Gdy panel zgłosi błąd lub brak potwierdzenia, szkic pozostaje dostępny. Można sprawdzić
publiczną stronę i ponowić publikację z panelu.

## Przeniesienie na hosting Wol‑Bud

Obecna domena `wol-bud.com.pl` korzysta z innej wersji HTML, CSS i JS niż GitHub Pages.
Pracuj na kopii plików z hostingu i zachowaj jego bieżące `index.html`, metadane,
zdjęcia oraz zasoby.

1. Sprawdź na kopii, czy `#ofirmie`, `#oferta` i `#opinie` są trzema sąsiednimi
   elementami bezpośrednio po `main > #start`. Sprawdź selektory sześciu pól z
   `assets/home-content.js` i ich wygląd na telefonie. Gdy identyfikatory lub klasy
   się różnią, dopasuj selektory do HTML hostingu.
2. Wypakuj katalogi `assets/` i `panel/` z paczki obok bieżącego `index.html`.
   W jego `<head>` dodaj poniższe dwie linie. Pozostaw istniejące odnośniki do
   CSS i JS. Dołączony JSON startowy użyje treści z HTML hostingu. Przy kolejnym
   wdrożeniu zachowaj aktualny JSON z opublikowaną treścią.

   ```html
   <link rel="stylesheet" href="assets/home-content.css">
   <script type="module" src="assets/home-page.js"></script>
   ```

3. Sprawdź, czy LiteSpeed obsługuje PHP 8.1 lub nowsze, przekazuje nagłówek
   `Authorization` do PHP i działa przez HTTPS. Ustaw konfigurację PHP jako plik
   `wolbud-editor-config.php` poziom wyżej niż katalog publiczny. Skopiuj szablon i
   zastąp wartość hashem wygenerowanym przez `password_hash` z długiego losowego
   hasła ASCII. Przekaż klientowi hasło edytora przez bezpieczny kanał.
4. Nadaj procesowi PHP możliwość zapisu do katalogu `assets/` dla atomowej podmiany
   `assets/home-content.json` oraz możliwość utworzenia pliku `wolbud-editor.lock`
   obok prywatnej konfiguracji. Skonfiguruj cache hostingu tak, by przy odczycie
   `assets/home-content.json` sprawdzać aktualność. Udostępnij klientowi adres
   `https://wol-bud.com.pl/panel/?sekcja=oferta` po sprawdzeniu zapisu, publikacji
   i odświeżenia w osobnej sesji przeglądarki.

W trybie hostingu PHP zapisuje tylko plik treści. Przycisk „Opublikuj” sprawdza
ten sam publiczny JSON, który ładuje strona. Widoczność panelu nie daje uprawnienia
do publikacji. Zapis na serwerze wymaga poprawnego hasła.

## Test z pięcioma klientami

Na kopii testowej ustaw tę samą wersję startową przed każdą sesją. Przygotuj
przeglądarkę z otwartym panelem i aktywnym dostępem do publikacji. Uczestnicy to
pięć osób, które samodzielnie aktualizują informacje o firmie, bez doświadczenia
w kodowaniu lub administracji GitHubem.

**Polecenie dla uczestnika.** „Na stronie głównej zmień nagłówek sekcji Oferta na
«Okna i drzwi dopasowane do Twojego domu». Umieść Ofertę przed sekcją O firmie.
Opublikuj zmiany i pokaż efekt na stronie, którą zobaczy klient.”

Uruchom stoper po odczytaniu zadania. Nie wskazuj przycisków ani sposobu zmiany
kolejności. Zapisz czas i zweryfikuj na publicznej stronie dokładny nagłówek oraz
kolejność Oferta → O firmie → Opinie. Próg odbioru to co najmniej **4 z 5 osób
bez podpowiedzi w ciągu 3 minut**. Wlicz czas oczekiwania na publikację i zapisz go
oddzielnie, żeby można było ocenić wpływ hostingu. Sesje z klientami są do wykonania.
