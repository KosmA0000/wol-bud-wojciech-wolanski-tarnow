#!/usr/bin/env python3
"""Build the static WOL-BUD website in the premium DAKO-Kalisz Awwwards style.
Features:
- Complete scraped product & category catalog (17 categories, 67 products, 7 services)
- Interactive product gallery with stage arrows (left/right), thumbnail switching & keyboard navigation
- Fullscreen Lightbox modal with zoom, left/right arrows, counter, keyboard navigation (Esc, Arrow keys)
- Smart breadcrumbs and 'Wróć' back buttons returning directly to originating homepage section (not hero)
- Individual 'Nawiguj w Google Maps ↗' buttons for every salon address
- Floating 'Do góry' (Back to Top) scroll button
- 100% authentic WOL-BUD content & verified 5-star Google reviews
"""

from __future__ import annotations

import html
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRAPED_DATA_FILE = ROOT / "docs" / "full_scraped_data.json"
SOURCE_DATA_FILE = ROOT / "docs" / "source-content.json"
GOOGLE_REVIEWS_FILE = ROOT.parent / "zrodla" / "google.txt"

GOOGLE_PROFILE = "https://www.google.com/maps/place/WOL-BUD+Wojciech+Wola%C5%84ski/@50.018426,20.948448,17z/data=!4m8!3m7!1s0x473d849d210e031b:0x4f5e253fc57bd81d!8m2!3d50.018426!4d20.948448!9m1!1b1!16s%2Fg%2F1pv5tkfkh?hl=pl"

# Navigation links for specific salon locations
MAP_LINKS = {
    "chyszow": "https://www.google.com/maps/dir/?api=1&destination=WOL-BUD+ul.+Gie%C5%82dowa+5,+33-100+Tarn%C3%B3w",
    "szkotnik": "https://www.google.com/maps/dir/?api=1&destination=WOL-BUD+ul.+Szkotnik+2b,+33-100+Tarn%C3%B3w",
    "radlow": "https://www.google.com/maps/dir/?api=1&destination=WOL-BUD+ul.+Le%C5%9Bna+17a,+33-130+Rad%C5%82%C3%B3w",
}

# Primary categories displayed in menus and catalog
PRIMARY_CATEGORIES = [
    ("Okna PCV firmy Domel", "/kategorie/okna-pcv-domel/", "/public/assets/scraped/thumbs/infinity-passive-130x163.jpg", "Okna energooszczędne i pasywne Gealan oraz Veka"),
    ("Drzwi zewnętrzne", "/kategorie/drzwi-zewnetrzne/", "/public/assets/source/products/drzwi-zewnetrzne-wiked.jpg", "Drzwi stalowe Wikęd o wysokiej izolacyjności i bezpieczeństwie"),
    ("Drzwi wewnętrzne", "/kategorie/drzwi-wewnetrzne/", "/public/assets/source/products/drzwi-wewnetrzne-malaga-w5.png", "Drzwi ramiakowe okleinowane Intenso, Erkado, DRE"),
    ("Bramy garażowe", "/kategorie/bramy-garazowe/", "/public/assets/scraped/thumbs/brama-garazowa-130x173.jpg", "Bramy segmentowe, rolowane i uchylne z automatyką"),
    ("Stolarka aluminiowa", "/kategorie/stolarka-aluminiowa/", "/public/assets/scraped/thumbs/alu3-130x92.jpg", "Okna, drzwi, fasady szklane oraz ogrody zimowe"),
    ("Rolety", "/kategorie/rolety/", "/public/assets/source/products/roleta-dzien-noc.jpg", "Rolety zewnętrzne adaptacyjne, podtynkowe, wewnętrzne i plisy"),
    ("Parapety i blaty", "/kategorie/parapety-blaty/", "/public/assets/scraped/thumbs/Botticino-130x86.jpg", "Aglomarmur, granit, marmur naturalny, parapety PCV i stalowe"),
    ("Moskitiery", "/kategorie/moskitiery/", "/public/assets/source/products/moskitiera-okienna.jpg", "Moskitiery ramkowe okienne i otwierane drzwiowe"),
]

# Subcategories definition for parent categories
SUBCATEGORIES = {
    "/kategorie/parapety-blaty/": [
        ("Aglomarmur", "/kategorie/aglomarmur/", "/public/assets/scraped/thumbs/Botticino-130x86.jpg", "16 odmian konglomeratu marmurowego na parapety i blaty wewnętrzne.", "16 produktów"),
        ("Granit", "/kategorie/granit/", "/public/assets/scraped/thumbs/Baltic-Brown-130x86.jpg", "10 odmian naturalnego granitu o najwyższej trwałości na zewnątrz i do wnętrz.", "10 produktów"),
        ("Marmur", "/kategorie/marmur/", "/public/assets/scraped/thumbs/Crema-Marphil-130x86.jpg", "7 odmian szlachetnego marmuru naturalnego o unikalnej estetyce.", "7 produktów"),
        ("Parapety PCV wewnętrzne", "/kategorie/pcv-wewnetrzne/", "/public/assets/scraped/thumbs/PCV-Bia_y-130x86.jpg", "Parapety komorowe PCV oraz nakładki renowacyjne na stare parapety.", "2 produkty"),
        ("Parapety stalowe i aluminiowe", "/kategorie/stalowe-aluminiowe-zewnetrzne/", "/public/assets/scraped/thumbs/RAL-8019-12-mm1-130x86.jpg", "Parapety zewnętrzne standard oraz zaokrąglona linia soft.", "4 produkty"),
    ],
    "/kategorie/rolety/": [
        ("Rolety wewnętrzne", "/kategorie/wewnetrzne/", "/public/assets/scraped/thumbs/dzien-noc-2-130x86.jpg", "Rolety materiałowe w kasetach ALU i PCV, dzień-noc, dachowe i mini.", "8 produktów"),
        ("Rolety zewnętrzne", "/kategorie/zewnetrzne/", "/public/assets/source/products/roleta-dzien-noc.jpg", "Rolety zewnętrzne w systemie adaptacyjnym oraz podtynkowym Integro.", "2 produkty"),
        ("Żaluzje i plisy", "/kategorie/zaluzje-plisy/", "/public/assets/source/products/zaluzje-drewniane.jpg", "Żaluzje drewniane, żaluzje aluminiowe poziome oraz plisy okienne.", "3 produkty"),
        ("Moskitiery", "/kategorie/moskitiery/", "/public/assets/source/products/moskitiera-okienna.jpg", "Siatki przeciw owadom: ramkowe okienne i otwierane drzwiowe.", "2 produkty"),
    ],
}

