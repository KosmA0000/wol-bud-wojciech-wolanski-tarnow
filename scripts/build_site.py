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

import html
import json
import re
import unicodedata
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
SCRAPED_DATA_FILE = ROOT / "docs" / "full_scraped_data.json"
SOURCE_DATA_FILE = ROOT / "docs" / "source-content.json"

# Navigation links for specific salon locations
MAP_LINKS = {
    "chyszow": "https://www.google.com/maps/dir/?api=1&destination=WOL-BUD+ul.+Gie%C5%82dowa+5,+33-100+Tarn%C3%B3w",
    "szkotnik": "https://www.google.com/maps/dir/?api=1&destination=WOL-BUD+ul.+Szkotnik+2b,+33-100+Tarn%C3%B3w",
    "radlow": "https://www.google.com/maps/dir/?api=1&destination=WOL-BUD+ul.+Le%C5%9Bna+17a,+33-130+Rad%C5%82%C3%B3w",
}

# Primary categories displayed in menus and catalog
PRIMARY_CATEGORIES = [
    ("Okna PCV firmy Domel", "/kategorie/okna-pcv-domel/", "/public/assets/scraped/thumbs/infinity-passive-130x163.webp", ""),
    ("Drzwi zewnętrzne", "/kategorie/drzwi-zewnetrzne/", "/public/assets/source/products/drzwi-zewnetrzne-wiked.webp", ""),
    ("Drzwi wewnętrzne", "/kategorie/drzwi-wewnetrzne/", "/public/assets/source/products/drzwi-wewnetrzne-malaga-w5.webp", ""),
    ("Bramy garażowe", "/kategorie/bramy-garazowe/", "/public/assets/scraped/thumbs/brama-garazowa-130x173.webp", ""),
    ("Stolarka aluminiowa", "/kategorie/stolarka-aluminiowa/", "/public/assets/scraped/thumbs/alu3-130x92.webp", ""),
    ("Rolety", "/kategorie/rolety/", "/public/assets/source/products/roleta-dzien-noc.webp", ""),
    ("Parapety i blaty", "/kategorie/parapety-blaty/", "/public/assets/scraped/thumbs/Botticino-130x86.webp", ""),
    ("Moskitiery", "/kategorie/moskitiery/", "/public/assets/source/products/moskitiera-okienna.webp", ""),
]

