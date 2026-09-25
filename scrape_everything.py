#!/usr/bin/env python3
"""Comprehensive scraper for WOL-BUD (https://wol-bud.com.pl).
Scrapes all categories, product lists, product details, images, and services.
"""

import urllib.request
import urllib.parse
import ssl
import os
import re
import json
from bs4 import BeautifulSoup

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
BASE_URL = 'https://wol-bud.com.pl'
IMG_DIR = os.path.join('public', 'assets', 'scraped')

def safe_download(url, subfolder=''):
    if not url:
        return ''
    full_url = urllib.parse.urljoin(BASE_URL, url)
    parts = urllib.parse.urlsplit(full_url)
    quoted_path = urllib.parse.quote(parts.path)
    safe_url = urllib.parse.urlunsplit((parts.scheme, parts.netloc, quoted_path, parts.query, parts.fragment))
    
    fname = os.path.basename(parts.path)
    if not fname:
        return ''
    safe_fname = re.sub(r'[^a-zA-Z0-9._-]', '_', fname)
    folder = os.path.join(IMG_DIR, subfolder) if subfolder else IMG_DIR
    os.makedirs(folder, exist_ok=True)
    out_path = os.path.join(folder, safe_fname)
    
    if not os.path.exists(out_path):
        try:
            req = urllib.request.Request(safe_url, headers=HEADERS)
            with urllib.request.urlopen(req, context=ctx, timeout=12) as r:
                with open(out_path, 'wb') as f:
                    f.write(r.read())
        except Exception as e:
            # Fallback: remove WordPress dimension suffix (e.g. -130x173) to get original
            orig_path = re.sub(r'-\d+x\d+(\.[a-zA-Z]+)$', r'\1', parts.path)
            if orig_path != parts.path:
                try:
                    q_orig = urllib.parse.quote(orig_path)
                    s_url = urllib.parse.urlunsplit((parts.scheme, parts.netloc, q_orig, parts.query, parts.fragment))
                    req = urllib.request.Request(s_url, headers=HEADERS)
                    with urllib.request.urlopen(req, context=ctx, timeout=12) as r:
                        with open(out_path, 'wb') as f:
                            f.write(r.read())
                except:
                    return ''
            else:
                return ''
    
    rel_path = os.path.join('/public/assets/scraped', subfolder, safe_fname).replace('\\', '/')
    return rel_path

def fetch_soup(url):
    full_url = urllib.parse.urljoin(BASE_URL, url)
    parts = urllib.parse.urlsplit(full_url)
    quoted_path = urllib.parse.quote(parts.path)
    safe_url = urllib.parse.urlunsplit((parts.scheme, parts.netloc, quoted_path, parts.query, parts.fragment))
    req = urllib.request.Request(safe_url, headers=HEADERS)
    with urllib.request.urlopen(req, context=ctx, timeout=15) as r:
        html = r.read().decode('utf-8', errors='ignore')
        return BeautifulSoup(html, 'html.parser')

