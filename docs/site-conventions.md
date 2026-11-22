# Konwencje strony WOL-BUD

Źródło: pomiar Testera (Z-001, `panel-v2 @ e5651c3`, pliki w `~/OpenBot/Shared/wolbud/rekonesans/`) i decyzje użytkownika z 2026-11-22 (`docs/decisions.md`, D-001…D-003).
Ten dokument to wzorzec dla mapy dróg dojścia w kodzie, walidatora i przepisów. Gdy kod i ten dokument się różnią, błąd jest w kodzie albo trzeba zmienić decyzję.

## 1. Typy stron

| Typ | Ścieżka | Głębokość / prefiks | Liczba dziś |
|---|---|---|---|
| home | `index.html` | 0 / `""` | 1 |
| główna | `oferta/`, `realizacje/`, `o-firmie/`, `nasze-sklepy/`, `kontakt/` | 1 / `../` | 5 |
| usługa (strona zbiorcza) | `uslugi/index.html` | 1 / `../` | 1 |
| kategoria główna | `kategorie/<slug>/index.html` | 2 / `../../` | 8 |
| podkategoria | `kategorie/<slug>/index.html` (rodzic w modelu, nie w ścieżce) | 2 / `../../` | 5 |
| produkt | `produkty/<slug>/index.html` | 2 / `../../` | 30 |
| promocja | `promocje/<slug>/index.html` | 2 / `../../` | 1 |
| lista promocji | `promocje/index.html` | 1 / `../` | 1 (do przebudowy, D-003) |
| własna | dowolna, ustalana przy tworzeniu | zależnie od ścieżki | 0 (po D-003) |
| przekierowanie | stare adresy w `kategorie/`, `produkty/` | 2–4 | 55 |

Kategorie główne: okna-pcv, drzwi-zewnetrzne (Drzwi wejściowe), drzwi-wewnetrzne, bramy-garazowe, stolarka-aluminiowa, rolety (Osłony okienne), parapety-blaty (Parapety i blaty), moskitiery.
Podkategorie: Osłony okienne → wewnetrzne, zewnetrzne, zaluzje-plisy; Parapety i blaty → parapety-wewnetrzne, parapety-zewnetrzne.
Produkt należy do dokładnie jednej kategorii (pomiar: 0 produktów w więcej niż jednej). Kategoria produktu = kategoria z okruszków i karty `.cat-prod-card`.
Usługi to sekcje (`article.service-card` z id) na `uslugi/index.html`, nie osobne strony.

## 2. Wspólne regiony (do oznaczenia `data-cms-region` w migracji)

| Region | Selektor | Gdzie | Źródło danych po migracji |
|---|---|---|---|
| header | `header.bar` | wszystkie | site-globals (logo, telefon) |
| menu | `nav#site-menu` | wszystkie | site-globals.menu (desktop href + kotwica mobilna) |
| footer | `footer` | wszystkie | site-globals.footer (6 linków) |
| back | `.page-nav-bar .btn-back` | podstrony | model (rodzic strony) |
| breadcrumbs | okruszki w `.page-nav-bar` | podstrony | model (hierarchia, sekcja 4) |
| cat-nav | `.cat-quick-nav` | kategorie i podkategorie | model (lista kategorii głównych + Usługi) |
| sidebar | `aside.subpage-sidebar` | 49 podstron | site-globals (wycena, salony) + model (kategorie) |
| contact | `nav.contact-bubbles`, `#scrollTopBtn`, `#lightboxModal` | wszystkie | site-globals |

Kotwice mobilne menu (`data-mobile-home-href`): `#start`, `#oferta`, `#uslugi`, `#realizacje`, `#ofirmie`, `#nasze-sklepy`, `#kontakt`. Wszystkie istnieją w `index.html` i muszą istnieć zawsze.
`realizacje/index.html` używa klasy `.cat-quick-nav` do kotwic galerii: to nie jest region cat-nav (migracja musi je rozróżnić).
Ścieżki względne: prefiks = `../` × głębokość. Silnik synchronizacji liczy je dla każdej strony.

## 3. Mapa dróg dojścia

Każdy przepis „utwórz / zmień adres / usuń” dodaje albo sprząta wszystkie pozycje z wiersza swojego typu. Walidator sprawdza komplet.

