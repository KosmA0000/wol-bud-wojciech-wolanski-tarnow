import { RECIPE_TOOLS } from './ai-recipes/index.js?v=20261122-turbo5';
import { AI_SYSTEM_PROMPT } from './ai-prompt.js?v=20261122-turbo5';

const STORAGE_KEY = 'wolbud:cms:ai-settings';

export const DEFAULT_AI_SETTINGS = Object.freeze({
  provider: 'gemini',
  model: 'gemini-4-hydrogen',
  apiKey: '',
  proxyUrl: './ai-proxy.php',
});

export const AI_MODELS = Object.freeze({
  gemini: [
    { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen (HIGH)' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  ],
  openai: [
    { id: 'gpt-4.1', label: 'GPT-4.1' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
  ],
  openrouter: [
    { id: 'nvidia/nemotron-3.5-super-vl:free', label: 'Nemotron 3.5 Super VL (free)' },
  ],
});

// 37 narzędzi starego panelu (wykonawca: executeAiTool w editor.js)
export const AI_TOOLS = Object.freeze([
  {
    name: 'get_page_structure',
    description:
      'Zwraca ścieżkę bieżącej strony, metadane SEO (title, description) oraz drzewo wszystkich sekcji, repeaterów i elementów wraz z ich uid, etykietami, ID i stanem ukrycia.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_element_details',
    description:
      'Zwraca szczegółowe pola tekstowe (textFields z key i aktualnym value), linki (links), zdjęcie (image), gwiazdki (stars) i kontenery dzieci (childRepeaters) dla wskazanego uid.',
    parameters: {
      type: 'object',
      properties: {
        uid: {
          type: 'string',
          description: 'Unikalny identyfikator elementu lub sekcji (uid z get_page_structure).',
        },
      },
      required: ['uid'],
    },
  },
  {
    name: 'update_element_text',
    description:
      'Zmienia treść tekstową na wskazanej sekcji lub kafelku. Możesz zmienić jedno pole (fieldKey + value) ALBO wiele pól naraz w jednym wywołaniu przez obiekt fields (np. { eyebrow: "...", title: "...", text: "..." }) — preferuj fields dla szybkości!',
    parameters: {
      type: 'object',
      properties: {
        uid: {
          type: 'string',
          description: 'Identyfikator uid sekcji lub elementu.',
        },
        fieldKey: {
          type: 'string',
          description: 'Klucz pojedynczego pola tekstowego (opcjonalny, jeśli podajesz fields).',
        },
        value: {
          type: 'string',
          description: 'Nowa treść tekstowa po polsku dla pojedynczego fieldKey.',
        },
        fields: {
          type: 'object',
          description: 'Mapa wielu pól do aktualizacji w JEDNYM wywołaniu, np. { "eyebrow": "Promocja", "title": "Rabat -15%", "text": "Opis..." }.',
        },
      },
      required: ['uid'],
    },
  },
  {
    name: 'update_element_link',
    description:
      'Ustawia lub zmienia link na przycisku, karcie albo elemencie (np. uslugi/index.html, promocje/jesien/index.html, #kontakt, tel:+48534091021, mailto:..., https://...).',
    parameters: {
      type: 'object',
      properties: {
        uid: {
          type: 'string',
          description: 'Identyfikator uid elementu zawierającego link.',
        },
        href: {
          type: 'string',
          description: 'Docelowy adres linku (ścieżka podstrony od katalogu głównego, kotwica #..., tel:, mailto: lub https://...).',
        },
        target: {
          type: 'string',
          description: 'Opcjonalny atrybut target: "_blank" dla otwierania w nowej karcie albo pusty ciąg dla bieżącej karty.',
        },
        text: {
          type: 'string',
          description: 'Opcjonalny nowy tekst etykiety zwykłego przycisku/linku.',
        },
        linkIndex: {
          type: 'integer',
          description: 'Indeks linku w elemencie (domyślnie 0, gdy element ma więcej niż jeden przycisk/link).',
        },
      },
      required: ['uid', 'href'],
    },
  },
  {
    name: 'update_element_image',
    description:
      'Ustawia zdjęcie w kafelku, sekcji lub banerze na podstawie rzeczywistej ścieżki z biblioteki (search_images) oraz opcjonalny opis alt.',
    parameters: {
      type: 'object',
      properties: {
        uid: {
          type: 'string',
          description: 'Identyfikator uid elementu ze zdjęciem.',
        },
        imagePath: {
          type: 'string',
          description: 'Prawdziwa ścieżka obrazu zwrócona przez search_images (np. img/products/okna-alu-przesuwne.webp lub img/uploads/...).',
        },
        alt: {
          type: 'string',
          description: 'Opcjonalny opis alternatywny zdjęcia (alt) przyjazny SEO i dostępności.',
        },
      },
      required: ['uid', 'imagePath'],
    },
  },
  {
    name: 'update_review_stars',
    description: 'Ustawia ocenę od 1 do 5 gwiazdek na karcie opinii klienta.',
    parameters: {
      type: 'object',
      properties: {
        uid: {
          type: 'string',
          description: 'Identyfikator uid karty opinii.',
        },
        stars: {
          type: 'integer',
          description: 'Liczba gwiazdek od 1 do 5.',
        },
      },
      required: ['uid', 'stars'],
    },
  },
  {
    name: 'move_element',
    description: 'Przesuwa sekcję lub kafelek w wybranym kierunku w obrębie listy/siatki.',
    parameters: {
      type: 'object',
      properties: {
        uid: {
          type: 'string',
          description: 'Identyfikator uid sekcji lub kafelka do przesunięcia.',
        },
        direction: {
          type: 'string',
          enum: ['up', 'down', 'left', 'right'],
          description: 'Kierunek przesunięcia: up, down, left lub right.',
        },
      },
      required: ['uid', 'direction'],
    },
  },
  {
    name: 'toggle_element_visibility',
    description: 'Ukrywa widoczną sekcję/element lub odkrywa wcześniej ukrytą sekcję/element.',
    parameters: {
      type: 'object',
      properties: {
        uid: {
          type: 'string',
          description: 'Identyfikator uid sekcji lub elementu.',
        },
      },
      required: ['uid'],
    },
  },
  {
    name: 'duplicate_element',
    description: 'Duplikuje wskazaną sekcję lub kafelek i zwraca newUid nowej kopii.',
    parameters: {
      type: 'object',
      properties: {
        uid: {
          type: 'string',
          description: 'Identyfikator uid sekcji lub elementu do zduplikowania.',
        },
      },
      required: ['uid'],
    },
  },
  {
    name: 'delete_element',
    description: 'Usuwa wskazaną sekcję lub kafelek z bieżącej strony (zmianę można cofnąć).',
    parameters: {
      type: 'object',
      properties: {
        uid: {
          type: 'string',
          description: 'Identyfikator uid sekcji lub elementu do usunięcia.',
        },
      },
      required: ['uid'],
    },
  },
  {
    name: 'add_section',
    description:
      'Dodaje nową gotową sekcję WOL-BUD do bieżącej strony i zwraca newUid, strukturę sekcji oraz jej pola tekstowe do natychmiastowej edycji.',
    parameters: {
      type: 'object',
      properties: {
        templateId: {
          type: 'string',
          enum: [
            'catalog-grid',
            'services-grid',
            'featured-products',
            'trust-about',
            'cta-banner',
            'realizations',
            'partners',
            'reviews',
            'text-article',
            'faq-accordion',
            'single-photo',
            'photo-gallery',
          ],
          description: 'Identyfikator szablonu sekcji WOL-BUD.',
        },
        afterSectionUid: {
          type: 'string',
          description: 'Opcjonalny uid sekcji, po której ma zostać wstawiona nowa sekcja (brak = na końcu strony).',
        },
      },
      required: ['templateId'],
    },
  },
  {
    name: 'add_item',
    description:
      'Dodaje nowy kafelek, usługę, opinię, zdjęcie, partnera, profil lub salon w kontenerze repeaterUid i zwraca newUid wraz z jego textFields do natychmiastowej edycji.',
    parameters: {
      type: 'object',
      properties: {
        repeaterUid: {
          type: 'string',
          description: 'Identyfikator uid kontenera powtarzalnego (repeatera) pobrany z get_page_structure lub get_element_details.',
        },
        itemType: {
          type: 'string',
          description: 'Opcjonalny typ dodawanego elementu, jeśli kontener obsługuje warianty.',
        },
        fields: {
          type: 'object',
          description: 'Opcjonalna mapa pól tekstowych do ustawienia od razu na nowym kafelku (np. { "title": "Pergole tarasowe", "cta": "Zobacz ofertę" }).',
        },
        href: {
          type: 'string',
          description: 'Opcjonalny link docelowy do podpięcia od razu pod nowy kafelek (np. "kategorie/pergole/index.html").',
        },
      },
      required: ['repeaterUid'],
    },
  },
  {
    name: 'add_text_block',
    description:
      'Dodaje nowy akapit (paragraph) lub punkt listy (list-item) wewnątrz wybranej sekcji/artykułu i wpisuje podany tekst.',
    parameters: {
      type: 'object',
      properties: {
        uid: {
          type: 'string',
          description: 'Identyfikator uid sekcji lub kontenera tekstowego.',
        },
        blockType: {
          type: 'string',
          enum: ['paragraph', 'list-item'],
          description: 'Typ bloku: "paragraph" (akapit) lub "list-item" (punkt listy).',
        },
        text: {
          type: 'string',
          description: 'Treść nowego akapitu lub punktu listy.',
        },
      },
      required: ['uid', 'blockType', 'text'],
    },
  },
  {
    name: 'set_page_meta',
    description: 'Ustawia tytuł SEO (<title>) i opis (<meta name="description">) bieżącej strony.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Nowy tytuł strony (<title>), najlepiej ok. 50–65 znaków z nazwą marki WOL-BUD.',
        },
        description: {
          type: 'string',
          description: 'Nowy meta opis strony (description), najlepiej ok. 130–160 znaków.',
        },
      },
    },
  },
  {
    name: 'list_pages',
    description: 'Wyszukuje podstrony w witrynie WOL-BUD z możliwością filtrowania po frazie i grupie.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Opcjonalna fraza wyszukiwania (fragment ścieżki lub nazwy podstrony).',
        },
        group: {
          type: 'string',
          enum: ['all', 'home', 'glowne', 'kategorie', 'produkty', 'promocje'],
          description: 'Opcjonalna grupa podstron do filtrowania.',
        },
      },
    },
  },
  {
    name: 'open_page',
    description: 'Otwiera wskazaną podstronę w edytorze WOL-BUD Studio i zwraca jej strukturę.',
    parameters: {
      type: 'object',
      properties: {
        pagePath: {
          type: 'string',
          description: 'Ścieżka podstrony z list_pages (np. index.html, uslugi/index.html, oferta/okna-pcv/index.html).',
        },
      },
      required: ['pagePath'],
    },
  },
  {
    name: 'create_page',
    description:
      'Tworzy nową podstronę (NIE kategorię/produkt — do tego dodaj_pozycje_oferty) jako KOPIĘ istniejącej analogicznej strony (np. inna promocja dla nowej promocji). Najpierw znajdz_analogiczne. Kopiuje układ i style wzoru, podmienia nagłówek, tytuł i opis; resztę tekstów wzoru trzeba potem zmienić na treść od klienta.',
    parameters: {
      type: 'object',
      properties: {
        sourcePage: {
          type: 'string',
          description: 'Ścieżka analogicznej strony-wzoru, np. promocje/rolety-zima/index.html. Brak = panel weźmie siostrzaną stronę z tego samego folderu.',
        },
        heading: {
          type: 'string',
          description: 'Główny nagłówek H1 nowej podstrony.',
        },
        eyebrow: {
          type: 'string',
          description: 'Opcjonalny krótki nadtytuł (eyebrow) nad głównym nagłówkiem.',
        },
        lead: {
          type: 'string',
          description: 'Opcjonalny akapit wprowadzający (lead) pod nagłówkiem H1.',
        },
        folder: {
          type: 'string',
          description: 'Opcjonalny katalog docelowy (np. "promocje", "oferta", "" dla katalogu głównego).',
        },
        slug: {
          type: 'string',
          description: 'Opcjonalny przyjazny URL bez polskich znaków i spacji (np. "promocja-jesienna").',
        },
        title: {
          type: 'string',
          description: 'Opcjonalny tytuł SEO (<title>) nowej strony.',
        },
        description: {
          type: 'string',
          description: 'Opcjonalny opis SEO (<meta name="description">) nowej strony.',
        },
        addToMenu: {
          type: 'boolean',
          description: 'Czy automatycznie dodać odnośnik do nowej strony w menu głównym (i domyślnie w stopce) witryny.',
        },
        addToFooter: {
          type: 'boolean',
          description: 'Czy dodać link do nowej podstrony również w stopce (domyślnie true, gdy addToMenu jest true).',
        },
        addToOferta: {
          type: 'boolean',
          description:
            'Czy automatycznie dodać klikalny kafelek prowadzący do tej podstrony w obu miejscach Oferty (w sekcji #oferta na index.html ORAZ na podstronie oferta/index.html). Domyślnie true dla szablonów "category" i "promo" — gwarantuje kompletną ścieżkę dojścia bez ślepych okruszków!',
        },
        ofertaTileStyle: {
          type: 'string',
          enum: ['card', 'pill'],
          description:
            'Styl kafelka w Ofercie (gdy addToOferta=true): "card" = duży kafelek ze zdjęciem w głównej siatce (.home-catalog-grid), "pill" = mały kafelek tekstowy / pigułka bez zdjęcia pod spodem (.home-extra-categories). Domyślnie "card".',
        },
      },
      required: ['heading'],
    },
  },
  {
    name: 'search_images',
    description:
      'Wyszukuje prawdziwe zdjęcia dostępne w bibliotece repozytorium i wśród wgranych plików. Zawsze używaj przed update_element_image.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Opcjonalna fraza wyszukiwania (np. "okna", "brama", "tarnow", "drzwi", "montaz").',
        },
        folder: {
          type: 'string',
          enum: [
            'all',
            'uploads',
            'products',
            'realizacje',
            'stores',
            'profiles',
            'partners',
            'montage',
            'parapety',
          ],
          description: 'Opcjonalny folder zdjęć do przeszukania (domyślnie "all").',
        },
        limit: {
          type: 'integer',
          description: 'Maksymalna liczba zwracanych wyników (np. 12).',
        },
      },
    },
  },
  {
    name: 'get_globals',
    description:
      'Odczytuje globalne dane firmy WOL-BUD (telefon, e-mail, Facebook, logo, Menu główne, linki w Stopce).',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'update_globals',
    description:
      'Aktualizuje globalne dane firmy oraz menu/stopkę na wszystkich podstronach. Użyj addMenuItem, aby dodać jedną pozycję bez nadpisywania całego menu.',
    parameters: {
      type: 'object',
      properties: {
        phoneDisplay: {
          type: 'string',
          description: 'Wyświetlany numer telefonu (np. "+48 534 091 021").',
        },
        phoneHref: {
          type: 'string',
          description: 'Link telefoniczny (np. "tel:+48534091021").',
        },
        email: {
          type: 'string',
          description: 'Główny adres e-mail firmy.',
        },
        facebookUrl: {
          type: 'string',
          description: 'Pełny adres profilu Facebook firmy.',
        },
        footerCopy: {
          type: 'string',
          description: 'Tekst praw autorskich / stopki.',
        },
        addMenuItem: {
          type: 'object',
          description: 'Dodaje pojedynczą pozycję na końcu menu głównego bez nadpisywania pozostałych pozycji.',
          properties: {
            label: {
              type: 'string',
              description: 'Widoczna etykieta pozycji menu (np. "Promocje").',
            },
            href: {
              type: 'string',
              description: 'Ścieżka docelowa linku (np. "promocje/index.html").',
            },
            mobileHref: {
              type: 'string',
              description: 'Opcjonalna ścieżka dla wersji mobilnej menu.',
            },
          },
          required: ['label', 'href'],
        },
        removeMenuHref: {
          type: 'string',
          description: 'Usuwa z menu głównego pozycję o podanym href.',
        },
        menu: {
          type: 'array',
          description: 'Pełna lista pozycji menu głównego (nadpisuje całe menu — stosuj tylko przy reorganizacji całego menu).',
          items: {
            type: 'object',
            properties: {
              label: {
                type: 'string',
                description: 'Etykieta linku w menu.',
              },
              href: {
                type: 'string',
                description: 'Docelowy adres linku.',
              },
              mobileHref: {
                type: 'string',
                description: 'Opcjonalny adres dla menu mobilnego.',
              },
            },
            required: ['label', 'href'],
          },
        },
        footerLinks: {
          type: 'array',
          description: 'Pełna lista linków w stopce.',
          items: {
            type: 'object',
            properties: {
              label: {
                type: 'string',
                description: 'Etykieta linku w stopce.',
              },
              href: {
                type: 'string',
                description: 'Docelowy adres linku w stopce.',
              },
            },
            required: ['label', 'href'],
          },
        },
      },
    },
  },
  {
    name: 'undo_last_change',
    description: 'Cofa ostatnią zmianę (lub wskazaną liczbę ostatnich kroków) na bieżącej stronie.',
    parameters: {
      type: 'object',
      properties: {
        steps: {
          type: 'integer',
          description: 'Liczba ostatnich zmian do cofnięcia (domyślnie 1).',
        },
      },
    },
  },
  {
    name: 'delete_page',
    description:
      'Oznacza niestandardową (własną) podstronę do usunięcia w szkicu. NIGDY nie działa na stronach chronionych (index.html oraz strony z listy chronionej profilu witryny).',
    parameters: {
      type: 'object',
      properties: {
        pagePath: {
          type: 'string',
          description:
            'Ścieżka niestandardowej podstrony do usunięcia (z list_pages, np. promocje/stara-oferta/index.html). Nigdy nie może być stroną chronioną.',
        },
        reason: {
          type: 'string',
          description: 'Krótki powód oznaczenia podstrony do usunięcia (np. na prośbę użytkownika).',
        },
      },
      required: ['pagePath'],
    },
  },
  {
    name: 'update_section_id',
    description:
      'Ustawia czystą kotwicę #id (np. promocje, faq, cennik) na wybranej sekcji, aby można było do niej linkować z Menu i przycisków.',
    parameters: {
      type: 'object',
      properties: {
        uid: {
          type: 'string',
          description: 'Identyfikator uid sekcji z get_page_structure.',
        },
        sectionId: {
          type: 'string',
          description:
            'Czysty identyfikator kotwicy bez znaku # (tylko małe litery, cyfry i myślniki, np. "promocje", "faq", "cennik").',
        },
      },
      required: ['uid', 'sectionId'],
    },
  },
  {
    name: 'reorder_element_to_index',
    description:
      'Przenosi sekcję lub kafelek od razu na dokładną pozycję w obrębie listy lub siatki (indeks od 0, np. index: 1 zaraz pod sekcją Hero).',
    parameters: {
      type: 'object',
      properties: {
        uid: {
          type: 'string',
          description: 'Identyfikator uid sekcji lub kafelka do przeniesienia.',
        },
        index: {
          type: 'integer',
          description: 'Docelowa pozycja od 0 (np. 0 = początek listy, 1 = druga pozycja zaraz pod sekcją Hero).',
        },
      },
      required: ['uid', 'index'],
    },
  },
  {
    name: 'update_section_style',
    description:
      'Zmienia bezpieczny, spójny z marką styl wizualny wybranej sekcji (kolorystyka tła, wyrównanie tekstu oraz odstępy pionowe).',
    parameters: {
      type: 'object',
      properties: {
        uid: {
          type: 'string',
          description: 'Identyfikator uid sekcji z get_page_structure.',
        },
        tone: {
          type: 'string',
          enum: ['default', 'light', 'dark', 'accent'],
          description:
            'Ton kolorystyczny sekcji: default (domyślny), light (jasny), dark (ciemny) lub accent (akcentowy marki).',
        },
        align: {
          type: 'string',
          enum: ['default', 'left', 'center'],
          description: 'Wyrównanie zawartości sekcji: default (domyślne), left (do lewej) lub center (wyśrodkowane).',
        },
        spacing: {
          type: 'string',
          enum: ['default', 'compact', 'spacious'],
          description: 'Odstępy pionowe sekcji: default (domyślne), compact (zwarte) lub spacious (przestronne).',
        },
      },
      required: ['uid'],
    },
  },
  {
    name: 'list_backups',
    description:
      'Narzędzie tylko do odczytu. Sprawdza dostępne kopie zapasowe strony (w tym nieusuwalną kopię oryginalną), aby móc poinformować użytkownika o możliwości bezpiecznego przywrócenia.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'discard_page_draft',
    description:
      'Odrzuca niezapisane/nieopublikowane zmiany w szkicu na bieżącej podstronie i przywraca ją do ostatniej opublikowanej wersji.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_site_components',
    description:
      'Zwraca pełny katalog istniejących komponentów i stylów tej konkretnej strony: wszystkie prawdziwe style przycisków (np. tc-tel, tc-mail, hero-btn, store-nav-btn, trust-about-link, service-feature-btn, cat-nav-pill), gotowe szablony sekcji (w tym przewijaną galerię zdjęć photo-gallery) oraz realne sekcje z innych podstron witryny, które można 1:1 sklonować.',
    parameters: {
      type: 'object',
      properties: {
        sourcePage: {
          type: 'string',
          description:
            'Opcjonalna ścieżka konkretnej podstrony do przeskanowania (np. "index.html", "uslugi/index.html"). Jeśli puste, skanuje bieżącą stronę oraz kluczowe strony witryny.',
        },
      },
    },
  },
  {
    name: 'add_styled_button',
    description:
      'Dodaje do wybranej sekcji lub karty nowy przycisk w JEDNYM Z ISTNIEJĄCYCH STYLÓW TEJ STRONY (np. styleId z list_site_components: tc-tel, tc-mail, hero-btn, store-nav-btn, trust-about-link, service-feature-btn, cat-nav-pill lub dowolna klasa przycisku wykryta na witrynie klienta).',
    parameters: {
      type: 'object',
      properties: {
        targetUid: {
          type: 'string',
          description: 'UID sekcji lub karty, do której ma zostać dodany przycisk (np. "sec-2").',
        },
        styleId: {
          type: 'string',
          description:
            'Identyfikator stylu przycisku istniejącego na tej stronie (z list_site_components, np. "tc-tel", "tc-mail", "hero-btn", "store-nav-btn", "trust-about-link", "service-feature-btn", "cat-nav-pill").',
        },
        label: {
          type: 'string',
          description: 'Widoczny napis na przycisku (czysty tekst po polsku, np. "Zobacz promocję").',
        },
        href: {
          type: 'string',
          description:
            'Docelowy adres linku: ścieżka podstrony (np. "oferta/index.html", "kontakt/index.html"), kotwica ("#kontakt"), telefon ("tel:+48..."), e-mail ("mailto:...") lub bezpieczny adres https://.',
        },
        target: {
          type: 'string',
          enum: ['_self', '_blank'],
          description: 'Opcjonalnie "_blank", aby otwierać zewnętrzny link w nowej karcie (domyślnie "_self" w tej samej karcie).',
        },
      },
      required: ['targetUid', 'styleId', 'label', 'href'],
    },
  },
  {
    name: 'clone_site_component',
    description:
      'Klonuje 1:1 dowolną istniejącą sekcję lub blok z innej (lub bieżącej) podstrony tej witryny w 100% oryginalnym stylu marki i wstawia ją na bieżącą stronę (automatycznie przepisuje ścieżki obrazów i linków). Idealne, gdy użytkownik chce dodać blok „taki jak na podstronie X”.',
    parameters: {
      type: 'object',
      properties: {
        sourcePage: {
          type: 'string',
          description: 'Ścieżka podstrony źródłowej z list_site_components (np. "index.html", "uslugi/index.html", "realizacje/index.html").',
        },
        sectionId: {
          type: 'string',
          description: 'Opcjonalne ID sekcji źródłowej (np. "opinie", "partnerzy", "realizacje").',
        },
        sectionIndex: {
          type: 'number',
          description: 'Opcjonalny indeks sekcji (od 0) zwrócony przez list_site_components, jeśli sekcja nie ma ID.',
        },
        afterUid: {
          type: 'string',
          description: 'Opcjonalny UID sekcji na bieżącej stronie, za którą ma zostać wstawiony sklonowany komponent.',
        },
      },
      required: ['sourcePage'],
    },
  },
  {
    name: 'get_section_html',
    description:
      'Tylko do odczytu. Zwraca czysty, produkcyjny kod HTML (bez atrybutów edytora) wskazanej sekcji, kontenera (repeatera) lub kafelka z bieżącej strony. Używaj ZAWSZE, gdy chcesz dokładnie zobaczyć klasy CSS, układ i zawartość fragmentu przed edycją lub zanim zbudujesz nowy blok w stylu witryny.',
    parameters: {
      type: 'object',
      properties: {
        uid: {
          type: 'string',
          description: 'UID sekcji, kontenera (repeatera) lub elementu z get_page_structure albo z zaznaczonego fragmentu użytkownika.',
        },
      },
      required: ['uid'],
    },
  },
  {
    name: 'read_page_summary',
    description:
      'Tylko do odczytu. Podgląda strukturę (tytuł, nagłówek H1, listę sekcji i ich nagłówków/klas) DOWOLNEJ innej podstrony witryny BEZ przeskakiwania z bieżącej strony użytkownika. Używaj zamiast open_page, gdy chcesz tylko coś sprawdzić na innej podstronie (np. index.html, oferta/index.html, realizacje/index.html).',
    parameters: {
      type: 'object',
      properties: {
        pagePath: {
          type: 'string',
          description: 'Ścieżka podstrony z list_pages (np. "index.html", "oferta/index.html", "realizacje/index.html").',
        },
      },
      required: ['pagePath'],
    },
  },
  {
    name: 'update_section_html',
    description:
      'Bezpiecznie podmienia czysty kod HTML wskazanej sekcji, kontenera lub elementu (uid) na bieżącej stronie. Najpierw wywołaj get_section_html(uid), aby zachować oryginalne klasy CSS i spójny wygląd witryny! Zablokowane są wszelkie skrypty (<script>), ramki (<iframe>), formularze (<form>), atrybuty on*= oraz niebezpieczne linki.',
    parameters: {
      type: 'object',
      properties: {
        uid: {
          type: 'string',
          description: 'UID sekcji, kontenera lub elementu do podmiany.',
        },
        html: {
          type: 'string',
          description: 'Kompletny, bezpieczny, czysty fragment HTML (jeden element główny, np. <section class="...">...</section> lub <div class="...">...</div>) używający klas CSS tej witryny.',
        },
      },
      required: ['uid', 'html'],
    },
  },
  {
    name: 'insert_custom_section',
    description:
      'Wstawia w pełni spersonalizowany, bezpieczny blok/sekcję HTML w wybranym miejscu na bieżącej stronie, gdy gotowe szablony (add_section) nie wystarczają (np. tabela porównawcza, cennik, niestandardowy układ kafelków, baner). Najpierw podglądnij istniejące klasy CSS strony przez get_section_html, aby wygląd był w 100% spójny z witryną.',
    parameters: {
      type: 'object',
      properties: {
        html: {
          type: 'string',
          description: 'Kompletny, bezpieczny, czysty fragment HTML (jeden element główny, np. <section class="section">...</section> lub <div class="surface-card">...</div>).',
        },
        afterUid: {
          type: 'string',
          description: 'Opcjonalny UID istniejącej sekcji, względem której wstawić nowy blok.',
        },
        position: {
          type: 'string',
          enum: ['after', 'before'],
          description: 'Czy wstawić za (domyślnie "after") czy przed ("before") sekcją wskazaną w afterUid.',
        },
      },
      required: ['html'],
    },
  },
  {
    name: 'search_site_wide',
    description:
      'Tylko do odczytu. Przeszukuje CAŁĄ witrynę (wszystkie podstrony, uwzględniając bieżące szkice) po tekście (query) i/lub selektorze CSS (selector), np. aby sprawdzić, na ilu podstronach występuje ten sam panel boczny (.sidebar-links, .subpage-sidebar), pasek kategorii (.cat-quick-nav-pills), baner CTA (.cta-banner-dark), siatka oferty (.home-catalog-grid), adres lub godziny otwarcia.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Opcjonalny szukany tekst (bez rozróżniania wielkości liter), np. "ul. Giełdowa 10", "Okna PCV", "Wiertarki".',
        },
        selector: {
          type: 'string',
          description: 'Opcjonalny selektor CSS, np. ".cat-quick-nav-pills", ".sidebar-links", ".cta-banner-dark", "aside.subpage-sidebar".',
        },
        pathPrefix: {
          type: 'string',
          description: 'Opcjonalny prefiks ścieżek podstron, np. "kategorie/" albo "produkty/". Pomiń, aby przeszukać całą witrynę.',
        },
        limit: {
          type: 'number',
          description: 'Opcjonalny limit zwracanych podstron (domyślnie 40, maks. 150).',
        },
      },
    },
  },
  {
    name: 'sync_element_across_site',
    description:
      'Systemowo propaguje/synchronizuje czysty HTML wybranego bloku z bieżącej strony (wskazanego przez uid) na WSZYSTKIE podstrony witryny zawierające pasujący selektor CSS (np. pasek kategorii .cat-quick-nav-pills, lista kategorii w panelu bocznym .sidebar-links, cały panel boczny aside.subpage-sidebar, wspólny baner .cta-banner-dark, pasek partnerów .partner-row). Automatycznie przelicza ścieżki względne (../../) dla każdej głębokości podstrony oraz zachowuje aktywne podświetlenie bieżącej podstrony (.is-active / aria-current / pogrubiony link). W pełni odwracalne jednym kliknięciem „Cofnij tę zmianę AI”.',
    parameters: {
      type: 'object',
      properties: {
        uid: {
          type: 'string',
          description: 'UID sekcji, kontenera (repeatera) lub elementu na bieżącej stronie, który ma zostać zsynchronizowany na inne podstrony.',
        },
        selector: {
          type: 'string',
          description: 'Selektor CSS wskazujący odpowiadający blok na stronach docelowych (np. ".cat-quick-nav-pills", ".sidebar-links", ".cta-banner-dark", "aside.subpage-sidebar").',
        },
        pathPrefix: {
          type: 'string',
          description: 'Opcjonalny prefiks ścieżki ograniczający synchronizację (np. "kategorie/" tylko dla stron kategorii). Pomiń, aby zsynchronizować w całej witrynie.',
        },
        excludePages: {
          type: 'array',
          items: { type: 'string' },
          description: 'Opcjonalna lista podstron do pominięcia (np. ["realizacje/index.html"]).',
        },
        preserveActiveClass: {
          type: 'boolean',
          description: 'Czy zachować aktywne podświetlenie bieżącej podstrony na stronach docelowych (domyślnie true).',
        },
      },
      required: ['uid', 'selector'],
    },
  },
  {
    name: 'replace_text_across_site',
    description:
      'Systemowo znajduje i zamienia tekst wyłącznie w widocznych węzłach tekstowych na WSZYSTKICH pasujących podstronach witryny (nie narusza znaczników HTML, skryptów ani linków). Idealne do globalnych zmian np. adresu, godzin otwarcia, hasła, nazwy kategorii lub korekty literówki w całej witrynie naraz. Użyj dryRun: true, aby najpierw policzyć trafienia.',
    parameters: {
      type: 'object',
      properties: {
        findText: {
          type: 'string',
          description: 'Dokładny tekst do znalezienia na podstronach witryny.',
        },
        replaceWith: {
          type: 'string',
          description: 'Nowy tekst zastępujący.',
        },
        selector: {
          type: 'string',
          description: 'Opcjonalny selektor CSS zawężający obszar podmiany (np. ".sidebar-store", ".cta-banner-dark", "main").',
        },
        pathPrefix: {
          type: 'string',
          description: 'Opcjonalny prefiks ścieżek podstron (np. "kategorie/"). Pomiń, aby objąć całą witrynę.',
        },
        dryRun: {
          type: 'boolean',
          description: 'Jeśli true — tylko zlicza i zwraca listę pasujących podstron bez wprowadzania zmian.',
        },
      },
      required: ['findText', 'replaceWith'],
    },
  },
]);