# Real Google reviews from Google Business profile
REAL_REVIEWS = [
    {
        "author": "Damian Machalski",
        "rating": 5,
        "date": "rok temu",
        "text": "Okna bardzo dobrej jakości. Fachowa obsługa, potrafią doradzić, montaż bez żadnych problemów.",
    },
    {
        "author": "Stanislaw Tyrka",
        "rating": 5,
        "date": "miesiąc temu",
        "text": "Firma z wieloletnim doświadczeniem i super ekipa. Polecam serdecznie",
    },
    {
        "author": "Martyna Olszowka",
        "rating": 5,
        "date": "rok temu",
        "text": "Serdecznie polecam ta firmę, dokładne wykonanie ,pełna profesjonalnosc . Jestem zadowolona montażem okiem polecam każdemu .",
    },
    {
        "author": "Justyna S",
        "rating": 5,
        "date": "rok temu",
        "text": "Polecam firmę Wol-bud. Zamawiałam okna, rolety, drzwi i bramę wszystko dostarczone na czas. Duży wybór drzwi, konkurencyjne ceny, bardzo dobry kontakt z klientem Pan Robert dołożył starań żeby jak najlepiej doradzić. Zgłaszałam drobne usterki i wszystko zostało wyregulowane i naprawione. Profesjonalny montaż 🙂",
    },
    {
        "author": "Amor Patriae Nostra Lex",
        "rating": 5,
        "date": "rok temu",
        "text": "Serdecznie polecam firmę , wykonali panowie u nas okna drzwi rolety, wszystko na pełnym profesjonalizmie 👏🤝 trzymają porządek na miejscu pracy, punktualni i kultura na pełnym poziomie 💪 panowie jechali do nas 150km na montaż 🙈 ale montaż i kontakt wzorowy!…",
    },
    {
        "author": "Andrzej Kozlowski",
        "rating": 5,
        "date": "6 lat temu",
        "text": "Firma i jej pracownicy z profesjonalnym podejściem do klienta i wykonywanych usług ! Wszystko zgodnie z zamówieniem i umową. Punktualnie i dokładnie wykonane. Przed podpisaniem umowy fachowe porady. Polecam.",
    },
    {
        "author": "Beata Grenda",
        "rating": 5,
        "date": "6 lat temu",
        "text": "Firma Wol-Bud fachowa obsługa i doradztwo na najwyższym poziomie, sprawny, szybki i terminowy montaż. Wystawiamy wiarygodny komentarz po 6 latach użytkowania od montażu. Okna po 6 latach od montażu szczelne i pracują bez problemów ,nie wspominając o bramie garażowej, roletach zewnętrznych ,drzwiach zewnętrznych i wewnętrznych które również zakupiliśmy w firmie Wol-Bud. Serwis na najwyższym poziomie w razie potrzeby. Z czystym sumieniem polecamy firmę Wol-Bud oraz wyroby budowlane które polecają i montują.",
    },
    {
        "author": "Petr Zmuda (petr)",
        "rating": 5,
        "date": "4 lata temu",
        "text": "Polecam. Profesjonalne podejście do tematu. Bardzo szybka reakcja na zgłoszenie zaciętej bramy garażowej. Serwis był w 20 min od zgłoszenia. Trudno dostępne części załatwione błyskawicznie.",
    },
]


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


def url_for(path: str, prefix: str) -> str:
    if not path:
        return prefix or "./"
    if path.startswith("http://") or path.startswith("https://") or path.startswith("tel:") or path.startswith("mailto:"):
        return path
    if path == "/":
        return f"{prefix}index.html" if prefix else "./"
    if path.startswith("/#"):
        return f"{prefix}index.html{path[1:]}" if prefix else path[1:]
    if path.startswith("#"):
        return path
    if path.startswith("/"):
        clean = path.lstrip("/")
        return f"{prefix}{clean}"
    return f"{prefix}{path}"


def header(prefix: str) -> str:
    links = [
        ("Oferta", "/oferta/"),
        ("Usługi", "/uslugi/"),
        ("O firmie", "/o-firmie/"),
        ("Nasze sklepy", "/nasze-sklepy/"),
        ("Kontakt", "/kontakt/"),
    ]
    menu_links = "".join(f'<a href="{url_for(href, prefix)}">{label}</a>' for label, href in links)
    brand_href = url_for("/", prefix)
    return f'''<header class="bar"><div class="bar-in"><div class="menu" id="menu"><button class="pill" id="menuButton" aria-expanded="false" data-menu-toggle>Menu</button><nav class="menu-panel" id="site-menu" data-menu-panel hidden aria-label="Menu główne">{menu_links}<a class="menu-phone" href="tel:+48534091021"><i></i>534 091 021</a></nav></div><a class="brand" href="{brand_href}">WOL-BUD</a><a class="pill phone" href="tel:+48534091021"><i></i>534 091 021</a></div></header>'''


def footer(prefix: str) -> str:
    links = [
        ("Oferta", "/oferta/"),
        ("Usługi", "/uslugi/"),
        ("O firmie", "/o-firmie/"),
        ("Nasze sklepy", "/nasze-sklepy/"),
        ("Kontakt", "/kontakt/"),
    ]
    footer_links = "".join(f'<a href="{url_for(href, prefix)}">{label}</a>' for label, href in links)
    return f'''<footer><div class="wrap"><div class="footer-links">{footer_links}</div><p class="footer-copy">WOL-BUD Wojciech Wolański · Sprzedaż i profesjonalny montaż okien, drzwi i bram od 1995 roku · Tarnów, Radłów · <a href="tel:+48534091021">534 091 021</a></p></div></footer>'''


def document(route: str, title: str, description: str, body: str) -> str:
    prefix = asset_prefix(route)
    safe_description = esc(description[:220])
    return f'''<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#1b1b19"><meta name="description" content="{safe_description}">
<title>{esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="{prefix}assets/css/site.css"><script defer src="{prefix}assets/js/site.js"></script></head>
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

</body></html>'''


