import urllib.request, re, ssl
from collections import deque
from urllib.parse import urljoin

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

base = 'https://wol-bud.com.pl/'
visited = set()
queue = deque([base])
all_links = set()

while queue and len(visited) < 200:
    url = queue.popleft()
    if url in visited:
        continue
    visited.add(url)
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, context=ctx, timeout=8) as resp:
            content_type = resp.headers.get('Content-Type', '')
            if 'text/html' not in content_type:
                continue
            body = resp.read().decode('utf-8', errors='ignore')
            links = re.findall(r'href=["\']([^"\']+)["\']', body)
            for link in links:
                full = urljoin(url, link).split('#')[0].split('?')[0]
                if full.startswith(base) and full not in visited:
                    if not any(full.lower().endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.css', '.js', '.xml', '.zip']):
                        queue.append(full)
                        all_links.add(full)
    except Exception as e:
        print(f'Error fetching {url}: {e}')

print(f'Total visited: {len(visited)}, Total discovered: {len(all_links)}')
with open('crawled_urls.txt', 'w', encoding='utf-8') as f:
    for u in sorted(visited | all_links):
        f.write(u + '\n')
print('Saved to crawled_urls.txt')