const FILE_TOOLS = [
  {
    name: 'list_files',
    description: 'Zwraca listę wszystkich plików/podstron witryny (tylko odczyt).',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'read_file',
    description: 'Czyta surową zawartość pliku strony (HTML/CSS/JS) — tylko odczyt, żeby sprawdzić, jak strona jest zbudowana.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Ścieżka pliku, np. index.html, oferta/index.html, assets/site.css' },
      },
      required: ['path'],
    },
  },
];

// Model dostaje: przepisy (całe łańcuchy zmian) + narzędzia starego panelu + odczyt plików. Bez write_file.
// Bez narzędzi z wbudowanymi szablonami panelu (wymyślony wygląd i treść-wypełniacz): nowe rzeczy tylko jako kopia analogicznych miejsc.
const BANNED_TOOLS = new Set(['add_section', 'add_text_block', 'insert_custom_section', 'update_section_html', 'write_file']);
const ALL_TOOLS = (() => {
  const seen = new Set();
  return [...RECIPE_TOOLS, ...AI_TOOLS, ...FILE_TOOLS].filter((t) => {
    if (!t?.name || seen.has(t.name) || BANNED_TOOLS.has(t.name)) return false;
    seen.add(t.name);
    return true;
  });
})();

export function getAiTools() {
  return ALL_TOOLS;
}