def home_page(scraped_data: dict) -> str:
    prefix = ""
    intro = "WOL-BUD to firma Wojciecha Wolańskiego, założona w 1995 roku. Oferuje okna PCV i aluminiowe, drzwi, bramy garażowe, rolety, parapety, doradztwo i montaż."

    # Authentic reviews markup for slider
    reviews_markup = []
    for r in REAL_REVIEWS:
        reviews_markup.append(f'''<li class="review">
  <div class="stars" role="img" aria-label="Ocena 5 na 5">★★★★★</div>
  <blockquote>{esc(r["text"])}</blockquote>
  <div class="review-author">{esc(r["author"])} · 5/5 · {esc(r["date"])}<span>Opinia Google</span></div>
</li>''')

    # Category Cards (8 primary)
    cat_cards_markup = []
    for cat_name, cat_href, cat_thumb, cat_desc in PRIMARY_CATEGORIES:
        cat_cards_markup.append(f'''<a class="home-cat-card" href="{url_for(cat_href, prefix)}">
  <div class="home-cat-thumb">
    <img src="{url_for(cat_thumb, prefix)}" alt="{esc(cat_name)}" loading="lazy" decoding="async">
  </div>
  <div class="home-cat-body">
    <h3>{esc(cat_name)}</h3>
    <p>{esc(cat_desc)}</p>
    <div class="home-cat-cta">Zobacz ofertę <span>↗</span></div>
  </div>
</a>''')

    # Services Cards (7 services)
    services_markup = []
    service_anchors = {
        "Pomiar, doradztwo i wycena": "pomiar-doradztwo-i-wycena",
        "Ciepły montaż": "cieply-montaz",
        "Serwis": "serwis",
        "Kompleksowa obsługa inwestycji": "kompleksowa-obsluga-inwestycji",
        "Prace wykończeniowe i murarskie": "prace-wykonczeniowe-i-murarskie",
        "Układanie kostki brukowej": "ukladanie-kostki-brukowej",
        "Daszki poliwęglanowe": "daszki-poliweglanowe",
    }
    for idx, s in enumerate(scraped_data.get("services", []), 1):
        stitle = s.get("title", "")
        anch = service_anchors.get(stitle, slugify(stitle))
        para = s.get("paragraphs", [""])[0] if s.get("paragraphs") else ""
        link = "/promocje/cieply-montaz-warstwowy-okien-drzwi/" if "Ciepły" in stitle else f"/uslugi/#{anch}"
        services_markup.append(f'''<a class="home-service-item" href="{url_for(link, prefix)}">
  <span class="home-service-item-n">0{idx} USŁUGA</span>
  <h4>{esc(stitle)}</h4>
  <p>{esc(para[:130])}...</p>
  <span class="arr">Dowiedz się więcej ↗</span>
</a>''')

    partner_logos = [
        ("partner-domel.jpg", "DOMEL"), ("partner-fill.png", "FILL"), ("partner-wiked.jpg", "WIKĘD"),
        ("partner-erkado.jpg", "ERKADO"), ("partner-intenso.jpg", "INTENSO"), ("partner-lagrus.jpg", "LAGRUS"),
    ]
    partner_entries = "".join(f'<div class="partner-logo"><img src="{url_for(f"/public/assets/source/partners/{file}", prefix)}" alt="{name}" loading="lazy" decoding="async"></div>' for file, name in partner_logos)

    body = f'''<main id="main">
<!-- HERO -->
<section class="hero" id="start">
  <div class="sticky">
    <div class="hero-frame" id="heroFrame">
      <img src="{url_for('/public/assets/source/products/fasada-aluminiowa.jpg', prefix)}" alt="Okna, drzwi i stolarka otworowa WOL-BUD Tarnów" width="1376" height="768" decoding="async">
    </div>
    <div class="hero-copy" id="heroCopy">
      <div class="hero-meta">
        <span>Tarnów, ul. Giełdowa 5 / Szkotnik 2B</span>
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
      </div>
    </div>
  </div>
</section>

<!-- MONTAŻ U CIEBIE (100% Authentic WOL-BUD Text) -->
<section class="trust" id="ofirmie">
  <div class="wrap">
    <div class="trust-head">
      <span class="eyebrow">Montaż</span>
      <h2>Zamontujemy u Ciebie</h2>
    </div>
    <div class="mz-grid">
      <div class="mz-copy">
        <p class="mz-lead">W trosce o Państwa wygodę i bezpieczeństwo inwestycji zapewniamy profesjonalny montaż w <strong>Tarnowie</strong>, <strong>Radłowie</strong> i okolicznych miejscowościach.</p>
        <p>WOL-BUD to firma Wojciecha Wolańskiego, założona w 1995 roku. Oferujemy okna PCV i aluminiowe, drzwi, bramy garażowe, rolety, parapety, doradztwo i montaż. Dobrze znamy produkty, które sprzedajemy. Montujemy dokładnie i dbamy o szczegóły.</p>
        <p>Specjalizujemy się w energooszczędnym ciepłym montażu warstwowym z zastosowaniem folii paroszczelnych i paroprzepuszczalnych ProTape oraz termoparapetów Klinar.</p>
        <figure class="glos glos--dark">
          <blockquote>„Okna bardzo dobrej jakości. Fachowa obsługa, potrafią doradzić, montaż bez żadnych problemów.”</blockquote>
          <figcaption><span aria-hidden="true">★★★★★</span> Damian Machalski · opinia Google</figcaption>
        </figure>
        <p class="mz-cta">
          <span>Potrzebujesz bezpłatnego pomiaru?</span>
          <a class="tc-tel" href="tel:+48534091021">Zadzwoń: 534 091 021</a>
        </p>
      </div>
      <figure class="mz-mapa" aria-label="Schemat obszaru montażu: Tarnów, Radłów i okoliczne miejscowości">
        <svg viewBox="0 0 440 300" role="img" aria-hidden="true" focusable="false">
          <defs>
            <radialGradient id="mzHalo" cx="50%" cy="50%" r="50%">
              <stop offset="0" stop-color="#ffb200" stop-opacity=".24"/>
              <stop offset=".62" stop-color="#ffb200" stop-opacity=".08"/>
              <stop offset="1" stop-color="#ffb200" stop-opacity="0"/>
            </radialGradient>
          </defs>
          <ellipse class="mz-halo" cx="220" cy="150" rx="205" ry="138" fill="url(#mzHalo)"/>
          <path d="M260 110 C 220 140 160 150 120 190" fill="none" stroke="rgba(244,243,236,.22)" stroke-width="2" stroke-dasharray="3 7" stroke-linecap="round"/>
          <path class="mz-trasa" d="M260 110 C 220 140 160 150 120 190" fill="none" stroke="#ffb200" stroke-width="3" stroke-linecap="round"/>
          <circle class="mz-puls" cx="260" cy="110" r="20" fill="none" stroke="#ffb200" stroke-opacity=".45"/>
          <circle cx="260" cy="110" r="8" fill="#ffb200"/>
          <text class="mz-l1" x="278" y="104" fill="#f4f3ec" font-size="19" font-weight="600">Tarnów</text>
          <text class="mz-adr" x="278" y="124" fill="rgba(244,243,236,.62)" font-size="12">WOL-BUD, ul. Giełdowa 5 / Szkotnik 2B</text>
          <g class="mz-cel">
            <circle cx="120" cy="190" r="7" fill="#f4f3ec"/>
            <text class="mz-l2" x="136" y="210" fill="#f4f3ec" font-size="17" font-weight="600">Radłów</text>
            <text class="mz-adr" x="136" y="226" fill="rgba(244,243,236,.62)" font-size="12">ul. Leśna 17A</text>
          </g>
          <text class="mz-l3" x="24" y="276" fill="rgba(244,243,236,.62)" font-size="13" font-style="italic">i okoliczne miejscowości</text>
        </svg>
        <figcaption>Schemat obszaru montażu, bez skali</figcaption>
      </figure>
    </div>
    <div class="mz-kroki">
      <span class="eyebrow">Harmonogram obsługi inwestycji</span>
      <ol>
        <li><span class="mz-n">01</span><b>Pomiar i doradztwo</b><span class="mz-t">Zapewniamy bezpłatny i niewiążący pomiar, doradztwo i wycenę na miejscu budowy lub w naszych salonach.</span></li>
        <li><span class="mz-n">02</span><b>Dobór stolarki</b><span class="mz-t">Oferujemy okna energooszczędne Domel, drzwi Wikęd, bramy garażowe, rolety i parapety.</span></li>
        <li><span class="mz-n">03</span><b>Ciepły montaż</b><span class="mz-t">Własne wykwalifikowane ekipy montażowe z wieloletnim doświadczeniem w szczelnym montażu trójwarstwowym.</span></li>
        <li><span class="mz-n">04</span><b>Serwis i gwarancja</b><span class="mz-t">Zapewniamy pełny serwis gwarancyjny i pogwarancyjny, regulację okuć oraz wymianę części.</span></li>
      </ol>
      <figure class="glos glos--dark glos--krotki">
        <blockquote>„Firma z wieloletnim doświadczeniem i super ekipa. Polecam serdecznie”</blockquote>
        <figcaption><span aria-hidden="true">★★★★★</span> Stanislaw Tyrka · opinia Google</figcaption>
      </figure>
    </div>
  </div>
</section>

<!-- OPINIE (100% Genuine Google Reviews) -->
<section class="reviews" id="opinie">
  <div class="wrap">
    <div class="reviews-head">
      <div>
        <span class="eyebrow">Opinie Google</span>
        <h2>Co mówią nasi klienci</h2>
      </div>
      <div class="reviews-score">
        <span class="score-value">4,3</span>
        <div>
          <div class="stars" aria-hidden="true">★★★★★</div>
          <p class="score-meta">Średnia ocen w Google<br>na podstawie 47 opinii</p>
          <a class="reviews-link" href="{GOOGLE_PROFILE}" target="_blank" rel="noopener noreferrer">
            Zobacz profil w Google
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M17 7H8M17 7v9"/></svg>
          </a>
        </div>
      </div>
    </div>
    <ul class="reviews-track" id="reviewsTrack">
      {''.join(reviews_markup)}
    </ul>
    <div class="reviews-nav">
      <button class="rev-prev" type="button" aria-label="Poprzednia opinia">←</button>
      <button class="rev-next" type="button" aria-label="Następna opinia">→</button>
    </div>
  </div>
</section>

<!-- CZEGO SZUKASZ? (Intuitive Catalog Cards Grid + Services) -->
<section class="offer" id="oferta">
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

    <!-- 7 Services Box -->
    <div class="home-services-box">
      <div class="home-services-head">
        <div>
          <span class="eyebrow eyebrow--gold">Kompleksowa obsługa</span>
          <h3>Usługi montażowe i serwisowe</h3>
        </div>
        <a href="{url_for('/uslugi/', prefix)}">Zobacz wszystkie usługi ↗</a>
      </div>
      <div class="home-services-grid">
        {''.join(services_markup)}
      </div>
    </div>

    <figure class="glos glos--wide">
      <blockquote>„Serdecznie polecam ta firmę, dokładne wykonanie ,pełna profesjonalnosc . Jestem zadowolona montażem okiem polecam każdemu .”</blockquote>
      <figcaption><span aria-hidden="true">★★★★★</span> Martyna Olszowka · opinia Google</figcaption>
    </figure>
  </div>
</section>

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

<!-- KONTAKT I SALONY -->
<section class="contact" id="kontakt">
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
          <li><span>Czynne:</span><span>Poniedziałek – piątek 09:00–17:00</span></li>
          <li><span>Soboty:</span><span>09:00–13:00 (Tarnów i Radłów)</span></li>
        </ul>
        <div class="kt-oferta">
          <b>WOL-BUD Wojciech Wolański</b>
          Sprzedaż i profesjonalny montaż stolarki okiennej i drzwiowej od 1995 roku.
        </div>
      </div>
      <div class="kt-adres">
        <span class="kt-lab">Salony sprzedaży</span>

        <div class="kt-store-item">
          <div class="kt-store-title">Salon Tarnów-Chyszów</div>
          <div class="kt-store-addr">ul. Giełdowa 5 (przy placu targowym), 33-100 Tarnów</div>
          <div class="kt-store-phone">Tel. 14 626 80 32 · Kom. 534 091 021</div>
          <a class="store-nav-btn" href="{MAP_LINKS['chyszow']}" target="_blank" rel="noopener noreferrer"><i><svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></i>Nawiguj w Google Maps ↗</a>
        </div>

        <div class="kt-store-item">
          <div class="kt-store-title">Salon Tarnów</div>
          <div class="kt-store-addr">ul. Szkotnik 2b, 33-100 Tarnów</div>
          <div class="kt-store-phone">Tel. 14 628 84 90 · Kom. 693 870 505</div>
          <a class="store-nav-btn" href="{MAP_LINKS['szkotnik']}" target="_blank" rel="noopener noreferrer"><i><svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></i>Nawiguj w Google Maps ↗</a>
        </div>

        <div class="kt-store-item">
          <div class="kt-store-title">Punkt Radłów</div>
          <div class="kt-store-addr">ul. Leśna 17a, 33-130 Radłów</div>
          <div class="kt-store-phone">Tel. 14 678 23 65 · Kom. 609 734 290</div>
          <a class="store-nav-btn" href="{MAP_LINKS['radlow']}" target="_blank" rel="noopener noreferrer"><i><svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></i>Nawiguj w Google Maps ↗</a>
        </div>

      </div>
    </div>
  </div>
</section>
</main>'''
    return document("/", "Okna i drzwi w szerokim wyborze | WOL-BUD Tarnów", intro, body)


