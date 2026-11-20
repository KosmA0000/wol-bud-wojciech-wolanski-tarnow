# Panel edycji Wol‑Bud

Panel obejmuje strony z treścią z katalogu Wol‑Bud. Pole „Znajdź stronę” pozwala
wybrać stronę główną, kategorię, kartę produktu albo inną podstronę. Adres startowy na GitHub Pages to
[panel edycji](https://kosma0000.github.io/wol-bud-wojciech-wolanski-tarnow/panel/?sekcja=oferta).

Kliknij obramowany tekst w podglądzie i wpisz zmianę. Kliknięcie kafelka otwiera
jego opcje w panelu. „Zdjęcie i odnośnik” pozwala wgrać plik z komputera oraz ustawić
link. „Dodaj w środku” wstawia kolejny klocek. Na stronie publicznej przycisk
„Zobacz zawartość” rozwija zagnieżdżone elementy. „Dodaj sekcję” wstawia blok
tekstowy lub nową listę opinii, produktów lub kafelków.

Kolejność zmienisz uchwytem w podglądzie lub na liście. „Układ elementów” otwiera
sterowanie częściami zaznaczonego bloku. „Przenieś wyżej” i „Przenieś niżej” działają
także z klawiatury. Panel pokazuje miejsca zgodne z przeciąganym klockiem. „Telefon”
zawęża podgląd do 390 px na komputerze. Każda strona ma własny szkic w danym profilu
przeglądarki. Po publikacji sprawdź wynik przez „Otwórz stronę publiczną”.

## GitHub Pages

Administrator w [ustawieniach GitHuba](https://github.com/settings/personal-access-tokens/new)
tworzy klucz typu fine-grained dla właściciela `KosmA0000`, wybiera wyłącznie
repozytorium `wol-bud-wojciech-wolanski-tarnow` i nadaje uprawnienie
**Repository permissions → Contents → Read and write**. Klucz musi być ważny i należeć
do konta z prawem zapisu do repozytorium. Przy pierwszej publikacji w otwartym panelu
klient wkleja klucz otrzymany od administratora. Panel trzyma go w pamięci bieżącej karty.

Publikacja aktualizuje plik treści danej strony na gałęzi `main` i uruchamia
istniejące wdrożenie GitHub Pages. Panel potwierdza sukces po odczytaniu identyfikatora nowej
wersji z publicznej strony. Oczekiwanie zwykle trwa tyle, ile wdrożenie GitHub Pages.
Gdy panel zgłosi błąd lub brak potwierdzenia, szkic pozostaje dostępny. Można sprawdzić
publiczną stronę i ponowić publikację z panelu.

## Przeniesienie na hosting Wol‑Bud

Obecna domena `wol-bud.com.pl` korzysta z innej wersji HTML, CSS i JS niż GitHub Pages.
Pracuj na kopii plików z hostingu i zachowaj jego bieżące `index.html`, metadane,
zdjęcia oraz zasoby.

1. Wypakuj katalogi `assets/` i `panel/` z paczki obok bieżącego `index.html`.
   Na kopii uruchom `node integrate.mjs ŚCIEŻKA_DO_STRONY`. Skrypt dołącza
   edytor do stron zawierających właściwą treść, zachowuje przekierowania i tworzy
   katalog stron. Przy powtórnym uruchomieniu używa istniejących plików publikacji.
2. Sprawdź na kopii główną stronę, podstronę kontaktową, kategorię i kartę produktu,
   w tym wygląd na telefonie. Edytor używa istniejących komponentów. Gdy na
   hostingu zmieniono klasy lub strukturę komponentu, dopasuj selektory w
   `assets/home-content.js` i `assets/home-model.js`. Po sprawdzeniu prześlij
   zaktualizowane pliki HTML, `assets/` oraz `panel/` na hosting.

3. Sprawdź, czy LiteSpeed obsługuje PHP 8.1 lub nowsze, przekazuje nagłówek
   `Authorization` do PHP i działa przez HTTPS. Ustaw konfigurację PHP jako plik
   `wolbud-editor-config.php` poziom wyżej niż katalog publiczny. Skopiuj szablon i
   zastąp wartość hashem wygenerowanym przez `password_hash` z długiego losowego
   hasła ASCII. Przekaż klientowi hasło edytora przez bezpieczny kanał.
4. Nadaj procesowi PHP możliwość zapisu do katalogów `assets/` i `assets/page-data/`
   oraz możliwość utworzenia pliku `wolbud-editor.lock`
   obok prywatnej konfiguracji. Skonfiguruj cache hostingu tak, by przy odczycie
   `assets/home-content.json` i JSON z `assets/page-data/` sprawdzać aktualność. Udostępnij klientowi adres
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