// Rekurencyjna konwersja JSON Schema -> schemat Gemini (obiekty, tablice, enum).
function convertSchemaToGemini(schema) {
  if (!schema || typeof schema !== 'object') return { type: 'STRING' };
  const out = {};
  let type = schema.type;
  if (Array.isArray(type)) type = type.find((x) => x !== 'null');
  if (typeof type === 'string') out.type = type.toUpperCase();
  if (typeof schema.description === 'string') out.description = schema.description;
  if (Array.isArray(schema.enum)) {
    const vals = schema.enum.filter((v) => v !== '' && v !== null && v !== undefined).map(String);
    if (vals.length > 0) {
      out.enum = vals;
      out.type = 'STRING';
    }
  }
  if (schema.items && typeof schema.items === 'object') out.items = convertSchemaToGemini(schema.items);
  else if (out.type === 'ARRAY') out.items = { type: 'STRING' };
  if (schema.properties && typeof schema.properties === 'object') {
    const entries = Object.entries(schema.properties);
    if (entries.length > 0) {
      out.properties = {};
      for (const [key, prop] of entries) out.properties[key] = convertSchemaToGemini(prop);
    }
  }
  if (Array.isArray(schema.required) && schema.required.length > 0) {
    const req = schema.required.filter((r) => out.properties && r in out.properties);
    if (req.length) out.required = req;
  }
  if (!out.type) out.type = out.properties ? 'OBJECT' : 'STRING';
  if (out.type === 'OBJECT' && !out.properties) {
    delete out.required;
  }
  return out;
}