def sidebar_markup(current_route: str, prefix: str = "") -> str:
    category_links = []
    for cat_name, cat_href, _, _ in PRIMARY_CATEGORIES:
        is_active = ' style="font-weight:700; color:var(--gold);"' if current_route == cat_href else ''
        category_links.append(f'<li><a href="{url_for(cat_href, prefix)}"{is_active}>{esc(cat_name)}</a></li>')

    return f'''<aside class="subpage-sidebar">
  <div class="sidebar-box sidebar-box--dark">
    <span class="eyebrow eyebrow--gold">Potrzebujesz wyceny?</span>
    <a class="sidebar-tel" href="tel:+48534091021">534 091 021</a>
    <p>Zadzwoń do nas. Pomiar, doradztwo techniczne i bezpłatna wycena na budowie.</p>
    <a class="tc-tel" href="tel:+48534091021">Zadzwoń teraz</a>
  </div>

  <div class="sidebar-box">
    <span class="eyebrow">Salony sprzedaży</span>
    <div class="sidebar-store">
      <p><strong>Tarnów:</strong> ul. Giełdowa 5</p>
      <a class="sidebar-map-link" href="{MAP_LINKS['chyszow']}" target="_blank" rel="noopener noreferrer">Nawiguj w Google Maps ↗</a>
    </div>
    <div class="sidebar-store">
      <p><strong>Tarnów:</strong> ul. Szkotnik 2B</p>
      <a class="sidebar-map-link" href="{MAP_LINKS['szkotnik']}" target="_blank" rel="noopener noreferrer">Nawiguj w Google Maps ↗</a>
    </div>
    <div class="sidebar-store">
      <p><strong>Radłów:</strong> ul. Leśna 17A</p>
      <a class="sidebar-map-link" href="{MAP_LINKS['radlow']}" target="_blank" rel="noopener noreferrer">Nawiguj w Google Maps ↗</a>
    </div>
    <a class="sidebar-link" href="{url_for('/nasze-sklepy/', prefix)}">Zobacz godziny i ekspozycje ↗</a>
  </div>

  <div class="sidebar-box">
    <span class="eyebrow">Kategorie produktów</span>
    <ul class="sidebar-links">
      {''.join(category_links)}
      <li><a href="{url_for('/uslugi/', prefix)}">Ciepły montaż i usługi</a></li>
    </ul>
  </div>
</aside>'''