# Subcategories definition for parent categories
SUBCATEGORIES = {
    "/kategorie/parapety-blaty/": [
        ("Aglomarmur", "/kategorie/aglomarmur/", "/public/assets/scraped/thumbs/Botticino-130x86.webp", "", ""),
        ("Granit", "/kategorie/granit/", "/public/assets/scraped/thumbs/Baltic-Brown-130x86.webp", "", ""),
        ("Marmur", "/kategorie/marmur/", "/public/assets/scraped/thumbs/Crema-Marphil-130x86.webp", "", ""),
        ("Parapety PCV wewnętrzne", "/kategorie/pcv-wewnetrzne/", "/public/assets/scraped/thumbs/PCV-Bia_y-130x86.webp", "", ""),
        ("Parapety stalowe i aluminiowe", "/kategorie/stalowe-aluminiowe-zewnetrzne/", "/public/assets/scraped/thumbs/RAL-8019-12-mm1-130x86.webp", "", ""),
    ],
    "/kategorie/rolety/": [
        ("Rolety wewnętrzne", "/kategorie/wewnetrzne/", "/public/assets/scraped/thumbs/dzien-noc-2-130x86.webp", "", ""),
        ("Rolety zewnętrzne", "/kategorie/zewnetrzne/", "/public/assets/source/products/roleta-dzien-noc.webp", "", ""),
        ("Żaluzje i plisy", "/kategorie/zaluzje-plisy/", "/public/assets/source/products/zaluzje-drewniane.webp", "", ""),
        ("Moskitiery", "/kategorie/moskitiery/", "/public/assets/source/products/moskitiera-okienna.webp", "", ""),
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
    value = value.replace("działa już od 25 lat", "działa od 1995 roku")
    value = value.replace("zajmujemy się już od 25 lat", "zajmujemy się od 1995 roku")
    value = value.replace("25-letnie doświadczenie w branży okien i drzwi", "doświadczenie w branży okien i drzwi od 1995 roku")
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


def source_content_panel(page: dict | None, prefix: str = "", summary: str = "Pełny opis źródłowy", anchor_map: dict | None = None) -> str:
    if not page:
        return ""
    body = render_source_blocks(source_body_blocks(page), prefix, anchor_map)
    if not body:
        return ""
    return f'''<details class="mobile-details source-content-disclosure" open data-responsive-disclosure>
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


def product_gallery_images(route: str, images: list[str]) -> tuple[list[str], list[str]]:
    """Keep detailed product photos in the stage; retain small source swatches separately."""
    hero_overrides = {
        "/produkty/infinity-passive-83md/": "/public/assets/source/products/okno-infinity-passive-83md.webp",
        "/produkty/drzwi-wewnetrzne-intenso/": "/public/assets/source/products/drzwi-wewnetrzne-malaga-w5.webp",
    }
    displayed = []
    small_assets = []
    for image in images:
        dimensions = image_dimensions(image)
        if dimensions and min(dimensions) < 80:
            small_assets.append(image)
        else:
            displayed.append(image)
    hero = hero_overrides.get(route)
    if hero and (ROOT / hero.lstrip("/")).exists():
        original_hero = images[0] if images else ""
        displayed = [hero] + [image for image in displayed if image != original_hero and image != hero]
        small_assets = [image for image in small_assets if image not in {hero, original_hero}]
    return displayed, small_assets


def header(prefix: str) -> str:
    links = [
        ("Strona główna", "/", "/#start"),
        ("Oferta", "/oferta/", "/#oferta"),
        ("Usługi", "/uslugi/", "/#uslugi"),
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
    return f'''<header class="bar"><div class="bar-in"><div class="menu" id="menu"><button class="pill" id="menuButton" aria-expanded="false" aria-controls="site-menu" data-menu-toggle>Menu</button><nav class="menu-panel" id="site-menu" data-menu-panel hidden aria-label="Menu główne"><button class="menu-close" type="button" data-menu-close aria-label="Zamknij menu">×</button>{menu_links}<a class="menu-phone" href="tel:+48534091021"><i></i>534 091 021</a></nav></div><a class="brand" href="{brand_href}">WOL-BUD</a><a class="pill phone" href="tel:+48534091021"><i></i>534 091 021</a></div></header>'''


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
    html_doc = f'''<!doctype html>
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
    return re.sub(r"(?m)^[ \t]+$", "", html_doc)


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

    additional_categories = [
        ("Rolety wewnętrzne", "/kategorie/wewnetrzne/"),
        ("Rolety zewnętrzne", "/kategorie/zewnetrzne/"),
        ("Żaluzje i plisy", "/kategorie/zaluzje-plisy/"),
    ]
    extra_category_markup = "".join(
        f'<a class="home-extra-category" href="{url_for(route, prefix)}">{esc(name)} <span aria-hidden="true">↗</span></a>'
        for name, route in additional_categories
    )

    featured_product_markup = []
    featured_products = [
        ("/produkty/infinity-passive-83md/", "Infinity Passive 83MD"),
        ("/produkty/wiked-drzwi-zewnetrzne-stalowe/", "Wikęd – drzwi zewnętrzne stalowe"),
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
        para = "\n".join(s.get("paragraphs", []))
        para_html = esc(para).replace("\n", "<br>")
        teaser = service_teasers.get(normalize(stitle)) or source_first_sentence(para)
        link = "/promocje/cieply-montaz-warstwowy-okien-drzwi/" if "Ciepły" in stitle else f"/uslugi/#{anch}"
        services_markup.append(f'''<article class="home-service-item">
  <h4>{esc(stitle)}</h4>
  <p class="home-service-item-teaser">{esc(teaser)}</p>
  <details class="mobile-details" open data-responsive-disclosure>
    <summary>Opis usługi</summary>
    <div class="mobile-details-body"><p>{para_html}</p></div>
  </details>
  <a class="arr" href="{url_for(link, prefix)}">Dowiedz się więcej ↗</a>
</article>''')

    partner_logos = [
        ("partner-domel.webp", "DOMEL"), ("partner-fill.webp", "FILL"), ("partner-wiked.webp", "WIKĘD"),
        ("partner-erkado.webp", "ERKADO"), ("partner-intenso.webp", "INTENSO"), ("partner-lagrus.webp", "LAGRUS"),
    ]
    partner_entries = "".join(f'<div class="partner-logo"><img src="{url_for(f"/public/assets/source/partners/{file}", prefix)}" alt="{name}" loading="lazy" decoding="async"></div>' for file, name in partner_logos)

    body = f'''<main id="main">
<!-- HERO -->
<section class="hero" id="start">
  <div class="sticky">
    <div class="hero-frame" id="heroFrame">
      <img src="{url_for('/public/assets/source/products/fasada-aluminiowa.webp', prefix)}" alt="Okna, drzwi i stolarka otworowa WOL-BUD Tarnów" width="1376" height="768" decoding="async">
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

<!-- POMIAR I WYCENA -->
<section class="trust" id="ofirmie">
  <div class="wrap">
    <div class="trust-compact">
      <div>
        <span class="eyebrow">Od 1995 roku</span>
        <h2>WOL-BUD Wojciech Wolański</h2>
        <p>Firma prowadzi sprzedaż i montaż stolarki okiennej i drzwiowej od 1995 roku. Pomiar, doradztwo i wycena są bezpłatne i niewiążące.</p>
      </div>
      <div class="trust-compact-actions">
        <a class="trust-about-link" href="{url_for('/o-firmie/', prefix)}">Poznaj firmę i referencje ↗</a>
        <a class="tc-tel" href="tel:+48534091021">Zadzwoń: 534 091 021</a>
      </div>
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
    <div class="home-extra-categories" aria-label="Dodatkowe kategorie produktów">
      {extra_category_markup}
    </div>
    <section class="home-featured-section" aria-labelledby="home-featured-title">
      <div class="home-featured-heading"><span class="eyebrow eyebrow--gold">Polecane produkty</span><h3 id="home-featured-title">Warto sprawdzić</h3></div>
      <div class="home-featured-grid">{''.join(featured_product_markup)}</div>
    </section>

    <!-- 7 Services Box -->
    <div class="home-services-box" id="uslugi">
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
      <div class="kt-adres" id="nasze-sklepy">
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

        <a class="store-full-copy-link" href="{url_for('/nasze-sklepy/', prefix)}">Pełny opis salonów i ekspozycji ↗</a>
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


def category_page(route: str, cat_data: dict, scraped_data: dict, source_page: dict | None = None) -> str:
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
            if p_img and not p_img.startswith("/"):
                p_img = "/" + p_img

            clean_route = route_url(p_href)
            prod_detail = scraped_data.get("products", {}).get(clean_route, {})
            p_href_rel = url_for(p_href, prefix)
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
    for c_name, c_href, _, _ in PRIMARY_CATEGORIES:
        is_cur = ' is-active' if route == c_href else ''
        quick_pills.append(f'<a href="{url_for(c_href, prefix)}" class="cat-nav-pill{is_cur}">{esc(c_name)}</a>')
    quick_pills.append(f'<a href="{url_for("/uslugi/", prefix)}" class="cat-nav-pill">Usługi montażowe</a>')

    cat_quick_nav = f'''<div class="cat-quick-nav" aria-label="Szybka nawigacja po kategoriach">
  <span class="cat-quick-nav-label">Kategorie:</span>
  <div class="cat-quick-nav-pills">{''.join(quick_pills)}</div>
</div>'''

    source_markup = source_content_panel(source_page, prefix, "Pełny opis kategorii")
    teaser = source_teaser(source_page)
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
        {content_grid}
        {source_markup}
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

    variant_assets_html = ""
    if small_assets:
        variant_cards = []
        for image in small_assets:
            image_rel = url_for(image, prefix)
            dimensions = image_dimensions(image)
            size_label = f" ({dimensions[0]} × {dimensions[1]} px)" if dimensions else ""
            label = re.sub(r"[-_]+", " ", Path(image).stem)
            label = re.sub(r"\b\d{1,4}x\d{1,4}\b", "", label, flags=re.IGNORECASE).strip()
            variant_cards.append(f'''<figure class="product-variant-card">
  <img src="{image_rel}" alt="{esc(label or title)}" loading="lazy" decoding="async">
  <figcaption>{esc(label or title)}{size_label}</figcaption>
</figure>''')
        variant_assets_html = f'''<details class="mobile-details product-variant-assets" data-responsive-disclosure>
  <summary>Dodatkowe próbki i ilustracje ({len(small_assets)})</summary>
  <div class="mobile-details-body"><div class="product-variant-grid">{"".join(variant_cards)}</div></div>
</details>'''

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
        items = "".join(f'<li><span class="chk">✓</span><span>{esc(s)}</span></li>' for s in specs)
        specs_html = f'''<details class="product-specs-box mobile-details" open data-responsive-disclosure>
  <summary>Parametry techniczne i charakterystyka</summary>
  <div class="mobile-details-body"><ul class="specs-list">{items}</ul></div>
</details>'''

    if source_page:
        desc_details = source_content_panel(source_page, prefix, "Opis, zalety i parametry produktu")
        specs_html = ""

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
        {variant_assets_html}
        {desc_details}
        {specs_html}
        {downloads_html}
        {product_nav_bar}
        <div class="cta-banner-dark">
          <span class="eyebrow eyebrow--gold">Zainteresował Cię ten produkt?</span>
          <h3>Zamów wycenę lub bezpłatny pomiar</h3>
          <p>Bezpłatny i niewiążący pomiar, doradztwo i wycena są dostępne na budowie lub w naszych salonach sprzedaży.</p>
          <a class="tc-tel" href="tel:+48534091021">Zadzwoń: 534 091 021</a>
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
    <p>Zobacz zdjęcia z ciepłego montażu warstwowego.</p>
  </div>
  <a class="service-feature-btn" href="{url_for('/promocje/cieply-montaz-warstwowy-okien-drzwi/', prefix)}">Zobacz fotoreportaż ↗</a>
</div>'''

        cards.append(f'''<article class="service-card" id="{anch}">
  <h2>{esc(stitle)}</h2>
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
            anch = service_anchors.get(stitle, slugify(stitle))
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
    <span class="eyebrow eyebrow--gold">Fotoreportaż z budowy</span>
    <p>Zobacz zdjęcia z ciepłego montażu warstwowego.</p>
  </div>
  <a class="service-feature-btn" href="{url_for('/promocje/cieply-montaz-warstwowy-okien-drzwi/', prefix)}">Zobacz fotoreportaż ↗</a>
</div>'''
            service_content_cards.append(f'''<article class="service-card" id="{esc(anch)}">
  <h2>{esc(stitle)}</h2>
  {f'<p class="service-card-teaser">{esc(teaser)}</p>' if teaser else ''}
  <details class="mobile-details" open data-responsive-disclosure>
    <summary>Opis usługi</summary>
    <div class="mobile-details-body source-content-body">{full_body}{feature_box}</div>
  </details>
</article>''')
        service_content = "".join(service_content_cards)
        warm_montage_link = f'''<div class="service-feature-box">
  <div>
    <span class="eyebrow eyebrow--gold">Ciepły montaż</span>
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
          <span class="eyebrow eyebrow--gold">Skorzystaj z naszych usług</span>
          <h3>Umów bezpłatny pomiar i wycenę</h3>
          <p>Pomiar, doradztwo i wycena są bezpłatne i niewiążące — na budowie lub w naszych salonach sprzedaży.</p>
          <a class="tc-tel" href="tel:+48534091021">Zadzwoń: 534 091 021</a>
        </div>
      </div>
      {sidebar_markup("/uslugi/", prefix)}
    </div>
  </div>
</main>'''
    return document(route, "Usługi WOL-BUD", "Usługi wymienione na stronie WOL-BUD: pomiar i wycena, ciepły montaż, serwis, prace wykończeniowe i murarskie, brukowanie, daszki poliwęglanowe.", main)


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
    <img src="{simg}" alt="{esc(stitle)}" loading="lazy" decoding="async">
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
          {source_content_panel(source_page, prefix, "Pełny opis montażu") or paras_html}
        </div>
        <div class="subpage-section">
          <h2>Zdjęcia z montażu</h2>
          <div class="montage-steps-grid">
            {''.join(steps_html)}
          </div>
        </div>
        <div class="cta-banner-dark">
          <span class="eyebrow eyebrow--gold">Chcesz zamówić ciepły montaż?</span>
          <h3>Zapytaj o ciepły montaż</h3>
          <p>Skontaktuj się z WOL-BUD, aby uzyskać informacje o ciepłym montażu okien i drzwi.</p>
          <a class="tc-tel" href="tel:+48534091021">Zadzwoń: 534 091 021</a>
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
      <span class="eyebrow eyebrow--gold">Potrzebujesz wyceny lub doradztwa?</span>
      <h3>Skontaktuj się z WOL-BUD</h3>
      <p>Pomożemy dobrać okna, drzwi i bramy dopasowane do Twojego projektu.</p>
      <a class="tc-tel" href="tel:+48534091021">Zadzwoń: 534 091 021</a>
    </div>
  </div>
</main>'''
    return document(route, "Pełna oferta produktów | WOL-BUD Tarnów", "Okna, drzwi, bramy garażowe, rolety i parapety w ofercie firmy WOL-BUD Tarnów.", main)


def references_gallery(prefix: str = "") -> str:
    source_order = [12, 1, 2, 3, 4, 9, 8, 7, 6, 5, 15, 14, 13, 11, 10]
    cards = []
    for number in source_order:
        filename = f"referencja-{number:02d}.webp"
        image_url = url_for(f"/public/assets/source/references/{filename}", prefix)
        cards.append(f'''<figure class="reference-card">
  <a href="{image_url}" target="_blank" rel="noopener noreferrer" aria-label="Otwórz skan referencji nr {number}">
    <img src="{image_url}" alt="Skan referencji nr {number}" loading="lazy" decoding="async" width="212" height="300">
  </a>
  <figcaption>Referencja nr {number}</figcaption>
</figure>''')
    return f'''<details class="mobile-details reference-gallery-disclosure" open data-responsive-disclosure>
  <summary>Zobacz skany referencji (15)</summary>
  <div class="mobile-details-body">
    <section class="reference-gallery" aria-labelledby="reference-gallery-title">
      <h2 id="reference-gallery-title">Referencje</h2>
      <div class="reference-gallery-grid">{"".join(cards)}</div>
    </section>
  </div>
</details>'''


def about_page(source_page: dict | None = None) -> str:
    route = "/o-firmie/"
    prefix = asset_prefix(route)
    company_story = source_content_panel(source_page, prefix, "O firmie: doświadczenie, atuty i dostawcy")
    references = references_gallery(prefix) if source_page else ""
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
        {references}
        <div class="cta-banner-dark">
          <span class="eyebrow eyebrow--gold">Porozmawiajmy o Twojej inwestycji</span>
          <h3>Odwiedź nasz salon lub zadzwoń</h3>
          <p>Informacje o produktach, usługach i salonach znajdziesz na naszej stronie.</p>
          <a class="tc-tel" href="tel:+48534091021">Zadzwoń: 534 091 021</a>
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
    locations = [
        ("Salon Tarnów-Chyszów", "ul. Giełdowa 5 (przy placu targowym Chyszów), 33-100 Tarnów", "14 626 80 32", "534 091 021", "salon-tarnow-chyszow.webp", "Pn–Pt 9–17 · Sb 9–13", MAP_LINKS['chyszow']),
        ("Salon w Tarnowie", "ul. Szkotnik 2b, 33-100 Tarnów", "14 628 84 90", "693 870 505", "salon-tarnow-szkotnik.webp", "Pn–Pt 9–17 · Sb 9–13", MAP_LINKS['szkotnik']),
        ("Punkt w Radłowie", "ul. Leśna 17a, 33-130 Radłów", "14 678 23 65", "609 734 290", "salon-radlow.webp", "Pn–Pt 9–17 · Sb 9–13", MAP_LINKS['radlow']),
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
    <div class="cta-banner-dark">
      <span class="eyebrow eyebrow--gold">Potrzebujesz pomocy w doborze?</span>
      <h3>Zadzwoń do wybranego punktu</h3>
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
        <div class="kt-oferta">
          <b>Firma Usługowo–Handlowa „WOL-BUD” Wojciech Wolański</b>
          NIP: 8731011790
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
    source_pages = source_page_index(source_content)

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
            cat_data = {"title": "Parapety i blaty" if "parapety" in parent_cat else "Rolety", "products": []}
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

    # Render captured source routes without a specialized catalogue template as complete content pages.
    generated_routes = {
        "/", "/oferta/", "/uslugi/", "/o-firmie/", "/nasze-sklepy/", "/kontakt/",
        "/promocje/cieply-montaz-warstwowy-okien-drzwi/",
        *categories.keys(), *products.keys(),
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
