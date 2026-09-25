import urllib.request, ssl, re, os, json
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

BASE_URL = 'https://wol-bud.com.pl'

CATEGORIES = [
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

def fetch_html(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, context=ctx, timeout=12) as resp:
        return resp.read().decode('utf-8', errors='ignore')

def download_image(img_url, dest_folder):
    if not img_url:
        return ''
    full_url = urljoin(BASE_URL, img_url)
    parsed = urlparse(full_url)
    filename = os.path.basename(parsed.path)
    if not filename:
        return ''
    os.makedirs(dest_folder, exist_ok=True)
    dest_path = os.path.join(dest_folder, filename)
    if not os.path.exists(dest_path):
        try:
            req = urllib.request.Request(full_url, headers=HEADERS)
            with urllib.request.urlopen(req, context=ctx, timeout=12) as resp:
                with open(dest_path, 'wb') as f:
                    f.write(resp.read())
        except Exception as e:
            print(f'Failed to download {full_url}: {e}')
            return ''
    return filename

print('Testing category scraping...')
cat_data = {}
all_product_urls = set()

for cat_path in CATEGORIES:
    url = urljoin(BASE_URL, cat_path)
    print(f'Scraping category: {url}')
    try:
        html = fetch_html(url)
        soup = BeautifulSoup(html, 'html.parser')
        
        # Title & heading
        h1 = soup.find('h1')
        title = h1.text.strip() if h1 else ''
        
        # Content description
        content_div = soup.find('div', class_='content')
        content_html = str(content_div) if content_div else ''
        content_text = content_div.text.strip() if content_div else ''
        
        # Product list
        product_list = soup.find('ul', id='productlist')
        products = []
        if product_list:
            for li in product_list.find_all('li'):
                a = li.find('a')
                if not a:
                    continue
                prod_href = a.get('href', '')
                prod_title = a.get('title', '')
                h2 = li.find('h2')
                if h2 and h2.text.strip():
                    prod_title = h2.text.strip()
                
                img = li.find('img')
                img_src = img.get('src', '') if img else ''
                local_img = download_image(img_src, 'public/assets/scraped/thumbs') if img_src else ''
                
                if prod_href:
                    all_product_urls.add(prod_href)
                    products.append({
                        'title': prod_title,
                        'href': prod_href,
                        'img_src': img_src,
                        'local_img': local_img
                    })
        
        cat_data[cat_path] = {
            'title': title,
            'url': cat_path,
            'content_html': content_html,
            'content_text': content_text,
            'products': products
        }
        print(f'  Found {len(products)} products in {cat_path}')
    except Exception as e:
        print(f'Error scraping {cat_path}: {e}')

print(f'\nTotal unique product URLs discovered: {len(all_product_urls)}')

with open('scraped_categories.json', 'w', encoding='utf-8') as f:
    json.dump(cat_data, f, ensure_ascii=False, indent=2)

print('Saved to scraped_categories.json')
