#!/usr/bin/env python3
"""Build the static WOL-BUD website in the premium DAKO-Kalisz Awwwards style.
Features:
- Complete scraped product & category catalog (17 categories, 67 products, 7 services)
- Interactive product gallery with stage arrows (left/right), thumbnail switching & keyboard navigation
- Fullscreen Lightbox modal with zoom, left/right arrows, counter, keyboard navigation (Esc, Arrow keys)
- Smart breadcrumbs and 'Wróć' back buttons returning directly to originating homepage section (not hero)
- Individual 'Nawiguj w Google Maps ↗' buttons for every salon address
- Floating 'Do góry' (Back to Top) scroll button
- Source-backed WOL-BUD content
"""

from __future__ import annotations

import hashlib
import html
import json
import re
import unicodedata
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
SCRAPED_DATA_FILE = ROOT / "docs" / "full_scraped_data.json"
SOURCE_DATA_FILE = ROOT / "docs" / "source-content.json"
PRODUCT_GALLERY_SOURCE_MAP_FILE = ROOT / "docs" / "product-gallery-source-map.json"
# Version of the stylesheet and script in their addresses, so that a browser holding an older copy
# fetches the new one together with a new page.
ASSET_VERSIONS = {
    name: hashlib.sha256((ROOT / "assets" / name).read_bytes()).hexdigest()[:10]
    for name in ("site.css", "site.js")
}

# Navigation links for specific salon locations
MAP_LINKS = {
    "chyszow": "https://www.google.com/maps/dir/?api=1&destination=WOL-BUD+ul.+Gie%C5%82dowa+10,+33-100+Tarn%C3%B3w",
    "kolejowa": "https://www.google.com/maps/dir/?api=1&destination=ul.+Kolejowa+5,+33-130+Rad%C5%82%C3%B3w",
}

FACEBOOK_URL = "https://www.facebook.com/sklep.wol.bud.tarnow"
FACEBOOK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.04C6.5 2.04 2 6.53 2 12.06c0 5 3.66 9.15 8.44 9.9v-7h-2.54v-2.9h2.54V9.85c0-2.51 1.49-3.89 3.78-3.89 1.09 0 2.23.19 2.23.19v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.9h-2.33v7A10 10 0 0 0 22 12.06C22 6.53 17.5 2.04 12 2.04Z"/></svg>'
MAIL_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/></svg>'
PHONE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 3.5h2.1l1.4 4-1.8 1.5a14 14 0 0 0 6.1 6.1l1.5-1.8 4 1.4v2.1c0 1.1-.9 2-2 2A15.5 15.5 0 0 1 5.2 5.5c0-1.1.9-2 2-2Z"/></svg>'
# Client, 20.10.2026: three bubbles in the middle of the right edge, Facebook, e-mail and phone;
# hovering one shows it whole.
CONTACT_BUBBLES = f'''<nav class="contact-bubbles" aria-label="Szybki kontakt">
  <a class="contact-bubble contact-bubble--fb" href="{FACEBOOK_URL}" target="_blank" rel="noopener noreferrer" aria-label="Facebook: facebook.com/sklep.wol.bud.tarnow (otwiera się w nowej karcie)"><span class="contact-bubble__text">facebook.com/sklep.wol.bud.tarnow</span><span class="contact-bubble__icon">{FACEBOOK_ICON}</span></a>
  <a class="contact-bubble contact-bubble--mail" href="mailto:biuro@wol-bud.com.pl" aria-label="E-mail: biuro@wol-bud.com.pl"><span class="contact-bubble__text">biuro@wol-bud.com.pl</span><span class="contact-bubble__icon">{MAIL_ICON}</span></a>
  <a class="contact-bubble contact-bubble--tel" href="tel:+48534091021" aria-label="Zadzwoń: 534 091 021"><span class="contact-bubble__text">534 091 021</span><span class="contact-bubble__icon">{PHONE_ICON}</span></a>
</nav>'''
# The calls to talk at the foot of the pages ("Porozmawiajmy o Twojej inwestycji" and the like) carry the
# e-mail next to the phone (client PDF of 20.10.2026).
CTA_CONTACT = f'''<div class="cta-actions">
            <a class="tc-tel" href="tel:+48534091021">Zadzwoń: 534 091 021</a>
            <a class="tc-mail" href="mailto:biuro@wol-bud.com.pl">{MAIL_ICON}biuro@wol-bud.com.pl</a>
          </div>'''

# Google Business Profile "WOL-BUD Wojciech Wolański" (Giełdowa 10, Tarnów), read on 16.10.2026.
# The rating and the count are copied by hand, so they need refreshing when the profile changes.
GOOGLE_REVIEWS_READ = "16.10.2026"
GOOGLE_REVIEWS_URL = "https://www.google.com/maps/place/WOL-BUD+Wojciech+Wola%C5%84ski/@50.018426,20.948448,17z/data=!4m8!3m7!1s0x473d849d210e031b:0x4f5e253fc57bd81d!8m2!3d50.018426!4d20.948448!9m1!1b1!16s%2Fg%2F1pv5tkfkh?hl=pl"
GOOGLE_RATING = "4,4"
GOOGLE_REVIEW_COUNT = 48

# Seven 5-star reviews from that profile, of similar length so the cards stay evenly filled;
# the longer ones go first, so the first cards in view are the fullest. Words as written by the
# authors; only a space before "!" is removed. Shown without the authors' names (client, 16.10.2026).
GOOGLE_REVIEWS = [
    "Szczerze polecam. Wymiana okien skrzynkowych i parapetów lastryko w starym domu przebiegła bez problemowo. Estetyczne wykończenie, ekipa montująca profesjonalna i przyjazna:) Dziękujemy!",
    "To nie pierwszy raz kiedy korzystamy z usług firmy WOLBUD. Zdecydowanie polecamy miło fachowo i czysto w trakcie pracy jak i po jej zakończeniu. Terminy zawsze na czas. Kontakt w czasie trwania zamówienia bezproblemowy. Dzięki Panowie",
    "Firma i jej pracownicy z profesjonalnym podejściem do klienta i wykonywanych usług! Wszystko zgodnie z zamówieniem i umową. Punktualnie i dokładnie wykonane. Przed podpisaniem umowy fachowe porady. Polecam.",
    "Zamówiłem w Firmie Wol-Bud okna, rolety, parapety i bramę garażową z montażem do Niemiec. Jestem bardzo zadowolony z jakości wykonanych prac, fachowości i obsługi klienta. Polecam",
    "Firma godna polecenia, jakość wykonania super i co najważniejsze nie ma żadnych proplemów przy gwarancji POLECAM",
    "Fachowcy z najwyższej półki, rzetelna obsługa i doradztwo a towar zgodny z zamówieniem. Szczerze polecam",
    "Okna bardzo dobrej jakości. Fachowa obsługa, potrafią doradzić, montaż bez żadnych problemów.",
]

# Sales points. Client corrections of 29.09: ul. Szkotnik 2B removed. Of 16.10: only Giełdowa 5 and
# Kolejowa 5 remain; the Radłów numbers, formerly at ul. Leśna 17a, now go with Kolejowa 5. The old
# Radłów picture was a map of ul. Leśna, so that card has none. Of 17.10: the Tarnów salon is at
# Giełdowa 10, the address the Google profile shows. Of 20.10 (PDF): "salony można dać zdjęcie naszego
# budynku" – the photo of the building, whose banner gives the Tarnów number, replaces the map snippet.
# Of 22.10: "a to jest radłów dodaj to zdjecie do radłowa" – the photo of the Radłów building. Also of
# 22.10, the hours of both: "Poniedziałek – piątek 08:00–16:00  Sobota: 09:00–12:00 (Tarnów i Radłów)",
# then "piatek z duzej litery".
STORES = [
    {
        "name": "Salon Tarnów-Chyszów", "city": "Tarnów", "street": "ul. Giełdowa 10",
        "address": "ul. Giełdowa 10 (przy placu targowym), 33-100 Tarnów",
        "address_full": "ul. Giełdowa 10 (przy placu targowym Chyszów), 33-100 Tarnów",
        "tel": "14 626 80 32", "mobile": "534 091 021", "photo": "salon-tarnow-gieldowa.webp",
        "hours": "Pn–Pt 8–16 · Sb 9–12", "map": MAP_LINKS["chyszow"],
    },
    {
        "name": "Salon Radłów", "city": "Radłów", "street": "ul. Kolejowa 5",
        "address": "ul. Kolejowa 5, 33-130 Radłów", "address_full": "ul. Kolejowa 5, 33-130 Radłów",
        "tel": "14 678 23 65", "mobile": "609 734 290", "photo": "salon-radlow-kolejowa.webp",
        "hours": "Pn–Pt 8–16 · Sb 9–12", "map": MAP_LINKS["kolejowa"],
    },
]

MAP_PIN_SVG = '<svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>'

# Pages dropped by the client corrections; the old address forwards to the closest current page.
REMOVED_ROUTES = {
    "/kategorie/okna-pcv-domel/": "/kategorie/okna-pcv/",
    "/produkty/infinity-passive-83md/": "/kategorie/okna-pcv/",
    "/produkty/energetic-83md/": "/kategorie/okna-pcv/",
    "/produkty/vector-82md/": "/kategorie/okna-pcv/",
    "/produkty/fusion/": "/kategorie/okna-pcv/",
    "/produkty/synergic/": "/kategorie/okna-pcv/",
    "/produkty/ogrody-zimowe/": "/kategorie/stolarka-aluminiowa/",
    "/produkty/effectline/": "/kategorie/okna-pcv/",
    # Client PDF of 20.10.2026: "Drzwi zewnętrzne – usuwamy to Wikęd".
    "/produkty/wiked-drzwi-zewnetrzne-stalowe/": "/kategorie/drzwi-zewnetrzne/",
    # The old sill kinds and their products, replaced by the Medos sills (client, 20.10.2026).
    "/kategorie/aglomarmur/": "/kategorie/parapety-wewnetrzne/",
    "/produkty/venus/": "/produkty/parapet-konglomerat-marmurowy/",
    "/produkty/new-marfil/": "/produkty/parapet-konglomerat-marmurowy/",
    "/produkty/olimpo/": "/produkty/parapet-konglomerat-marmurowy/",
    "/produkty/botticino/": "/produkty/parapet-konglomerat-marmurowy/",
    "/produkty/breccia-aurora/": "/produkty/parapet-konglomerat-marmurowy/",
    "/produkty/breccia-oniciata/": "/produkty/parapet-konglomerat-marmurowy/",
    "/produkty/travertino/": "/produkty/parapet-konglomerat-marmurowy/",
    "/produkty/calacata/": "/produkty/parapet-konglomerat-marmurowy/",
    "/produkty/nero-portoro/": "/produkty/parapet-konglomerat-marmurowy/",
    "/produkty/giallo-reale/": "/produkty/parapet-konglomerat-marmurowy/",
    "/produkty/rosa-del-garda/": "/produkty/parapet-konglomerat-marmurowy/",
    "/produkty/rosso-asiago/": "/produkty/parapet-konglomerat-marmurowy/",
    "/kategorie/aglomarmur/page/2/": "/kategorie/parapety-wewnetrzne/",
    "/produkty/espaniola/": "/produkty/parapet-konglomerat-marmurowy/",
    "/produkty/polare/": "/produkty/parapet-konglomerat-marmurowy/",
    "/produkty/carrara-micro/": "/produkty/parapet-konglomerat-marmurowy/",
    "/produkty/aglomarmur/": "/produkty/parapet-konglomerat-marmurowy/",
    "/kategorie/granit/": "/kategorie/parapety-wewnetrzne/",
    "/produkty/baltic-brown/": "/produkty/parapet-granit/",
    "/produkty/star-galaxy/": "/produkty/parapet-granit/",
    "/produkty/kashmir-gold/": "/produkty/parapet-granit/",
    "/produkty/nero-zimbabwe/": "/produkty/parapet-granit/",
    "/produkty/multicolor-red/": "/produkty/parapet-granit/",
    "/produkty/santiago-red/": "/produkty/parapet-granit/",
    "/produkty/new-impala/": "/produkty/parapet-granit/",
    "/produkty/yellow-pink/": "/produkty/parapet-granit/",
    "/produkty/new-bianco-cristal/": "/produkty/parapet-granit/",
    "/produkty/granit/": "/produkty/parapet-granit/",
    "/kategorie/marmur/": "/kategorie/parapety-wewnetrzne/",
    "/produkty/perlato/": "/kategorie/parapety-wewnetrzne/",
    "/produkty/nero-marquina/": "/kategorie/parapety-wewnetrzne/",
    "/produkty/forest-green/": "/kategorie/parapety-wewnetrzne/",
    "/produkty/forest-brown/": "/kategorie/parapety-wewnetrzne/",
    "/produkty/emperador-dark/": "/kategorie/parapety-wewnetrzne/",
    "/produkty/crema-marphil/": "/kategorie/parapety-wewnetrzne/",
    "/produkty/marmur/": "/kategorie/parapety-wewnetrzne/",
    "/kategorie/pcv-wewnetrzne/": "/kategorie/parapety-wewnetrzne/",
    "/produkty/pcv-nakladka/": "/produkty/parapet-pvc/",
    "/produkty/pcv-wewnetrzne/": "/produkty/parapet-pvc/",
    "/kategorie/stalowe-aluminiowe-zewnetrzne/": "/kategorie/parapety-zewnetrzne/",
    "/produkty/aluminiowe-linia-zaokraglona/": "/produkty/parapet-aluminiowy/",
    "/produkty/aluminiowe-linia-standard/": "/produkty/parapet-aluminiowy/",
    "/produkty/stalowe-linia-zaokraglona/": "/produkty/parapet-stalowy/",
    "/produkty/stalowe-linia-standard/": "/produkty/parapet-stalowy/",
    # Client, 21.10.2026: "to intenso usuwamy" – the card, the catalogue link and the logo go too.
    "/produkty/drzwi-wewnetrzne-intenso/": "/kategorie/drzwi-wewnetrzne/",
}

# Service names shown on the site (client: "Prawidłowy – szczelny montaż" instead of "Ciepły montaż").
SERVICE_TITLE_RENAMES = {
    "Ciepły montaż": "Prawidłowy – szczelny montaż",
}

# Services left off the site. Client, 22.10.2026: "całkowicie usuń sekcję układanie kostki brukowej".
REMOVED_SERVICES = {"Układanie kostki brukowej"}

# Window profiles presented with a photo on the left and the description beside it.
PCV_PROFILES = [
    {
        "name": "Okno PROTECTO", "kicker": "Okna na profilach Gealan Kontur", "image": "/img/profiles/pcv-protecto.webp",
        "blocks": [
            ("h", "Zwiększone bezpieczeństwo"),
            ("p", "Okna na profilu Gealan Kontur zapewniają wyższy poziom bezpieczeństwa. W produkcie zastosowano innowacyjną „płetwę antywłamaniową” wykonaną z PCV. To rozwiązanie antywłamaniowe uniemożliwia włamywaczom wyważenie okna. Płetwa antywłamaniowa jest skuteczną barierą dla włamywacza próbującego wyważyć skrzydło okienne za pomocą np. śrubokręta."),
            ("h", "Profil"),
            ("ul", [
                "6-komorowy profil GEALAN",
                "kształtownik wzmocnienia tworzy w ramie siódmą komorę",
                "innowacyjna płetwa antywłamaniowa wykonana z PCV",
                "szerokość zabudowy 82,5 mm",
                "gładka powierzchnia ramy ułatwia mycie i konserwację",
                "system uszczelek przyszybowych zapewniający szczelność i niezawodność okna",
                "wzmocnienia stalowe zimnogięte ocynkowane, rama grubość 1,5 mm, skrzydło grubość 2 mm",
            ]),
        ],
    },
    {
        "name": "Okno ENERGETIC", "kicker": "Okna na profilach Gealan S 9000 MD", "image": "/img/profiles/pcv-energetic.webp",
        "blocks": [
            ("h", "Standard pasywny"),
            ("p", "Energetic to innowacyjny system na profilach Gealan S 9000 wyposażony w środkową uszczelkę, dedykowany dla okien, drzwi oraz drzwi podnoszono-przesuwnych. Przy zastosowaniu standardowych wzmocnień stalowych spełnia standard pasywny."),
            ("h", "Profil"),
            ("ul", [
                "6-komorowa budowa ramy i skrzydła",
                "szerokość zabudowy 82,5 mm",
                "kształtownik wzmocnienia stalowego tworzy w ramie siódmą komorę",
                "gładka powierzchnia ramy ułatwia mycie i konserwację",
                "inteligentny system uszczelek rozmieszczonych w trzech płaszczyznach",
                "wzmocnienia stalowe zimnogięte ocynkowane, rama grubość 1,5 mm, skrzydło grubość 1,5 mm",
                "środkowa uszczelka w postaci przylgi",
            ]),
        ],
    },
    {
        "name": "Okno VECTOR", "kicker": "Okna 7-komorowe oparte na systemie Veka Softline 82 MD", "image": "/img/profiles/pcv-vector.webp",
        "blocks": [
            ("h", "Skuteczna ochrona przed zimnem i hałasem"),
            ("p", "Okna 7-komorowe Vector, oparte na systemie Veka Softline 82, to idealne rozwiązanie dla domów energooszczędnych i pasywnych. Dzięki innowacyjnej konstrukcji okna PCV 7-komorowe skutecznie chronią wnętrza przed zimnem, wilgocią i hałasem, jednocześnie obniżając koszty ogrzewania budynku. Profil klasy A oraz doskonała izolacja termiczna sprawiają, że to rozwiązanie spełnia najwyższe standardy energooszczędności."),
            ("h", "Profil"),
            ("ul", [
                "układ trzech uszczelek (zewnętrznej, środkowej i wewnętrznej) doskonale izoluje hałas, wilgoć, zimno i przeciągi; uszczelka środkowa jest solidnie zamocowana do ramy",
                "stalowe wzmocnienia zimnogięte ocynkowane gwarantują wysoką statykę oraz odporność na uszkodzenia",
                "profil o szerokości zabudowy 82 mm, w klasie A (grubość ścianek zewnętrznych 3 mm)",
            ]),
        ],
    },
    {
        "name": "Okno CONTUR", "kicker": "Okna oparte na systemie Gealan Linear", "image": "/img/profiles/pcv-contur.webp",
        "blocks": [
            ("h", "Nowoczesny wygląd"),
            ("p", "Prosta, przejrzysta koncepcja projektowa systemu Gealan Linear uwzględnia trendy architektoniczne, w ramach których proponowane są okna o prostych, wyrazistych konturach. Dzięki smukłemu i eleganckiemu wyglądowi okna stanowią idealne dopełnienie nowoczesnego budownictwa, a zwłaszcza minimalistycznych, prostych wnętrz."),
            ("h", "Profil"),
            ("ul", ["6-komorowy profil GEALAN", "szerokość zabudowy 74 mm"]),
        ],
    },
    {
        "name": "Okno HENSPERFECT", "kicker": "Okna oparte na systemie Deceuninck", "image": "/img/profiles/pcv-hensperfect.webp",
        "blocks": [
            ("h", "Tradycyjne wzornictwo"),
            ("p", "Tradycyjna, ponadczasowa koncepcja projektowa systemu HENSPERFECT uwzględnia klasyczne trendy architektoniczne, w ramach których proponowane są okna o wyrazistych przylgach i eleganckim wyglądzie. Dzięki solidnemu wykończeniu okna stanowią idealne dopełnienie tradycyjnego oraz energooszczędnego budownictwa, a zwłaszcza obiektów poddawanych renowacji."),
            ("h", "Wszechstronność zastosowań"),
            ("p", "Kompletny system premium przeznaczony do budowy okien oraz drzwi balkonowych o głębokości zabudowy 84 mm. Zoptymalizowana, 6-komorowa konstrukcja profili zapewnia najwyższą kompatybilność, szczelność oraz doskonałą izolację termiczną."),
        ],
    },
    {
        "name": "Schüco LivIng", "kicker": "Okna na profilach Schüco", "image": "/img/profiles/pcv-schuco-living.webp",
        "blocks": [
            ("p", "To system, który wyznacza nowoczesne standardy dla okien PVC. Dzięki zastosowaniu zaawansowanych profili oraz technologii wielokomorowej okna oferują:"),
            ("ul", [
                "znakomitą izolację termiczną i akustyczną",
                "wytrzymałość na warunki atmosferyczne",
                "możliwość personalizacji kształtu i koloru",
                "bezpieczeństwo dzięki okuciom Winkhaus activPilot",
            ]),
            ("p", "To rozwiązania, które łączą energooszczędność z minimalistyczną estetyką."),
        ],
    },
    {
        "name": "Salamander bluEvolution 82", "kicker": "Okna na profilach Salamander", "image": "/img/profiles/pcv-salamander-bluevolution-82.webp",
        "blocks": [
            ("p", "To energooszczędny, 6-komorowy profil okienny z PVC o głębokości zabudowy 82 mm i eleganckiej estetyce."),
            ("h", "Ciepło i oszczędność"),
            ("p", "Trzy uszczelki i głęboki profil (82 mm) skutecznie zatrzymują ciepło w domu, obniżając rachunki za ogrzewanie."),
        ],
    },
    # Client WhatsApp of 21.10.2026: "dodajemy do okna jeden profil w takim samym stylu jak tam".
    {
        "name": "Kömmerling 88 MD", "kicker": "Okna na profilach Kömmerling", "image": "/img/profiles/pcv-koemmerling-88md.webp",
        "blocks": [
            ("p", "Kömmerling 88 MD to nowoczesny system okienny klasy premium, przeznaczony szczególnie do budownictwa energooszczędnego i pasywnego. Siedmiokomorowa konstrukcja oraz zastosowanie uszczelki środkowej zapewniają bardzo dobrą izolacyjność cieplną, szczelność i ochronę przed hałasem. System umożliwia zastosowanie nowoczesnych pakietów szybowych, zapewniając komfort użytkowania oraz szerokie możliwości projektowe."),
            ("h", "Profil"),
            ("ul", [
                "7-komorowy system profili z uszczelką środkową",
                "głębokość zabudowy 88 mm",
                "trzy poziomy uszczelnienia zwiększające szczelność okna",
                "możliwość zastosowania pakietów szybowych o grubości do 60 mm, zależnie od konfiguracji",
                "możliwość wykonania okien o wysokich parametrach izolacyjności cieplnej",
                "solidne wzmocnienia stalowe zapewniające stabilność konstrukcji",
                "możliwość zastosowania szyb trzyszybowych",
                "wysoka izolacyjność akustyczna oraz możliwość zastosowania zabezpieczeń antywłamaniowych",
                "łatwa pielęgnacja i szeroki wybór kolorów oraz oklein dekoracyjnych",
            ]),
        ],
    },
]