def category_page(route: str, cat_data: dict, scraped_data: dict) -> str:
    prefix = asset_prefix(route)
    title = cat_data.get("title") or route.strip("/").split("/")[-1].replace("-", " ").title()
    desc = cat_data.get("description", "")
    products = cat_data.get("products", [])

    # If aglomarmur page 1, also include products from page 2 if present
    if route == "/kategorie/aglomarmur/":
        page2_prods = scraped_data.get("categories", {}).get("/kategorie/aglomarmur/page/2/", {}).get("products", [])
        if page2_prods:
            existing_hrefs = {p.get("href") for p in products}
            for p in page2_prods:
                if p.get("href") not in existing_hrefs:
                    products.append(p)

    cards_html = []
    # If category has direct products
    if products:
        for p in products:
            p_title = p.get("title", "")
            p_href = route_url(p.get("href", ""))
            p_img = p.get("image", "")
            if not p_img.startswith("/"):
                p_img = "/" + p_img

            clean_route = route_url(p_href)
            prod_detail = scraped_data.get("products", {}).get(clean_route, {})
            snippet = ""
            if prod_detail.get("specs"):
                snippet = prod_detail["specs"][0]
            elif prod_detail.get("paragraphs"):
                snippet = prod_detail["paragraphs"][0]
            if len(snippet) > 110:
                snippet = snippet[:110] + "..."

            p_href_rel = url_for(p_href, prefix)
            p_img_rel = url_for(p_img, prefix)

            cards_html.append(f'''<article class="cat-prod-card">
  <a class="cat-prod-media" href="{p_href_rel}" aria-label="{esc(p_title)}">
    <img src="{p_img_rel}" alt="{esc(p_title)}" loading="lazy" decoding="async">
  </a>
  <div class="cat-prod-body">
    <span class="cat-prod-tag">WOL-BUD Tarnów</span>
    <h3 class="cat-prod-title"><a href="{p_href_rel}">{esc(p_title)}</a></h3>
    <p class="cat-prod-snippet">{esc(snippet)}</p>
    <a class="cat-prod-btn" href="{p_href_rel}">Zobacz parametry <span>↗</span></a>
  </div>
</article>''')
        content_grid = f'<div class="cat-products-grid">{"".join(cards_html)}</div>'
    elif route in SUBCATEGORIES:
        # Parent category with subcategories
        for sub_title, sub_href, sub_thumb, sub_desc, sub_count in SUBCATEGORIES[route]:
            sub_href_rel = url_for(sub_href, prefix)
            sub_thumb_rel = url_for(sub_thumb, prefix)
            cards_html.append(f'''<a class="subcat-card" href="{sub_href_rel}">
  <div class="subcat-card-media">
    <img src="{sub_thumb_rel}" alt="{esc(sub_title)}" loading="lazy" decoding="async">
  </div>
  <div class="subcat-card-body">
    <span class="subcat-card-count">{esc(sub_count)}</span>
    <h3>{esc(sub_title)}</h3>
    <p>{esc(sub_desc)}</p>
    <span class="cat-prod-btn">Przejdź do oferty <span>↗</span></span>
  </div>
</a>''')
        content_grid = f'<div class="subcat-grid">{"".join(cards_html)}</div>'
    else:
        content_grid = ""

    # Category Quick-Nav Bar
    quick_pills = []
    for c_name, c_href, _, _ in PRIMARY_CATEGORIES:
        is_cur = ' is-active' if route == c_href else ''
        quick_pills.append(f'<a href="{url_for(c_href, prefix)}" class="cat-nav-pill{is_cur}">{esc(c_name)}</a>')
    quick_pills.append(f'<a href="{url_for("/uslugi/", prefix)}" class="cat-nav-pill">Usługi montażowe</a>')

    cat_quick_nav = f'''<div class="cat-quick-nav" aria-label="Szybka nawigacja po kategoriach">
  <span class="cat-quick-nav-label">Kategorie:</span>
  <div class="cat-quick-nav-pills">{''.join(quick_pills)}</div>
</div>'''

    desc_html = f'<p class="subpage-lead">{esc(desc)}</p>' if desc else ''

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
        {content_grid}
        <div class="cta-banner-dark">
          <span class="eyebrow eyebrow--gold">Zainteresowała Cię nasza oferta?</span>
          <h3>Zamów bezpłatny pomiar i wycenę</h3>
          <p>Doradzimy odpowiednie rozwiązanie i przygotujemy niezobowiązującą kalkulację cenową.</p>
          <a class="tc-tel" href="tel:+48534091021">Zadzwoń: 534 091 021</a>
        </div>
      </div>
      {sidebar_markup(route, prefix)}
    </div>
  </div>
