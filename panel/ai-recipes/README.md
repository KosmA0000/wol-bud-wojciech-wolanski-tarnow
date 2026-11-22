# Przepisy AI (stary panel)

Jedno polecenie klienta = jeden przepis = cały łańcuch powiązanych zmian (strona, kafelki, menu, pigułki, okruszki, linki).
AI nie wymyśla wyglądu: każdy przepis KLONUJE istniejący element tego samego typu (sąsiedni kafelek, siostrzana strona) i podmienia tylko teksty, linki i zdjęcia.
Przed zmianą przepis sam sprawdza, z czym element się łączy. Gdy brakuje decyzji klienta (np. podkategoria czy produkt), zwraca
`{ ok: false, needsAnswer: 'Pytanie po polsku?', options: ['A', 'B'] }` — AI zadaje to pytanie klientowi i woła przepis jeszcze raz.

Moduł: `export const tools = [{ name, description, parameters }]` (JSON Schema, opisy po polsku) i `export async function run(name, args, ctx)`.
Wynik: `{ ok: true, summary: 'Co zrobiłem, po ludzku', changedPages: [...] }` albo `{ ok: false, error }` / `needsAnswer`.
Cofanie całej operacji robi `index.js` sam (zapamiętuje stan każdej strony przed `writePage`/`deletePage` i menu przed `setGlobals`).

## ctx (z editor.js)
- `listPages()` → `[{ path, label, title, group }]` (bez usuniętych; ścieżki typu `kategorie/okna-pcv/index.html`)
- `readPage(path)` → `Promise<string|null>` HTML (szkic, a jak go nie ma — opublikowana wersja)
- `writePage(path, html, { label?, group?, title?, description? })` → zapis do szkicu (jak edycja ręczna; nowa ścieżka = nowa strona)
- `deletePage(path)` → usunięcie strony (szkic)
- `getGlobals()` / `setGlobals(g)` → menu (`menu: [{label, href, mobileHref}]`), stopka (`footerLinks`), `phoneDisplay`, `phoneHref`, `email`, `facebookUrl`…
- `parse(html)` → `Document`; `serialize(doc)` → HTML z `<!doctype html>`
- `rebaseUrls(html, fromPath, toPath)` → przepina względne linki/zdjęcia przy kopiowaniu strony do innego folderu
- `slugify(text)` → `okna-pcv`
- `wireOfferTiles({ targetPagePath, title, ctaLabel, ofertaTileStyle })` → istniejąca funkcja starego panelu: kafelek w sekcji Oferta na `index.html` i `oferta/index.html`
- `reloadCurrent()` → odświeża podgląd

Mapa strony i zależności: `Shared/wolbud/site-conventions.md` (typy stron, regiony, drogi dojścia, okruszki, sekcja 7 — co trzeba zmienić przy każdej zmianie).
Sitemap.xml i manifest generuje publikacja sama — nie ruszaj.