ALU_PROFILES = [
    {
        "name": "Aluprof MB-79N", "kicker": "Ekonomiczny system okienno-drzwiowy", "image": "/img/profiles/alu-aluprof-mb79n.webp",
        "blocks": [
            ("p", "Aluprof MB-79N to ekonomiczny system okienno-drzwiowy o podwyższonych wymaganiach izolacyjności termicznej. Służy on do wykonywania konstrukcji, wśród których znajdują się okna stałe, rozwierne, uchylne, uchylno-rozwierane, uchylno-przesuwne, a także drzwi zewnętrzne jedno- i dwuskrzydłowe oraz rozwiązania witrynowe z drzwiami."),
        ],
    },
    {
        "name": "Aluron AS 75", "kicker": "Trzykomorowy system z technologią ANTI-BI-METAL", "image": "/img/profiles/alu-aluron-as75.webp",
        "blocks": [
            ("p", "Trzykomorowy system AS 75 przeznaczony do produkcji izolowanych termicznie konstrukcji okien i drzwi z zastosowaniem innowacyjnej technologii ANTI-BI-METAL, która zapobiega odkształcaniu się skrzydeł drzwiowych podczas nagrzania promieniami słonecznymi, jak i również przy bardzo niskich temperaturach. System spełnia wymagania wszystkich aktualnych i przyszłych norm izolacji termicznej."),
        ],
    },
]

# New category copy from the client corrections. Routes listed here replace the captured source text.
CATEGORY_CONTENT = {
    "/kategorie/okna-pcv/": {
        "lead": "Okna PCV na profilach Gealan, Veka, Deceuninck, Schüco, Salamander i Kömmerling.",
        "profiles": PCV_PROFILES,
    },
    # Client PDF of 20.10.2026: the text as written there ("blocks", shown like copy_blocks_markup) and
    # the producers with links to their catalogues. A producer without a usable link has "".
    "/kategorie/drzwi-zewnetrzne/": {
        "lead": "Drzwi zewnętrzne – bezpieczeństwo, ciepło i styl dla Twojego domu",
        "blocks": [
            ("p", "Drzwi zewnętrzne to wizytówka każdego budynku oraz pierwsza linia obrony przed zimnem, hałasem i nieproszonymi gośćmi. W naszej ofercie znajdziesz szeroki wybór skrzydeł drzwiowych, które łączą w sobie nowoczesny design, doskonałe parametry termoizolacyjne oraz zaawansowane systemy antywłamaniowe. Niezależnie od tego, czy szukasz drzwi do nowoczesnej willi, energooszczędnego domu pasywnego, czy przytulnego mieszkania w bloku – mamy rozwiązanie idealne dla Ciebie."),
            ("h", "Dlaczego warto wybrać nasze drzwi wejściowe?"),
            ("ul", [
                # The PDF has "(\(U_{d}\))", a formula pasted as code; it stands for Ud.
                "Doskonała izolacja termiczna (Energooszczędność): Oferujemy modele spełniające najnowsze normy budowlane, o niskim współczynniku przenikania ciepła (Ud). Dzięki solidnemu wypełnieniu (np. pianą PUR) skutecznie zatrzymują ciepło wewnątrz i obniżają rachunki za ogrzewanie.",
                "Bezpieczeństwo na najwyższym poziomie: Nasze drzwi wyposażone są w wielopunktowe zamki, bolce antywyważeniowe oraz solidne ościeżnice. Znajdziesz u nas skrzydła w klasach odporności na włamanie RC2, RC3 i wyższych.",
                "Cisza i komfort akustyczny: Skutecznie odcinają hałasy dobiegające z ulicy lub klatki schodowej, zapewniając domownikom upragniony spokój.",
                "Trwałość na lata: Odporność na promieniowanie UV, opady deszczu, mróz oraz odkształcenia gwarantuje, że drzwi będą działać płynnie i wyglądać jak nowe przez dekady.",
            ]),
            ("pb", ("Drzwi stalowe:", "Wyjątkowo odporne na uszkodzenia mechaniczne i trudne warunki pogodowe. Świetny stosunek jakości do ceny.")),
        ],
        "photo": ("/img/products/drzwi-zewnetrzne-stalowe.webp", "Drzwi zewnętrzne stalowe"),
        "brands_title": "Mamy w swojej ofercie drzwi zewnętrzne producentów",
        "brands": [
            ("Wikęd", "https://wiked.pl/wp-content/uploads/2026/08/WIKED_Katalog_drzwi_do_domu_2026_RELEASE_-zmiany-na-10.07.26.pdf"),
            ("Erkado", "https://erkado.pl/wp-content/uploads/2025/11/stalowe-katalog-2026ib-www-082026-1.pdf"),
            ("Martom", "https://drzwimartom.pl/wp-content/uploads/2026/09/Katalog-Martom-Wrzesien-2026-www.pdf"),
        ],
    },
    "/kategorie/drzwi-wewnetrzne/": {
        "lead": "Drzwi wewnętrzne – styl, prywatność i trwałość w Twoim domu",
        "blocks": [
            ("p", "Dobrze dobrane drzwi wewnętrzne to nie tylko praktyczne zamknięcie pomieszczenia, ale też ważny detal aranżacji wnętrza. W naszej ofercie znajdziesz modele dopasowane do każdego stylu: od klasycznych i minimalistycznych, po nowoczesne skrzydła loftowe i skandynawskie."),
            ("h", "Co znajdziesz w naszej ofercie?"),
            ("ul", [
                "Drzwi przylgowe i bezprzylgowe – klasyczne skrzydła z widocznym wcięciem lub nowoczesne, idealnie zlicowane z ościeżnicą.",
                "Różne warianty wykończenia – modele malowane, foliowane oraz skrzydła gruntowane do samodzielnego malowania lub tapetowania.",
                "Przeszklenia i pełne skrzydła – zapewniające intymność w sypialni albo doświetlające ciemne korytarze.",
                "Rozwiązania specjalne – drzwi z odwrotną przylgą (rewersyjne) oraz modele dedykowane do łazienek.",
            ]),
        ],
        "photo": ("/img/products/drzwi-wewnetrzne-aranzacja.webp", "Drzwi wewnętrzne w aranżacji wnętrza"),
        "brands_title": "Mamy w swojej ofercie drzwi wewnętrzne producentów",
        "brands": [
            ("Erkado", "https://erkado.pl/wp-content/uploads/2025/11/katalog-dw-2026ic-www-7092026.pdf"),
            # The PDF links a file on the client's own computer ("Katalog produktów 20262027.pdf"); this is
            # the same catalogue on the producer's site, read on 20.10.2026. The producer writes POL-SKONE.
            ("Pol-Skone", "https://www.pol-skone.pl/pliki/pobierz/GdQUeBUt1AojPX8e5MBEbEzPpKyZHabC/katalog-produktow-20262027.pdf"),
            ("Porta", "https://www.porta.com.pl/phavi/at/upl/2026/0701/0720-0732-katalog-porta-2_2026-www.pdf"),
            ("Dre", "https://dre.pl/wp-content/uploads/2026/10/Katalog-DRE-2026_3.pdf"),
        ],
    },
}

# Main photo placed first in a product gallery. INTEGRO and adaptacyjny: client, 22.10.2026, "Aluprof –
# system podtynkowy INTEGRO proszę dodać to zdjęcie", and the same for the system adaptacyjny; neither
# product had a photo at all.
PRODUCT_MAIN_PHOTOS = {
    "/produkty/fasady/": "/img/products/fasada-dom-szczytowy.webp",
    "/produkty/okna-drzwi-alu/": "/img/products/okna-alu-przesuwne.webp",
    "/produkty/podtynkowe-integro/": "/img/products/rolety-podtynkowe-integro.webp",
    "/produkty/adaptacyjne/": "/img/products/rolety-adaptacyjne.webp",
    # Client, 22.10.2026: "I główne zdjęcie moskitiery drzwiowe", resent 23.10.2026.
    "/produkty/drzwiowe/": "/img/products/moskitiera-drzwiowa.webp",
}

# Client PDF of 20.10.2026: the main photo stays, the old photos go and these follow it, in the
# order of the PDF. Fasady: the photos of the house with the tall gable glazing (PDF p. 3). Okna i
# drzwi ALU: "co tamte plus te" – the same photos plus those of PDF pp. 4–5. All are in Realizacje.
FACADE_PHOTOS = [
    "/img/realizacje/dom-nowoczesna-stodola-04.webp",
    "/img/realizacje/dom-nowoczesna-stodola-02.webp",
    "/img/realizacje/dom-nowoczesna-stodola-08.webp",
    "/img/realizacje/dom-nowoczesna-stodola-05.webp",
]
PRODUCT_GALLERIES = {
    "/produkty/fasady/": FACADE_PHOTOS,
    "/produkty/okna-drzwi-alu/": FACADE_PHOTOS + [
        "/img/realizacje/dom-nowoczesna-stodola-10.webp",
        "/img/realizacje/dom-pietrowy-duze-przeszklenia-06.webp",
        "/img/realizacje/dom-pietrowy-duze-przeszklenia-07.webp",
        "/img/realizacje/dom-pietrowy-duze-przeszklenia-03.webp",
        "/img/realizacje/dom-z-widokiem-01.webp",
        "/img/realizacje/dom-z-widokiem-02.webp",
        "/img/realizacje/okna-nad-brama-garazowa-03.webp",
    ],
}

# Profile rows shown on product pages.
PRODUCT_PROFILES = {
    "/produkty/okna-drzwi-alu/": ALU_PROFILES,
}

ALU_COPY = [
    ("p", "Szukasz stolarki okiennej, która połączy bezkompromisową wytrzymałość z minimalistycznym designem? Wybierz okna aluminiowe – rozwiązanie stworzone z myślą o nowoczesnej architekturze, domach energooszczędnych oraz spektakularnych wielkogabarytowych przeszkleniach. Zapomnij o ograniczeniach konstrukcyjnych i postaw na profile, które przetrwają próbę czasu."),
    ("p", "Dzięki plastyczności aluminium oraz zaawansowanym systemom technologicznym realizujemy nawet najbardziej śmiałe wizje architektoniczne:"),
    ("ul", [
        "Wielkie systemy przesuwne (HS): efektowne, bezprogowe wyjścia na taras, które płynnie łączą salon z ogrodem.",
        "Nowoczesne domy i rezydencje: przeszklenia narożne, fasady szklane oraz okna z ukrytym skrzydłem, nadające bryle budynku lekkości.",
        "Konstrukcje nietypowe: okna o niestandardowych gabarytach i kształtach dopasowane do indywidualnych projektów.",
    ]),
    ("p", "W naszej ofercie znajdziesz konstrukcje oparte na flagowych, sprawdzonych systemach Aluprof, Aluron oraz Procural (dawne Ponzio), które gwarantują najwyższą jakość technologiczną i design na światowym poziomie."),
]

# Product descriptions rewritten by the client; they replace the captured text of the old site.
PRODUCT_COPY = {
    "/produkty/okna-drzwi-alu/": ALU_COPY,
}

# Products added by the client corrections: (category route, product route, title, image, paragraphs, bullet list).
NEW_PRODUCTS = [
    (
        "/kategorie/zewnetrzne/", "/produkty/zaluzje-fasadowe/", "Żaluzje fasadowe", "/img/products/zaluzje-fasadowe.webp",
        [
            "Żaluzje fasadowe to nowoczesne systemy osłon zewnętrznych, które stanowią idealne dopełnienie współczesnej architektury. W przeciwieństwie do tradycyjnych rolet pozwalają na płynną regulację kąta nachylenia lameli, co daje pełną kontrolę nad ilością światła wpadającego do wnętrza bez konieczności całkowitego zasłaniania widoku za oknem.",
            "W ofercie posiadamy dwa najpopularniejsze typy profili: C80 (o tradycyjnym kształcie litery C, zapewniający płynny obrót lameli w obie strony) oraz Z90 (o kształcie litery Z, gwarantujący maksymalne zaciemnienie i podwyższoną odporność na wiatr). Oferujemy zarówno systemy podtynkowe do budynków w trakcie budowy, jak i natynkowe, idealne do obiektów już wykończonych.",
        ],
        [],
    ),
    (
        "/kategorie/moskitiery/", "/produkty/moskitiery-plisowane/", "Moskitiery plisowane", "/img/products/moskitiera-plisowana.webp",
        [
            "Moskitiera plisowana to najnowocześniejsze i najbardziej komfortowe rozwiązanie, które skutecznie chroni Twój dom przed komarami, muchami oraz innymi insektami. Dzięki unikalnej konstrukcji, w której siatka układa się w charakterystyczną harmonijkę, produkt ten doskonale sprawdza się w przypadku dużych przeszkleń, takich jak drzwi tarasowe, balkonowe czy wyjścia na ogród zimowy.",
        ],
        [
            "Oszczędność miejsca: siatka po złożeniu całkowicie chowa się w aluminiowym profilu bocznym, dzięki czemu nie zajmuje miejsca w świetle przejścia.",
            "Niski próg (bez barier): płaski próg ułatwia swobodne przechodzenie i jest w 100% bezpieczny dla dzieci, osób starszych oraz poruszających się na wózkach.",
            "Płynne przesuwanie: konstrukcja pozwala na zatrzymanie moskitiery w dowolnym miejscu – nie musisz otwierać jej do końca, aby wyjść na taras.",
            "Trwałość na lata: profile wykonane z ekstrudowanego aluminium są odporne na warunki atmosferyczne, a plisowana siatka z włókna szklanego nie odkształca się i nie płowieje od słońca.",
            "Estetyczny design: minimalistyczny wygląd idealnie wpisuje się w nowoczesną architekturę i nie zaburza wyglądu Twoich okien.",
        ],
    ),
    # Client, 22.10.2026: "do rolet zewnętrznych dodajemy nowe Rolety nadstawne", their text and main photo.
    (
        "/kategorie/zewnetrzne/", "/produkty/rolety-nadstawne/", "Rolety nadstawne", "/img/products/rolety-nadstawne.webp",
        [
            "Rolety nadstawne to niezwykle uniwersalne rozwiązanie, które umożliwia różnorodne metody montażu: bez zabudowy, z zabudową częściową lub całkowitą. Czoło skrzynki rolety służy jako podkład pod dowolny materiał wykończeniowy, takie jak styropian, tynk czy klinkier, co sprawia, że rolety te są niezauważalnym elementem fasady. Dzięki tej elastyczności można je łatwo dopasować do każdego rodzaju architektury budynku.",
            "Skrzynie rolet nadstawnych wykonane są z wysokiej jakości elementów PVC, co gwarantuje ich trwałość i odporność na warunki atmosferyczne. Dodatkowo, wnętrze skrzynek zostało dodatkowo docieplone, co znacząco poprawia parametry termiczne produktu. To rozwiązanie nie tylko zwiększa komfort cieplny wnętrza, ale również wspiera oszczędność energii.",
        ],
        [],
    ),
]

# Primary categories displayed in menus and catalog
PRIMARY_CATEGORIES = [
    ("Okna PCV", "/kategorie/okna-pcv/", "/img/products/okno-infinity-passive-83md.webp", ""),
    ("Drzwi wejściowe", "/kategorie/drzwi-zewnetrzne/", "/img/products/drzwi-zewnetrzne-stalowe.webp", ""),
    # Client, 23.10.2026: "zmienić jedno zdjęcie główne drzwi wewnętrznych" – their photo replaces the Malaga W-5.
    ("Drzwi wewnętrzne", "/kategorie/drzwi-wewnetrzne/", "/img/products/drzwi-wewnetrzne-dab-szyba.webp", ""),
    ("Bramy garażowe", "/kategorie/bramy-garazowe/", "/img/products/brama-segmentowa.webp", ""),
    ("Stolarka aluminiowa", "/kategorie/stolarka-aluminiowa/", "/img/products/fasada-dom-szczytowy.webp", ""),
    # Client, 23.10.2026: "zmienimy nazwę zakładki rolety na Osłony okienne" (the address /kategorie/rolety/
    # stays), then their showroom wall for the tile: "zdjęcie główne osłon okiennych będzie takie".
    ("Osłony okienne", "/kategorie/rolety/", "/img/products/oslony-okienne-ekspozycja.webp", ""),
    # Client, 21.10.2026: the black sill photo they sent as the main sill picture.
    ("Parapety i blaty", "/kategorie/parapety-blaty/", "/img/products/parapety-blaty.webp", ""),
    # Client, 22.10.2026: "główne zdjecie moskitier", cut out of its white frame.
    ("Moskitiery", "/kategorie/moskitiery/", "/img/products/moskitiera-siatka.webp", ""),
]

# Category links in the "Kategorie:" bar and the sidebar: the main categories plus Żaluzje i plisy after
# Osłony okienne.
NAV_CATEGORIES = []
for _name, _href, _, _ in PRIMARY_CATEGORIES:
    NAV_CATEGORIES.append((_name, _href))
    if _href == "/kategorie/rolety/":
        NAV_CATEGORIES.append(("Żaluzje i plisy", "/kategorie/zaluzje-plisy/"))

# Realizacje in place of the reference letters (client PDF p. 1). The client's photos came unlabelled,
# so they are split into three kinds of work; within "Okna" photos of the same house stay together.
# Photos only, no descriptions (client, 10.2026). The first photo is the cover; its grid thumbnail is
# /img/realizacje/miniatury/<file name of the photo>. The photos sent with the client PDF of
# 20.10.2026 are added to the houses they show ("do realizacji można dodać te zdjęcia wszystkie").
REALIZATIONS = [
    {
        "slug": "okna",
        "title": "Okna",
        "photos": [
            "/img/products/fasada-dom-szczytowy.webp",
            "/img/realizacje/dom-nowoczesna-stodola-02.webp",
            "/img/realizacje/dom-nowoczesna-stodola-03.webp",
            "/img/realizacje/dom-nowoczesna-stodola-04.webp",
            "/img/realizacje/dom-nowoczesna-stodola-05.webp",
            "/img/realizacje/dom-nowoczesna-stodola-06.webp",
            "/img/realizacje/dom-nowoczesna-stodola-07.webp",
            "/img/realizacje/dom-nowoczesna-stodola-08.webp",
            "/img/realizacje/dom-nowoczesna-stodola-09.webp",
            "/img/realizacje/dom-nowoczesna-stodola-10.webp",
            "/img/realizacje/dom-pietrowy-duze-przeszklenia-01.webp",
            "/img/realizacje/dom-pietrowy-duze-przeszklenia-02.webp",
            "/img/realizacje/dom-pietrowy-duze-przeszklenia-03.webp",
            "/img/realizacje/dom-pietrowy-duze-przeszklenia-04.webp",
            "/img/realizacje/dom-pietrowy-duze-przeszklenia-05.webp",
            "/img/realizacje/dom-pietrowy-duze-przeszklenia-06.webp",
            "/img/realizacje/dom-pietrowy-duze-przeszklenia-07.webp",
            "/img/realizacje/dom-pietrowy-duze-przeszklenia-08.webp",
            "/img/realizacje/dom-z-dachem-czterospadowym-01.webp",
            "/img/realizacje/dom-z-dachem-czterospadowym-02.webp",
            "/img/realizacje/okna-narozne-01.webp",
            "/img/realizacje/okna-narozne-02.webp",
            "/img/realizacje/dom-z-widokiem-01.webp",
            "/img/realizacje/dom-z-widokiem-02.webp",
            "/img/realizacje/okna-nad-brama-garazowa-03.webp",
            "/img/montage/zabezpieczenie-folii.webp",
            "/img/montage/zabezpieczenie-folii-2.webp",
            "/img/montage/zabezpieczenie-folii-od-zewn_trz-1.webp",
            "/img/montage/zabezpieczenie-folii-od-zewn_trz-2.webp",
            "/img/montage/termoparapet-balkonowy.webp",
            "/img/products/okna-alu-przesuwne.webp",
            "/img/montage/klinaryt-drzwi-HST.webp",
            # Client, 23.10.2026: "dodaj je do sekcji realizacji" – four photos of one house.
            "/img/realizacje/dom-okna-zloty-dab-01.webp",
            "/img/realizacje/dom-okna-zloty-dab-02.webp",
            "/img/realizacje/dom-okna-zloty-dab-03.webp",
            "/img/realizacje/dom-okna-zloty-dab-04.webp",
        ],
    },
    {
        "slug": "bramy",
        "title": "Bramy",
        "photos": [
            "/img/realizacje/okna-nad-brama-garazowa-01.webp",
            "/img/realizacje/okna-nad-brama-garazowa-02.webp",
        ],
    },
    {
        "slug": "drzwi",
        "title": "Drzwi",
        "photos": [
            "/img/realizacje/drzwi-wejsciowe-01.webp",
            "/img/realizacje/drzwi-wejsciowe-02.webp",
            "/img/realizacje/drzwi-wewnetrzne-01.webp",
        ],
    },
]