function toGeminiFunctionDeclarations(tools) {
  return tools.map((tool) => {
    const decl = { name: tool.name, description: tool.description };
    const props = tool.parameters?.properties;
    if (props && Object.keys(props).length > 0) decl.parameters = convertSchemaToGemini(tool.parameters);
    return decl;
  });
}

export function loadAiSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_AI_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_AI_SETTINGS };
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

export function saveAiSettings(settings) {
  const next = { ...DEFAULT_AI_SETTINGS, ...(settings || {}) };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

export async function checkProxyStatus(proxyUrl = './ai-proxy.php') {
  try {
    const sep = proxyUrl.includes('?') ? '&' : '?';
    const res = await fetch(`${proxyUrl}${sep}status=1`, { method: 'GET', cache: 'no-store' });
    if (!res.ok) return { available: false, configured: false };
    const data = await res.json();
    return { available: true, configured: Boolean(data?.configured), ...data };
  } catch {
    return { available: false, configured: false };
  }
}

export async function runAiTurn({
  userMessage,
  history = [],
  contextSummary = '',
  settings,
  csrfToken = '',
  toolExecutor,
  onToolCall,
  onToolResult,
  signal,
}) {
  const s = { ...DEFAULT_AI_SETTINGS, ...(settings || loadAiSettings()) };
  const isLocalProxy = Boolean(document.querySelector('meta[name="cms-local-proxy"]'));
  const useDirectGemini = !isLocalProxy && s.provider !== 'proxy' && Boolean(s.apiKey);

  const messages = [
    ...history.slice(-12).map((m) => ({ role: m.role, content: m.text })),
    { role: 'user', content: userMessage },
  ];
  const systemText = [AI_SYSTEM_PROMPT, contextSummary].filter(Boolean).join('\n\n');
  const tools = ALL_TOOLS.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
  const toolLog = [];
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (csrfToken) headers['X-CMS-CSRF-Token'] = csrfToken;

  const callModel = async () => {
    if (useDirectGemini) {
      const model = s.model || 'gemini-4-hydrogen';
      const geminiContents = [];
      for (const m of messages) {
        if (m.role === 'tool') {
          geminiContents.push({
            role: 'user',
            parts: [{ functionResponse: { name: m.name, id: m.tool_call_id, response: JSON.parse(m.content || '{}') } }],
          });
        } else if (m.role === 'assistant') {
          const parts = [];
          if (m.content) parts.push({ text: m.content });
          for (const tc of m.tool_calls || []) {
            const p = { functionCall: { name: tc.function.name, id: tc.id, args: JSON.parse(tc.function.arguments || '{}') } };
            if (tc.thoughtSignature) p.thoughtSignature = tc.thoughtSignature;
            parts.push(p);
          }
          geminiContents.push({ role: 'model', parts });
        } else {
          geminiContents.push({ role: 'user', parts: [{ text: String(m.content || '') }] });
        }
      }
      const gTools = [{ functionDeclarations: toGeminiFunctionDeclarations(ALL_TOOLS) }];
      const candidateModels = Array.from(
        new Set([model, 'gemini-4-hydrogen', 'gemini-3.1-pro-preview', 'gemini-3.8-flash'].filter(Boolean))
      );
      let data = null;
      let lastErrMsg = '';
      for (const m of candidateModels) {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(s.apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal,
            body: JSON.stringify({
              ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
              contents: geminiContents,
              tools: gTools,
              generationConfig: m.includes('hydrogen') ? { thinkingConfig: { thinkingLevel: 'HIGH' } } : {},
            }),
          }
        );
        const json = await res.json().catch(() => ({}));
        if (res.ok) {
          data = json;
          break;
        }
        lastErrMsg = json?.error?.message ? `HTTP ${res.status}: ${json.error.message}` : `HTTP ${res.status}`;
        if (res.status !== 429 && res.status !== 404 && res.status !== 503) {
          throw new Error(`Błąd Gemini API (${lastErrMsg})`);
        }
      }
      if (!data) throw new Error(`Błąd Gemini API (${lastErrMsg || 'HTTP 429'})`);
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const text = parts.filter((p) => !p.thought && p.text).map((p) => p.text).join('\n').trim();
      const toolCalls = parts.filter((p) => p.functionCall).map((p, i) => ({
        id: p.functionCall.id || `g_${Date.now()}_${i}`,
        name: p.functionCall.name,
        args: p.functionCall.args || {},
        ...(p.thoughtSignature ? { thoughtSignature: p.thoughtSignature } : {}),
      }));
      return { text, toolCalls };
    }

    const res = await fetch(s.proxyUrl || './ai-proxy.php', {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({
        systemPrompt: systemText,
        messages,
        tools,
        ...(s.provider && s.provider !== 'proxy' ? { provider: s.provider } : {}),
        ...(s.model ? { model: s.model } : {}),
      }),
    });
    if (!res.ok) {
      throw new Error(
        res.status === 405
          ? 'HTTP 405 — na GitHub Pages nie działa PHP proxy. Otwórz lokalnie http://127.0.0.1:4180/panel/ albo wpisz klucz Gemini API w ustawieniach AI.'
          : `Błąd serwera AI (HTTP ${res.status})`
      );
    }
    return res.json();
  };

  for (let round = 0; round < 16; round += 1) {
    const data = await callModel();
    const calls = Array.isArray(data?.toolCalls) ? data.toolCalls : [];
    const text = typeof data?.text === 'string' ? data.text.trim() : '';

    if (calls.length === 0) {
      return { reply: text || 'Gotowe.', toolLog };
    }

    messages.push({
      role: 'assistant',
      content: text,
      tool_calls: calls.map((tc, i) => ({
        id: tc.id || `call_${round}_${i}`,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.args || {}) },
        ...(tc.thoughtSignature ? { thoughtSignature: tc.thoughtSignature } : {}),
      })),
    });

    for (let i = 0; i < calls.length; i += 1) {
      const tc = calls[i];
      const id = tc.id || `call_${round}_${i}`;
      const args = tc.args || {};
      await onToolCall?.({ id, name: tc.name, args });
      let result;
      let ok = true;
      try {
        result = await toolExecutor(tc.name, args);
        if (result?.ok === false || result?.error) ok = false;
      } catch (e) {
        ok = false;
        result = { ok: false, error: e?.message || String(e) };
      }
      const summary = ok ? 'OK' : (result?.error || 'Błąd');
      toolLog.push({ name: tc.name, args, ok, summary });
      await onToolResult?.({ id, name: tc.name, args, ok, summary, result });
      messages.push({
        role: 'tool',
        tool_call_id: id,
        name: tc.name,
        content: JSON.stringify(result),
      });
    }
  }

  return { reply: 'Zakończono.', toolLog };
}
