# Zasoby graficzne WOL-BUD

Inwentaryzacja publicznych grafik dostępnych na [wol-bud.com.pl](https://wol-bud.com.pl/), pobranych do `public/assets/source/`. Wszystkie wymiary poniżej zmierzono na pobranych plikach. Adresy w tabelach prowadzą do użytego pliku źródłowego; strony źródłowe wskazano osobno.

## Nazwa i logo firmy

Na stronie nie ma osobnego pliku logo WOL-BUD. Nagłówek używa tekstowego elementu `h1#logo`, a sam znak jest wtopiony w tło strony głównej `style/img/home.jpg` (1920 × 1405 px). Znak ma kolorowy obszar około **x=500–648, y=30–69 px**. Można go pokazać bez tworzenia nowego logo jako wycinek CSS z `background-image`, z prostokątem około 170 × 60 px i `background-position: -490px -20px` przy naturalnym `background-size: 1920px 1405px`.

Ograniczenia: tło jest nieprzezroczystym JPG z białym polem wokół znaku, więc crop pasuje do jasnego nagłówka i nie nadaje się na ciemne tło. Sam znak ma około 149 × 40 px w rozdzielczości źródłowej; dobrze użyć go w podobnym lub mniejszym rozmiarze, bo powiększanie uwidoczni piksele. W tym samym obrazie pozostaje reszta starego tła, dlatego element musi mieć stałe wymiary i właściwe przesunięcie.

| Plik | URL źródłowy | Rodzaj / opis | Wymiary |
|---|---|---|---:|
| [ui/background-home.jpg](../public/assets/source/ui/background-home.jpg) | https://wol-bud.com.pl/style/img/home.jpg | Tło starej strony; zawiera osadzony znak WOL-BUD opisany wyżej. | 1920 × 1405 |
| [wolbud/wolbud-cieply-montaz-banner.png](../public/assets/source/wolbud/wolbud-cieply-montaz-banner.png) | https://wol-bud.com.pl/wp-content/uploads/2016/10/wolbud-szablon-web1-645x360.png | Grafika promująca ciepły montaż, używana w slajderze strony głównej i nagłówkach podstron. | 645 × 360 |
| [wolbud/wolbud-siedziba.jpg](../public/assets/source/wolbud/wolbud-siedziba.jpg) | https://wol-bud.com.pl/gallery/aboutrm.jpg | Zdjęcie opisane na stronie jako „Nasza firma”; fotografia wnętrza hali/magazynu. | 168 × 200 |

## Salony

Zdjęcia występują na podstronie [Nasze sklepy](https://wol-bud.com.pl/nasze-sklepy). To niewielkie pliki źródłowe (około 212 × 216 px), więc lepiej prezentować je w małych kartach niż powiększać na pełny ekran.

| Plik | URL źródłowy | Rodzaj / opis | Wymiary |
|---|---|---|---:|
| [stores/salon-tarnow-chyszow.jpg](../public/assets/source/stores/salon-tarnow-chyszow.jpg) | https://wol-bud.com.pl/gallery/chyszow.jpg | Salon Tarnów-Chyszów, ul. Giełdowa 5. | 212 × 216 |
| [stores/salon-tarnow-szkotnik.jpg](../public/assets/source/stores/salon-tarnow-szkotnik.jpg) | https://wol-bud.com.pl/gallery/tarnow.jpg | Salon w Tarnowie, ul. Szkotnik 2b. | 212 × 216 |
| [stores/salon-radlow.jpg](../public/assets/source/stores/salon-radlow.jpg) | https://wol-bud.com.pl/gallery/radlow.jpg | Punkt w Radłowie. | 213 × 216 |

## Produkty

To zdjęcia katalogowe produktów i przykładów asortymentu. Nie przedstawiają wykonanych realizacji WOL-BUD. Źródła znajdują się na wskazanych kartach produktu lub kategorii.

| Plik | URL źródłowy | Rodzaj / opis | Wymiary |
|---|---|---|---:|
| [products/okno-infinity-passive-83md.jpg](../public/assets/source/products/okno-infinity-passive-83md.jpg) | https://wol-bud.com.pl/wp-content/uploads/2013/09/infinity-passive-476x600.jpg | Okno DOMEL Infinity Passive 83MD. [Karta produktu](https://wol-bud.com.pl/produkty/infinity-passive-83md) | 476 × 600 |
| [products/drzwi-zewnetrzne-wiked.jpg](../public/assets/source/products/drzwi-zewnetrzne-wiked.jpg) | https://wol-bud.com.pl/wp-content/uploads/2013/09/wik%C4%99d-600x600.jpg | Drzwi zewnętrzne WIKĘD. [Karta produktu](https://wol-bud.com.pl/produkty/wiked-drzwi-zewnetrzne-stalowe) | 600 × 600 |
| [products/drzwi-wewnetrzne-malaga-w5.png](../public/assets/source/products/drzwi-wewnetrzne-malaga-w5.png) | https://wol-bud.com.pl/wp-content/uploads/2013/09/Malaga-W-5-277x600.png | Model drzwi wewnętrznych INTENSO Malaga W-5. [Karta produktu](https://wol-bud.com.pl/produkty/drzwi-wewnetrzne-intenso) | 277 × 600 |
| [products/brama-segmentowa.jpg](../public/assets/source/products/brama-segmentowa.jpg) | https://wol-bud.com.pl/wp-content/uploads/2013/08/brama-garazowa.jpg | Brama garażowa segmentowa. | 300 × 400 |
| [products/brama-rolowana.jpg](../public/assets/source/products/brama-rolowana.jpg) | https://wol-bud.com.pl/wp-content/uploads/2013/08/brama-garazowa-rolowana.jpg | Brama garażowa rolowana. | 344 × 459 |
| [products/brama-uchylna.jpg](../public/assets/source/products/brama-uchylna.jpg) | https://wol-bud.com.pl/wp-content/uploads/2013/08/brama-garazowa-uchylna1.jpg | Brama garażowa uchylna. | 610 × 413 |
| [products/ogrod-zimowy.jpg](../public/assets/source/products/ogrod-zimowy.jpg) | https://wol-bud.com.pl/wp-content/uploads/2013/08/ogr%C3%B3d1-390x600.jpg | Przykład konstrukcji ogrodu zimowego. | 390 × 600 |
| [products/fasada-aluminiowa.jpg](../public/assets/source/products/fasada-aluminiowa.jpg) | https://wol-bud.com.pl/wp-content/uploads/2013/08/fasady1-449x600.jpg | Przykład fasady aluminiowej. | 449 × 600 |
| [products/moskitiera-okienna.jpg](../public/assets/source/products/moskitiera-okienna.jpg) | https://wol-bud.com.pl/wp-content/uploads/2013/08/moskitiera-ramkowa-okienna-458x600.jpg | Moskitiera okienna. | 458 × 600 |
| [products/moskitiera-przeciw-owadom.jpg](../public/assets/source/products/moskitiera-przeciw-owadom.jpg) | https://wol-bud.com.pl/wp-content/uploads/2013/08/moskitiery-przeciw-owadom.jpg | Zdjęcie z karty moskitier okiennych. | 440 × 328 |
| [products/roleta-dzien-noc.jpg](../public/assets/source/products/roleta-dzien-noc.jpg) | https://wol-bud.com.pl/wp-content/uploads/2015/07/dzien-noc-1.jpg | Rolety wewnętrzne dzień i noc. | 710 × 474 |
| [products/zaluzje-drewniane.jpg](../public/assets/source/products/zaluzje-drewniane.jpg) | https://wol-bud.com.pl/wp-content/uploads/2015/07/zaluzje-drewniane-1.jpg | Żaluzje drewniane. | 710 × 474 |
| [products/plisy.png](../public/assets/source/products/plisy.png) | https://wol-bud.com.pl/wp-content/uploads/2015/07/plisy-1.png | Plisy. | 710 × 473 |

## Montaż

Zdjęcia pochodzą z podstrony [Ciepły montaż warstwowy okien i drzwi](https://wol-bud.com.pl/promocje/cieply-montaz-warstwowy-okien-drzwi). Dokumentują etapy prac montażowych; nie należy opisywać ich jako galerii ukończonych realizacji.

| Plik | URL źródłowy | Rodzaj / opis | Wymiary |
|---|---|---|---:|
| [montage/wyrownanie-otworow-01.jpg](../public/assets/source/montage/wyrownanie-otworow-01.jpg) | https://wol-bud.com.pl/wp-content/uploads/2016/10/wyr%C3%B3wnanie-otwor%C3%B3w-1.jpg | Etap przygotowania otworu. | 1844 × 1383 |
| [montage/wyrownanie-otworow-02.jpg](../public/assets/source/montage/wyrownanie-otworow-02.jpg) | https://wol-bud.com.pl/wp-content/uploads/2016/10/wyr%C3%B3wnanie-otwor%C3%B3w-2.jpg | Etap przygotowania otworu. | 1844 × 1383 |
| [montage/wyklejanie-folii-01.jpg](../public/assets/source/montage/wyklejanie-folii-01.jpg) | https://wol-bud.com.pl/wp-content/uploads/2016/10/wyklejanie-folii.jpg | Przyklejanie folii montażowej. | 1844 × 1383 |
| [montage/wyklejanie-folii-02.jpg](../public/assets/source/montage/wyklejanie-folii-02.jpg) | https://wol-bud.com.pl/wp-content/uploads/2016/10/wyklejanie-folii-1.jpg | Przyklejanie folii montażowej. | 853 × 1521 |
| [montage/zabezpieczenie-folii-01.jpg](../public/assets/source/montage/zabezpieczenie-folii-01.jpg) | https://wol-bud.com.pl/wp-content/uploads/2016/10/zabezpieczenie-folii.jpg | Zabezpieczenie folii montażowej. | 1844 × 1383 |
| [montage/zabezpieczenie-folii-02.jpg](../public/assets/source/montage/zabezpieczenie-folii-02.jpg) | https://wol-bud.com.pl/wp-content/uploads/2016/10/zabezpieczenie-folii-2.jpg | Zabezpieczenie folii montażowej. | 1844 × 1383 |
| [montage/zabezpieczenie-folii-od-zewnatrz-01.jpg](../public/assets/source/montage/zabezpieczenie-folii-od-zewnatrz-01.jpg) | https://wol-bud.com.pl/wp-content/uploads/2016/10/zabezpieczenie-folii-od-zewn%C4%85trz-1.jpg | Zabezpieczenie od zewnętrznej strony. | 1521 × 853 |
| [montage/zabezpieczenie-folii-od-zewnatrz-02.jpg](../public/assets/source/montage/zabezpieczenie-folii-od-zewnatrz-02.jpg) | https://wol-bud.com.pl/wp-content/uploads/2016/10/zabezpieczenie-folii-od-zewn%C4%85trz-2.jpg | Zabezpieczenie od zewnętrznej strony. | 2112 × 1184 |
| [montage/termoparapet-okienny.jpg](../public/assets/source/montage/termoparapet-okienny.jpg) | https://wol-bud.com.pl/wp-content/uploads/2016/10/termoparapet-okienny.jpg | Montaż termoparapetu okiennego. | 1867 × 1401 |
| [montage/termoparapet-balkonowy.jpg](../public/assets/source/montage/termoparapet-balkonowy.jpg) | https://wol-bud.com.pl/wp-content/uploads/2016/10/termoparapet-balkonowy.jpg | Montaż termoparapetu balkonowego. | 1844 × 1383 |
| [montage/termoparapet-drzwi-hst.jpg](../public/assets/source/montage/termoparapet-drzwi-hst.jpg) | https://wol-bud.com.pl/wp-content/uploads/2016/10/klinaryt-drzwi-HST.jpg | Montaż przy drzwiach HST. | 1844 × 1383 |

## Referencje

Podstrona [O firmie](https://wol-bud.com.pl/o-firmie) prezentuje 15 zeskanowanych referencji pod numerami 1–15. Pobrane pliki mają oryginalne wymiary 2481 × 3509 px. Na źródłowej stronie nie podano tekstowych nazw ani opisów dla skanów poza numerami. Jeśli pokażesz je publicznie, zastosuj miniatury z możliwością powiększenia i sprawdź, czy skany nie ujawniają danych, których firma nie chce eksponować.

| Plik | URL źródłowy | Rodzaj / opis | Wymiary |
|---|---|---|---:|
| [references/referencja-01.jpg](../public/assets/source/references/referencja-01.jpg) | https://wol-bud.com.pl/wp-content/uploads/2013/08/1.jpg | Skan referencji nr 1. | 2481 × 3509 |
| [references/referencja-02.jpg](../public/assets/source/references/referencja-02.jpg) | https://wol-bud.com.pl/wp-content/uploads/2013/08/2.jpg | Skan referencji nr 2. | 2481 × 3509 |
| [references/referencja-03.jpg](../public/assets/source/references/referencja-03.jpg) | https://wol-bud.com.pl/wp-content/uploads/2013/08/3.jpg | Skan referencji nr 3. | 2481 × 3509 |
| [references/referencja-04.jpg](../public/assets/source/references/referencja-04.jpg) | https://wol-bud.com.pl/wp-content/uploads/2013/08/4.jpg | Skan referencji nr 4. | 2481 × 3509 |
| [references/referencja-05.jpg](../public/assets/source/references/referencja-05.jpg) | https://wol-bud.com.pl/wp-content/uploads/2013/08/5.jpg | Skan referencji nr 5. | 2481 × 3509 |
| [references/referencja-06.jpg](../public/assets/source/references/referencja-06.jpg) | https://wol-bud.com.pl/wp-content/uploads/2013/08/6.jpg | Skan referencji nr 6. | 2481 × 3509 |
| [references/referencja-07.jpg](../public/assets/source/references/referencja-07.jpg) | https://wol-bud.com.pl/wp-content/uploads/2013/08/7.jpg | Skan referencji nr 7. | 2481 × 3509 |
| [references/referencja-08.jpg](../public/assets/source/references/referencja-08.jpg) | https://wol-bud.com.pl/wp-content/uploads/2013/08/8.jpg | Skan referencji nr 8. | 2481 × 3509 |
| [references/referencja-09.jpg](../public/assets/source/references/referencja-09.jpg) | https://wol-bud.com.pl/wp-content/uploads/2013/08/9.jpg | Skan referencji nr 9. | 2481 × 3509 |
| [references/referencja-10.jpg](../public/assets/source/references/referencja-10.jpg) | https://wol-bud.com.pl/wp-content/uploads/2013/08/10.jpg | Skan referencji nr 10. | 2481 × 3509 |
| [references/referencja-11.jpg](../public/assets/source/references/referencja-11.jpg) | https://wol-bud.com.pl/wp-content/uploads/2013/08/11.jpg | Skan referencji nr 11. | 2481 × 3509 |
| [references/referencja-12.jpg](../public/assets/source/references/referencja-12.jpg) | https://wol-bud.com.pl/wp-content/uploads/2013/08/12.jpg | Skan referencji nr 12. | 2481 × 3509 |
| [references/referencja-13.jpg](../public/assets/source/references/referencja-13.jpg) | https://wol-bud.com.pl/wp-content/uploads/2013/08/13.jpg | Skan referencji nr 13. | 2481 × 3509 |
| [references/referencja-14.jpg](../public/assets/source/references/referencja-14.jpg) | https://wol-bud.com.pl/wp-content/uploads/2013/08/14.jpg | Skan referencji nr 14. | 2481 × 3509 |
| [references/referencja-15.jpg](../public/assets/source/references/referencja-15.jpg) | https://wol-bud.com.pl/wp-content/uploads/2013/08/15.jpg | Skan referencji nr 15. | 2481 × 3509 |

## Logo partnerów

Na stronie głównej w sekcji partnerów dostępne są poniższe znaki. To marki dostawców, nie logo WOL-BUD.

| Plik | URL źródłowy | Rodzaj / opis | Wymiary |
|---|---|---|---:|
| [partners/partner-domel.jpg](../public/assets/source/partners/partner-domel.jpg) | https://wol-bud.com.pl/wp-content/uploads/2013/07/logo-domel-180x59.jpg | Logo DOMEL. | 180 × 59 |
| [partners/partner-fill.png](../public/assets/source/partners/partner-fill.png) | https://wol-bud.com.pl/wp-content/uploads/2013/07/logo.png | Logo FILL (plik rozpoznany po znaku). | 171 × 82 |
| [partners/partner-wiked.jpg](../public/assets/source/partners/partner-wiked.jpg) | https://wol-bud.com.pl/wp-content/uploads/2013/07/logo-wiked-180x72.jpg | Logo WIKĘD. | 180 × 72 |
| [partners/partner-erkado.jpg](../public/assets/source/partners/partner-erkado.jpg) | https://wol-bud.com.pl/wp-content/uploads/2013/07/erkado_logo-180x22.jpg | Logo ERKADO. | 180 × 22 |
| [partners/partner-intenso.jpg](../public/assets/source/partners/partner-intenso.jpg) | https://wol-bud.com.pl/wp-content/uploads/2013/07/intenso-logo-154x112.jpg | Logo INTENSO. | 154 × 112 |
| [partners/partner-lagrus.jpg](../public/assets/source/partners/partner-lagrus.jpg) | https://wol-bud.com.pl/wp-content/uploads/2013/07/logo-lagrus-112x112.jpg | Logo LAGRUS; znak widoczny w sekcji partnerów na stronie głównej. | 112 × 112 |

## Ikony i sprites źródłowej witryny

Arkusz `/style/screen.css` używa małych bitmap do elementów nawigacyjnych i dekoracji. Nie znaleziono osobnego, pełnego zestawu ikon SVG. Pliki poniżej są bitmapowymi sprite'ami starej strony; mogą służyć jako odniesienie, ale nie są potrzebne do odtworzenia nowego interfejsu.

| Plik | URL źródłowy | Rodzaj / opis | Wymiary |
|---|---|---|---:|
| [ui/sprite-lokalizacje.png](../public/assets/source/ui/sprite-lokalizacje.png) | https://wol-bud.com.pl/style/img/lokalizacje.png | Sprite znaczników lokalizacji i telefonu używanych przy punktach sprzedaży. | 21 × 117 |
| [ui/sprite-partnerzy.png](../public/assets/source/ui/sprite-partnerzy.png) | https://wol-bud.com.pl/style/img/partnerzy.png | Sprite/dekoracja sekcji partnerów. | 213 × 217 |
| [ui/icon-offer-list.png](../public/assets/source/ui/icon-offer-list.png) | https://wol-bud.com.pl/style/img/offerli.png | Dekoracyjny element listy oferty. | 159 × 302 |

## Zakres i dostępność

- Przejrzano stronę główną, kategorię oferty, strony produktów, „O firmie”, „Usługi”, „Nasze sklepy”, „Kontakt” oraz stronę o ciepłym montażu.
- Strona nie udostępnia galerii zdjęć ukończonych realizacji. Dostępne materiały to osobno: produkty katalogowe, salony, zdjęcie firmy, etapy montażu i skany referencji. Te kategorie zachowano w nazwach lokalnych folderów.
- Nie pobrano zdjęcia moskitiery drzwiowej: bezpośrednie źródła wskazywane przez stronę zwracają 404. Dostępne jest zdjęcie moskitier okiennych.
- Osobny adres `logo_petecki.jpg`, który pojawia się w odnośnikach witryny, zwraca 404. Nie jest dołączony.
- W witrynie nie znaleziono samodzielnego pliku logo WOL-BUD ani dedykowanej galerii ukończonych prac. Znak osadzony w `home.jpg` jest jedynym znalezionym źródłem logo firmy.