# Sills of the manufacturer Medos (medosparapety.pl, 20.10.2026) that replace the old sill kinds (client):
# names, photos and parameter lists as Medos gives them, no text of our own. A parameter is a string,
# a pair (item, sub-items) or a pair (item, photo shown with it).
SILL_CATEGORIES = {
    '/kategorie/parapety-wewnetrzne/': "Parapety wewnętrzne",
    '/kategorie/parapety-zewnetrzne/': "Parapety zewnętrzne",
}
# The rest of the Medos sill offer, on the "Parapety i blaty" page: names only, linked to
# medosparapety.pl, grouped and ordered as Medos lists them (client, 20.10.2026).
# [(Medos group, [(name, address)])]
SILL_MEDOS_LINKS = [
    ("Parapety wewnętrzne", [
        ("Parapet MDF zielona płyta", "https://medosparapety.pl/pl/parapet-mdf-zielona-plyta/"),
        ("Parapet MDF - MDS", "https://medosparapety.pl/pl/parapet-mdf-mds/"),
        ("Parapet PVC softline", "https://medosparapety.pl/pl/parapet-pvc-softline/"),
        ("Parapet Postforming modern", "https://medosparapety.pl/pl/parapet-postforming-modern/"),
        ("Parapet Postforming", "https://medosparapety.pl/pl/parapet-postforming/"),
        ("Nakładka renowacyjna komorowa", "https://medosparapety.pl/pl/nakladka-renowacyjna-komorowa/"),
        ("Nakładka renowacyjna premium", "https://medosparapety.pl/pl/nakladka-renowacyjna-premium/"),
    ]),
    ("Parapety zewnętrzne", [
        ("Parapet stalowy softline", "https://medosparapety.pl/pl/parapet-stalowy-softline/"),
        ("Parapet stalowy laminowany", "https://medosparapety.pl/pl/parapet-stalowy-laminowany/"),
        ("Parapet stalowy laminowany softline", "https://medosparapety.pl/pl/parapet-stalowy-laminowany-softline/"),
        ("Parapet stalowy lakierowany", "https://medosparapety.pl/pl/parapet-stalowy-lakierowany/"),
        ("Parapet stalowy lakierowany softline", "https://medosparapety.pl/pl/parapet-stalowy-lakierowany-softline/"),
        ("Parapet aluminiowy - imitacja płytki", "https://medosparapety.pl/pl/parapet-aluminiowy-imitacja-plytki/"),
    ]),
]
# [(category route, product route, title, photos, parameters)]
SILL_PRODUCTS = [
    ('/kategorie/parapety-wewnetrzne/', '/produkty/parapet-granit/', 'Granit', [
        '/img/parapety/parapet-granit/granit--wiz-6.webp',
        '/img/parapety/parapet-granit/granit--wiz-2.webp',
        '/img/parapety/parapet-granit/granit--wiz-3.webp',
        '/img/parapety/parapet-granit/granit--wiz-5.webp',
        '/img/parapety/parapet-granit/granit--wiz-1.webp',
        '/img/parapety/parapet-granit/granit--wiz-4.webp',
    ], [
        'zastosowanie: wewnętrzne i zewnętrzne',
        'szerokość: 10 - 60 cm',
        'maksymalna długość pojedynczego elementu: 280 cm',
        'grubość parapetu: 2 lub 3 cm',
        ('w standardzie (bez dopłaty) narożnik prosty', [
                'zgodnie z określonymi wymiarami',
                'wg załączonego projektu (z uwzględnieniem możliwości technicznych)',
            ]),
        'możliwość niestandardowego wykończenia rantów',
    ]),
    ('/kategorie/parapety-wewnetrzne/', '/produkty/parapet-konglomerat-marmurowy/', 'Konglomerat marmurowy', [
        '/img/parapety/parapet-konglomerat-marmurowy/konglomerat--wiz-4.webp',
        '/img/parapety/parapet-konglomerat-marmurowy/konglomerat--wiz-1.webp',
        '/img/parapety/parapet-konglomerat-marmurowy/konglomerat--wiz-3.webp',
        '/img/parapety/parapet-konglomerat-marmurowy/konglomerat--wiz-2.webp',
    ], [
        'zastosowanie: wewnętrzne',
        'szerokość: 10 - 60 cm',
        'maksymalna długość pojedynczego elementu: 320 cm',
        'grubość parapetu: 2 lub 3 cm',
        ('każdy parapet wykonywany jest pod indywidualne zamówienie', [
                'zgodnie z określonymi wymiarami',
                'wg załączonego projektu (z uwzględnieniem możliwości technicznych)',
            ]),
        'możliwość niestandardowego wykończenia rantów',
    ]),
    ('/kategorie/parapety-wewnetrzne/', '/produkty/parapet-konglomerat-kwarcowy/', 'Konglomerat kwarcowy', [
        '/img/parapety/parapet-konglomerat-kwarcowy/konglomerat-kwarcowy--wiz-2.webp',
        '/img/parapety/parapet-konglomerat-kwarcowy/konglomerat-kwarcowy--wiz-3.webp',
        '/img/parapety/parapet-konglomerat-kwarcowy/konglomerat-kwarcowy--wiz-1.webp',
        '/img/parapety/parapet-konglomerat-kwarcowy/konglomerat-kwarcowy--wiz-4.webp',
    ], [
        'zastosowanie: wewnętrzne',
        'szerokość: 10 - 60 cm',
        'maksymalna długość pojedynczego elementu: 320 cm',
        'grubość parapetu: 2 cm',
        'w standardzie (bez dopłaty) narożnik prosty',
        ('każdy parapet wykonywany jest pod indywidualne zamówienie', [
                'zgodnie z określonymi wymiarami',
                'wg załączonego projektu (z uwzględnieniem możliwości technicznych)',
            ]),
        'możliwość niestandardowego wykończenia rantów',
    ]),
    ('/kategorie/parapety-wewnetrzne/', '/produkty/parapet-mdf-laminowany/', 'Parapet MDF laminowany', [
        '/img/parapety/parapet-mdf-laminowany/parapet-mdf-laminowany--wiz-3.webp',
        '/img/parapety/parapet-mdf-laminowany/parapet-mdf-laminowany--wiz-2.webp',
        '/img/parapety/parapet-mdf-laminowany/parapet-mdf-laminowany--wiz-6.webp',
        '/img/parapety/parapet-mdf-laminowany/parapet-mdf-laminowany--wiz-4.webp',
        '/img/parapety/parapet-mdf-laminowany/parapet-mdf-laminowany--wiz-1.webp',
        '/img/parapety/parapet-mdf-laminowany/parapet-mdf-laminowany--wiz-5.webp',
    ], [
        'maksymalna długość parapetów (w jednym elemencie): 250 cm',
        ('parapety powyżej 250 cm łączone od spodu specjalnym łącznikiem:', '/img/parapety/parapet-mdf-laminowany/lacznik-parapetow-MDF.webp'),
        'maksymalna szerokość: 90 cm',
        'dostępne grubości: 2 cm, 2,5 cm, 3 cm i 4 cm (tolerancja (+/-) 2 mm)',
        'każdy parapet wykonywany jest pod indywidualny wymiar podany przez klienta',
        'możliwość wykonania wcięć wg własnego projektu',
        'możliwość niestandardowego wykończenia rantów',
    ]),
    ('/kategorie/parapety-wewnetrzne/', '/produkty/parapet-pvc/', 'Parapet PVC', [
        '/img/parapety/parapet-pvc/parapet-pvc--wiz-4.webp',
        '/img/parapety/parapet-pvc/parapet-pvc--wiz-1.webp',
        '/img/parapety/parapet-pvc/parapet-pvc--wiz-5.webp',
        '/img/parapety/parapet-pvc/parapet-pvc--wiz-3.webp',
        '/img/parapety/parapet-pvc/parapet-pvc--wiz-2.webp',
        '/img/parapety/parapet-pvc/parapet-pvc--wiz-6.webp',
    ], [
        'szerokości: od 15 do 40 cm (co 5 cm), 50 cm, biały i marmur dodatkowo w szerokości 60 cm',
        'długość maksymalna – 600 cm',
        'grubość parapetu – 2 cm',
        'grubość ścianki – 1,3 mm',
        'możliwość docięcia parapetu na szerokość',
        'każdy parapet wykonywany jest pod indywidualny wymiar podany przez klienta',
        'zabezpieczenie folią ochronną',
    ]),
    ('/kategorie/parapety-zewnetrzne/', '/produkty/parapet-stalowy/', 'Parapet stalowy', [
        '/img/parapety/parapet-stalowy/parapet-stalowy--wiz-1.webp',
        '/img/parapety/parapet-stalowy/parapet-stalowy--wiz-4.webp',
        '/img/parapety/parapet-stalowy/parapet-stalowy--wiz-2.webp',
        '/img/parapety/parapet-stalowy/parapet-stalowy--wiz-3.webp',
    ], [
        'szerokość: od 10 do 40 cm (co 2,5 cm)',
        'maksymalna długość pojedynczego elementu – 600 cm',
        'grubość blachy – 0,7 mm (+/- 0,05 mm)',
        'grubość powłoki lakierniczej 25 μm',
        'każdy parapet wykonywany jest pod indywidualny wymiar podany przez klienta',
        'zabezpieczenie folią ochronną',
        'możliwość wykonania parapetu w dowolnym kolorze z palety RAL !',
    ]),
    ('/kategorie/parapety-zewnetrzne/', '/produkty/parapet-aluminiowy/', 'Parapet aluminiowy', [
        '/img/parapety/parapet-aluminiowy/parapet-aluminiowy--wiz-1.webp',
        '/img/parapety/parapet-aluminiowy/parapet-aluminiowy--wiz-2.webp',
    ], [
        'szerokość: od 10 do 40 cm (co 2,5 cm)',
        'maksymalna długość pojedynczego elementu – 600 cm',
        'grubość aluminium – 1,0 mm',
        'każdy parapet wykonywany jest pod indywidualny wymiar podany przez klienta',
        'zabezpieczenie folią ochronną',
        'możliwość wykonania parapetu w dowolnej kolorystyce RAL !',
    ]),
]

# Their colours. Swatches: /img/parapety/kolory/miniatury/<file>.webp; the sill in that colour, shown
# when the swatch is picked (as on medosparapety.pl): /img/parapety/kolory/parapet/<file>.webp.
# {product route: [(colour, file)]}
SILL_PALETTES = {
    '/produkty/parapet-granit/': [
        ('Absolute Black', 'parapet-granit-absoluteblack'),
        ('Absolute Black Lapatura', 'parapet-granit-absoluteblacklapatura'),
        ('Black Antracite', 'parapet-granit-blackantracite'),
        ('Black Antracite Lapatura', 'parapet-granit-blackantracitelapatura'),
        ('Brąz Królewski', 'parapet-granit-brazkrolewski'),
        ('Cambodia', 'parapet-granit-cambodia'),
        ('Cambodia Lapatura', 'parapet-granit-cambodialapatura'),
        ('Coffee Brown', 'parapet-granit-coffeebrown'),
        ('Coffee Brown Lapatura', 'parapet-granit-coffeebrownlapatura'),
        ('Galaxy Star', 'parapet-granit-galaxystar'),
        ('Galaxy Star Lapatura', 'parapet-granit-galaxystarlapatura'),
        ('Golden Dream', 'parapet-granit-goldendream'),
        ('Grey', 'parapet-granit-grey'),
        ('Nero Impala', 'parapet-granit-neroimpala'),
        ('Steel Grey', 'parapet-granit-steelgrey'),
        ('Steel Grey Mat', 'parapet-granit-steelgreymat'),
    ],
    '/produkty/parapet-konglomerat-marmurowy/': [
        ('Baltic Grey', 'parapet-konglomerat-marmurowy-balticgrey'),
        ('Beige Marfil', 'parapet-konglomerat-marmurowy-beigemarfil'),
        ('Bianco Ambra', 'parapet-konglomerat-marmurowy-biancoambra'),
        ('Bianco Carrara', 'parapet-konglomerat-marmurowy-biancocarrara'),
        ('Bianco Mandorla', 'parapet-konglomerat-marmurowy-biancomandorla'),
        ('Bianco Micro', 'parapet-konglomerat-marmurowy-biancomicro'),
        ('Botticino', 'parapet-konglomerat-marmurowy-botticino'),
        ('Calacatta', 'parapet-konglomerat-marmurowy-calacatta'),
        ('Crystal White', 'parapet-konglomerat-marmurowy-crystalwhite'),
        ('Finnish Black', 'parapet-konglomerat-marmurowy-finnishblack'),
        ('Grigio Perla', 'parapet-konglomerat-marmurowy-grigioperla'),
        ('Grigio Torun', 'parapet-konglomerat-marmurowy-grigiotorun'),
        ('Kala White', 'parapet-konglomerat-marmurowy-kalawhite'),
        ('Lino', 'parapet-konglomerat-marmurowy-lino'),
        ('Madreperla', 'parapet-konglomerat-marmurowy-madreperla'),
        ('Misty Carrara', 'parapet-konglomerat-marmurowy-mistycarrara'),
        ('Perlato', 'parapet-konglomerat-marmurowy-perlato'),
        ('Polare', 'parapet-konglomerat-marmurowy-polare'),
        ('Silver Grey', 'parapet-konglomerat-marmurowy-silvergrey'),
        ('Super White', 'parapet-konglomerat-marmurowy-superwhite'),
        ('Venus', 'parapet-konglomerat-marmurowy-venus'),
        ('White Perl', 'parapet-konglomerat-marmurowy-whiteperl'),
    ],
    '/produkty/parapet-konglomerat-kwarcowy/': [
        ('Agnolo', 'parapet-konglomerat-kwarcowy-agnolo'),
        ('Ancient Beige', 'parapet-konglomerat-kwarcowy-ancientbeige'),
        ('Ashen White', 'parapet-konglomerat-kwarcowy-ashenwhite'),
        ('Black Forest', 'parapet-konglomerat-kwarcowy-blackforest'),
        ('Black Oro', 'parapet-konglomerat-kwarcowy-blackoro'),
        ('Casablanca', 'parapet-konglomerat-kwarcowy-casablanca'),
        ('Concrete Tan', 'parapet-konglomerat-kwarcowy-concretetan'),
        ('Corfu', 'parapet-konglomerat-kwarcowy-corfu'),
        ('Grant Grey', 'parapet-konglomerat-kwarcowy-grantgrey'),
        ('Lagoon White', 'parapet-konglomerat-kwarcowy-lagoonwhite'),
        ('Marcus Pearl', 'parapet-konglomerat-kwarcowy-marcuspearl'),
        ('Naxos', 'parapet-konglomerat-kwarcowy-naxos'),
        ('New Carrara', 'parapet-konglomerat-kwarcowy-newcarrara'),
        ('Pietre Grey', 'parapet-konglomerat-kwarcowy-pietregrey'),
        ('Santorini', 'parapet-konglomerat-kwarcowy-santorini'),
        ('Semolina', 'parapet-konglomerat-kwarcowy-semolina'),
        ('Tin Foil', 'parapet-konglomerat-kwarcowy-tinfoil'),
        ('Winter Haze', 'parapet-konglomerat-kwarcowy-winterhaze'),
    ],
    '/produkty/parapet-mdf-laminowany/': [
        ('Biały mat', 'parapet-mdf-laminowany-bialymat'),
        ('Biały połysk', 'parapet-mdf-laminowany-bialypolysk'),
        ('Calacatta', 'parapet-mdf-laminowany-calacatta'),
        ('Marmur', 'parapet-mdf-laminowany-marmur'),
        ('Białe drewno', 'parapet-mdf-laminowany-bialedrewno'),
        ('Popiel', 'parapet-mdf-laminowany-popiel'),
        ('Dąb bielony', 'parapet-mdf-laminowany-dabbielony'),
        ('Dąb halifax biały', 'parapet-mdf-laminowany-dabhalifaxbialy'),
        ('Beton', 'parapet-mdf-laminowany-beton'),
        ('Aluminium 58', 'parapet-mdf-laminowany-aluminium58'),
        ('Grenada', 'parapet-mdf-laminowany-grenada'),
        ('Antracyt mat', 'parapet-mdf-laminowany-antracytmat'),
        ('Czarny', 'parapet-mdf-laminowany-czarny'),
        ('Wenge deska', 'parapet-mdf-laminowany-wengedeska'),
        ('Ciemny orzech', 'parapet-mdf-laminowany-ciemnyorzech'),
        ('Orzech', 'parapet-mdf-laminowany-orzech'),
        ('Orzech lanzado', 'parapet-mdf-laminowany-orzechlanzado'),
        ('Złoty dąb', 'parapet-mdf-laminowany-zlotydab'),
        ('Dąb antyczny', 'parapet-mdf-laminowany-dabantyczny'),
        ('Dąb halifax tabac', 'parapet-mdf-laminowany-dabhalifaxtabac'),
        ('Dąb ribbeck', 'parapet-mdf-laminowany-dabribbeck'),
        ('Dąb riviera', 'parapet-mdf-laminowany-dabriviera'),
        ('Dąb rustico', 'parapet-mdf-laminowany-dabrustico'),
        ('Woodec', 'parapet-mdf-laminowany-woodec'),
        ('Winchester', 'parapet-mdf-laminowany-winchester'),
        ('Dąb artisan', 'parapet-mdf-laminowany-dabartisan'),
        ('Dąb naturalny', 'parapet-mdf-laminowany-dabnaturalny'),
        ('Dąb halifax naturalny', 'parapet-mdf-laminowany-dabhalifaxnaturalny'),
    ],
    '/produkty/parapet-pvc/': [
        ('Biały', 'parapet-pvc-bialy'),
        ('Marmur', 'parapet-pvc-marmur'),
        ('Srebrny', 'parapet-pvc-srebrny'),
        ('Dąb wiejski', 'parapet-pvc-dabwiejski'),
        ('Dąb naturalny', 'parapet-pvc-dabnaturalny'),
        ('Winchester', 'parapet-pvc-winchester'),
        ('Złoty dąb', 'parapet-pvc-zlotydab'),
        ('Orzech', 'parapet-pvc-orzech'),
        ('Antracyt', 'parapet-pvc-antracyt'),
        ('Czarny mat', 'parapet-pvc-czarnymat'),
    ],
    '/produkty/parapet-stalowy/': [
        ('Brąz RAL 8019', 'parapet-stalowy-brazral8019'),
        ('Brąz RAL 8017', 'parapet-stalowy-brazral8017'),
        ('Biały RAL 9016', 'parapet-stalowy-bialyral9016'),
        ('Srebrny RAL 9006', 'parapet-stalowy-srebrnyral9006'),
        ('Antracyt RAL 7024', 'parapet-stalowy-antracytral7024'),
        ('RAL 7021', 'parapet-stalowy-ral7021'),
        ('Antracyt RAL 7016', 'parapet-stalowy-antracytral7016'),
        ('Czarny RAL 9005', 'parapet-stalowy-czarnyral9005'),
        ('Srebrny RAL 9007', 'parapet-stalowy-srebrnyral9007'),
        ('Srebrny RAL 7037 Piasek', 'parapet-stalowy-srebrnyral7037piasek'),
        ('Antracyt RAL 7016 Piasek', 'parapet-stalowy-antracytral7016piasek'),
    ],
    '/produkty/parapet-aluminiowy/': [
        ('Biały RAL 9016', 'parapet-aluminiowy-bialyral9016'),
        ('Brąz RAL 8019', 'parapet-aluminiowy-brazral8019'),
        ('Antracyt RAL 7016', 'parapet-aluminiowy-antracytral7016'),
        ('RAL 7021 mat', 'parapet-aluminiowy-ral7021mat'),
        ('Czarny RAL 9005', 'parapet-aluminiowy-czarnyral9005'),
    ],
}
# Their descriptions and files to download, as on medosparapety.pl (client: copy the descriptions).
# {product route: [paragraph]}
SILL_DESCRIPTIONS = {
    '/produkty/parapet-granit/': [
        'Granit jest twardą skałą o budowie jawnokrystalicznej, zbudowaną z kwarcu, skalenia potasowego i plagioklazu oraz biotytu. Materiał w 100% naturalny, wysoko ceniony przez miłośników surowej prostoty połączonej z wyjątkową jakością i elegancją. Ze względu na dostępność dużych bloków, łatwość cięcia i polerowania oraz nieocenione walory estetyczne znalazł szerokie zastosowanie zarówno jako kamień budowlany, jak i dekoracyjny.',
        'Dzięki odporności na działanie kwasów i niezwykłej wytrzymałości na skrajne czynniki atmosferyczne, jako jedyny ma zastosowanie w warunkach zewnętrznych. Wyjątkowość tego materiału dopełnia różnorodność możliwych do uzyskania stylizacji powierzchni (połysk, mat, lapatura), dzięki czemu perfekcyjnie kreuje klimat i podkreśla zmysłowość wnętrz.',
    ],
    '/produkty/parapet-konglomerat-marmurowy/': [
        'Konglomerat marmurowy jest cenionym w budownictwie produktem, będącym mieszanką wyselekcjonowanych odłamków naturalnego marmuru (95%) i żywicy polimerowej pełniącej rolę spoiwa.',
        'Mnogość możliwych barw, struktur oraz stopnia rozdrobnienia zastosowanych kamieni pozwala na otrzymanie płyt o największym zróżnicowaniu wizualnym wśród materiałów kamiennych.”',
        'Aglomarmur jest stosunkowo łatwy w kształtowaniu dzięki czemu, po odpowiedniej obróbce, powstają odporne na ścieranie, gładkie, błyszczące powierzchnie, przywodzące na myśl szlachetne wnętrza starożytnej Grecji i Rzymu, pełne ponadczasowego prestiżu i elegancji.',
    ],
    '/produkty/parapet-konglomerat-kwarcowy/': [
        'Najszlachetniejszy rodzaj konglomeratu, zawierający powyżej 90% naturalnego kwarcu w postaci zmielonych kamieni lub piasku oraz spoiwa – zwykle żywicy epoksydowej. Do jego produkcji stosuje się rozmaite dodatki np. fragmenty szkła, ceramiki, pigmenty koloryzujące, drobiny granitu lub marmuru, wpływające na ostateczny wygląd i trwałość. Nowoczesne technologie produkcji umożliwiają uzyskanie płyt o bardzo dobrej powtarzalności, przy zachowaniu bogatej kolorystyki i różnorodności tekstur.',
        'Produkt końcowy zachowuje właściwości wykorzystanego kamienia, a w niektórych aspektach nawet je przewyższa. Tworzy efektowną, estetyczną powierzchnię, odporną na wysoką temperaturę, zabrudzenia i uszkodzenia mechaniczne.',
        'Konglomerat kwarcowy to piękno i solidność, cieszące się niesłabnącą popularnością wśród projektantów wnętrz.',
    ],
    '/produkty/parapet-mdf-laminowany/': [
        'Parapet MDF jest produktem drewnopodobnym, powstałym w wyniku sprasowania włókien drzewnych z dodatkiem związków organicznych, łączonych i utwardzonych w warunkach wysokiego ciśnienia i temperatury. Płyta MDF jest wilgocioodporna. Jest bardzo dobrym substytutem dla drewna naturalnego. Nie zawiera żadnych strukturalnych niedoskonałości typu sęki, złe ułożenie włókien, wiek rdzeni, pęknięcia, czy też przeżywiczenia. Parapet MDF w połączeniu z okleiną PVC powstaje pod wysokim ciśnieniem oraz w wysokiej temperaturze, przez co produkt staje się wytrzymały na otarcia oraz zarysowania. Wszystkie parapety są dwustronnie laminowane (spód - laminat w kolorze białym). Szeroka gama kolorystyczna parapetów dostępna w ofercie pozwala dobrać parapet do niemalże każdego okna.',
    ],
    '/produkty/parapet-pvc/': [
        'Parapety wykonane z PVC od wielu lat pokrywają zapotrzebowanie rynków budowlanych na całym świecie. Są przykładem zachowania idealnego balansu między ceną a jakością produktu. Właściwości materiału gwarantują odporność na wilgoć i temperaturę, a przekrój komorowy nadaje sztywność konstrukcji oraz gwarantuje stabilność parapetu. Parapety powlekane są folią wysokiej jakości, co zwiększa ich odporność na zarysowania oraz na działanie promieni słonecznych. Gładka powierzchnia okleiny ułatwia pielęgnację i zapobiega ich trwałym zabrudzeniom. Standardową linię parapetów PVC charakteryzuje klasyczna prostota dzięki czemu produkt idealnie sprawdzi się zarówno w nowoczesnych, surowych wnętrzach, jak i w pomieszczeniach o dużej ilości dominujących szczegółów.',
    ],
    '/produkty/parapet-stalowy/': [
        'Parapety wykonane z wysokiej klasy blachy ocynkowanej ogniowo powlekanej lakierem poliestrowym. Połączenie powłok ochronnych: ogniowo ocynkowanych i powłok organicznych w jednym wyrobie, ma za zadanie zapewnienie wysokich walorów użytkowych i estetycznych oraz długotrwałej żywotności elementów z nich wykonanych. Prosta linia i wysoka estetyka wykonania sprawiają, że parapet idealnie komponuje się z każdym oknem.',
    ],
    '/produkty/parapet-aluminiowy/': [
        'Aluminium łączy w sobie unikalną kombinację pożądanych własności takich jak: niewielka masa, wysoka wytrzymałość, plastyczność, podatność na obróbkę czy wysoka odporność na korozję. W odróżnieniu od większości gatunków stali, glin nie kruszeje w niskich temperaturach, lecz zwiększa swą wytrzymałość. Wysokiej jakości proszkowa powłoka malarska oraz klasyczny kształt gwarantują estetyczny wygląd i kompatybilność z mnogością typów elewacji.',
    ],
}
# {product route: [(title, address)]}
SILL_DOWNLOADS = {
    '/produkty/parapet-granit/': [
        ('rysunek techniczny (.pdf)', 'https://medosparapety.pl/mstatic/images/products/granit/files/granit--rystech.pdf'),
        ('deklaracja właściwości użytkowych (.pdf)', 'https://medosparapety.pl/mstatic/images/products/granit/files/granit--deklaracja.pdf'),
        ('deklaracja właściwości użytkowych (.pdf)', 'https://medosparapety.pl/mstatic/images/products/granit/files/granit--deklaracja2.pdf'),
        ('instrukcja montażu parapetu wewnętrznego (.pdf)', 'https://medosparapety.pl/mstatic/images/products/granit/files/granit--instrukcja_parapet_wew.pdf'),
        ('instrukcja montażu parapetu zewnętrznego (.pdf)', 'https://medosparapety.pl/mstatic/images/products/granit/files/granit--instrukcja_parapet_zew.pdf'),
    ],
    '/produkty/parapet-konglomerat-marmurowy/': [
        ('rysunek techniczny (.pdf)', 'https://medosparapety.pl/mstatic/images/products/konglomerat-marmurowy/files/konglomerat--rystech.pdf'),
        ('deklaracja właściwości użytkowych (.pdf)', 'https://medosparapety.pl/mstatic/images/products/konglomerat-marmurowy/files/konglomerat--deklaracja.pdf'),
        ('deklaracja właściwości użytkowych (.pdf)', 'https://medosparapety.pl/mstatic/images/products/konglomerat-marmurowy/files/konglomerat--deklaracja2.pdf'),
        ('instrukcja montażu parapetu wewnętrznego (.pdf)', 'https://medosparapety.pl/mstatic/images/products/konglomerat-marmurowy/files/konglomerat--instrukcja_parapet_wew.pdf'),
    ],
    '/produkty/parapet-konglomerat-kwarcowy/': [
        ('rysunek techniczny (.pdf)', 'https://medosparapety.pl/mstatic/images/products/konglomerat-kwarcowy/files/konglomerat-kwarcowy--rystech.pdf'),
        ('deklaracja właściwości użytkowych (.pdf)', 'https://medosparapety.pl/mstatic/images/products/konglomerat-kwarcowy/files/konglomerat-kwarcowy--deklaracja.pdf'),
        ('deklaracja właściwości użytkowych (.pdf)', 'https://medosparapety.pl/mstatic/images/products/konglomerat-kwarcowy/files/konglomerat-kwarcowy--deklaracja2.pdf'),
        ('instrukcja montażu parapetu wewnętrznego (.pdf)', 'https://medosparapety.pl/mstatic/images/products/konglomerat-kwarcowy/files/konglomerat-kwarcowy--instrukcja_parapet_wew.pdf'),
    ],
    '/produkty/parapet-mdf-laminowany/': [
        ('rysunek techniczny (.pdf)', 'https://medosparapety.pl/mstatic/images/products/parapet-mdf-laminowany/files/parapet-mdf-laminowany--rystech.pdf'),
        ('deklaracja właściwości użytkowych (.pdf)', 'https://medosparapety.pl/mstatic/images/products/parapet-mdf-laminowany/files/parapet-mdf-laminowany--deklaracja.pdf'),
    ],
    '/produkty/parapet-pvc/': [
        ('rysunek techniczny (.pdf)', 'https://medosparapety.pl/mstatic/images/products/parapet-pvc/files/parapet-pvc--rystech.pdf'),
        ('deklaracja właściwości użytkowych (.pdf)', 'https://medosparapety.pl/mstatic/images/products/parapet-pvc/files/parapet-pvc--deklaracja.pdf'),
        ('aprobata techniczna (.pdf)', 'https://medosparapety.pl/mstatic/images/products/parapet-pvc/files/parapet-pvc--aprobata.pdf'),
        ('atest higieniczny (.pdf)', 'https://medosparapety.pl/mstatic/images/products/parapet-pvc/files/parapet-pvc--atest.pdf'),
    ],
    '/produkty/parapet-stalowy/': [
        ('rysunek techniczny (.pdf)', 'https://medosparapety.pl/mstatic/images/products/parapet-stalowy/files/parapet-stalowy--rystech.pdf'),
        ('deklaracja właściwości użytkowych (.pdf)', 'https://medosparapety.pl/mstatic/images/products/parapet-stalowy/files/parapet-stalowy--deklaracja.pdf'),
    ],
    '/produkty/parapet-aluminiowy/': [
        ('rysunek techniczny (.pdf)', 'https://medosparapety.pl/mstatic/images/products/parapet-aluminiowy/files/parapet-aluminiowy--rystech.pdf'),
        ('deklaracja właściwości użytkowych (.pdf)', 'https://medosparapety.pl/mstatic/images/products/parapet-aluminiowy/files/parapet-aluminiowy--deklaracja.pdf'),
    ],
}


