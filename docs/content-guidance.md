# Wytyczne treści dla implementatora

Dokument opiera się na 93 stronach źródłowych z kodem HTTP 200 zebranych w [source-content.json](source-content.json) i [source-content.md](source-content.md). Nie zastępuje oryginalnej treści. Pełne opisy usług i produktów pozostają w danych źródłowych; ten plik porządkuje nawigację, krótkie wprowadzenie oraz miejsca wymagające ostrożności.

## Hierarchia 18 stron kategorii

W źródłowym menu widać dziewięć głównych grup. Sześć stron należy do parapetów, dwie do rolet, a osiemnasty adres to druga strona paginacji aglomarmuru.

1. Okna PCV firmy Domel — /kategorie/okna-pcv-domel
2. Drzwi wewnętrzne — /kategorie/drzwi-wewnetrzne
3. Drzwi zewnętrzne — /kategorie/drzwi-zewnetrzne
4. Stolarka aluminiowa — /kategorie/stolarka-aluminiowa
5. Bramy garażowe — /kategorie/bramy-garazowe
6. Parapety i blaty — /kategorie/parapety-blaty
   - Aglomarmur — /kategorie/aglomarmur
     - Dalsze pozycje paginacji: /kategorie/aglomarmur/page/2
   - Granit — /kategorie/granit
   - Marmur — /kategorie/marmur
   - Parapety PCV wewnętrzne — /kategorie/pcv-wewnetrzne
   - Parapety stalowe i aluminiowe zewnętrzne — /kategorie/stalowe-aluminiowe-zewnetrzne
   - Parapety drewniane — /kategorie/drewniane
7. Moskitiery — /kategorie/moskitiery
8. Rolety — /kategorie/rolety
   - Rolety wewnętrzne — /kategorie/wewnetrzne
   - Rolety zewnętrzne — /kategorie/zewnetrzne
9. Żaluzje i plisy — /kategorie/zaluzje-plisy

Uwaga: strona parapetów drewnianych jest dostępna, lecz nie wyświetla produktów. Aglomarmur /page/2 to paginacja, a nie odrębna kategoria.

## Grupy 68 dostępnych stron produktów

Nazwy poniżej odpowiadają nagłówkom przechwyconych stron; po nazwie znajduje się końcówka ścieżki pod /produkty/. Sumy grup zgadzają się z 68 stronami produktów z HTTP 200.

### Okna PCV — 6 stron

Aktywna kategoria Okna PCV firmy Domel wymienia pięć modeli:

- Infinity Passive 83MD — infinity-passive-83md
- Energetic 83MD — energetic-83md
- Vector 82MD — vector-82md
- Fusion — fusion
- Synergic — synergic

Dodatkowa strona produktu:

- Effectline — effectline

Effectline ma własną dostępną stronę, ale nie pojawia się na aktywnej stronie kategorii Domel. Stara kategoria /kategorie/okna-pcv-petecki zwraca 404.

### Drzwi — 2 strony

- Drzwi wewnętrzne: Intenso Doors – drzwi ramiakowe okleinowane — drzwi-wewnetrzne-intenso
- Drzwi zewnętrzne: Wikęd – drzwi zewnętrzne stalowe — wiked-drzwi-zewnetrzne-stalowe

### Stolarka aluminiowa — 3 strony

- Ogrody zimowe — ogrody-zimowe
- Fasady Aluminiowe — fasady
- Okna i drzwi ALU — okna-drzwi-alu

### Bramy garażowe — 3 strony

- Bramy segmentowe — segmentowe
- Bramy rolowane — rolowane
- Bramy uchylne — uchylne

### Parapety — 39 stron

**Aglomarmur — 16**

- Venus — venus
- New Marfil — new-marfil
- Olimpo — olimpo
- Botticino — botticino
- Breccia Aurora — breccia-aurora
- Breccia Oniciata — breccia-oniciata
- Travertino — travertino
- Calacata — calacata
- Nero Portoro — nero-portoro
- Giallo Reale — giallo-reale
- Rosa del Garda — rosa-del-garda
- Rosso Asiago — rosso-asiago
- Espaniola — espaniola
- Polare — polare
- Carrara Micro — carrara-micro
- Verde Alpi — aglomarmur