</main>'''
    return document(route, f"{title} | WOL-BUD Tarnów", desc or f"{title} — sprzedaż i montaż w WOL-BUD Tarnów.", main)


def product_detail_page(route: str, prod: dict, scraped_data: dict) -> str:
    prefix = asset_prefix(route)
    title = prod.get("title", "")
    paragraphs = prod.get("paragraphs", [])
    specs = prod.get("specs", [])
    images = prod.get("images", [])
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
    if not images:
        images = ["/public/assets/source/products/fasada-aluminiowa.jpg"]

    main_img = url_for(images[0], prefix)
    has_multiple = len(images) > 1

    prev_arrow = f'''<button type="button" class="gallery-nav-arrow gallery-prev" data-gallery-prev aria-label="Poprzednie zdjęcie">
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
</button>''' if has_multiple else ""

    next_arrow = f'''<button type="button" class="gallery-nav-arrow gallery-next" data-gallery-next aria-label="Następne zdjęcie">
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
</button>''' if has_multiple else ""

    counter_html = f'''<div class="gallery-counter"><span data-gallery-curr>1</span> / <span>{len(images)}</span></div>''' if has_multiple else ""

    thumbs_html = ""
    if has_multiple:
        thumb_list = []
        for i, img in enumerate(images):
            act_cls = " is-active" if i == 0 else ""
            img_rel = url_for(img, prefix)
            thumb_list.append(f'''<button type="button" class="product-gallery-thumb{act_cls}" data-index="{i}" data-src="{img_rel}" aria-label="Zdjęcie {i+1} z {len(images)}">
  <img src="{img_rel}" alt="{esc(title)}">
</button>''')
        thumbs_html = f'<div class="product-gallery-row" data-gallery-thumbs>{"".join(thumb_list)}</div>'

    visual_html = f'''<div class="product-gallery" data-gallery>
  <div class="product-gallery-stage">
    {prev_arrow}
    <div class="product-detail-visual" data-gallery-trigger title="Kliknij, aby powiększyć zdjęcie">
      <img src="{main_img}" alt="{esc(title)}" id="mainGalleryImg" data-gallery-main decoding="async">
      <div class="gallery-zoom-badge">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
        <span>Powiększ</span>
      </div>
      {counter_html}
    </div>
    {next_arrow}
  </div>
  {thumbs_html}
</div>'''

    # Description paragraphs
    desc_html = "".join(f'<p>{esc(p)}</p>' for p in paragraphs if p.strip())

    # Specs box
    specs_html = ""
    if specs:
        items = "".join(f'<li><span class="chk">✓</span><span>{esc(s)}</span></li>' for s in specs)
        specs_html = f'''<div class="product-specs-box">
  <h3>Parametry techniczne i charakterystyka</h3>
  <ul class="specs-list">{items}</ul>
</div>'''

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
        <div class="article-copy">
          {desc_html}
        </div>
        {specs_html}
        {downloads_html}
        {product_nav_bar}
        <div class="cta-banner-dark">
          <span class="eyebrow eyebrow--gold">Zainteresował Cię ten produkt?</span>
          <h3>Zamów wycenę lub bezpłatny pomiar</h3>
          <p>Skontaktuj się z naszymi doradcami. Pomożemy dobrać optymalną konfigurację dla Twojego budynku.</p>
          <a class="tc-tel" href="tel:+48534091021">Zadzwoń: 534 091 021</a>
        </div>
      </div>
      {sidebar_markup(parent_cat_href, prefix)}
    </div>
  </div>
</main>'''
    description = paragraphs[0] if paragraphs else f"{title} w ofercie WOL-BUD Tarnów."
    return document(route, f"{title} | WOL-BUD Tarnów", description, main)