# Subcategories definition for parent categories
SUBCATEGORIES = {
    "/kategorie/parapety-blaty/": [
        ("Parapety wewnętrzne", "/kategorie/parapety-wewnetrzne/", "/img/parapety/parapet-granit/granit--wiz-6.webp", "", ""),
        ("Parapety zewnętrzne", "/kategorie/parapety-zewnetrzne/", "/img/parapety/parapet-stalowy/parapet-stalowy--wiz-1.webp", "", ""),
    ],
    # Client, 23.10.2026: "w zakładce rolety żeby 1 były zewnętrzne a nie wewnętrzne", then their photo
    # for the tile: "a to ma być zdjęcie rolety zewnętrznej". Without Moskitiery: "z zakładki osłony
    # okienne wyrzucamy moskitiery bo one są osobno jeszcze".
    "/kategorie/rolety/": [
        ("Rolety zewnętrzne", "/kategorie/zewnetrzne/", "/img/products/rolety-zewnetrzne.webp", "", ""),
        ("Rolety wewnętrzne", "/kategorie/wewnetrzne/", "/img/thumbs/dzien-noc-2-130x86.webp", "", ""),
        ("Żaluzje i plisy", "/kategorie/zaluzje-plisy/", "/img/products/zaluzje-drewniane.webp", "", ""),
    ],
}

def esc(value: str) -> str:
    return html.escape(str(value or ""), quote=True)