**Granit — 10**

- Baltic Brown — baltic-brown
- Star Galaxy — star-galaxy
- Kashmir Gold — kashmir-gold
- Nero Zimbabwe — nero-zimbabwe
- Multicolor Red — multicolor-red
- Santiago Red — santiago-red
- New Impala — new-impala
- Yellow Pink — yellow-pink
- New Bianco Cristal — new-bianco-cristal
- Kashmir White — granit

**Marmur — 7**

- Perlato — perlato
- Nero Marquina — nero-marquina
- Forest Green — forest-green
- Forest Brown — forest-brown
- Emperador Dark — emperador-dark
- Crema Marphil — crema-marphil
- Crystal White — marmur

**Parapety PCV wewnętrzne — 2**

- Parapety PCV Nakładka — pcv-nakladka
- Parapety PCV — pcv-wewnetrzne

**Parapety stalowe i aluminiowe zewnętrzne — 4**

- Parapety aluminiowe linia Zaokrąglona — aluminiowe-linia-zaokraglona
- Parapety aluminiowe linia Standard — aluminiowe-linia-standard
- Parapety stalowe linia Zaokrąglona — stalowe-linia-zaokraglona
- Parapety stalowe linia Standard — stalowe-linia-standard

W źródle występuje też kategoria parapetów drewnianych, ale nie ma dla niej strony produktu w dostępnych 68 adresach.

### Moskitiery — 2 strony

- Moskitiery drzwiowe — drzwiowe
- Moskitiery okienne — moskitiery-okienne

### Rolety — 10 stron

**Wewnętrzne — 8**

- DZIEŃ / NOC — dzien-noc-2
- DO OKIEN DACHOWYCH DEKOLUX — do-okien-dachowych-dekolux
- W KASECIE ALU KLAUDIA — w-kasecie-alu-klaudia
- W KASECIE ALU VEGAS PROFIL — w-kasecie-alu-vegas-profil
- W KASECIE ALU VEGAS CLASSIC — w-kasecie-alu-vegas-classic
- W KASECIE PCV VEGAS CLASSIC — w-kasecie-pcv-vegas-classic
- MINI VEGAS — mini-vegas
- MINI SLIM — mini-slim

**Zewnętrzne — 2**

- Aluprof – system podtynkowy INTEGRO — podtynkowe-integro
- Aluprof – system adaptacyjny — adaptacyjne

### Żaluzje i plisy — 3 strony

- Żaluzje drewniane — zaluzje-drewniane
- Żaluzje poziome aluminiowe — zaluzje-poziome-aluminiowe
- Plisy — plisy

## Krótkie wprowadzenie na stronę główną

Poniższy tekst jest parafrazą informacji ze strony głównej oraz podstron Usługi i O firmie:

> WOL-BUD oferuje okna PCV i aluminiowe, drzwi, bramy garażowe, rolety i parapety. Zapewnia doradztwo oraz montaż; pomiar i wycena są bezpłatne i niewiążące.

Źródła: strona główna, /uslugi, /o-firmie. Jako krótkie, bezpośrednie działanie można pokazać telefon 534 091 021. Nie dodawać formularza.

## Dane kontaktowe z witryny

| Punkt / informacja | Dane w źródle |
| --- | --- |
| Telefon główny | 534 091 021 |
| E-mail | biuro@wol-bud.com.pl |
| Plac Targowy Chyszów | ul. Giełdowa 5, 33-100 Tarnów; 14 626 80 32; 534 091 021 |
| Tarnów | ul. Szkotnik 2b, 33-100 Tarnów; 693 870 505; 14 628 84 90 |
| Radłów według strony Nasze sklepy | ul. Leśna 17a, 33-130 Radłów; 609 734 290; 14 678 23 65 |
| Dane firmy na stronie Kontakt | Firma Usługowo–Handlowa „WOL-BUD” Wojciech Wolański; ul. Leśna 17A, 33-130 Radłów; NIP 8731011790 |
| Godziny podane na stronie Nasze sklepy | pon.–pt. 9–17, sob. 9–13, niedz. zamknięte |