def services_page(scraped_data: dict) -> str:
    route = "/uslugi/"
    prefix = asset_prefix(route)
    services = scraped_data.get("services", [])
    service_anchors = {
        "Pomiar, doradztwo i wycena": "pomiar-doradztwo-i-wycena",
        "Ciepły montaż": "cieply-montaz",
        "Serwis": "serwis",
        "Kompleksowa obsługa inwestycji": "kompleksowa-obsluga-inwestycji",
        "Prace wykończeniowe i murarskie": "prace-wykonczeniowe-i-murarskie",
        "Układanie kostki brukowej": "ukladanie-kostki-brukowej",
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
    <span class="eyebrow eyebrow--gold">Fotoreportaż z budowy</span>
    <p>Zobacz pełny 11-etapowy przewodnik fotograficzny z ciepłego montażu warstwowego w naszej firmie.</p>
  </div>
  <a class="service-feature-btn" href="{url_for('/promocje/cieply-montaz-warstwowy-okien-drzwi/', prefix)}">Zobacz fotoreportaż ↗</a>
</div>'''

        cards.append(f'''<article class="service-card" id="{anch}">
  <div class="service-card__num">0{idx} USŁUGA WOL-BUD</div>
  <h2>{esc(stitle)}</h2>
  {paras_html}
  {bullets_html}
  {feature_box}
</article>''')

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
      <p class="subpage-lead">Świadczymy kompleksowe usługi montażu stolarki otworowej, energooszczędnego ciepłego montażu warstwowego, serwisu okien i drzwi oraz prac wykończeniowych dla klientów indywidualnych i instytucji.</p>
    </header>
    <div class="subpage-grid">
      <div class="subpage-content">
        {''.join(cards)}
        <div class="cta-banner-dark">
          <span class="eyebrow eyebrow--gold">Skorzystaj z naszych usług</span>
          <h3>Umów bezpłatny pomiar i wycenę</h3>
          <p>Przyjedziemy na budowę, dokonamy pomiarów i doradzimy optymalne rozwiązania.</p>
          <a class="tc-tel" href="tel:+48534091021">Zadzwoń: 534 091 021</a>
        </div>
      </div>
      {sidebar_markup("/uslugi/", prefix)}
    </div>
  </div>
</main>'''
    return document(route, "Usługi montażowe i serwisowe | WOL-BUD Tarnów", "Kompleksowy montaż okien, drzwi, bram, ciepły montaż warstwowy i serwis stolarki w Tarnowie i okolicach.", main)


def warm_montage_page(scraped_data: dict) -> str:
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
    <img src="{simg}" alt="{esc(stitle)}" loading="lazy" decoding="async">
  </div>
  <div class="montage-step-info">
    <span class="montage-step-n">ETAP 0{idx if idx < 10 else idx}</span>
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
      <p class="subpage-lead">Energooszczędny, szczelny montaż trójwarstwowy okien i drzwi z wykorzystaniem folii ProTape, taśm rozprężnych i termoparapetów podokiennych Klinar.</p>
    </header>
    <div class="subpage-grid">
      <div class="subpage-content">
        <div class="article-copy">
          {paras_html}
        </div>
        <div class="subpage-section">
          <h2>Harmonogram wykonania krok po kroku</h2>
          <div class="montage-steps-grid">
            {''.join(steps_html)}
          </div>
        </div>
        <div class="cta-banner-dark">
          <span class="eyebrow eyebrow--gold">Chcesz zamówić ciepły montaż?</span>
          <h3>Skonsultuj swoją inwestycję z ekspertem</h3>
          <p>Nasi wykwalifikowani montażyści zapewnią idealne parametry szczelności i termiki w Twoim domu.</p>
          <a class="tc-tel" href="tel:+48534091021">Zadzwoń: 534 091 021</a>
        </div>
      </div>
      {sidebar_markup("/uslugi/", prefix)}
    </div>
  </div>
</main>'''
    return document(route, f"{title} | WOL-BUD Tarnów", "Ciepły montaż warstwowy okien i drzwi — harmonogram, technologia i 11 etapów z fotoreportażem.", main)


def catalog_index_page() -> str:
    route = "/oferta/"
    prefix = asset_prefix(route)
    cards = []
    for cat_name, cat_href, cat_thumb, cat_desc in PRIMARY_CATEGORIES:
        cards.append(f'''<a class="home-cat-card" href="{url_for(cat_href, prefix)}">
  <div class="home-cat-thumb">
    <img src="{url_for(cat_thumb, prefix)}" alt="{esc(cat_name)}" loading="lazy" decoding="async">
  </div>
  <div class="home-cat-body">
    <h3>{esc(cat_name)}</h3>
    <p>{esc(cat_desc)}</p>
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
      <h1>Pełna oferta produktów</h1>
      <p class="subpage-lead">Kompleksowa stolarka otworowa dla domu i inwestycji: okna, drzwi, bramy, rolety i parapety od sprawdzonych producentów.</p>
    </header>
    <div class="home-catalog-grid">
      {''.join(cards)}
    </div>
    <div class="cta-banner-dark">
      <span class="eyebrow eyebrow--gold">Potrzebujesz wyceny lub doradztwa?</span>
      <h3>Skontaktuj się z naszymi ekspertami</h3>
      <p>Pomożemy dobrać okna, drzwi i bramy dopasowane do Twojego projektu.</p>
      <a class="tc-tel" href="tel:+48534091021">Zadzwoń: 534 091 021</a>
    </div>
  </div>
</main>'''
    return document(route, "Pełna oferta produktów | WOL-BUD Tarnów", "Okna, drzwi, bramy garażowe, rolety i parapety w ofercie firmy WOL-BUD Tarnów.", main)


def about_page(source_content: dict) -> str:
    route = "/o-firmie/"
    prefix = asset_prefix(route)
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
      <span class="eyebrow">Tradycja i doświadczenie</span>
      <h1>O firmie WOL-BUD</h1>
      <p class="subpage-lead">Firma Wojciecha Wolańskiego od 1995 roku dostarcza i profesjonalnie montuje stolarkę okienną i drzwiową w Tarnowie, Radłowie i Małopolsce.</p>
    </header>
    <div class="subpage-grid">
      <div class="subpage-content article-copy">
        <p>Sprzedażą i montażem stolarki okiennej i drzwiowej zajmujemy się od 1995 roku, zdobywając zaufanie inwestorów indywidualnych oraz instytucji, o czym świadczą liczne referencje i zadowoleni klienci powracający po latach.</p>
        <p>W naszej ofercie znajdą Państwo wyłącznie wyroby renomowanych producentów, charakteryzujące się najwyższą jakością wykonania, trwałością oraz doskonałymi parametrami termicznymi i akustycznymi.</p>
        <p>Posiadamy własne, wykwalifikowane ekipy montażowe, które regularnie podnoszą swoje kwalifikacje na szkoleniach technicznych. Dzięki temu gwarantujemy rzetelne wykonanie każdego zlecenia — od prostego montażu po zaawansowany ciepły montaż trójwarstwowy w budownictwie pasywnym.</p>
        <div class="subpage-section">
          <h2>Dlaczego WOL-BUD?</h2>
          <ul>
            <li>Doświadczenie w branży okien i drzwi od 1995 roku</li>
            <li>Własna, sprawdzona ekipa montażystów</li>
            <li>Autoryzowany partner renomowanych producentów (Domel, Wikęd, Intenso, Erkado)</li>
            <li>Trzy dogodne salony sprzedaży w Tarnowie i Radłowie</li>
            <li>Bezpłatny pomiar, fachowe doradztwo techniczne i wycena na budowie</li>
            <li>Kompleksowy serwis gwarancyjny i pogwarancyjny</li>
          </ul>
        </div>
        <div class="cta-banner-dark">
          <span class="eyebrow eyebrow--gold">Porozmawiajmy o Twojej inwestycji</span>
          <h3>Odwiedź nasz salon lub zadzwoń</h3>
          <p>Chętnie odpowiemy na wszystkie pytania i dobierzemy idealną stolarkę.</p>
          <a class="tc-tel" href="tel:+48534091021">Zadzwoń: 534 091 021</a>
        </div>
      </div>
      {sidebar_markup("/o-firmie/", prefix)}
    </div>
  </div>
</main>'''
    return document(route, "O firmie | WOL-BUD Wojciech Wolański Tarnów", "WOL-BUD — ponad 25 lat doświadczenia w sprzedaży i montażu okien, drzwi i bram w Tarnowie i Radłowie.", main)


def locations_page() -> str:
    route = "/nasze-sklepy/"
    prefix = asset_prefix(route)
    locations = [
        ("Salon Tarnów-Chyszów", "ul. Giełdowa 5 (przy placu targowym Chyszów), 33-100 Tarnów", "14 626 80 32", "534 091 021", "salon-tarnow-chyszow.jpg", "Pn–Pt 9–17 · Sb 9–13", MAP_LINKS['chyszow']),
        ("Salon w Tarnowie", "ul. Szkotnik 2b, 33-100 Tarnów", "14 628 84 90", "693 870 505", "salon-tarnow-szkotnik.jpg", "Pn–Pt 9–17 · Sb 9–13", MAP_LINKS['szkotnik']),
        ("Punkt w Radłowie", "ul. Leśna 17a, 33-130 Radłów", "14 678 23 65", "609 734 290", "salon-radlow.jpg", "Pn–Pt 9–17 · Sb 9–13", MAP_LINKS['radlow']),
    ]
    cards = []
    for name, address, tel_fixed, tel_mobile, photo, hours, map_url in locations:
        mobile_digits = re.sub(r"\D", "", tel_mobile)
        fixed_digits = re.sub(r"\D", "", tel_fixed)
        photo_url = url_for(f"/public/assets/source/stores/{photo}", prefix)
        cards.append(f'''<article class="location-card">
  <div class="location-card__photo"><img src="{photo_url}" alt="{esc(name)}" loading="lazy" decoding="async"></div>
  <div class="location-card__body">
    <h2>{esc(name)}</h2>
    <address>{esc(address)}</address>
    <div class="location-card__links">
      <a href="tel:{mobile_digits}">Kom. {esc(tel_mobile)}</a>
      <a href="tel:{fixed_digits}">Tel. {esc(tel_fixed)}</a>
    </div>
    <p class="location-card__hours">{esc(hours)} · niedz. zamknięte</p>
    <a class="store-nav-btn" href="{map_url}" target="_blank" rel="noopener noreferrer"><i><svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></i>Nawiguj w Google Maps ↗</a>
  </div>
</article>''')

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
      <p class="subpage-lead">Zapraszamy do naszych salonów sprzedaży okien i drzwi w Tarnowie oraz Radłowie. Na miejscu zobaczysz pełne wzorniki i porozmawiasz z doradcą technicznym.</p>
    </header>
    <div class="location-grid">
      {''.join(cards)}
    </div>
    <div class="cta-banner-dark">
      <span class="eyebrow eyebrow--gold">Potrzebujesz pomocy w doborze?</span>
      <h3>Zadzwoń do wybranego punktu lub na infolinię</h3>
      <a class="tc-tel" href="tel:+48534091021">Zadzwoń: 534 091 021</a>
    </div>
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
          <li><span>Czynne:</span><span>Poniedziałek – piątek 09:00–17:00</span></li>
          <li><span>Soboty:</span><span>09:00–13:00 (Tarnów i Radłów)</span></li>
        </ul>
        <div class="kt-oferta">
          <b>WOL-BUD Wojciech Wolański</b>
          Sprzedaż i profesjonalny montaż stolarki okiennej i drzwiowej od 1995 roku.
        </div>
      </div>
      <div class="kt-adres">
        <span class="kt-lab">Salony sprzedaży</span>

        <div class="kt-store-item">
          <div class="kt-store-title">Salon Tarnów-Chyszów</div>
          <div class="kt-store-addr">ul. Giełdowa 5 (przy placu targowym), 33-100 Tarnów</div>
          <div class="kt-store-phone">Tel. 14 626 80 32 · Kom. 534 091 021</div>
          <a class="store-nav-btn" href="{MAP_LINKS['chyszow']}" target="_blank" rel="noopener noreferrer"><i><svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></i>Nawiguj w Google Maps ↗</a>
        </div>

        <div class="kt-store-item">
          <div class="kt-store-title">Salon Tarnów</div>
          <div class="kt-store-addr">ul. Szkotnik 2b, 33-100 Tarnów</div>
          <div class="kt-store-phone">Tel. 14 628 84 90 · Kom. 693 870 505</div>
          <a class="store-nav-btn" href="{MAP_LINKS['szkotnik']}" target="_blank" rel="noopener noreferrer"><i><svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></i>Nawiguj w Google Maps ↗</a>
        </div>

        <div class="kt-store-item">
          <div class="kt-store-title">Punkt Radłów</div>
          <div class="kt-store-addr">ul. Leśna 17a, 33-130 Radłów</div>
          <div class="kt-store-phone">Tel. 14 678 23 65 · Kom. 609 734 290</div>
          <a class="store-nav-btn" href="{MAP_LINKS['radlow']}" target="_blank" rel="noopener noreferrer"><i><svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></i>Nawiguj w Google Maps ↗</a>
        </div>

      </div>
    </div>
  </div>
</main>'''
    return document(route, "Kontakt | WOL-BUD Wojciech Wolański Tarnów", "Dane kontaktowe WOL-BUD. Salony w Tarnowie i Radłowie, telefony, godziny otwarcia i formularz.", main)


def main() -> None:
    print("Loading data...")
    scraped_data = json.loads(SCRAPED_DATA_FILE.read_text(encoding="utf-8"))
    source_content = json.loads(SOURCE_DATA_FILE.read_text(encoding="utf-8"))

    # 1. Generate Home Page
    print("Generating Home Page...")
    (ROOT / "index.html").write_text(home_page(scraped_data), encoding="utf-8")

    # 2. Generate Primary and Secondary Category Pages
    print("Generating Category Pages...")
    categories = scraped_data.get("categories", {})
    for cat_route, cat_data in categories.items():
        html_content = category_page(cat_route, cat_data, scraped_data)
        dest = output_path(cat_route)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(html_content, encoding="utf-8")
        print(f"  Category {cat_route} -> {len(cat_data.get('products', []))} products")

    # Ensure parent categories have dedicated pages
    for parent_cat in ["/kategorie/parapety-blaty/", "/kategorie/rolety/"]:
        if parent_cat not in categories:
            cat_data = {"title": "Parapety i blaty" if "parapety" in parent_cat else "Rolety", "products": []}
            html_content = category_page(parent_cat, cat_data, scraped_data)
            dest = output_path(parent_cat)
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(html_content, encoding="utf-8")
            print(f"  Parent Category {parent_cat}")

    # 3. Generate All Product Detail Pages
    print("Generating Product Detail Pages...")
    products = scraped_data.get("products", {})
    for prod_route, prod_data in products.items():
        html_content = product_detail_page(prod_route, prod_data, scraped_data)
        dest = output_path(prod_route)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(html_content, encoding="utf-8")
    print(f"  Generated {len(products)} product detail pages.")

    # 4. Generate Services Page
    print("Generating Services Page...")
    (ROOT / "uslugi" / "index.html").parent.mkdir(parents=True, exist_ok=True)
    (ROOT / "uslugi" / "index.html").write_text(services_page(scraped_data), encoding="utf-8")

    # 5. Generate Warm Montage Page
    print("Generating Warm Montage Page...")
    (ROOT / "promocje" / "cieply-montaz-warstwowy-okien-drzwi" / "index.html").parent.mkdir(parents=True, exist_ok=True)
    (ROOT / "promocje" / "cieply-montaz-warstwowy-okien-drzwi" / "index.html").write_text(warm_montage_page(scraped_data), encoding="utf-8")

    # 6. Generate Catalog Index (Oferta)
    print("Generating Catalog Index Page...")
    (ROOT / "oferta" / "index.html").parent.mkdir(parents=True, exist_ok=True)
    (ROOT / "oferta" / "index.html").write_text(catalog_index_page(), encoding="utf-8")

    # 7. Generate Standalone Pages: O firmie, Nasze sklepy, Kontakt
    print("Generating Static Content Pages...")
    (ROOT / "o-firmie" / "index.html").parent.mkdir(parents=True, exist_ok=True)
    (ROOT / "o-firmie" / "index.html").write_text(about_page(source_content), encoding="utf-8")

    (ROOT / "nasze-sklepy" / "index.html").parent.mkdir(parents=True, exist_ok=True)
    (ROOT / "nasze-sklepy" / "index.html").write_text(locations_page(), encoding="utf-8")

    (ROOT / "kontakt" / "index.html").parent.mkdir(parents=True, exist_ok=True)
    (ROOT / "kontakt" / "index.html").write_text(contact_page(), encoding="utf-8")

    print("\nSite build complete! All pages generated with interactive galleries, navigation, and map links.")


if __name__ == "__main__":
    main()