def run_scraper():
    data = {
        'categories': {},
        'products': {},
        'services': {},
        'warm_montage': {},
    }

    # 1. Scrape Warm Montage (/promocje/cieply-montaz-warstwowy-okien-drzwi)
    print('Scraping Ciepły Montaż Warstwowy...')
    try:
        soup = fetch_soup('/promocje/cieply-montaz-warstwowy-okien-drzwi')
        content = soup.find('div', id='content')
        if content:
            h1 = content.find('h1')
            h1_text = h1.text.strip() if h1 else 'Ciepły montaż warstwowy okien i drzwi'
            paragraphs = []
            for p in content.find_all('p'):
                t = p.text.strip()
                if t:
                    paragraphs.append(t)
            
            steps = []
            for a in content.find_all('a'):
                href = a.get('href', '')
                img = a.find('img')
                if img and ('uploads' in href or 'uploads' in img.get('src', '')):
                    img_url = href or img.get('src', '')
                    local_img = safe_download(img_url, 'montage')
                    caption = a.text.strip() or img.get('alt', '') or os.path.basename(img_url).replace('.jpg', '').replace('-', ' ')
                    steps.append({
                        'title': caption,
                        'img': local_img
                    })
            
            data['warm_montage'] = {
                'title': h1_text,
                'paragraphs': paragraphs,
                'steps': steps
            }
            print(f'  Done warm montage: {len(steps)} steps with photos')
    except Exception as e:
        print(f'Error scraping warm montage: {e}')

    # 2. Scrape Services (/uslugi)
    print('Scraping Usługi...')
    try:
        soup = fetch_soup('/uslugi')
        content = soup.find('div', id='content')
        services = []
        if content:
            current_sec = None
            for elem in content.children:
                if not elem.name:
                    continue
                if elem.name == 'h2':
                    if current_sec:
                        services.append(current_sec)
                    current_sec = {
                        'title': elem.text.strip(),
                        'paragraphs': [],
                        'bullets': []
                    }
                elif current_sec:
                    if elem.name == 'p':
                        t = elem.text.strip()
                        if t:
                            current_sec['paragraphs'].append(t)
                    elif elem.name == 'ul':
                        bullets = [li.text.strip() for li in elem.find_all('li') if li.text.strip()]
                        if bullets:
                            current_sec['bullets'].extend(bullets)
            if current_sec:
                services.append(current_sec)
        data['services'] = services
        print(f'  Found {len(services)} services in /uslugi')
    except Exception as e:
        print(f'Error scraping services: {e}')

    # 3. Scrape Categories & their Products
    CATEGORY_URLS = [
        '/kategorie/okna-pcv-domel',
        '/kategorie/drzwi-wewnetrzne',
        '/kategorie/drzwi-zewnetrzne',
        '/kategorie/stolarka-aluminiowa',
        '/kategorie/bramy-garazowe',
        '/kategorie/parapety-blaty',
        '/kategorie/aglomarmur',
        '/kategorie/aglomarmur/page/2',
        '/kategorie/granit',
        '/kategorie/marmur',
        '/kategorie/pcv-wewnetrzne',
        '/kategorie/stalowe-aluminiowe-zewnetrzne',
        '/kategorie/moskitiery',
        '/kategorie/rolety',
        '/kategorie/wewnetrzne',
        '/kategorie/zewnetrzne',
        '/kategorie/zaluzje-plisy',
    ]

    all_product_links = set()

    for cat_url in CATEGORY_URLS:
        print(f'Scraping category: {cat_url}...')
        try:
            soup = fetch_soup(cat_url)
            content = soup.find('div', id='content')
            h1 = soup.find('h1')
            cat_title = h1.text.strip() if h1 else cat_url.rstrip('/').split('/')[-1].replace('-', ' ').title()
            
            # Content intro
            intro_paragraphs = []
            intro_bullets = []
            c_div = soup.find('div', class_='content')
            if c_div:
                for p in c_div.find_all('p'):
                    t = p.text.strip()
                    if t:
                        intro_paragraphs.append(t)
                for ul in c_div.find_all('ul'):
                    intro_bullets.extend([li.text.strip() for li in ul.find_all('li') if li.text.strip()])
            
            # Products in category
            products_list = []
            plist = soup.find('ul', id='productlist')
            if plist:
                for li in plist.find_all('li'):
                    a = li.find('a')
                    if not a:
                        continue
                    p_href = a.get('href', '').split('#')[0].split('?')[0]
                    h2 = li.find('h2')
                    p_title = h2.text.strip() if h2 else a.get('title', '')
                    img = li.find('img')
                    img_src = img.get('src', '') if img else ''
                    local_img = safe_download(img_src, 'thumbs') if img_src else ''
                    
                    if p_href:
                        all_product_links.add(p_href)
                        products_list.append({
                            'title': p_title,
                            'href': p_href,
                            'image': local_img
                        })
            
            clean_route = cat_url.rstrip('/') + '/'
            data['categories'][clean_route] = {
                'title': cat_title,
                'route': clean_route,
                'paragraphs': intro_paragraphs,
                'bullets': intro_bullets,
                'products': products_list
            }
            print(f'  Category {cat_title}: {len(products_list)} products')
        except Exception as e:
            print(f'Error scraping {cat_url}: {e}')

    # 4. Scrape Product Detail Pages
    print(f'\nScraping {len(all_product_links)} product detail pages...')
    for prod_url in sorted(all_product_links):
        print(f'Scraping product: {prod_url}...')
        try:
            soup = fetch_soup(prod_url)
            content = soup.find('div', id='content')
            if not content:
                continue
            
            h1 = content.find('h1') or soup.find('h1')
            prod_title = h1.text.strip() if h1 else prod_url.rstrip('/').split('/')[-1].replace('-', ' ').title()
            
            # Collect paragraphs, lists, specs
            paragraphs = []
            specs = []
            images = []
            pdf_links = []
            
            c_div = content.find('div', class_='content') or content
            for p in c_div.find_all('p'):
                t = p.text.strip()
                if t and not any(t.startswith(x) for x in ['Oferta', 'Szybki kontakt', 'Okna i drzwi w szerokim']):
                    paragraphs.append(t)
            
            for ul in c_div.find_all('ul'):
                if ul.get('id') == 'productlist':
                    continue
                items = [li.text.strip() for li in ul.find_all('li') if li.text.strip()]
                if items and len(items) > 1 and not any('Domel' in x for x in items[:2]):
                    specs.extend(items)
            
            # Collect images
            for img in content.find_all('img'):
                src = img.get('src', '')
                if src and ('uploads' in src) and not any(x in src for x in ['logo', 'icon', 'arrow']):
                    loc_img = safe_download(src, 'products')
                    if loc_img and loc_img not in images:
                        images.append(loc_img)
            
            # Collect pdf links
            for a in content.find_all('a'):
                h = a.get('href', '')
                if h.lower().endswith('.pdf'):
                    pdf_links.append({
                        'title': a.text.strip() or 'Katalog PDF',
                        'href': urllib.parse.urljoin(BASE_URL, h)
                    })
            
            clean_route = prod_url.rstrip('/') + '/'
            data['products'][clean_route] = {
                'title': prod_title,
                'route': clean_route,
                'paragraphs': paragraphs,
                'specs': specs,
                'images': images,
                'pdfs': pdf_links
            }
            print(f'  Product {prod_title}: {len(paragraphs)} paras, {len(specs)} specs, {len(images)} images')
        except Exception as e:
            print(f'Error scraping product {prod_url}: {e}')

    with open('docs/full_scraped_data.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print('\nSuccessfully saved everything to docs/full_scraped_data.json!')

if __name__ == '__main__':
    run_scraper()
