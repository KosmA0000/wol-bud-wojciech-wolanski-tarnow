import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

const root = resolve(process.argv[2] || '.');
const assets = join(root, 'assets');
const skip = new Set(['assets', 'img', 'panel', 'node_modules']);
const seed = '{ "version": 1, "revision": "original" }\n';

async function htmlFiles(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || skip.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await htmlFiles(path));
    else if (entry.name.endsWith('.html')) found.push(path);
  }
  return found;
}

function titleOf(html, path) {
  if (path === 'index.html') return 'Strona główna';
  return html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1].replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ').trim() ||
    html.match(/<title>([^<]+)<\/title>/i)?.[1].split('|')[0].trim() || path;
}

await mkdir(join(assets, 'page-data'), { recursive: true });
const pages = [];
for (const file of await htmlFiles(root)) {
  const path = relative(root, file).split(sep).join('/');
  const html = await readFile(file, 'utf8');
  if (!/<main\b/i.test(html) || !/<\/head>/i.test(html)) continue;
  const slug = createHash('sha256').update(path).digest('hex').slice(0, 16);
  const content = path === 'index.html' ? 'assets/home-content.json' : 'assets/page-data/' + slug + '.json';
  const depth = path.split('/').length - 1;
  const prefix = '../'.repeat(depth);
  const tags = '<link rel="stylesheet" href="' + prefix + 'assets/home-content.css?v=3">' +
    '<script type="module" src="' + prefix + 'assets/home-page.js?v=3" data-wolbud-content="' + content + '"></script>';
  const previous = /<link\b[^>]+href="[^"]*assets\/home-content\.css[^"]*"[^>]*>\s*<script\b[^>]+src="[^"]*assets\/home-page\.js[^"]*"[^>]*><\/script>\r?\n?/gi;
  const stripped = html.replace(previous, '');
  const next = stripped.replace(/<\/head>/i, tags + '</head>');
  if (next !== html) await writeFile(file, next);
  await writeFile(join(root, content), seed, { flag: 'wx' }).catch((error) => {
    if (error.code !== 'EEXIST') throw error;
  });
  pages.push({ path, title: titleOf(html, path), content });
}
pages.sort((left, right) => left.path === 'index.html' ? -1 : right.path === 'index.html' ? 1 : left.path.localeCompare(right.path, 'pl'));
await writeFile(join(assets, 'page-catalog.json'), JSON.stringify(pages, null, 2) + '\n');
process.stdout.write('Panel podłączony do ' + pages.length + ' stron.\n');