Strona Kontakt podaje salon Radłów przy ul. Kolejowej 5 i niepełny numer 609 734 29; strona Nasze sklepy podaje dla Radłowa ul. Leśną 17a i pełny numer 609 734 290. To konflikt wewnątrz źródła — nie łączyć obu adresów w jednej informacji o salonie. W razie prezentowania adresu Radłowa oprzeć się na ustaleniu właściciela. Adres Giełdowa 10 pochodzi z profilu Google Maps, nie z treści witryny.

Strona źródłowa podaje te same godziny dla wszystkich trzech punktów, ale nie oznacza daty aktualizacji. Na stronie kontaktowej należy zachować prostą ścieżkę telefoniczną.

## Kontrola treści ze starego index.html

- **Ocena 4,3/5 i 47 opinii**: potwierdzone bezpośrednio w Google Maps 25.09.2026. Profil pokazuje adres Giełdowa 10; nie jest to adres z treści oficjalnej strony. Linkuj ocenę do właściwej wizytówki.
- **Cztery cytaty i przypisani autorzy z index.html**: nie zostały bezpośrednio potwierdzone w Google. Nie publikować jako opinii Google. Jedna opinia bezpośrednio potwierdzona i zapisana w docs/google-reviews-verified.md należy do Damiana Machalskiego, ma 5/5 i względną datę „rok temu”.
- **Adresy punktów**: Giełdowa 10 w index.html nie występuje na oficjalnej stronie. Radłów ma sprzeczne adresy w dwóch oficjalnych podstronach (Leśna 17a / Kolejowa 5). Nie przedstawiać sprzecznych danych jako jednego adresu.
- **Wiek firmy**: źródło jednocześnie podaje założenie firmy w 1995 r. oraz „25 lat” działalności/doświadczenia. W 2026 r. te komunikaty są niespójne. Nie przenosić na home dynamicznego stażu ani „25 lat” bez potwierdzenia firmy.
- **Ceny i parametry techniczne**: wartości dotyczące drzwi Intenso i okna Infinity Passive 83MD znajdują się na stronach produktów, ale źródło nie podaje daty obowiązywania. Mogą się zmienić; przed wyeksponowaniem ceny lub specyfikacji potwierdzić aktualność i zachować warunki pomiaru podane przy parametrze.
- **Wskazówki zakupowe**: sekwencja „ustaleń przed zamówieniem” oraz polecenia typu „przygotuj wymiary”, „porównaj zakres i termin”, „potwierdź termin” i „zapytaj o serwis po zakupie” nie występują jako taki proces na stronach źródłowych. Usunąć je albo zastąpić parafrazą konkretnych istniejących opisów usług.
- **Potwierdzone marki**: ERKADO, WIKĘD, FILL, Aluprof, Mobilus i Somfy są wymienione na stronie O firmie. Samo potwierdzenie marki na stronie firmy nie oznacza jednak dostępności konkretnego modelu w danej kategorii produktu.
- **Formularz**: oryginalna podstrona Kontakt zawiera pola formularza, ale zgodnie z ustaleniem właściciela nowa strona nie może ich mieć; używać telefonu i opublikowanego adresu e-mail.

## Wskazówki wdrożeniowe

- Pełna treść źródłowa ma pozostać osiągalna na podstronach. Krótka strona główna nie oznacza pominięcia opisów źródłowych.
- Nie dopisywać usług, obietnic, opinii, cen ani danych technicznych. W razie skrócenia zachować pełne zdania albo wiernie parafrazować cały sens.
- Zachować rozdział między kategoriami a stronami produktów. Produkty bez jawnego wpisu w aktywnej kategorii (np. Effectline) nie powinny być po cichu dopisywane do listy tej kategorii.
- Pliki źródłowe opisują też duplikaty i niedostępne adresy; dla treści używać wpisów HTTP 200. Adresy z captureStatus fetch-error zwracają 404 i nie dostarczają treści.