def normalize(value: str) -> str:
    value = value.casefold().replace("ł", "l")
    value = unicodedata.normalize("NFKD", value)
    value = "".join(char for char in value if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


def slugify(value: str) -> str:
    return normalize(value).replace(" ", "-") or "sekcja"


def route_for(url: str) -> str:
    path = re.sub(r"\?.*$", "", url.split("wol-bud.com.pl", 1)[-1])
    if not path or path == "/":
        return "/"
    return "/" + path.strip("/") + "/"


def output_path(route: str) -> Path:
    if route == "/":
        return ROOT / "index.html"
    return ROOT.joinpath(*route.strip("/").split("/"), "index.html")


def asset_prefix(route: str) -> str:
    depth = 0 if route == "/" else len(route.strip("/").split("/"))
    return "../" * depth


def route_url(route: str) -> str:
    return route if route.endswith("/") else route + "/"


def with_index(path: str) -> str:
    """Point directory links at index.html so pages also work when opened from disk (file://)."""
    clean, hash_mark, fragment = path.partition("#")
    if clean.endswith("/"):
        clean += "index.html"
    return clean + hash_mark + fragment


def url_for(path: str, prefix: str) -> str:
    if not path:
        return f"{prefix}index.html"
    if path.startswith("http://") or path.startswith("https://") or path.startswith("tel:") or path.startswith("mailto:"):
        return path
    if path == "/":
        return f"{prefix}index.html"
    if path.startswith("/#"):
        return f"{prefix}index.html{path[1:]}" if prefix else path[1:]
    if path.startswith("#"):
        return path
    if path.startswith("/"):
        clean = path.lstrip("/")
        return with_index(f"{prefix}{clean}")
    return with_index(f"{prefix}{path}")


def source_route(page: dict) -> str:
    path = urlsplit(page.get("url", "")).path or "/"
    return route_url(path)


def source_page_index(source_content: dict) -> dict:
    pages = {}
    for page in source_content.get("pages", []):
        if page.get("httpStatus") != 200 or page.get("captureStatus") != "captured":
            continue
        pages.setdefault(source_route(page), page)
    return pages


def source_page_title(page: dict) -> str:
    for block in page.get("blocks", []):
        if block.get("type") == "heading" and block.get("level") == 1:
            return block.get("text", "").strip()
    return page.get("title", "WOL-BUD")


def source_display_text(value: str) -> str:
    value = str(value or "")
    # Client corrections of 29.09: "Firma działa od 31 lat" (founded in 1995).
    value = value.replace("działa już od 25 lat", "działa już od 31 lat")
    value = value.replace("zajmujemy się już od 25 lat", "zajmujemy się już od 31 lat")
    value = value.replace("25-letnie doświadczenie w branży okien i drzwi", "31-letnie doświadczenie w branży okien i drzwi")
    # Winter gardens are no longer offered and the PETECKI name is removed from the aluminium pages.
    value = value.replace("okna i drzwi aluminiowe, ogrody zimowe oraz fasady aluminiowe", "okna i drzwi aluminiowe oraz fasady aluminiowe")
    value = value.replace("Firma „PETECKI” przy budowie ścian osłonowych korzysta", "Przy budowie ścian osłonowych korzystamy")
    value = value.replace("Wysoka jakość wykonania produktów Firmy „PETECKI” oraz", "Wysoka jakość wykonania oferowanych przez nas fasad oraz")
    # ul. Szkotnik 2B is closed, so the number of sales points changed.
    value = value.replace("Trzy salony sprzedaży w Tarnowie i Radłowie", "Salony sprzedaży w Tarnowie i Radłowie")
    # Client correction of 17.10: the Tarnów salon is at Giełdowa 10.
    value = value.replace("na ulicy Giełdowej 5 w Tarnowie", "na ulicy Giełdowej 10 w Tarnowie")
    return value


def source_body_blocks(page: dict) -> list:
    blocks = page.get("blocks", [])
    title_index = next(
        (i for i, block in enumerate(blocks) if block.get("type") == "heading" and block.get("level") == 1),
        -1,
    )
    body = blocks[title_index + 1:] if title_index >= 0 else blocks[:]

    # The capture keeps the original page body, followed by the site's repeated offer footer.
    for i, block in enumerate(body):
        if block.get("type") != "heading" or normalize(block.get("text", "")) != "oferta":
            continue
        following = body[i + 1:i + 3]
        if any(
            next_block.get("type") == "heading"
            and normalize(next_block.get("text", "")) == "zobacz nasza oferte"
            for next_block in following
        ):
            body = body[:i]
            break
    if urlsplit(page.get("url", "")).path.rstrip("/") == "/o-firmie":
        body = [dict(block) for block in body]
        for i, block in enumerate(body):
            if block.get("type") != "list" or block.get("depth") != 1:
                continue
            items = list(block.get("items", []))
            for item_index, item in enumerate(items):
                match = re.match(r"(Uczciwość wobec Klienta na każdym etapie rozmów):\s*(szczegółowe doradztwo i przejrzyste przedstawienie oferty)", item, re.IGNORECASE)
                if not match:
                    continue
                items[item_index] = match.group(1) + ":"
                block["items"] = items
                nested = next(
                    (next_block for next_block in body[i + 1:] if next_block.get("type") == "list"),
                    None,
                )
                if nested and int(nested.get("depth", 1) or 1) == 2:
                    nested["items"] = [match.group(2), *nested.get("items", [])]
                break
        # Client PDF of 20.10.2026: no references at all, so the line that led to their scans goes too.
        body = [
            block for block in body
            if not normalize(block.get("text", "")).startswith("ponizej przedstawiamy niektore z naszych referencji")
        ]
        # Client, 20.10.2026: the line above the supplier list, in their words.
        for block in body:
            if normalize(block.get("text", "")).startswith("w naszej ofercie posiadamy produkty wylacznie"):
                block["text"] = "W naszej ofercie posiadamy produkty wyłącznie renomowanych polskich firm:"
        # Client, 20.10.2026: four window makers added to that list, in their words. A company's second
        # description hangs under it; Smartline+ is Dobroplast's other system, next to P-Line.
        heading_index = next(
            (i for i, block in enumerate(body) if normalize(block.get("text", "")).startswith("w naszej ofercie posiadamy produkty wylacznie")),
            -1,
        )
        if 0 <= heading_index < len(body) - 1 and body[heading_index + 1].get("type") == "list":
            suppliers = body[heading_index + 1]
            # Client, 21.10.2026: Intenso removed from the whole site, this list included.
            suppliers["items"] = [
                *(item for item in suppliers.get("items", []) if not normalize(item).startswith("intenso")),
                "WILLINGEN – okna produkowane w systemach profili Schüco living 82, łączące nowoczesny design, wysoką jakość wykonania oraz doskonałe parametry termoizolacyjne.",
                "DEBOW – okna PCV produkowane na profilach Salamander 82, zapewniające trwałość, energooszczędność i estetyczny wygląd.",
                "HENSFORT – okna PCV w systemie Hensperfect, charakteryzujące się klasycznym wzornictwem, solidną konstrukcją oraz wysokimi parametrami izolacji termicznej i akustycznej.",
            ]
            body[heading_index + 2:heading_index + 2] = [
                {"type": "list", "listType": "unordered", "depth": 2, "items": [
                    "Okna PCV w systemach profili Hensperfect oraz Kömmerling Hensproline 88 MD, łączące nowoczesne rozwiązania technologiczne, wysoką izolacyjność termiczną i akustyczną oraz solidną konstrukcję.",
                ]},
                {"type": "list", "listType": "unordered", "depth": 1, "items": ["Dobroplast"]},
                {"type": "list", "listType": "unordered", "depth": 2, "items": [
                    "P-Line – Okna w systemie P-Line to połączenie nowoczesnego wyglądu, funkcjonalności i dobrych parametrów użytkowych. Zapewniają odpowiednią izolację termiczną i akustyczną, szczelność oraz komfort użytkowania, sprawdzając się w nowoczesnych i tradycyjnych budynkach.",
                    "Smartline+ – System okienny Smartline+ łączy estetyczny design z funkcjonalnością i komfortem użytkowania. Przemyślana konstrukcja profili wspiera izolacyjność termiczną oraz szczelność okien, stanowiąc praktyczne rozwiązanie do domów i mieszkań.",
                ]},
                # Client, 22.10.2026: these too, in their words and order; their WIŚNIOWSKI line is already
                # on the list word for word, so it is not repeated.
                {"type": "list", "listType": "unordered", "depth": 1, "items": [
                    "MIROLA – żaluzje fasadowe produkowane na wymiar, dostępne z szerokim wyborem automatyki i napędów",
                    "MEDOS – parapety wewnętrzne i zewnętrzne",
                    "DECCO – rolety zewnętrzne w systemach adaptacyjnych, podtynkowych i nadstawnych oraz żaluzje fasadowe, zapewniające doskonałą izolację termiczną i nowoczesny design.",
                    "HANAROL – rolety wewnętrzne materiałowe, dzień-noc, rzymskie, plisy żaluzję drewniane oraz aluminiowe",
                ]},
            ]
    return body


def render_source_list(node: dict) -> str:
    tag = "ol" if node.get("listType") == "ordered" else "ul"
    items = []
    for item in node.get("items", []):
        children = "".join(render_source_list(child) for child in item.get("children", []))
        items.append(f"<li>{esc(source_display_text(item.get('text', '')))}{children}</li>")
    return f'<{tag} class="source-list">{"".join(items)}</{tag}>'


def render_source_blocks(blocks: list, prefix: str = "", anchor_map: dict | None = None) -> str:
    rendered = []
    roots = []
    stack = []

    def flush_lists() -> None:
        if roots:
            rendered.extend(render_source_list(root) for root in roots)
            roots.clear()
        stack.clear()

    for block in blocks:
        block_type = block.get("type")
        if block_type == "list":
            items = [{"text": item, "children": []} for item in block.get("items", [])]
            if not items:
                continue
            depth = max(1, int(block.get("depth", 1) or 1))
            node = {"listType": block.get("listType"), "items": items}
            if depth == 1 and stack and len(stack) > 1:
                stack[0]["items"].extend(items)
                stack[:] = [stack[0]]
                continue
            if depth == 1 or not stack:
                roots.append(node)
                stack[:] = [node]
                continue
            parent_depth = min(depth - 2, len(stack) - 1)
            parent = stack[parent_depth]
            parent["items"][-1]["children"].append(node)
            stack[:] = stack[:parent_depth + 1] + [node]
            continue

        flush_lists()
        if block_type == "heading":
            text = source_display_text(block.get("text", "").strip())
            level = min(4, max(2, int(block.get("level", 2) or 2)))
            heading_id = (anchor_map or {}).get(normalize(text), "")
            id_attr = f' id="{esc(heading_id)}"' if heading_id else ""
            rendered.append(f"<h{level}{id_attr}>{esc(text)}</h{level}>")
        elif block_type == "paragraph":
            text = source_display_text(block.get("text", "").strip())
            if normalize(text) in {"opis", "parametry", "zalety", "cechy", "dane techniczne"}:
                rendered.append(f"<h2>{esc(text)}</h2>")
            elif text:
                rendered.append(f"<p>{esc(text).replace(chr(10), '<br>')}</p>")
        elif block_type == "table":
            headers = block.get("headers", [])
            rows = block.get("rows", [])
            head_html = "".join(f"<th scope=\"col\">{esc(source_display_text(cell))}</th>" for cell in headers)
            body_html = "".join(
                "<tr>" + "".join(f"<td>{esc(source_display_text(cell))}</td>" for cell in row) + "</tr>"
                for row in rows
            )
            rendered.append(
                f'<div class="source-table-scroll"><table><thead><tr>{head_html}</tr></thead><tbody>{body_html}</tbody></table></div>'
            )
        elif block_type == "image":
            src = url_for(block.get("src", ""), prefix)
            alt = esc(block.get("alt", ""))
            rendered.append(f'<figure class="source-image"><img src="{esc(src)}" alt="{alt}" loading="lazy" decoding="async"></figure>')

    flush_lists()
    return "".join(rendered)


def source_content_panel(page: dict | None, prefix: str = "", summary: str = "Pełny opis źródłowy", anchor_map: dict | None = None, anchor_id: str | None = None) -> str:
    if not page:
        return ""
    body = render_source_blocks(source_body_blocks(page), prefix, anchor_map)
    if not body:
        return ""
    id_attr = f' id="{esc(anchor_id)}"' if anchor_id else ""
    return f'''<details class="mobile-details source-content-disclosure"{id_attr} open data-responsive-disclosure>
  <summary>{esc(summary)}</summary>
  <div class="mobile-details-body source-content-body">{body}</div>
</details>'''


def source_first_sentence(value: str) -> str:
    value = source_display_text(value).strip()
    match = re.search(r"^(.+?[.!?])(?:\s|$)", value)
    return match.group(1) if match else value


def source_teaser(page: dict | None) -> str:
    if not page:
        return ""
    for block in source_body_blocks(page):
        if block.get("type") == "paragraph" and block.get("text", "").strip():
            return source_first_sentence(block["text"])
    for block in source_body_blocks(page):
        if block.get("type") == "list" and block.get("items"):
            return source_first_sentence(block["items"][0])
    return ""


def source_service_sections(page: dict | None) -> list:
    if not page:
        return []
    sections = []
    current = None
    for block in source_body_blocks(page):
        if block.get("type") == "heading" and int(block.get("level", 2) or 2) == 2:
            if current:
                sections.append(current)
            current = {"title": block.get("text", ""), "blocks": []}
        elif current:
            current["blocks"].append(block)
    if current:
        sections.append(current)
    return sections


_image_dimension_cache: dict[str, tuple[int, int] | None] = {}
_product_gallery_source_map: dict | None = None


def image_dimensions(image_path: str) -> tuple[int, int] | None:
    if image_path in _image_dimension_cache:
        return _image_dimension_cache[image_path]
    path = ROOT / image_path.lstrip("/")
    size_match = re.search(r"(?:[-_])(\d{1,4})x(\d{1,4})(?=\.[^.]+$)", path.name, re.IGNORECASE)
    if size_match:
        dimensions = (int(size_match.group(1)), int(size_match.group(2)))
    else:
        try:
            from PIL import Image

            with Image.open(path) as image:
                dimensions = image.size
        except Exception:
            dimensions = None
    _image_dimension_cache[image_path] = dimensions
    return dimensions


def horizontal_photo_strip(content: str, track_class: str, label: str, track_attributes: str = "") -> str:
    return f'''<div class="photo-strip" data-scroll-gallery aria-label="{esc(label)}">
  <button type="button" class="photo-strip-arrow" data-scroll-prev aria-label="Poprzednie zdjęcie" aria-disabled="true">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
  </button>
  <div class="{track_class}" data-scroll-track tabindex="0" role="region" aria-label="{esc(label)}" {track_attributes}>{content}</div>
  <button type="button" class="photo-strip-arrow" data-scroll-next aria-label="Następne zdjęcie" aria-disabled="false">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
  </button>
</div>'''


def source_gallery_images(route: str, images: list[str]) -> tuple[list[str], list[str]]:
    """Use every original product-gallery item, paired with its source thumbnail."""
    global _product_gallery_source_map
    if _product_gallery_source_map is None:
        try:
            _product_gallery_source_map = json.loads(PRODUCT_GALLERY_SOURCE_MAP_FILE.read_text(encoding="utf-8-sig"))
        except (OSError, json.JSONDecodeError):
            _product_gallery_source_map = {}

    source_page = _product_gallery_source_map.get("pages", {}).get(route, {})
    source_items = source_page.get("items", [])
    if source_items:
        gallery_images = []
        gallery_thumbnails = []
        for item in source_items:
            image = item.get("image", "")
            thumbnail = item.get("thumbnail", "")
            local_image_exists = bool(image and not image.startswith(("http://", "https://")) and (ROOT / image.lstrip("/")).is_file())
            local_thumbnail_exists = bool(thumbnail and not thumbnail.startswith(("http://", "https://")) and (ROOT / thumbnail.lstrip("/")).is_file())
            if (
                item.get("imageStatus") == "original-fetch-failed"
                and item.get("thumbnailStatus") == "source-thumb-fetch-failed"
                and not local_image_exists
                and not local_thumbnail_exists
            ):
                # Both authentic source files are gone, so do not emit a broken image.
                continue
            image_exists = bool(image and (image.startswith("http://") or image.startswith("https://") or (ROOT / image.lstrip("/")).is_file()))
            thumbnail_exists = bool(thumbnail and (thumbnail.startswith("http://") or thumbnail.startswith("https://") or (ROOT / thumbnail.lstrip("/")).is_file()))
            if not image_exists:
                # If the linked original is gone, keep the source thumbnail as the clickable item.
                image = item.get("sourceThumb", "") or item.get("sourceImage", "")
                thumbnail = item.get("sourceThumb", "") or image
            elif not thumbnail_exists:
                thumbnail = image
            if image:
                gallery_images.append(image)
                gallery_thumbnails.append(thumbnail or image)
        if gallery_images:
            return gallery_images, gallery_thumbnails

    # Legacy fallback for routes absent from the source gallery audit.
    displayed = []
    for image in images:
        dimensions = image_dimensions(image)
        if not (dimensions and min(dimensions) < 80):
            displayed.append(image)
    return displayed, []


def product_gallery_images(route: str, images: list[str]) -> tuple[list[str], list[str]]:
    """Gallery for a product page, led by the client's main photo when one is set."""
    if route in PRODUCT_GALLERIES:
        # The client's photos in place of the old gallery, with the thumbnails made for Realizacje.
        gallery = [PRODUCT_MAIN_PHOTOS[route], *PRODUCT_GALLERIES[route]]
        return gallery, [realization_thumb(photo) for photo in gallery]
    gallery, thumbnails = source_gallery_images(route, images)
    main_photo = PRODUCT_MAIN_PHOTOS.get(route)
    if main_photo and (ROOT / main_photo.lstrip("/")).is_file():
        gallery = [main_photo] + [image for image in gallery if image != main_photo]
        if thumbnails:
            thumbnails = [main_photo] + thumbnails
    return gallery, thumbnails


def copy_blocks_markup(blocks: list) -> str:
    rendered = []
    for kind, value in blocks:
        if kind == "h":
            rendered.append(f"<h3>{esc(value)}</h3>")
        elif kind == "p":
            rendered.append(f"<p>{esc(value)}</p>")
        elif kind == "pb":
            # A paragraph opening with a bold label: (label, text).
            label, text = value
            rendered.append(f"<p><strong>{esc(label)}</strong> {esc(text)}</p>")
        elif kind == "ul":
            rendered.append('<ul class="source-list">' + "".join(f"<li>{esc(item)}</li>" for item in value) + "</ul>")
    return "".join(rendered)


def profile_rows_markup(profiles: list, prefix: str, label: str) -> str:
    rows = []
    for profile in profiles:
        image_url = url_for(profile["image"], prefix)
        rows.append(f'''<article class="profile-row" id="{esc(slugify(profile["name"]))}">
  <figure class="profile-row__media">
    <img src="{image_url}" alt="{esc(profile["name"])} – przekrój profilu" data-lightbox-trigger data-lightbox-src="{image_url}" data-lightbox-group="profile" loading="lazy" decoding="async">
  </figure>
  <div class="profile-row__body">
    <span class="profile-row__kicker">{esc(profile["kicker"])}</span>
    <h2>{esc(profile["name"])}</h2>
    <details class="mobile-details profile-row__details" open data-responsive-disclosure>
      <summary>Opis i parametry profilu</summary>
      <div class="mobile-details-body">{copy_blocks_markup(profile["blocks"])}</div>
    </details>
  </div>
</article>''')
    return f'<section class="profile-list" aria-label="{esc(label)}">{"".join(rows)}</section>'


def store_phone_line(store: dict) -> str:
    parts = []
    if store["tel"]:
        parts.append(f"Tel. {store['tel']}")
    if store["mobile"]:
        parts.append(f"Kom. {store['mobile']}")
    return " · ".join(parts)


def store_items_markup(photo_prefix: str | None = None) -> str:
    """Store entries; with photo_prefix (the home page) a store's photo is shown in its own entry."""
    items = []
    # Stores with just an address first, the ones with a phone line below (client, 10.2026).
    for store in sorted(STORES, key=lambda store: bool(store_phone_line(store))):
        phone_line = store_phone_line(store)
        phone_html = f'\n  <div class="kt-store-phone">{esc(phone_line)}</div>' if phone_line else ""
        # Client, 20.10.2026: the photo of the salon building, not cropped by the layout; the file
        # itself has the camera watermark cut off the bottom. Of 21.10: "te zdjecie ma byc przy
        # gieldowej", so it sits in the Giełdowa entry instead of below both stores.
        photo_html = ""
        if photo_prefix is not None and store["photo"]:
            photo_path = "/img/stores/" + store["photo"]
            width, height = image_dimensions(photo_path) or (1200, 834)
            photo_html = f'\n  <figure class="kt-salon-photo"><img src="{url_for(photo_path, photo_prefix)}" alt="{esc(store["name"])}, {esc(store["street"])}" width="{width}" height="{height}" loading="lazy" decoding="async"></figure>'
        items.append(f'''<div class="kt-store-item">
  <div class="kt-store-title">{esc(store["name"])}</div>
  <div class="kt-store-addr">{esc(store["address"])}</div>{phone_html}
  <a class="store-nav-btn" href="{store["map"]}" target="_blank" rel="noopener noreferrer"><i>{MAP_PIN_SVG}</i>Nawiguj w Google Maps ↗</a>{photo_html}
</div>''')
    return "\n".join(items)


def redirect_page(route: str, target: str) -> str:
    target_url = url_for(target, asset_prefix(route))
    return f'''<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0; url={target_url}">
<title>Strona przeniesiona | WOL-BUD</title></head>
<body><p>Ta strona została przeniesiona: <a href="{target_url}">przejdź dalej</a>.</p></body></html>
'''


def header(prefix: str) -> str:
    links = [
        ("Strona główna", "/", "/#start"),
        ("Oferta", "/oferta/", "/#oferta"),
        ("Usługi", "/uslugi/", "/#uslugi"),
        ("Realizacje", "/realizacje/", "/#realizacje"),
        ("O firmie", "/o-firmie/", "/#ofirmie"),
        ("Nasze sklepy", "/nasze-sklepy/", "/#nasze-sklepy"),
        ("Kontakt", "/kontakt/", "/#kontakt"),
    ]
    menu_links = "".join(
        f'<a href="{url_for(href, prefix)}"'
        + (f' data-desktop-href="{url_for(href, prefix)}" data-mobile-home-href="{url_for(mobile_href, prefix)}"' if mobile_href else "")
        + f'>{label}</a>'
        for label, href, mobile_href in links
    )
    brand_href = url_for("/", prefix)
    logo_src = url_for("/img/wolbud-logo.webp", prefix)
    return f'''<header class="bar"><div class="bar-in"><div class="menu" id="menu"><button class="pill" id="menuButton" aria-expanded="false" aria-controls="site-menu" data-menu-toggle>Menu</button><nav class="menu-panel" id="site-menu" data-menu-panel hidden aria-label="Menu główne"><button class="menu-close" type="button" data-menu-close aria-label="Zamknij menu">×</button>{menu_links}<a class="menu-phone" href="tel:+48534091021"><i></i>534 091 021</a></nav></div><a class="brand" href="{brand_href}" aria-label="WOL-BUD – strona główna"><img src="{logo_src}" alt="WOL-BUD – okna, drzwi, rolety, bramy" width="363" height="96"></a><a class="pill phone" href="tel:+48534091021"><i></i>534 091 021</a></div></header>'''


def footer(prefix: str) -> str:
    links = [
        ("Oferta", "/oferta/"),
        ("Usługi", "/uslugi/"),
        ("Realizacje", "/realizacje/"),
        ("O firmie", "/o-firmie/"),
        ("Nasze sklepy", "/nasze-sklepy/"),
        ("Kontakt", "/kontakt/"),
    ]
    footer_links = "".join(f'<a href="{url_for(href, prefix)}">{label}</a>' for label, href in links)
    return f'''<footer><div class="wrap"><div class="footer-links">{footer_links}</div><div class="footer-social"><a href="{FACEBOOK_URL}" target="_blank" rel="noopener noreferrer" aria-label="WOL-BUD na Facebooku (otwiera się w nowej karcie)">{FACEBOOK_ICON}Facebook</a></div><p class="footer-copy">WOL-BUD Wojciech Wolański · Sprzedaż i profesjonalny montaż okien, drzwi i bram od 1995 roku · Tarnów, Radłów · <a href="tel:+48534091021">534 091 021</a></p></div></footer>'''


def document(route: str, title: str, description: str, body: str) -> str:
    prefix = asset_prefix(route)
    safe_description = esc(description[:220])
    html_doc = f'''<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#2c4d19"><meta name="description" content="{safe_description}">
<title>{esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="icon" type="image/png" href="{prefix}img/favicon.png"><link rel="apple-touch-icon" href="{prefix}img/favicon.png"><link rel="stylesheet" href="{prefix}assets/site.css?v={ASSET_VERSIONS['site.css']}"><script defer src="{prefix}assets/site.js?v={ASSET_VERSIONS['site.js']}"></script></head>
<body>
{header(prefix)}
{body}
{footer(prefix)}

<!-- Lightbox Modal for Enlarge Image -->
<div class="lightbox-modal" id="lightboxModal" role="dialog" aria-modal="true" aria-label="Powiększone zdjęcie" hidden>
  <div class="lightbox-backdrop" data-lightbox-close></div>
  <div class="lightbox-dialog">
    <button type="button" class="lightbox-close" data-lightbox-close aria-label="Zamknij (Esc)">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </button>
    <button type="button" class="lightbox-arrow lightbox-prev" data-lightbox-prev aria-label="Poprzednie zdjęcie (Strzałka w lewo)">
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
    </button>
    <div class="lightbox-media-wrap">
      <img src="" alt="" id="lightboxImg" class="lightbox-img">
      <div class="lightbox-caption-bar">
        <span class="lightbox-caption" id="lightboxCaption"></span>
        <span class="lightbox-counter" id="lightboxCounter">1 / 1</span>
      </div>
    </div>
    <button type="button" class="lightbox-arrow lightbox-next" data-lightbox-next aria-label="Następne zdjęcie (Strzałka w prawo)">
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
    </button>
  </div>
</div>

<!-- Floating Back to Top Button -->
<button type="button" class="scroll-top-btn" id="scrollTopBtn" aria-label="Przewiń do góry" title="Do góry">
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"></polyline></svg>
  <span>Do góry</span>
</button>

{CONTACT_BUBBLES}

</body></html>'''
    return re.sub(r"(?m)^[ \t]+$", "", html_doc)


def photo_count_label(count: int) -> str:
    if count == 1:
        return "1 zdjęcie"
    if count % 10 in (2, 3, 4) and count % 100 not in (12, 13, 14):
        return f"{count} zdjęcia"
    return f"{count} zdjęć"


def realization_thumb(photo: str) -> str:
    return f"/img/realizacje/miniatury/{Path(photo).name}"


def realization_alt(group: dict) -> str:
    return f"{group['title']} – realizacja WOL-BUD"


def realization_img_size(path: str) -> str:
    dimensions = image_dimensions(path)
    return f' width="{dimensions[0]}" height="{dimensions[1]}"' if dimensions else ""


def reviews_section() -> str:
    reviews = "".join(
        f'''<li class="review"><div class="stars" role="img" aria-label="Ocena 5 na 5">★★★★★</div><blockquote>{esc(text)}</blockquote><div class="review-source">Opinia z Google</div></li>'''
        for text in GOOGLE_REVIEWS
    )
    arrow = '<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="{path}"></path></svg>'
    return f'''<section class="reviews" id="opinie">
  <div class="wrap">
    <div class="reviews-head">
      <div>
        <span class="eyebrow">Opinie Google</span>
        <h2>Co mówią Klienci</h2>
      </div>
      <div class="reviews-score">
        <span class="score-value">{GOOGLE_RATING}</span>
        <div>
          <div class="stars" aria-hidden="true">★★★★★</div>
          <p class="score-meta">Średnia ocen w&nbsp;Google<br>z {GOOGLE_REVIEW_COUNT} opinii, stan na {GOOGLE_REVIEWS_READ}</p>
          <a class="reviews-link" href="{esc(GOOGLE_REVIEWS_URL)}" target="_blank" rel="noopener noreferrer">Zobacz opinie w Google{arrow.format(size=15, path="M7 17L17 7M17 7H8M17 7v9")}</a>
        </div>
      </div>
    </div>
    <ul class="reviews-track" id="reviewsTrack">{reviews}</ul>
    <div class="reviews-nav">
      <button type="button" class="rev-prev" aria-label="Poprzednie opinie" aria-controls="reviewsTrack" disabled>{arrow.format(size=18, path="M15 5l-7 7 7 7")}</button>
      <button type="button" class="rev-next" aria-label="Następne opinie" aria-controls="reviewsTrack">{arrow.format(size=18, path="M9 5l7 7-7 7")}</button>
    </div>
    <p class="reviews-note">Wybrane opinie z naszego profilu w Google. Nie sprawdzamy, czy ich autorzy kupili nasze produkty. Wszystkie opinie znajdziesz w Google.</p>
  </div>
</section>'''


def realizations_home_section(prefix: str = "") -> str:
    cards = []
    for group in REALIZATIONS:
        cover = realization_thumb(group["photos"][0])
        width, height = image_dimensions(cover) or (4, 3)
        cards.append(f'''<a class="realization-card" href="{url_for(f'/realizacje/#{group["slug"]}', prefix)}">
  <div class="realization-card-media" style="--ar: {width / height:.4f}"><img src="{url_for(cover, prefix)}" alt="{esc(realization_alt(group))}"{realization_img_size(cover)} loading="lazy" decoding="async"></div>
  <div class="realization-card-body">
    <h3>{esc(group["title"])}</h3>
    <span>{photo_count_label(len(group["photos"]))} ↗</span>
  </div>
</a>''')
    return f'''<!-- REALIZACJE -->
<section class="realizations-home" id="realizacje">
  <div class="wrap">
    <div class="offer-head">
      <div>
        <span class="eyebrow eyebrow--highlight">Zdjęcia z naszych montaży</span>
        <h2>Realizacje</h2>
      </div>
    </div>
    <div class="realization-cards">
      {''.join(cards)}
    </div>
    <a class="realizations-more" href="{url_for('/realizacje/', prefix)}">Zobacz wszystkie realizacje ↗</a>
  </div>
</section>'''


def realizations_page() -> str:
    route = "/realizacje/"
    prefix = asset_prefix(route)
    pills = "".join(
        f'<a href="#{group["slug"]}" class="cat-nav-pill">{esc(group["title"])}</a>'
        for group in REALIZATIONS
    )
    sections = []
    for group in REALIZATIONS:
        slug = group["slug"]
        photos = []
        alt = esc(realization_alt(group))
        for path in group["photos"]:
            full = url_for(path, prefix)
            thumb = realization_thumb(path)
            width, height = image_dimensions(thumb) or (4, 3)
            # The photo's own proportions, so the gallery shows it whole instead of cropping it to 4:3.
            photos.append(f'''<figure class="realization-photo" style="--ar: {width / height:.4f}">
  <a href="{full}" data-lightbox-trigger data-lightbox-src="{full}" data-lightbox-group="realizacja-{slug}" aria-label="Powiększ zdjęcie: {alt}">
    <img src="{url_for(thumb, prefix)}" alt="{alt}"{realization_img_size(thumb)} loading="lazy" decoding="async">
  </a>
</figure>''')
        sections.append(f'''<section class="realization-group" id="{slug}" aria-labelledby="{slug}-title">
  <div class="realization-group-head">
    <h2 id="{slug}-title">{esc(group["title"])}</h2>
    <span class="realization-count">{photo_count_label(len(group["photos"]))}</span>
  </div>
  {horizontal_photo_strip("".join(photos), "realization-grid", f"Zdjęcia: {group['title']}")}
</section>''')

    crumb = f'''<div class="page-nav-bar">
  <button type="button" class="btn-back" data-history-back aria-label="Wróć do poprzedniej strony">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
    <span>Wróć</span>
  </button>
  <nav class="breadcrumbs" aria-label="Okruszki"><a href="{url_for('/#realizacje', prefix)}" data-home-link>Strona główna</a><span>/</span><span aria-current="page">Realizacje</span></nav>
</div>'''

    main = f'''<main id="main" class="page-main">
  <div class="wrap">
    {crumb}
    <header class="subpage-head">
      <span class="eyebrow">Zdjęcia z naszych montaży</span>
      <h1>Realizacje</h1>
      <p class="subpage-lead">Kliknij zdjęcie, aby je powiększyć.</p>
    </header>
    <div class="cat-quick-nav" aria-label="Szybka nawigacja po realizacjach">
      <span class="cat-quick-nav-label">Realizacje:</span>
      <div class="cat-quick-nav-pills">{pills}</div>
    </div>
    <div class="subpage-grid">
      <div class="subpage-content">
        {''.join(sections)}
        <div class="cta-banner-dark">
          <span class="eyebrow eyebrow--highlight">Planujesz budowę lub wymianę okien?</span>
          <h3>Umów bezpłatny pomiar i wycenę</h3>
          <p>Pomiar, doradztwo i wycena są bezpłatne i niewiążące — na budowie lub w naszych salonach sprzedaży.</p>
          {CTA_CONTACT}
        </div>
      </div>
      {sidebar_markup(route, prefix)}
    </div>
  </div>
</main>'''
    return document(route, "Realizacje | WOL-BUD Tarnów", "Realizacje WOL-BUD: zdjęcia okien, bram i drzwi zamontowanych w domach jednorodzinnych.", main)


def home_page(scraped_data: dict, services_source_page: dict | None = None) -> str:
    prefix = ""
    intro = "WOL-BUD to firma Wojciecha Wolańskiego, założona w 1995 roku. Oferuje okna PCV i aluminiowe, drzwi, bramy garażowe, rolety, parapety, doradztwo i montaż."
    service_teasers = {
        normalize(section["title"]): source_teaser({"blocks": section["blocks"]})
        for section in source_service_sections(services_source_page)
    }

    # Category Cards (8 primary)
    cat_cards_markup = []
    for cat_name, cat_href, cat_thumb, cat_desc in PRIMARY_CATEGORIES:
        cat_desc_html = f'<p>{esc(cat_desc)}</p>' if cat_desc else ""
        cat_cards_markup.append(f'''<a class="home-cat-card" href="{url_for(cat_href, prefix)}">
  <div class="home-cat-thumb">
    <img src="{url_for(cat_thumb, prefix)}" alt="{esc(cat_name)}" loading="lazy" decoding="async">
  </div>
  <div class="home-cat-body">
    <h3>{esc(cat_name)}</h3>
    {cat_desc_html}
    <div class="home-cat-cta">Zobacz ofertę <span>↗</span></div>
  </div>
</a>''')

    # Zewnętrzne first, as on the Rolety page (client, 23.10.2026).
    additional_categories = [
        ("Rolety zewnętrzne", "/kategorie/zewnetrzne/"),
        ("Rolety wewnętrzne", "/kategorie/wewnetrzne/"),
        ("Żaluzje i plisy", "/kategorie/zaluzje-plisy/"),
    ]
    extra_category_markup = "".join(
        f'<a class="home-extra-category" href="{url_for(route, prefix)}">{esc(name)} <span aria-hidden="true">↗</span></a>'
        for name, route in additional_categories
    )

    featured_product_markup = []
    featured_products = [
        ("/produkty/okna-drzwi-alu/", "Okna i drzwi aluminiowe"),
    ]
    product_data = scraped_data.get("products", {})
    for route, featured_title in featured_products:
        product = product_data.get(route, {})
        images, _ = product_gallery_images(route, product.get("images", []))
        image_html = ""
        if images:
            image_html = f'<img src="{url_for(images[0], prefix)}" alt="{esc(featured_title)}" loading="lazy" decoding="async">'
        paragraph = next((item for item in product.get("paragraphs", []) if item.strip()), "")
        teaser = source_first_sentence(paragraph) if paragraph else ""
        featured_product_markup.append(f'''<a class="home-featured-product" href="{url_for(route, prefix)}">
  <div class="home-featured-media">{image_html}</div>
  <div class="home-featured-copy">
    <h4>{esc(featured_title)}</h4>
    {f'<p>{esc(teaser)}</p>' if teaser else ''}
    <span>Zobacz produkt ↗</span>
  </div>
</a>''')

    # Services Cards (6 services)
    services_markup = []
    service_anchors = {
        "Pomiar, doradztwo i wycena": "pomiar-doradztwo-i-wycena",
        "Ciepły montaż": "cieply-montaz",
        "Serwis": "serwis",
        "Kompleksowa obsługa inwestycji": "kompleksowa-obsluga-inwestycji",
        "Prace wykończeniowe i murarskie": "prace-wykonczeniowe-i-murarskie",
        "Daszki poliwęglanowe": "daszki-poliweglanowe",
    }
    for idx, s in enumerate(scraped_data.get("services", []), 1):
        stitle = s.get("title", "")
        if stitle in REMOVED_SERVICES:
            continue
        anch = service_anchors.get(stitle, slugify(stitle))
        para = "\n".join(s.get("paragraphs", []))
        teaser = service_teasers.get(normalize(stitle)) or source_first_sentence(para)
        link = "/promocje/cieply-montaz-warstwowy-okien-drzwi/#pelny-opis-montazu" if "Ciepły" in stitle else f"/uslugi/#{anch}"
        service_href = url_for(link, prefix)
        shown_title = SERVICE_TITLE_RENAMES.get(stitle, stitle)
        # Open on desktop; site.js closes the rows on phones, where they become tap-to-open tiles.
        services_markup.append(f'''<details class="home-service-item" open data-responsive-disclosure>
  <summary><h4>{esc(shown_title)}</h4></summary>
  <div class="home-service-item-body">
    <p class="home-service-item-teaser">{esc(teaser)}</p>
    <a class="arr" href="{service_href}" aria-label="Dowiedz się więcej: {esc(shown_title)}">Dowiedz się więcej ↗</a>
  </div>
</details>''')

    # Client, 21.10.2026: Intenso and Lagrus out, the eight logos sent that day in, in the order sent.
    # Decco is light lettering, so it sits on a dark tile. Medos: the producer's own colour logo
    # (medosparapety.pl, SVG) in place of the white one on black, as the client asked the same day.
    # Wiśniowski sent later that day ("logo jeszcze dodać"), so it comes last; its mark stands above
    # the name, so its tile gives it more height.
    stacked_logos = {"partner-wisniowski.webp"}
    partner_logos = [
        ("partner-domel.webp", "DOMEL", False), ("partner-fill.webp", "FILL", False), ("partner-wiked.webp", "WIKĘD", False),
        ("partner-erkado.webp", "ERKADO", False), ("partner-medos.svg", "MEDOS", False), ("partner-hensfort.webp", "HENSFORT", False),
        ("partner-dobroplast.webp", "DOBROPLAST", False), ("partner-willingen.webp", "WILLINGEN", False),
        ("partner-debow.webp", "OKNA DEBOW", False), ("partner-mirola.webp", "MIROLA", False),
        ("partner-decco.webp", "DECCO", True), ("partner-hanarol.webp", "HANAROL", False),
        ("partner-wisniowski.webp", "WIŚNIOWSKI", False),
    ]
    partner_entries = "".join(
        f'<div class="partner-logo{" partner-logo--dark" if dark else ""}{" partner-logo--stacked" if file in stacked_logos else ""}"><img src="{url_for(f"/img/partners/{file}", prefix)}" alt="{name}" loading="lazy" decoding="async"></div>'
        for file, name, dark in partner_logos
    )

    body = f'''<main id="main">
<!-- HERO -->
<section class="hero" id="start">
  <div class="sticky">
    <div class="hero-frame" id="heroFrame">
      <img src="{url_for('/img/realizacje/dom-nowoczesna-stodola-04.webp', prefix)}" alt="Okna, drzwi i stolarka otworowa WOL-BUD Tarnów" width="1200" height="1600" decoding="async">
    </div>
    <div class="hero-copy" id="heroCopy">
      <div class="hero-meta">
        <span>Tarnów, ul. Giełdowa 10 · Radłów, ul. Kolejowa 5</span>
        <span>Sprzedaż i montaż</span>
        <span>Od 1995 roku</span>
      </div>
      <h1>
        <span class="mask"><span>Okna i drzwi</span></span>
        <span class="mask"><span>w szerokim</span></span>
        <span class="mask"><span>wyborze</span></span>
      </h1>
      <p class="hero-sub">{esc(intro)}</p>
      <div class="hero-cta">
        <a class="hero-btn" href="tel:+48534091021"><i></i>Zadzwoń: 534 091 021</a>
        <a class="hero-mail" href="mailto:biuro@wol-bud.com.pl">{MAIL_ICON}biuro@wol-bud.com.pl</a>
      </div>
    </div>
  </div>
</section>

<!-- POMIAR I WYCENA -->
<section class="trust" id="ofirmie">
  <div class="wrap">
    <div class="trust-compact">
      <div>
        <span class="eyebrow">Od 1995 roku</span>
        <h2>WOL-BUD Wojciech Wolański</h2>
        <p>WOL-BUD to doświadczona firma, która na rynku okien i drzwi działa już od 31 lat – została założona przez Wojciecha Wolańskiego w 1995 roku. Spośród naszych Klientów wyróżniamy zarówno inwestorów indywidualnych, jak również instytucje. Posiadane referencje, jak też ogromna liczba kontrahentów z polecenia, to najlepszy dowód na najwyższą jakość naszej oferty.</p>
      </div>
      <div class="trust-compact-actions">
        <a class="trust-about-link" href="{url_for('/o-firmie/', prefix)}">Poznaj firmę ↗</a>
        <a class="tc-tel" href="tel:+48534091021">Zadzwoń: 534 091 021</a>
      </div>
    </div>
  </div>
</section>
<!-- CZEGO SZUKASZ? (Intuitive Catalog Cards Grid + Services) -->
<section class="offer offer--house" id="oferta">
  <div class="offer-bg" aria-hidden="true"><div class="offer-bg-img"></div></div>
  <div class="wrap">
    <div class="offer-head">
      <div>
        <span class="eyebrow">Katalog i usługi</span>
        <h2>Czego szukasz?</h2>
      </div>
      <p>Wybierz kategorię produktów lub sprawdź nasze usługi montażowe i serwisowe.</p>
    </div>

    <!-- 8 Primary Categories with Photos -->
    <div class="home-catalog-grid">
      {''.join(cat_cards_markup)}
    </div>
    <div class="home-extra-categories" aria-label="Dodatkowe kategorie produktów">
      {extra_category_markup}
    </div>
    <section class="home-featured-section" aria-labelledby="home-featured-title">
      <div class="home-featured-heading"><span class="eyebrow eyebrow--highlight">Polecane produkty</span><h3 id="home-featured-title">Warto sprawdzić</h3></div>
      <div class="home-featured-grid">{''.join(featured_product_markup)}</div>
    </section>

    <!-- 7 Services Box -->
    <div class="home-services-box" id="uslugi">
      <div class="home-services-head">
        <div>
          <span class="eyebrow eyebrow--highlight">Kompleksowa obsługa</span>
          <h3>Usługi montażowe i serwisowe</h3>
        </div>
        <a href="{url_for('/uslugi/', prefix)}">Zobacz wszystkie usługi ↗</a>
      </div>
      <div class="home-services-grid">
        {''.join(services_markup)}
      </div>
    </div>

  </div>
</section>

<!-- OPINIE GOOGLE -->
{reviews_section()}

<!-- REALIZACJE I PARTNERZY na wspólnym zdjęciu w tle -->
<div class="photo-band">
{realizations_home_section(prefix)}

<!-- DOSTAWCY / PARTNERZY -->
<section class="partners-section">
  <div class="wrap">
    <div class="section-head-center">
      <span class="eyebrow">Dostawcy</span>
      <h2>Partnerzy</h2>
    </div>
    <div class="partner-row">{partner_entries}</div>
  </div>
</section>
</div>

<!-- KONTAKT I SALONY -->
<section class="contact contact--photo" id="kontakt">
  <div class="wrap">
    <div class="contact-head">
      <div>
        <span class="eyebrow">Kontakt</span>
        <h2>Chętnie doradzimy</h2>
      </div>
      <p>Zadzwoń albo zajrzyj do naszych salonów sprzedaży w Tarnowie i Radłowie. Umówimy pomiar i odpowiemy na Twoje pytania.</p>
    </div>
    <div class="kt">
      <div class="kt-tel">
        <span class="kt-lab">Zadzwoń</span>
        <a class="kt-num" href="tel:+48534091021"><i><svg viewBox="0 0 24 24"><path d="M7.2 3.5h2.1l1.4 4-1.8 1.5a14 14 0 0 0 6.1 6.1l1.5-1.8 4 1.4v2.1c0 1.1-.9 2-2 2A15.5 15.5 0 0 1 5.2 5.5c0-1.1.9-2 2-2Z"/></svg></i>534 091 021</a>
        <ul class="kt-lista">
          <li><span>E-mail:</span><a href="mailto:biuro@wol-bud.com.pl">biuro@wol-bud.com.pl</a></li>
          <li><span>Facebook:</span><a href="{FACEBOOK_URL}" target="_blank" rel="noopener noreferrer">Zobacz nasz profil ↗</a></li>
          <li><span>Czynne:</span><span>Poniedziałek – Piątek 08:00–16:00</span></li>
          <li><span>Sobota:</span><span>09:00–12:00 (Tarnów i Radłów)</span></li>
        </ul>
        <div class="kt-oferta">
          <b>WOL-BUD Wojciech Wolański</b>
          Sprzedaż i profesjonalny montaż stolarki okiennej i drzwiowej od 1995 roku.
        </div>
      </div>
      <div class="kt-adres" id="nasze-sklepy">
        <span class="kt-lab">Salony sprzedaży</span>

        {store_items_markup(prefix)}

        <a class="store-full-copy-link" href="{url_for('/nasze-sklepy/', prefix)}">Pełny opis salonów i ekspozycji ↗</a>
      </div>
    </div>
  </div>
</section>
</main>'''
    return document("/", "Okna i drzwi w szerokim wyborze | WOL-BUD Tarnów", intro, body)


def sidebar_markup(current_route: str, prefix: str = "") -> str:
    sidebar_stores = "\n".join(
        f'''<div class="sidebar-store">
      <p><strong>{esc(store["city"])}:</strong> {esc(store["street"])}</p>
      <a class="sidebar-map-link" href="{store["map"]}" target="_blank" rel="noopener noreferrer">Nawiguj w Google Maps ↗</a>
    </div>'''
        for store in STORES
    )
    category_links = []
    for cat_name, cat_href in NAV_CATEGORIES:
        is_active = ' style="font-weight:700; color:var(--highlight);"' if current_route == cat_href else ''
        category_links.append(f'<li><a href="{url_for(cat_href, prefix)}"{is_active}>{esc(cat_name)}</a></li>')

    return f'''<aside class="subpage-sidebar">
  <div class="sidebar-box sidebar-box--dark">
    <span class="eyebrow eyebrow--highlight">Potrzebujesz wyceny?</span>
    <a class="sidebar-tel" href="tel:+48534091021">534 091 021</a>
    <p>Zadzwoń do nas. Pomiar, doradztwo techniczne i bezpłatna wycena na budowie.</p>
    <a class="tc-tel" href="tel:+48534091021">Zadzwoń teraz</a>
  </div>

  <div class="sidebar-box">
    <span class="eyebrow">Salony sprzedaży</span>
    {sidebar_stores}
    <a class="sidebar-link" href="{url_for('/nasze-sklepy/', prefix)}">Zobacz godziny i ekspozycje ↗</a>
  </div>

  <div class="sidebar-box">
    <span class="eyebrow">Kategorie produktów</span>
    <ul class="sidebar-links">
      {''.join(category_links)}
      <li><a href="{url_for('/uslugi/', prefix)}">Szczelny montaż i usługi</a></li>
    </ul>
  </div>
</aside>'''


def sill_palette_markup(route: str, title: str, prefix: str) -> str:
    swatches = SILL_PALETTES.get(route)
    if not swatches:
        return ""
    items = "".join(
        f'''<li><button type="button" class="palette-swatch" aria-pressed="{"true" if index == 0 else "false"}" data-palette-src="{url_for(f"/img/parapety/kolory/parapet/{file}.webp", prefix)}"><img src="{url_for(f"/img/parapety/kolory/miniatury/{file}.webp", prefix)}" alt="{esc(title)} – {esc(name)}" width="220" height="220" loading="lazy" decoding="async"></button><span>{esc(name)}</span></li>'''
        for index, (name, file) in enumerate(swatches)
    )
    name, file = swatches[0]
    return f'''<section class="palette-box" id="kolorystyka" aria-labelledby="kolorystyka-title" data-palette>
  <h2 id="kolorystyka-title">Kolorystyka</h2>
  <div class="palette-preview"><img src="{url_for(f"/img/parapety/kolory/parapet/{file}.webp", prefix)}" alt="{esc(title)} – {esc(name)}" width="650" height="367" loading="lazy" decoding="async" data-palette-image></div>
  <ul class="palette-grid">{items}</ul>
</section>'''


def sill_medos_links_markup(route: str) -> str:
    if route != "/kategorie/parapety-blaty/":
        return ""
    groups = "".join(
        f'''<h3>{esc(group)}</h3>
  <ul class="brand-chips">{"".join(f'<li><a href="{esc(href)}" target="_blank" rel="noopener noreferrer">{esc(name)} <span aria-hidden="true">↗</span></a></li>' for name, href in links)}</ul>
  '''
        for group, links in SILL_MEDOS_LINKS
    )
    return f'''<div class="brand-box">
  <h2>Pozostałe parapety z oferty Medos</h2>
  {groups}</div>'''


def sill_medos_logo_markup(route: str, prefix: str) -> str:
    # Client, 21.10.2026: "medosa proszę dać pod każdym parapecie na dole" – the producer's colour
    # logo below the files of every sill.
    if route not in {prod_route for _, prod_route, *_ in SILL_PRODUCTS}:
        return ""
    return f'<div class="sill-producer-logo"><img src="{url_for("/img/partners/partner-medos.svg", prefix)}" alt="Medos" width="144" height="46" loading="lazy" decoding="async"></div>'


def spec_item_markup(item, prefix: str) -> str:
    if isinstance(item, str):
        return f"<span>{esc(item)}</span>"
    text, extra = item
    if isinstance(extra, str):
        return f'<div>{esc(text)}<img class="spec-photo" src="{url_for(extra, prefix)}" alt="" loading="lazy" decoding="async"></div>'
    return f'<div>{esc(text)}<ul>{"".join(f"<li>{esc(sub)}</li>" for sub in extra)}</ul></div>'


def category_page(route: str, cat_data: dict, scraped_data: dict, source_page: dict | None = None) -> str:
    prefix = asset_prefix(route)
    title = cat_data.get("title") or route.strip("/").split("/")[-1].replace("-", " ").title()
    desc = cat_data.get("description", "")
    products = cat_data.get("products", [])

    cards_html = []
    # If category has direct products
    if products:
        for p in products:
            p_title = p.get("title", "")
            p_href = route_url(p.get("href", ""))
            p_img = p.get("image", "")
            if p_img and not p_img.startswith("/"):
                p_img = "/" + p_img

            clean_route = route_url(p_href)
            prod_detail = scraped_data.get("products", {}).get(clean_route, {})
            p_href_rel = url_for(p_href, prefix)
            category_image_overrides = {
                "/produkty/fasady": "/img/products/fasada-dom-szczytowy.webp",
            }
            p_img = category_image_overrides.get(clean_route.rstrip("/"), p_img)
            if clean_route.rstrip("/") not in category_image_overrides:
                detail_images, _ = product_gallery_images(clean_route, prod_detail.get("images", []))
                if detail_images:
                    p_img = detail_images[0]
            p_img_rel = url_for(p_img, prefix)
            p_media = (
                f'<img src="{p_img_rel}" alt="{esc(p_title)}" loading="lazy" decoding="async">'
                if p_img else '<span aria-hidden="true"></span>'
            )

            cards_html.append(f'''<article class="cat-prod-card">
  <a class="cat-prod-media" href="{p_href_rel}" aria-label="{esc(p_title)}">
    {p_media}
  </a>
  <div class="cat-prod-body">
    <span class="cat-prod-tag">WOL-BUD Tarnów</span>
    <h3 class="cat-prod-title"><a href="{p_href_rel}">{esc(p_title)}</a></h3>
    <a class="cat-prod-btn" href="{p_href_rel}">Zobacz parametry <span>↗</span></a>
  </div>
</article>''')
        content_grid = f'<div class="cat-products-grid">{"".join(cards_html)}</div>'
    elif route in SUBCATEGORIES:
        # Parent category with subcategories
        for sub_title, sub_href, sub_thumb, sub_desc, sub_count in SUBCATEGORIES[route]:
            sub_href_rel = url_for(sub_href, prefix)
            sub_thumb_rel = url_for(sub_thumb, prefix)
            sub_desc_html = f'<p>{esc(sub_desc)}</p>' if sub_desc else ""
            sub_count_html = f'<span class="subcat-card-count">{esc(sub_count)}</span>' if sub_count else ""
            cards_html.append(f'''<a class="subcat-card" href="{sub_href_rel}">
  <div class="subcat-card-media">
    <img src="{sub_thumb_rel}" alt="{esc(sub_title)}" loading="lazy" decoding="async">
  </div>
  <div class="subcat-card-body">
    {sub_count_html}
    <h3>{esc(sub_title)}</h3>
    {sub_desc_html}
    <span class="cat-prod-btn">Przejdź do oferty <span>↗</span></span>
  </div>
</a>''')
        content_grid = f'<div class="subcat-grid">{"".join(cards_html)}</div>'
    else:
        content_grid = ""

    # Category Quick-Nav Bar
    quick_pills = []
    for c_name, c_href in NAV_CATEGORIES:
        is_cur = ' is-active' if route == c_href else ''
        quick_pills.append(f'<a href="{url_for(c_href, prefix)}" class="cat-nav-pill{is_cur}">{esc(c_name)}</a>')
    quick_pills.append(f'<a href="{url_for("/uslugi/", prefix)}" class="cat-nav-pill">Usługi montażowe</a>')

    cat_quick_nav = f'''<div class="cat-quick-nav" aria-label="Szybka nawigacja po kategoriach">
  <span class="cat-quick-nav-label">Kategorie:</span>
  <div class="cat-quick-nav-pills">{''.join(quick_pills)}</div>
</div>'''

    source_markup = source_content_panel(source_page, prefix, "Pełny opis kategorii")
    teaser = source_teaser(source_page)
    client_markup = ""
    brand_markup = ""
    client_content = CATEGORY_CONTENT.get(route)
    if client_content:
        # The client's own copy replaces the captured text of the old site.
        source_markup = ""
        paragraphs = client_content.get("paragraphs", [])
        blocks = client_content.get("blocks", [])
        teaser = client_content.get("lead") or (source_first_sentence(paragraphs[0]) if paragraphs else "")
        parts = []
        if client_content.get("photo"):
            photo_src, photo_alt = client_content["photo"]
            photo_url = url_for(photo_src, prefix)
            parts.append(f'''<figure class="category-feature">
  <img src="{photo_url}" alt="{esc(photo_alt)}" data-lightbox-trigger data-lightbox-src="{photo_url}" data-lightbox-group="category" decoding="async">
</figure>''')
        if paragraphs or blocks:
            # Same disclosure as the source description: collapsed on phones, below the product names.
            copy = copy_blocks_markup(blocks) if blocks else "".join(f"<p>{esc(text)}</p>" for text in paragraphs)
            source_markup = f'''<details class="mobile-details source-content-disclosure" open data-responsive-disclosure>
  <summary>Pełny opis kategorii</summary>
  <div class="mobile-details-body source-content-body"><div class="article-copy">{copy}</div></div>
</details>'''
        if client_content.get("brands"):
            # After the description, as in the client PDF. An outside address is the producer's
            # catalogue; it opens in a new tab, like the other files to download.
            chips = "".join(
                f'<li><a href="{esc(href)}" target="_blank" rel="noopener noreferrer">{esc(name)} – katalog <span aria-hidden="true">↗</span></a></li>'
                if href.startswith("https://")
                else f'<li><a href="{url_for(href, prefix)}">{esc(name)} <span aria-hidden="true">↗</span></a></li>' if href
                else f"<li><span>{esc(name)}</span></li>"
                for name, href in client_content["brands"]
            )
            brand_markup = f'''<div class="brand-box">
  <h2>{esc(client_content.get("brands_title", "Producenci"))}</h2>
  <ul class="brand-chips">{chips}</ul>
</div>'''
        if client_content.get("profiles"):
            parts.append(profile_rows_markup(client_content["profiles"], prefix, f"Profile: {title}"))
        client_markup = "\n".join(parts)
    desc_html = f'<p class="subpage-lead">{esc(teaser or desc)}</p>' if teaser or (desc and not source_markup) else ''

    crumb = f'''<div class="page-nav-bar">
  <button type="button" class="btn-back" data-history-back aria-label="Wróć do poprzedniej strony">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
    <span>Wróć</span>
  </button>
  <nav class="breadcrumbs" aria-label="Okruszki"><a href="{url_for('/#oferta', prefix)}" data-home-link>Strona główna</a><span>/</span><a href="{url_for('/oferta/', prefix)}">Oferta</a><span>/</span><span aria-current="page">{esc(title)}</span></nav>
</div>'''

    main = f'''<main id="main" class="page-main">
  <div class="wrap">
    {crumb}
    <header class="subpage-head">
      <span class="eyebrow">Kategoria oferty</span>
      <h1>{esc(title)}</h1>
      {desc_html}
    </header>
    {cat_quick_nav}
    <div class="subpage-grid">
      <div class="subpage-content">
        {client_markup}
        {content_grid}{sill_medos_links_markup(route)}
        {source_markup}{brand_markup}
        <div class="cta-banner-dark">
          <span class="eyebrow eyebrow--highlight">Zainteresowała Cię nasza oferta?</span>
          <h3>Zamów bezpłatny pomiar i wycenę</h3>
          <p>Doradzimy odpowiednie rozwiązanie i przygotujemy niezobowiązującą kalkulację cenową.</p>
          {CTA_CONTACT}
        </div>
      </div>
      {sidebar_markup(route, prefix)}
    </div>
  </div>
</main>'''
    return document(route, f"{title} | WOL-BUD Tarnów", desc or f"{title} — sprzedaż i montaż w WOL-BUD Tarnów.", main)


def product_detail_page(route: str, prod: dict, scraped_data: dict, source_page: dict | None = None) -> str:
    prefix = asset_prefix(route)
    title = prod.get("title", "")
    paragraphs = prod.get("paragraphs", [])
    specs = prod.get("specs", [])
    images, small_assets = product_gallery_images(route, prod.get("images", []))
    pdfs = prod.get("pdfs", [])

    # Find parent category
    parent_cat_name = "Oferta"
    parent_cat_href = "/oferta/"
    clean_route = route.rstrip("/")
    cat_products_list = []
    for cat_href, cat_info in scraped_data.get("categories", {}).items():
        for p in cat_info.get("products", []):
            if p.get("href", "").rstrip("/") == clean_route:
                parent_cat_name = cat_info.get("title", "Kategoria")
                parent_cat_href = cat_href
                cat_products_list = cat_info.get("products", [])
                break
        if parent_cat_href != "/oferta/":
            break

    # Calculate previous and next product in this category
    prev_link_html = ""
    next_link_html = ""
    if cat_products_list:
        p_index = -1
        for i, p in enumerate(cat_products_list):
            if p.get("href", "").rstrip("/") == clean_route:
                p_index = i
                break
        if p_index > 0:
            p_prev = cat_products_list[p_index - 1]
            prev_href = url_for(route_url(p_prev.get("href", "")), prefix)
            prev_title = esc(p_prev.get("title", ""))
            prev_link_html = f'''<a class="pnav-btn pnav-prev" href="{prev_href}">
  <small>← Poprzedni produkt</small>
  <span>{prev_title}</span>
</a>'''
        if p_index >= 0 and p_index < len(cat_products_list) - 1:
            p_next = cat_products_list[p_index + 1]
            next_href = url_for(route_url(p_next.get("href", "")), prefix)
            next_title = esc(p_next.get("title", ""))
            next_link_html = f'''<a class="pnav-btn pnav-next" href="{next_href}">
  <small>Następny produkt →</small>
  <span>{next_title}</span>
</a>'''

    prev_span = prev_link_html if prev_link_html else "<span></span>"
    next_span = next_link_html if next_link_html else "<span></span>"
    product_nav_bar = f'''<nav class="product-nav-bar" aria-label="Nawigacja między produktami">
  {prev_span}
  <a class="pnav-all" href="{url_for(parent_cat_href, prefix)}">Wszystkie z kategorii {esc(parent_cat_name)} ↗</a>
  {next_span}
</nav>'''

    # Hero visual & interactive gallery with stage arrows and zoom
    visual_html = ""
    main_img = url_for(images[0], prefix) if images else ""
    has_multiple = len(images) > 1

    prev_arrow = f'''<button type="button" class="gallery-nav-arrow gallery-prev" data-gallery-prev aria-label="Poprzednie zdjęcie">
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
</button>''' if has_multiple else ""

    next_arrow = f'''<button type="button" class="gallery-nav-arrow gallery-next" data-gallery-next aria-label="Następne zdjęcie">
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
</button>''' if has_multiple else ""

    counter_html = f'''<div class="gallery-counter"><span data-gallery-curr>1</span> / <span>{len(images)}</span></div>''' if has_multiple else ""

    gallery_thumbs = []
    thumbnail_images = small_assets if len(small_assets) == len(images) else images
    for i, img in enumerate(images):
        image_rel = url_for(img, prefix)
        thumb_src = url_for(thumbnail_images[i], prefix)
        width, height = image_dimensions(img) or (4, 3)
        ratio = width / height
        act_cls = " is-active" if i == 0 else ""
        gallery_thumbs.append(f'''<button type="button" class="product-gallery-thumb{act_cls}" data-index="{i}" data-src="{image_rel}" data-ratio="{ratio:.5f}" style="--gallery-ratio: {ratio:.5f};" aria-label="Pokaż zdjęcie {i+1} z {len(images)}: {esc(title)}" aria-current="{str(i == 0).lower()}">
  <img src="{thumb_src}" alt="{esc(title)}" loading="lazy" decoding="async">
</button>''')
    thumbs_html = horizontal_photo_strip(
        "".join(gallery_thumbs), "product-gallery-row", f"Galeria zdjęć: {title}", "data-gallery-thumbs"
    ) if gallery_thumbs else ""

    door_gallery_class = " product-gallery--door" if any(
        "drzwi" in normalize(value) for value in (title, parent_cat_name, route)
    ) else ""
    visual_html = f'''<div class="product-gallery{door_gallery_class}" data-gallery>
  <div class="product-gallery-stage">
    {prev_arrow}
    <button type="button" class="product-detail-visual" data-gallery-trigger aria-haspopup="dialog" aria-label="Powiększ zdjęcie produktu: {esc(title)}">
      <img src="{main_img}" alt="{esc(title)}" id="mainGalleryImg" data-gallery-main decoding="async">
      <div class="gallery-zoom-badge">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
        <span>Powiększ</span>
      </div>
      {counter_html}
    </button>
    {next_arrow}
  </div>
  {thumbs_html}
</div>''' if images else ""

    # Description paragraphs
    desc_html = "".join(f'<p>{esc(p)}</p>' for p in paragraphs if p.strip())
    desc_details = f'''<details class="mobile-details" open data-responsive-disclosure>
  <summary>Opis produktu</summary>
  <div class="mobile-details-body"><div class="article-copy">{desc_html}</div></div>
</details>''' if desc_html else ""

    # Specs box
    specs_html = ""
    if specs:
        items = "".join(f'<li><span class="chk">✓</span>{spec_item_markup(s, prefix)}</li>' for s in specs)
        specs_html = f'''<details class="product-specs-box mobile-details" open data-responsive-disclosure>
  <summary>Parametry techniczne i charakterystyka</summary>
  <div class="mobile-details-body"><ul class="specs-list">{items}</ul></div>
</details>'''

    if route in PRODUCT_COPY:
        desc_details = f'''<details class="mobile-details source-content-disclosure" open data-responsive-disclosure>
  <summary>Opis, zalety i parametry produktu</summary>
  <div class="mobile-details-body source-content-body"><div class="article-copy">{copy_blocks_markup(PRODUCT_COPY[route])}</div></div>
</details>'''
        specs_html = ""
    elif source_page:
        desc_details = source_content_panel(source_page, prefix, "Opis, zalety i parametry produktu")
        specs_html = ""
    profiles_html = profile_rows_markup(PRODUCT_PROFILES[route], prefix, f"Systemy: {title}") if route in PRODUCT_PROFILES else ""

    # PDF downloads
    downloads_html = ""
    if pdfs:
        btns = "".join(f'''<a class="pdf-download-btn" href="{esc(pdf.get("href", ""))}" target="_blank" rel="noopener noreferrer">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
  <span>{esc(pdf.get("title", "Pobierz katalog PDF"))} ↗</span>
</a>''' for pdf in pdfs)
        downloads_html = f'''<div class="product-downloads-box">
  <h3>Katalogi i pliki do pobrania</h3>
  <div class="pdf-btn-list">{btns}</div>
</div>'''

    crumb = f'''<div class="page-nav-bar">
  <button type="button" class="btn-back" data-history-back aria-label="Wróć do poprzedniej strony">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
    <span>Wróć</span>
  </button>
  <nav class="breadcrumbs" aria-label="Okruszki"><a href="{url_for('/#oferta', prefix)}" data-home-link>Strona główna</a><span>/</span><a href="{url_for(parent_cat_href, prefix)}">{esc(parent_cat_name)}</a><span>/</span><span aria-current="page">{esc(title)}</span></nav>
</div>'''

    main = f'''<main id="main" class="page-main">
  <div class="wrap">
    {crumb}
    <header class="subpage-head">
      <span class="eyebrow">{esc(parent_cat_name)}</span>
      <h1>{esc(title)}</h1>
    </header>
    <div class="subpage-grid">
      <div class="subpage-content">
        {visual_html}
        {desc_details}
        {profiles_html}
        {specs_html}{sill_palette_markup(route, title, prefix)}
        {downloads_html}{sill_medos_logo_markup(route, prefix)}
        {product_nav_bar}
        <div class="cta-banner-dark">
          <span class="eyebrow eyebrow--highlight">Zainteresował Cię ten produkt?</span>
          <h3>Zamów wycenę lub bezpłatny pomiar</h3>
          <p>Bezpłatny i niewiążący pomiar, doradztwo i wycena są dostępne na budowie lub w naszych salonach sprzedaży.</p>
          {CTA_CONTACT}
        </div>
      </div>
      {sidebar_markup(parent_cat_href, prefix)}
    </div>
  </div>
</main>'''
    description = paragraphs[0] if paragraphs else f"{title} w ofercie WOL-BUD Tarnów."
    return document(route, f"{title} | WOL-BUD Tarnów", description, main)


def services_page(scraped_data: dict, source_page: dict | None = None) -> str:
    route = "/uslugi/"
    prefix = asset_prefix(route)
    services = [s for s in scraped_data.get("services", []) if s.get("title", "") not in REMOVED_SERVICES]
    service_anchors = {
        "Pomiar, doradztwo i wycena": "pomiar-doradztwo-i-wycena",
        "Ciepły montaż": "cieply-montaz",
        "Serwis": "serwis",
        "Kompleksowa obsługa inwestycji": "kompleksowa-obsluga-inwestycji",
        "Prace wykończeniowe i murarskie": "prace-wykonczeniowe-i-murarskie",
        "Daszki poliwęglanowe": "daszki-poliweglanowe",
    }

    cards = []
    for idx, s in enumerate(services, 1):
        stitle = s.get("title", "")
        anch = service_anchors.get(stitle, slugify(stitle))
        paragraphs = s.get("paragraphs", [])
        bullets = s.get("bullets", [])

        paras_html = "".join(f'<p>{esc(p)}</p>' for p in paragraphs)
        bullets_html = ""
        if bullets:
            bullets_html = "<ul>" + "".join(f'<li>{esc(b)}</li>' for b in bullets) + "</ul>"

        feature_box = ""
        if "Ciepły" in stitle:
            feature_box = f'''<div class="service-feature-box">
  <div>
    <span class="eyebrow eyebrow--highlight">Fotoreportaż z budowy</span>
    <p>Zobacz zdjęcia z ciepłego montażu warstwowego.</p>
  </div>
  <a class="service-feature-btn" href="{url_for('/promocje/cieply-montaz-warstwowy-okien-drzwi/', prefix)}">Zobacz fotoreportaż ↗</a>
</div>'''

        cards.append(f'''<article class="service-card" id="{anch}">
  <h2>{esc(SERVICE_TITLE_RENAMES.get(stitle, stitle))}</h2>
  <details class="mobile-details" open data-responsive-disclosure>
    <summary>Opis usługi</summary>
    <div class="mobile-details-body">
      {paras_html}
      {bullets_html}
      {feature_box}
    </div>
  </details>
</article>''')

    if source_page:
        service_content_cards = []
        source_sections = source_service_sections(source_page)
        for section in source_sections:
            stitle = source_display_text(section["title"])
            if stitle in REMOVED_SERVICES:
                continue
            anch = service_anchors.get(stitle, slugify(stitle))
            shown_title = SERVICE_TITLE_RENAMES.get(stitle, stitle)
            blocks = section["blocks"]
            first_paragraph = next(
                (block.get("text", "") for block in blocks if block.get("type") == "paragraph" and block.get("text", "").strip()),
                "",
            )
            teaser = source_first_sentence(first_paragraph)
            full_body = render_source_blocks(blocks, prefix)
            feature_box = ""
            if "Ciepły" in stitle:
                feature_box = f'''<div class="service-feature-box">
  <div>
    <span class="eyebrow eyebrow--highlight">Fotoreportaż z budowy</span>
    <p>Zobacz zdjęcia z ciepłego montażu warstwowego.</p>
  </div>
  <a class="service-feature-btn" href="{url_for('/promocje/cieply-montaz-warstwowy-okien-drzwi/', prefix)}">Zobacz fotoreportaż ↗</a>
</div>'''
            service_content_cards.append(f'''<article class="service-card" id="{esc(anch)}">
  <h2>{esc(shown_title)}</h2>
  {f'<p class="service-card-teaser">{esc(teaser)}</p>' if teaser else ''}
  <details class="mobile-details" open data-responsive-disclosure>
    <summary>Opis usługi</summary>
    <div class="mobile-details-body source-content-body">{full_body}{feature_box}</div>
  </details>
</article>''')
        service_content = "".join(service_content_cards)
        warm_montage_link = f'''<div class="service-feature-box">
  <div>
    <span class="eyebrow eyebrow--highlight">Prawidłowy – szczelny montaż</span>
    <p>Zdjęcia i pełny opis ciepłego montażu warstwowego.</p>
  </div>
  <a class="service-feature-btn" href="{url_for('/promocje/cieply-montaz-warstwowy-okien-drzwi/', prefix)}">Zobacz opis montażu ↗</a>
</div>'''
        service_content += warm_montage_link
    else:
        service_content = "".join(cards)

    crumb = f'''<div class="page-nav-bar">
  <button type="button" class="btn-back" data-history-back aria-label="Wróć do poprzedniej strony">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
    <span>Wróć</span>
  </button>
  <nav class="breadcrumbs" aria-label="Okruszki"><a href="{url_for('/#oferta', prefix)}" data-home-link>Strona główna</a><span>/</span><span aria-current="page">Usługi</span></nav>
</div>'''

    main = f'''<main id="main" class="page-main">
  <div class="wrap">
    {crumb}
    <header class="subpage-head">
      <span class="eyebrow">WOL-BUD Tarnów</span>
      <h1>Usługi montażowe i serwisowe</h1>
    </header>
    <div class="subpage-grid">
      <div class="subpage-content">
        {service_content}
        <div class="cta-banner-dark">
          <span class="eyebrow eyebrow--highlight">Skorzystaj z naszych usług</span>
          <h3>Umów bezpłatny pomiar i wycenę</h3>
          <p>Pomiar, doradztwo i wycena są bezpłatne i niewiążące — na budowie lub w naszych salonach sprzedaży.</p>
          {CTA_CONTACT}
        </div>
      </div>
      {sidebar_markup("/uslugi/", prefix)}
    </div>
  </div>
</main>'''
    return document(route, "Usługi WOL-BUD", "Usługi wymienione na stronie WOL-BUD: pomiar i wycena, prawidłowy – szczelny montaż, serwis, prace wykończeniowe i murarskie, daszki poliwęglanowe.", main)


def warm_montage_page(scraped_data: dict, source_page: dict | None = None) -> str:
    route = "/promocje/cieply-montaz-warstwowy-okien-drzwi/"
    prefix = asset_prefix(route)
    montage = scraped_data.get("warm_montage", {})
    title = montage.get("title", "Ciepły montaż warstwowy okien i drzwi")
    paragraphs = montage.get("paragraphs", [])
    steps = montage.get("steps", [])

    paras_html = "".join(f'<p>{esc(p)}</p>' for p in paragraphs if not p.startswith("Harmonogram"))

    steps_html = []
    for idx, s in enumerate(steps, 1):
        stitle = s.get("title", f"Krok {idx}")
        simg = url_for(s.get("img", ""), prefix)
        steps_html.append(f'''<article class="montage-step-card">
  <div class="montage-step-media">
    <img src="{simg}" alt="{esc(stitle)}" data-lightbox-trigger data-lightbox-src="{simg}" data-lightbox-group="warm-montage" loading="lazy" decoding="async">
  </div>
  <div class="montage-step-info">
          <h3 class="montage-step-title">{esc(stitle)}</h3>
  </div>
</article>''')

    crumb = f'''<div class="page-nav-bar">
  <button type="button" class="btn-back" data-history-back aria-label="Wróć do poprzedniej strony">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
    <span>Wróć</span>
  </button>
  <nav class="breadcrumbs" aria-label="Okruszki"><a href="{url_for('/#oferta', prefix)}" data-home-link>Strona główna</a><span>/</span><a href="{url_for('/uslugi/', prefix)}">Usługi</a><span>/</span><span aria-current="page">{esc(title)}</span></nav>
</div>'''

    main = f'''<main id="main" class="page-main">
  <div class="wrap">
    {crumb}
    <header class="subpage-head">
      <span class="eyebrow">Fotoreportaż i technologia</span>
      <h1>{esc(title)}</h1>
      <p class="subpage-lead">{esc(source_teaser(source_page) or (paragraphs[0] if paragraphs else ''))}</p>
    </header>
    <div class="subpage-grid">
      <div class="subpage-content">
        <div class="article-copy">
          {source_content_panel(source_page, prefix, "Pełny opis montażu", anchor_id="pelny-opis-montazu") or paras_html}
        </div>
        <div class="subpage-section">
          <h2>Zdjęcia z montażu</h2>
          {horizontal_photo_strip(''.join(steps_html), "montage-steps-grid", "Zdjęcia z montażu")}
        </div>
        <div class="cta-banner-dark">
          <span class="eyebrow eyebrow--highlight">Chcesz zamówić ciepły montaż?</span>
          <h3>Zapytaj o ciepły montaż</h3>
          <p>Skontaktuj się z WOL-BUD, aby uzyskać informacje o ciepłym montażu okien i drzwi.</p>
          {CTA_CONTACT}
        </div>
      </div>
      {sidebar_markup("/uslugi/", prefix)}
    </div>
  </div>
</main>'''
    return document(route, f"{title} | WOL-BUD Tarnów", "Ciepły montaż warstwowy okien i drzwi — opis technologii i zdjęcia z montażu.", main)


def catalog_index_page() -> str:
    route = "/oferta/"
    prefix = asset_prefix(route)
    cards = []
    for cat_name, cat_href, cat_thumb, cat_desc in PRIMARY_CATEGORIES:
        cat_desc_html = f'<p>{esc(cat_desc)}</p>' if cat_desc else ""
        cards.append(f'''<a class="home-cat-card" href="{url_for(cat_href, prefix)}">
  <div class="home-cat-thumb">
    <img src="{url_for(cat_thumb, prefix)}" alt="{esc(cat_name)}" loading="lazy" decoding="async">
  </div>
  <div class="home-cat-body">
    <h3>{esc(cat_name)}</h3>
    {cat_desc_html}
    <div class="home-cat-cta">Zobacz ofertę <span>↗</span></div>
  </div>
</a>''')

    crumb = f'''<div class="page-nav-bar">
  <button type="button" class="btn-back" data-history-back aria-label="Wróć do poprzedniej strony">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
    <span>Wróć</span>
  </button>
  <nav class="breadcrumbs" aria-label="Okruszki"><a href="{url_for('/#oferta', prefix)}" data-home-link>Strona główna</a><span>/</span><span aria-current="page">Oferta</span></nav>
</div>'''

    main = f'''<main id="main" class="page-main">
  <div class="wrap">
    {crumb}
    <header class="subpage-head">
      <span class="eyebrow">Katalog WOL-BUD</span>
      <h1>Oferta produktów</h1>
      <p class="subpage-lead">Kompleksowa stolarka otworowa dla domu i inwestycji: okna, drzwi, bramy, rolety i parapety od sprawdzonych producentów.</p>
    </header>
    <div class="home-catalog-grid">
      {''.join(cards)}
    </div>
    <div class="cta-banner-dark">
      <span class="eyebrow eyebrow--highlight">Potrzebujesz wyceny lub doradztwa?</span>
      <h3>Skontaktuj się z WOL-BUD</h3>
      <p>Pomożemy dobrać okna, drzwi i bramy dopasowane do Twojego projektu.</p>
      {CTA_CONTACT}
    </div>
  </div>
</main>'''
    return document(route, "Pełna oferta produktów | WOL-BUD Tarnów", "Okna, drzwi, bramy garażowe, rolety i parapety w ofercie firmy WOL-BUD Tarnów.", main)


def about_page(source_page: dict | None = None) -> str:
    route = "/o-firmie/"
    prefix = asset_prefix(route)
    # Client PDF of 20.10.2026: the scans of references are gone from this page altogether.
    company_story = source_content_panel(source_page, prefix, "O firmie: doświadczenie, atuty i dostawcy")
    crumb = f'''<div class="page-nav-bar">
  <button type="button" class="btn-back" data-history-back aria-label="Wróć do poprzedniej strony">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
    <span>Wróć</span>
  </button>
  <nav class="breadcrumbs" aria-label="Okruszki"><a href="{url_for('/#ofirmie', prefix)}" data-home-link>Strona główna</a><span>/</span><span aria-current="page">O firmie</span></nav>
</div>'''

    main = f'''<main id="main" class="page-main">
  <div class="wrap">
    {crumb}
    <header class="subpage-head">
      <span class="eyebrow">Od 1995 roku</span>
      <h1>O firmie WOL-BUD</h1>
      <p class="subpage-lead">Firma Wojciecha Wolańskiego zajmuje się sprzedażą i montażem stolarki okiennej i drzwiowej od 1995 roku.</p>
    </header>
    <div class="subpage-grid">
      <div class="subpage-content article-copy">
        {company_story}
        <div class="cta-banner-dark">
          <span class="eyebrow eyebrow--highlight">Porozmawiajmy o Twojej inwestycji</span>
          <h3>Odwiedź nasz salon lub zadzwoń</h3>
          <p>Informacje o produktach, usługach i salonach znajdziesz na naszej stronie.</p>
          {CTA_CONTACT}
        </div>
      </div>
      {sidebar_markup("/o-firmie/", prefix)}
    </div>
  </div>
</main>'''
    return document(route, "O firmie | WOL-BUD Wojciech Wolański Tarnów", "WOL-BUD — sprzedaż i montaż stolarki okiennej i drzwiowej od 1995 roku.", main)


def source_document_page(route: str, source_page: dict) -> str:
    prefix = asset_prefix(route)
    title = source_page_title(source_page)
    source_markup = source_content_panel(source_page, prefix, "Pełny opis źródłowy")
    crumb = f'''<div class="page-nav-bar">
  <button type="button" class="btn-back" data-history-back aria-label="Wróć do poprzedniej strony">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
    <span>Wróć</span>
  </button>
  <nav class="breadcrumbs" aria-label="Okruszki"><a href="{url_for('/#oferta', prefix)}" data-home-link>Strona główna</a><span>/</span><span aria-current="page">{esc(title)}</span></nav>
</div>'''
    main = f'''<main id="main" class="page-main">
  <div class="wrap">
    {crumb}
    <header class="subpage-head"><h1>{esc(title)}</h1></header>
    <div class="subpage-grid">
      <div class="subpage-content">{source_markup}</div>
      {sidebar_markup(route, prefix)}
    </div>
  </div>
</main>'''
    return document(route, f"{title} | WOL-BUD", title, main)


def locations_page(source_page: dict | None = None) -> str:
    route = "/nasze-sklepy/"
    prefix = asset_prefix(route)
    cards = []
    for store in STORES:
        name = store["name"]
        if store["photo"]:
            photo_url = url_for(f"/img/stores/{store['photo']}", prefix)
            photo_html = f'<div class="location-card__photo"><img src="{photo_url}" alt="{esc(name)}" loading="lazy" decoding="async"></div>'
        else:
            photo_html = f'<div class="location-card__photo location-card__photo--empty" aria-hidden="true"><i>{MAP_PIN_SVG}</i><span>{esc(store["city"])}</span></div>'
        phone_links = "".join(
            f'\n      <a href="tel:{re.sub(r"[^0-9]", "", number)}">{label} {esc(number)}</a>'
            for label, number in (("Kom.", store["mobile"]), ("Tel.", store["tel"]))
            if number
        )
        links_html = f'\n    <div class="location-card__links">{phone_links}\n    </div>' if phone_links else ""
        hours_html = f'\n    <p class="location-card__hours">{esc(store["hours"])} · niedz. zamknięte</p>' if store["hours"] else ""
        cards.append(f'''<article class="location-card">
  {photo_html}
  <div class="location-card__body">
    <h2>{esc(name)}</h2>
    <address>{esc(store["address_full"])}</address>{links_html}{hours_html}
    <a class="store-nav-btn" href="{store["map"]}" target="_blank" rel="noopener noreferrer"><i>{MAP_PIN_SVG}</i>Nawiguj w Google Maps ↗</a>
  </div>
</article>''')

    source_details = source_content_panel(source_page, prefix, "Informacje o salonach i ekspozycji")
    source_intro = source_teaser(source_page)

    crumb = f'''<div class="page-nav-bar">
  <button type="button" class="btn-back" data-history-back aria-label="Wróć do poprzedniej strony">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
    <span>Wróć</span>
  </button>
  <nav class="breadcrumbs" aria-label="Okruszki"><a href="{url_for('/#kontakt', prefix)}" data-home-link>Strona główna</a><span>/</span><span aria-current="page">Nasze sklepy</span></nav>
</div>'''

    main = f'''<main id="main" class="page-main">
  <div class="wrap">
    {crumb}
    <header class="subpage-head">
      <span class="eyebrow">Salony stacjonarne</span>
      <h1>Nasze sklepy i ekspozycje</h1>
      <p class="subpage-lead">{esc(source_intro or 'Zapraszamy do salonów sprzedaży w Tarnowie i Radłowie.')}</p>
    </header>
    <div class="location-grid">
      {''.join(cards)}
    </div>
    {source_details}
  </div>
</main>'''
    return document(route, "Nasze sklepy i salony | WOL-BUD Tarnów, Radłów", "Adresy salonów sprzedaży WOL-BUD w Tarnowie i Radłowie. Godziny otwarcia, telefony i wskazówki dojazdu.", main)


def contact_page() -> str:
    route = "/kontakt/"
    prefix = asset_prefix(route)
    crumb = f'''<div class="page-nav-bar">
  <button type="button" class="btn-back" data-history-back aria-label="Wróć do poprzedniej strony">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
    <span>Wróć</span>
  </button>
  <nav class="breadcrumbs" aria-label="Okruszki"><a href="{url_for('/#kontakt', prefix)}" data-home-link>Strona główna</a><span>/</span><span aria-current="page">Kontakt</span></nav>
</div>'''

    main = f'''<main id="main" class="page-main">
  <div class="wrap">
    {crumb}
    <header class="subpage-head">
      <span class="eyebrow">Dane kontaktowe</span>
      <h1>Chętnie doradzimy</h1>
      <p class="subpage-lead">Zadzwoń albo zajrzyj do naszych salonów w Tarnowie i Radłowie. Umówimy pomiar na budowie i odpowiemy na wszystkie pytania techniczne.</p>
    </header>
    <div class="kt">
      <div class="kt-tel">
        <span class="kt-lab">Zadzwoń do nas</span>
        <a class="kt-num" href="tel:+48534091021"><i><svg viewBox="0 0 24 24"><path d="M7.2 3.5h2.1l1.4 4-1.8 1.5a14 14 0 0 0 6.1 6.1l1.5-1.8 4 1.4v2.1c0 1.1-.9 2-2 2A15.5 15.5 0 0 1 5.2 5.5c0-1.1.9-2 2-2Z"/></svg></i>534 091 021</a>
        <ul class="kt-lista">
          <li><span>E-mail:</span><a href="mailto:biuro@wol-bud.com.pl">biuro@wol-bud.com.pl</a></li>
          <li><span>Facebook:</span><a href="{FACEBOOK_URL}" target="_blank" rel="noopener noreferrer">Zobacz nasz profil ↗</a></li>
          <li><span>Czynne:</span><span>Poniedziałek – Piątek 08:00–16:00</span></li>
          <li><span>Sobota:</span><span>09:00–12:00 (Tarnów i Radłów)</span></li>
        </ul>
        <div class="kt-oferta">
          <b>WOL-BUD Wojciech Wolański</b>
          Sprzedaż i profesjonalny montaż stolarki okiennej i drzwiowej od 1995 roku.
        </div>
        <div class="kt-oferta">
          <b>Firma Usługowo–Handlowa „WOL-BUD” Wojciech Wolański</b>
          NIP: 8731011790
        </div>
      </div>
      <div class="kt-adres">
        <span class="kt-lab">Salony sprzedaży</span>

        {store_items_markup()}

      </div>
    </div>
  </div>
</main>'''
    return document(route, "Kontakt | WOL-BUD Wojciech Wolański Tarnów", "Dane kontaktowe WOL-BUD. Salony w Tarnowie i Radłowie, telefony, godziny otwarcia i formularz.", main)


def apply_client_corrections(scraped_data: dict, source_pages: dict) -> None:
    """Bring the captured data in line with the client corrections of 29.09."""
    categories = scraped_data["categories"]
    products = scraped_data["products"]
    removed = {route.rstrip("/") for route in REMOVED_ROUTES}

    # "Okna PCV" without the word Domel; the client's profiles replace the old product list.
    old_pcv = categories.pop("/kategorie/okna-pcv-domel/", {})
    categories["/kategorie/okna-pcv/"] = {
        **old_pcv,
        "title": "Okna PCV",
        "description": "Okna PCV na profilach Gealan, Veka, Deceuninck, Schüco i Salamander – sprzedaż i montaż WOL-BUD Tarnów.",
        "paragraphs": [],
        "products": [],
    }
    # The client calls this tab "Drzwi wejściowe" (PDF p. 5); the address /kategorie/drzwi-zewnetrzne/ stays.
    categories["/kategorie/drzwi-zewnetrzne/"]["title"] = "Drzwi wejściowe"
    # The client renamed the Rolety tab "Osłony okienne" (23.10.2026); the address /kategorie/rolety/ stays.
    categories["/kategorie/rolety/"]["title"] = "Osłony okienne"
    for route in REMOVED_ROUTES:
        categories.pop(route, None)
        products.pop(route, None)
        source_pages.pop(route, None)
    for cat_data in categories.values():
        cat_data["products"] = [p for p in cat_data.get("products", []) if p.get("href", "").rstrip("/") not in removed]
        cat_data["paragraphs"] = [source_display_text(text) for text in cat_data.get("paragraphs", [])]

    stolarka = source_pages.get("/kategorie/stolarka-aluminiowa/")
    if stolarka:
        stolarka["blocks"] = [
            {**block, "items": [item for item in block.get("items", []) if normalize(item) != "ogrody zimowe"]}
            if block.get("type") == "list" else block
            for block in stolarka.get("blocks", [])
        ]
    sills = source_pages.get("/kategorie/parapety-blaty/")
    if sills:
        # The captured list and its closing paragraph name the old sill kinds.
        sills["blocks"] = [
            block for block in sills.get("blocks", [])
            if not (block.get("type") == "list" and "Aglomarmur" in block.get("items", []))
            and not (block.get("type") == "paragraph" and block.get("text", "").startswith("Powyżej prezentujemy"))
        ]
    stores = source_pages.get("/nasze-sklepy/")
    if stores:
        # The captured address list still names ul. Szkotnik; the store cards above it carry the current data.
        stores["blocks"] = [
            block for block in stores.get("blocks", [])
            if not (block.get("type") == "list" and any("Szkotnik" in item for item in block.get("items", [])))
        ]

    for route, copy in PRODUCT_COPY.items():
        if route in products:
            products[route]["paragraphs"] = [value for kind, value in copy if kind == "p"]
    for route in products:
        products[route]["paragraphs"] = [source_display_text(text) for text in products[route].get("paragraphs", [])]

    for cat_route, prod_route, title, image, paragraphs, bullets in NEW_PRODUCTS:
        categories[cat_route]["products"].append({"title": title, "href": prod_route.rstrip("/"), "image": image})
        products[prod_route] = {"title": title, "paragraphs": paragraphs, "specs": bullets, "images": [image], "pdfs": []}

    for cat_route, title in SILL_CATEGORIES.items():
        categories[cat_route] = {"title": title, "description": "", "paragraphs": [], "products": []}
    for cat_route, prod_route, title, photos, specs in SILL_PRODUCTS:
        categories[cat_route]["products"].append({"title": title, "href": prod_route.rstrip("/"), "image": photos[0]})
        products[prod_route] = {
            "title": title,
            "paragraphs": SILL_DESCRIPTIONS[prod_route],
            "specs": specs,
            "images": photos,
            "pdfs": [{"title": name, "href": href} for name, href in SILL_DOWNLOADS[prod_route]],
        }


def main() -> None:
    print("Loading data...")
    scraped_data = json.loads(SCRAPED_DATA_FILE.read_text(encoding="utf-8"))
    source_content = json.loads(SOURCE_DATA_FILE.read_text(encoding="utf-8"))
    source_pages = source_page_index(source_content)
    apply_client_corrections(scraped_data, source_pages)

    # 1. Generate Home Page
    print("Generating Home Page...")
    (ROOT / "index.html").write_text(home_page(scraped_data, source_pages.get("/uslugi/")), encoding="utf-8")

    # 2. Generate Primary and Secondary Category Pages
    print("Generating Category Pages...")
    categories = scraped_data.get("categories", {})
    for cat_route, cat_data in categories.items():
        html_content = category_page(cat_route, cat_data, scraped_data, source_pages.get(cat_route))
        dest = output_path(cat_route)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(html_content, encoding="utf-8")
        print(f"  Category {cat_route} -> {len(cat_data.get('products', []))} products")

    # Ensure parent categories have dedicated pages
    for parent_cat in ["/kategorie/parapety-blaty/", "/kategorie/rolety/"]:
        if parent_cat not in categories:
            cat_data = {"title": "Parapety i blaty" if "parapety" in parent_cat else "Osłony okienne", "products": []}
            html_content = category_page(parent_cat, cat_data, scraped_data, source_pages.get(parent_cat))
            dest = output_path(parent_cat)
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(html_content, encoding="utf-8")
            print(f"  Parent Category {parent_cat}")

    # 3. Generate All Product Detail Pages
    print("Generating Product Detail Pages...")
    products = scraped_data.get("products", {})
    for prod_route, prod_data in products.items():
        html_content = product_detail_page(prod_route, prod_data, scraped_data, source_pages.get(prod_route))
        dest = output_path(prod_route)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(html_content, encoding="utf-8")
    print(f"  Generated {len(products)} product detail pages.")

    # 4. Generate Services Page
    print("Generating Services Page...")
    (ROOT / "uslugi" / "index.html").parent.mkdir(parents=True, exist_ok=True)
    (ROOT / "uslugi" / "index.html").write_text(services_page(scraped_data, source_pages.get("/uslugi/")), encoding="utf-8")

    # 5. Generate Warm Montage Page
    print("Generating Warm Montage Page...")
    (ROOT / "promocje" / "cieply-montaz-warstwowy-okien-drzwi" / "index.html").parent.mkdir(parents=True, exist_ok=True)
    (ROOT / "promocje" / "cieply-montaz-warstwowy-okien-drzwi" / "index.html").write_text(warm_montage_page(scraped_data, source_pages.get("/promocje/cieply-montaz-warstwowy-okien-drzwi/")), encoding="utf-8")

    # 5b. Generate Realizations Page
    print("Generating Realizations Page...")
    (ROOT / "realizacje" / "index.html").parent.mkdir(parents=True, exist_ok=True)
    (ROOT / "realizacje" / "index.html").write_text(realizations_page(), encoding="utf-8")

    # 6. Generate Catalog Index (Oferta)
    print("Generating Catalog Index Page...")
    (ROOT / "oferta" / "index.html").parent.mkdir(parents=True, exist_ok=True)
    (ROOT / "oferta" / "index.html").write_text(catalog_index_page(), encoding="utf-8")

    # 7. Generate Standalone Pages: O firmie, Nasze sklepy, Kontakt
    print("Generating Static Content Pages...")
    (ROOT / "o-firmie" / "index.html").parent.mkdir(parents=True, exist_ok=True)
    (ROOT / "o-firmie" / "index.html").write_text(about_page(source_pages.get("/o-firmie/")), encoding="utf-8")

    (ROOT / "nasze-sklepy" / "index.html").parent.mkdir(parents=True, exist_ok=True)
    (ROOT / "nasze-sklepy" / "index.html").write_text(
        locations_page(source_pages.get("/nasze-sklepy/")),
        encoding="utf-8",
    )

    (ROOT / "kontakt" / "index.html").parent.mkdir(parents=True, exist_ok=True)
    (ROOT / "kontakt" / "index.html").write_text(contact_page(), encoding="utf-8")

    # Old addresses of removed pages forward visitors and search engines to the current page.
    for old_route, target in REMOVED_ROUTES.items():
        dest = output_path(old_route)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(redirect_page(old_route, target), encoding="utf-8")
        print(f"  Redirect {old_route} -> {target}")

    # Render captured source routes without a specialized catalogue template as complete content pages.
    generated_routes = {
        "/", "/oferta/", "/uslugi/", "/realizacje/", "/o-firmie/", "/nasze-sklepy/", "/kontakt/",
        "/promocje/cieply-montaz-warstwowy-okien-drzwi/",
        *categories.keys(), *products.keys(), *REMOVED_ROUTES.keys(),
    }
    for source_route_path, source_page in source_pages.items():
        if source_route_path in generated_routes:
            continue
        dest = output_path(source_route_path)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(source_document_page(source_route_path, source_page), encoding="utf-8")
        generated_routes.add(source_route_path)
        print(f"  Source page {source_route_path}")

    print("\nSite build complete! All pages generated with interactive galleries, navigation, and map links.")


if __name__ == "__main__":
    main()
