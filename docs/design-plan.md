# Specyfikacja nowej witryny WOL-BUD

Dokument dla agenta implementującego. Treść, nazwy kategorii i dane firmy należy pobrać z obecnej witryny WOL-BUD i zachować. Dozwolone są korekta pisowni, usunięcie duplikatów i parafraza bez zmiany sensu. Nie dodawać usług, obietnic, danych liczbowych, opinii ani zdjęć, których nie potwierdza źródło.

## Cel i priorytety

1. Klient ma od razu rozpoznać zakres oferty, znaleźć potrzebną kategorię i zadzwonić.
2. Pełna treść obecnej witryny ma pozostać dostępna, lecz ma być rozdzielona na tematyczne strony i zwarte, rozwijane sekcje.
3. Strona ma budzić zaufanie przez informacje o firmie, jej salonach, partnerach i autentyczne opinie z Google Maps.
4. Najpierw projektować dla telefonu. Nie stosować dużego, pustego hero ani długich pionowych list tam, gdzie wystarczy kompaktowy katalog lub akordeon.

## Kierunek wizualny i referencje

`przyklady.txt` zawiera trzy punkty odniesienia: [DAKO Kalisz](https://kosma0000.github.io/dako-kalisz-okna-drzwi-bramy/), [PIMM — Budowa domu](https://pimm.com.pl/budowa-domu/) i [RKP](https://rkp.com.pl/). Odczyt struktury PIMM wspiera osobne strony dla poszczególnych usług; RKP pokazuje katalog oferty umieszczony wcześnie na stronie głównej. DAKO nie otworzyło się w dostępnych narzędziach.

Nie było dostępnej przeglądarki ani zrzutów ekranu, więc wygląd tych witryn, ich faktyczny pierwszy ekran, mobile, animacje i detale nawigacji nie zostały ocenione. Nie przypisywać referencjom konkretnej palety, kroju pisma ani animacji. Dla WOL-BUD przyjąć własny, uporządkowany kierunek redakcyjno-architektoniczny: mocna, czytelna typografia, wyraźna siatka, stonowane jasne tło, ciemny tekst i jeden ciepły kolor akcentu. Zachować istniejące logo. Nie używać stockowych ani generowanych zdjęć. Efekt wizualny może być dopracowany i charakterystyczny, ale ma wynikać z typografii, kompozycji i prawdziwych materiałów, a nie z wysokiego hero czy scroll-jackingu.

## Architektura informacji

| Strona | Zawartość i rola |
| --- | --- |
| `/` | Krótkie przedstawienie firmy, kompaktowy katalog kategorii produktowych i usług, telefon, poziomy pas opinii z Google Maps, skróty do zdjęć i do informacji o firmie. |
| `/oferta` | Indeks wszystkich kategorii produktowych ze źródła. Zawiera nazwy i krótkie, oparte na źródle objaśnienia; pełny tekst znajduje się na stronie danej kategorii. |
| `/oferta/<kategoria>` | Osobna strona każdej kategorii produktowej. Oryginalne opisy i podkategorie są przypisane tylko tutaj, w kompletnych sekcjach lub akordeonach. |
| `/uslugi` | Indeks siedmiu nagłówków ze źródłowej strony „Usługi”: pomiar/doradztwo/wycena, ciepły montaż, serwis, kompleksowa obsługa inwestycji, prace wykończeniowe i murarskie, układanie kostki brukowej oraz daszki poliwęglanowe. |
| `/uslugi/<usluga>` | Osobna strona dla każdej z powyższych usług. Cały przypisany jej tekst źródłowy jest dostępny na tej stronie, bez kopiowania pełnego opisu na indeksie ani na stronie głównej. |
| `/o-firmie` | Pełne informacje o firmie, jej doświadczeniu, sposobie pracy i dostawcach/partnerach, wyłącznie na podstawie obecnej treści. |
| `/galeria` | Osobna galeria istniejących zdjęć z kategoriami wynikającymi z faktycznej zawartości plików. Kategorie mogą obejmować produkty, salony/firmę i etapy ciepłego montażu, jeśli odpowiadają im dostępne zdjęcia. |
| `/kontakt` | Dane kontaktowe, adresy i godziny salonów oraz odnośniki do map. Bez formularza i bez osadzonej mapy. |

### Kategorie oferty

Zachować nazwy i kolejność katalogu ze źródłowej witryny. Odczytana lista obejmuje: okna PCV, drzwi wewnętrzne, drzwi zewnętrzne, stolarkę aluminiową, bramy garażowe, parapety i blaty, moskitiery, rolety, rolety wewnętrzne, rolety zewnętrzne oraz żaluzje i plisy. Strona `/oferta` ma pokazywać kategorie i prowadzić do odpowiednich stron. Treści podkategorii, takich jak typy parapetów, mają własne strony tylko wtedy, gdy źródło ma dla nich osobną treść; w pozostałych przypadkach umieścić je jako nazwane sekcje na właściwej stronie nadrzędnej.

Każda strona źródłowa ma być przypisana do dokładnie jednego miejsca docelowego. Zachować istniejące adresy URL kategorii i podstron, gdy to możliwe. Gdy nowa architektura wymaga zmiany ścieżki, przygotować przekierowanie ze starego adresu i nie prowadzić menu do nieistniejących stron. Nie tworzyć strony usługi „inteligentny dom” wyłącznie na podstawie frazy w tytule SEO; dodać ją tylko wtedy, gdy inna treść źródłowa potwierdza taką usługę.

## Strona główna i pierwszy ekran telefonu

Pierwszy ekran telefonu ma od razu zawierać logo/nazwę, krótki opis firmy, telefon oraz czytelny katalog oferty. Układ:

1. Wąski, stale dostępny nagłówek: logo po lewej; po prawej przycisk `Zadzwoń` z głównym numerem firmy i przycisk `Menu`. Na telefonie oba przyciski mają co najmniej 44 × 44 px. Nagłówek pozostaje u góry podczas przewijania; nie dodawać pływającego przycisku telefonu przy dolnej krawędzi.
2. Nagłówek strony i najwyżej dwa krótkie zdania o firmie, parafrazowane z obecnego tekstu. Nie dodawać nowego sloganu ani nie powtarzać pełnego opisu ze strony `/o-firmie`.
3. Widoczny, bezpośredni przycisk telefonu `tel:`.
4. Zwarty, dwuczęściowy indeks bez zdjęć przy opisach: pełna lista kategorii produktowych oraz lista siedmiu usług ze źródłowej strony „Usługi”. Pokazać je pod krótkimi etykietami `Produkty` i `Usługi`, jako tekstowe odnośniki bez dodatkowych opisów. Użyć dwóch kolumn na typowym telefonie, z wyraźnymi nazwami i dużymi polami dotyku. Każda pozycja prowadzi bezpośrednio do właściwej strony kategorii/usługi; nie wymaga wcześniejszego wejścia na `/oferta` lub `/uslugi`.

Nie umieszczać w pierwszym ekranie dużego zdjęcia, które zepchnęłoby katalog i telefon. Jako cel kompozycyjny przyjąć widoczność krótkiego przedstawienia, połączenia oraz obu list kategorii bez przewijania na typowym telefonie 390 × 844 px. Nazwy kategorii mają być krótkimi linkami bez dodatkowych opisów, w dwóch kolumnach; pola dotyku pozostają co najmniej 44 px wysokie. Przy węższych lub niższych ekranach pierwszeństwo mają: firma, przycisk telefonu, nazwy kategorii bezpośrednio prowadzące do stron oraz łatwo dostępne menu. Na desktopie hero może używać szerszej siatki, ale nadal ma pokazywać ofertę i telefon bez wielkiego pustego pola.

Pozostałe sekcje strony głównej, w tej kolejności: opinie z Google Maps w poziomym pasie; krótkie przejście do galerii zdjęć; skrót do informacji o firmie i partnerów, jeśli ich materiały są dostępne; skrót do salonów/kontaktu. Nie kopiować tutaj pełnych akapitów z podstron.

## Nawigacja i katalogi

- Menu desktopowe: `Oferta`, `Usługi`, `Zdjęcia`, `O firmie`, `Salony i kontakt`; numer telefonu jako osobny, widoczny przycisk w nagłówku.
- Menu mobilne: przycisk `Menu` otwiera prosty panel z tymi samymi pozycjami. Panel ma zamykać się po wyborze strony i po klawiszu Escape; po otwarciu przenieść fokus do panelu, a przy zamknięciu oddać fokus przyciskowi menu.
- Strony `/oferta` i `/uslugi` zaczynają się od zwartego spisu nazw, który prowadzi bezpośrednio do odpowiedniej kategorii. Nazwy w menu mogą się powtarzać jako nawigacja; nie kopiować całych opisów między stronami.
- Na każdej stronie kategorii/usługi dodać spis treści prowadzący do sekcji tej strony. Na desktopie może być przypięty w bocznej kolumnie. Na telefonie użyć zwijanego przycisku `Spis treści`; wybór pozycji przewija do sekcji i zamyka listę. Link do sekcji ma otwierać powiązany akordeon.
- Na dole strony szczegółowej dodać krótkie odnośniki do poprzedniej i następnej kategorii/usługi, aby można było płynnie przejść między nimi, oraz przycisk telefonu w obrębie treści.

## Opisy i akordeony

- Długie opisy dzielić na kompletne tematy z nagłówkami wynikającymi z treści. Nie ucinać akapitu w połowie ani nie zostawiać oderwanego zdania. Każdy oryginalny szczegół ma zostać umieszczony w logicznym bloku.
- Sekcje szczegółowe pokazywać jako akordeon z dokładnie jedną otwartą pozycją naraz. Otwarcie nowej zamyka poprzednią; ponowne kliknięcie otwartej pozycji zamyka ją. Domyślnie wszystkie są zamknięte, by strony pozostały zwarte.
- Tytuł akordeonu ma jasno opisywać zawartość. Kontrolki muszą obsługiwać klawiaturę, mieć widoczny fokus i prawidłowo raportować stan otwarcia czytnikowi ekranu.
- Treść akordeonu pozostaje częścią strony i nie może być osobną, powtórzoną kopią treści. Spis treści, odnośniki z innych kategorii i URL z kotwicą mają otwierać właściwą sekcję.
- Bez treści „na próbę”: FAQ, liczby, zapewnienia i nowe sekcje tworzyć tylko, jeśli odpowiada im konkretny tekst ze źródła.

## Zdjęcia i galeria

Agent assetów ustalił, że obecna witryna nie zawiera galerii ukończonych realizacji. Dostępne są zdjęcia produktów, firmy, salonów, referencji i etapów ciepłego montażu. Dlatego:

- Stronę nazwać neutralnie `Zdjęcia` albo `Galeria zdjęć`, nie przedstawiać zdjęć produktowych ani ekspozycyjnych jako ukończonych realizacji.
- Użyć tylko istniejących zdjęć ze źródłowej witryny. Nie pobierać stocków, nie generować obrazów i nie dopisywać opisu sugerującego, że fotografia przedstawia usługę wykonaną u klienta, jeśli źródło tego nie potwierdza.
- Podzielić galerię na kategorie zgodne z zawartością: np. produkty, salony/firma, ciepły montaż. Utworzyć kategorię tylko wtedy, gdy są przypisane do niej rzeczywiste zdjęcia. Zachować oryginalne podpisy/alt, o ile są dostępne; w innym przypadku opisać wyłącznie widoczny obiekt.
- Nie umieszczać zdjęć w kartach ani opisach produktów/usług. Na stronie szczegółowej, pod kompletnym opisem, dodać odnośnik `Zobacz zdjęcia` tylko wtedy, gdy w galerii istnieje pasująca, prawidłowo oznaczona kategoria. Odnośnik otwiera `/galeria?kategoria=<slug>` z tą kategorią wybraną.
- Galeria ma być osobnym widokiem z prostym wyborem kategorii i siatką zdjęć. Kategorie nie mogą obiecywać galerii realizacji, których nie ma w źródle.

### Powrót do dokładnego miejsca

Przed przejściem z opisu usługi do zdjęć zachować w stanie bieżącego wpisu historii: adres i kotwicę strony źródłowej, aktualne położenie przewinięcia oraz identyfikator otwartego akordeonu. W galerii wyświetlić przycisk `Wróć do: [nazwa strony]`. Po jego użyciu wrócić do wcześniejszego wpisu historii i odtworzyć położenie oraz stan akordeonu. Dla bezpośredniego wejścia do galerii przycisk ma prowadzić do strony kategorii z parametru `powrot`, a jeśli go brak — do `/oferta`. Nie używać trwałych cookies do zapamiętywania tego stanu.

## Opinie z Google Maps

- Na stronie głównej opinie są obowiązkowo prezentowane poziomo, nigdy jako długa pionowa lista.
- Pobierać wyłącznie rzeczywiste opinie przypisane do właściwego profilu WOL-BUD w Google Maps. Zachować oryginalny sens i nie dopisywać ani nie łączyć wypowiedzi. Pokazywać nazwę autora i ocenę tylko wtedy, gdy są podane publicznie przy opinii. Nie wymyślać oceny zbiorczej ani daty.
- Układ to ręcznie przewijany rząd kart: przeciąganie/gest poziomy na telefonie oraz widoczne przyciski poprzednia/następna na większym ekranie. Nie stosować automatycznego przesuwania ani paska pionowego. Karty mają mieć równą, ograniczoną wysokość; dłuższy tekst może otwierać się w szczególe karty.
- Dodać link do profilu/opinii w Google Maps jako zwykły odnośnik. Nie osadzać zewnętrznego widgetu.

## Kontakt i prywatność

- Głównym działaniem kontaktowym jest telefon. Główny numer ze źródłowej strony ma być klikalny przez `tel:` w nagłówku oraz w miejscach CTA. Numery poszczególnych salonów prezentować przy ich właściwych adresach.
- Zachować źródłowy e-mail jako zwykły link `mailto:` i wszystkie aktualne dane salonów, godziny oraz adresy. Pełne dane lokalizacji umieścić w jednym miejscu (`/kontakt`), a w stopce dać tylko krótkie odnośniki, bez powielania długiego opisu.
- Nie dodawać formularzy, pól kontaktowych, czatu ani wymogu zgody na cookies. Nie dodawać analityki, banera cookies ani osadzonych zewnętrznych map i widgetów opinii. Linki do Google Maps mogą otwierać zewnętrzną stronę.
- Witryna jest wyłącznie po polsku.

## Zachowanie na telefonie i dostępność

- Projektować od szerokości 320 px. Przy 320–430 px: pojedyncza kolumna dla treści, dwie kolumny dla zwartego katalogu kategorii, bez poziomego przewijania całej strony. Poziomy gest jest zarezerwowany dla pasa opinii i siatki zdjęć, jeśli jest wygodna na dotyk.
- Obszar dotyku dla przycisków i linków: co najmniej 44 × 44 px; zachować odstęp, by sąsiednie linki nie były mylone. Długie nazwy kategorii mają się zawijać, nie ucinać.
- Zachować czytelną szerokość akapitów na dużych ekranach, wyraźną hierarchię nagłówków, kontrast tekstu co najmniej WCAG AA, widoczny fokus klawiatury i opisy alternatywne zgodne z faktyczną zawartością zdjęć.
- Nie uzależniać informacji od hovera, samego koloru ani animacji. Respektować `prefers-reduced-motion`; nie stosować automatycznej zmiany slajdów, parallaxu zajmującego ekran ani wymuszonego przewijania.
- W każdej podstronie utrzymywać widoczny dostęp do menu i telefonu w górnym nagłówku. Nie dodawać dolnego sticky CTA.

## Zasady kompletności treści

Przed układaniem tekstu przypisać każdą istniejącą stronę, podstronę, paragraf, listę, podpis i nazwę produktu do dokładnie jednego miejsca w nowej architekturze. Zachować wszystkie informacje ze stron WOL-BUD; usuwać wyłącznie powtórzenia i błędy pisowni, a parafrazy nie mogą zmieniać sensu. Zachować źródłowe nazwy firm, produktów i partnerów. W treści nie zostawiać elementów formularza — kontakt odbywa się telefonicznie i przez istniejący e-mail.

## Kryteria gotowego wdrożenia

- Na standardowym ekranie telefonu pierwsza sekcja pokazuje krótką informację o firmie, bezpośredni telefon i wyraźny katalog głównych kategorii; nie dominuje jej dekoracyjne zdjęcie.
- Każda kategoria produktowa i każda z siedmiu usług jest osiągalna z indeksu najwyżej jednym przejściem.
- Każdy opis źródłowy występuje w jednym właściwym miejscu, z pełną informacją, i można do niego przejść ze spisu treści.
- Otwarcie kolejnego akordeonu zamyka poprzedni.
- Opinie na stronie głównej przesuwają się w bok i pochodzą z Google Maps.
- Zdjęcia są wyłącznie ze źródłowej witryny, prawidłowo opisane i nie są nazywane realizacjami, jeśli nie pokazują potwierdzonej realizacji.
- Po wejściu z kategorii do zdjęć i powrocie użytkownik trafia na ten sam fragment strony z zachowanym otwartym akordeonem.
- Na stronie nie ma formularza, cookies, dolnego przycisku sticky ani tekstów/usług/zdjęć bez potwierdzenia w źródle.