| Typ | Musi do niej prowadzić |
|---|---|
| główna | menu desktop + kotwica mobilna na home; stopka (gdy jest w site-globals.footer); sitemap; manifest |
| kategoria główna | kafel `.home-cat-card` na home; kafel `.home-cat-card` na Ofercie; pigułka w `.cat-quick-nav` na każdej kategorii i podkategorii; link w boksie kategorii sidebaru; okruszki dzieci; sitemap; manifest |
| podkategoria | karta `.subcat-card` na stronie rodzica; na home i na Ofercie **kafel albo pigułka** (ustawienie `homeDisplay: tile/pill`, D-001); okruszki dzieci; sitemap; manifest. Nie trafia do `.cat-quick-nav` ani do sidebaru |
| produkt | karta `.cat-prod-card` w swojej kategorii; `nav.product-nav-bar` sąsiadów (poprzedni / następny w kolejności kategorii) i własny link „Wszystkie z kategorii”; okruszki; sitemap; manifest |
| promocja | wpis na liście promocji `promocje/index.html`; opcjonalnie baner lub kafel na home (wybór klienta); sitemap; manifest |
| usługa (sekcja) | `article.service-card#<id>` na `uslugi/`; karta `.home-service-item` na home |
| własna | brak konwencji: asystent pyta (ASK), skąd ma prowadzić (menu, stopka, kafel na wskazanej stronie, tylko link w treści); bez wybranego miejsca strona nie powstaje, bo musi być osiągalna |
| przekierowanie | nic; nie występuje w sitemap ani w liście stron manifestu |

Ustawienie `homeDisplay` przy nowej podkategorii: w formularzu domyślnie „pigułka”; asystent AI pyta, gdy polecenie tego nie przesądza.

## 4. Okruszki (D-002: pełna ścieżka)

Wzór: `Strona główna / Oferta / [kategoria nadrzędna] / Kategoria / Produkt`. Ostatni element to `<span aria-current="page">`, pozostałe to linki, separator `<span>/</span>`.

| Typ | Okruszki |
|---|---|
| główna, usługa | Strona główna / Tytuł |
| kategoria główna | Strona główna / Oferta / Kategoria |
| podkategoria | Strona główna / Oferta / Kategoria nadrzędna / Podkategoria |
| produkt | Strona główna / Oferta / [nadrzędna] / Kategoria / Produkt |
| promocja | Strona główna / Promocje / Promocja |

Link „Strona główna” ma `data-home-link` i prowadzi do kotwicy sekcji home, z której strona pochodzi (kategorie i produkty `#oferta`, O firmie `#ofirmie`, Nasze sklepy `#nasze-sklepy`, Kontakt `#kontakt`, Realizacje `#realizacje`, Usługi i promocje `#uslugi`).

## 5. Umiejscowienie nowych sekcji

Kolejność zmierzona na stronach każdego typu (`rekonesans/umiejscowienie.md`):
- podstrony: `.page-nav-bar → header.subpage-head → [.cat-quick-nav] → .subpage-grid (treść || sidebar) → .cta-banner-dark`. Nowa sekcja treści trafia do kolumny treści `.subpage-grid`, po ostatniej sekcji tego samego rodzaju, zawsze przed `.cta-banner-dark`;
- produkt: przed `nav.product-nav-bar`;
- kategoria: siatka `.cat-products-grid` / `.subcat-grid` zostaje pierwszym blokiem treści, nowe sekcje idą za nią;
- home: kolejność `hero → trust → oferta → opinie → photo-band → kontakt`. Brak jednej reguły, więc asystent pyta, między którymi sekcjami wstawić, chyba że polecenie to wskazuje.
Nowe sekcje i elementy powstają tylko z katalogu komponentów (`rekonesans/katalog-komponentow.md`, 33 komponenty z klasami z `site.css`).

## 6. Znane wyjątki i porządki migracji

- 3 strony testowe (D-003): `kategorie/drewniane/`, `produkty/index.html`; usuwane w migracji z przekierowaniem (stare adresy działają). `promocje/index.html` przebudowuje przepis listy promocji.
- 55 przekierowań jest dziś w `sitemap.xml` i w `cms-manifest.json` jako strony: po migracji tylko w osobnej liście przekierowań manifestu (niezmiennik „sitemap = strony publiczne”).
- 41 linków wewnętrznych prowadzi do przekierowań (głównie z `produkty/index.html`): migracja kieruje je wprost do celu.
- `produkty/parapet-mdf-laminowany/`: obraz `lacznik-parapetow-MDF.webp` bez `alt`. Tekst podaje klient; do tego czasu walidator zgłasza ostrzeżenie, nie błąd.
- Okruszki do poprawienia według sekcji 4: `kategorie/drewniane` (usuwana), `nasze-sklepy` (`#kontakt` → `#nasze-sklepy`), `promocje/cieply-montaz…` (pod Usługami → pod Promocjami), wszystkie podkategorie i produkty (dochodzi Oferta i rodzic).
- Pasek `.cat-quick-nav` i sidebar: „Żaluzje i plisy” wypada (podkategoria, D-001); zostaje 8 kategorii głównych + Usługi.
- `<link rel="canonical">`: 0/54. Decyzja w kontrakcie SEO (faza 1).
