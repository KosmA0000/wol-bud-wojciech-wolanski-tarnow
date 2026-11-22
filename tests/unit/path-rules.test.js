// Reguły ścieżek z Z-005: wielkość liter (L-019), segmenty z kropką i nazwy urządzeń Windows (L-020), typy plików (D-010).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validateWritePath } from '../../dev/safe-path.js';
import { startTestServer } from './helpers.js';

const srv = await startTestServer();
after(() => srv.cleanup());
const site = (rel) => path.join(srv.ctx.siteRoot, ...rel.split('/'));
const page = '<!doctype html><title>Nowa</title><p>ok</p>';
const refused = (p, opts) => assert.throws(() => validateWritePath(p, opts), (e) => e.status === 400 || e.status === 403, p);

test('L-019: poza img/ ścieżki zapisu tylko małymi literami', () => {
  for (const p of ['O-Firmie/Index.html', 'Assets/cms-manifest.json', 'Sitemap.xml', 'ROBOTS.TXT', 'oferta/Nowa.html']) refused(p);
  refused('O-Firmie/index.html', { isDeletion: true });
  assert.equal(validateWritePath('img/Lacznik-MDF.JPG'), 'img/Lacznik-MDF.JPG');
});

test('L-020: segment z kropką na końcu i nazwy urządzeń Windows są odrzucane', () => {
  for (const p of ['assets./cms-manifest.json', 'oferta./index.html', 'oferta/x..html', 'nul.html', 'oferta/con.html',
    'aux/index.html', 'com1.html', 'lpt9/index.html', 'img/prn.webp', 'img/NUL.webp', 'oferta/conin$.html']) refused(p);
  refused('assets./cms-manifest.json', { isDeletion: true });
  assert.equal(validateWritePath('oferta/console.html'), 'oferta/console.html');
});

test('D-010: zapis tylko html, json w assets/, sitemap.xml, robots.txt i obrazy w img/', () => {
  for (const p of ['assets/extra.css', 'favicon.ico', 'notatki.txt', 'oferta/feed.xml', 'oferta/x.webp', 'img/x.json',
    'assets/x.html', 'img/x.html', 'img/a.gif', 'img/a.svg', 'dane.json']) refused(p);
  for (const p of ['index.html', 'oferta/okna/index.html', 'assets/site-globals.json', 'assets/cms-manifest.json',
    'sitemap.xml', 'robots.txt', 'img/a.webp', 'img/sub/b.jpeg', 'img/c.jpg', 'img/d.png']) {
    assert.equal(validateWritePath(p), p);
  }
});

test('L-019: /panel/Index.HTML i /panel/Config.js nie omijają trybu lokalnego', async () => {
  const index = await fetch(`${srv.base}/panel/Index.HTML`);
  const indexText = await index.text();
  if (index.status === 200) assert.match(indexText, /name="cms-local-proxy"/);
  else assert.equal(index.status, 404);
  const cfg = await fetch(`${srv.base}/panel/Config.js`);
  const cfgText = await cfg.text();
  if (cfg.status === 200) assert.match(cfgText, /mode: 'hosting'/);
  else assert.equal(cfg.status, 404);
});

test('L-019: paczka z zapisem i usunięciem tej samej ścieżki w innej wielkości liter jest odrzucana', async () => {
  const r = await srv.post('/panel/api.php', { files: [{ path: 'O-Firmie/Index.html', content: page }],
    deletions: ['o-firmie/index.html'] });
  assert.equal(r.status, 400, JSON.stringify(r.body));
  assert.ok(fs.existsSync(site('o-firmie/index.html')));
  const dup = await srv.post('/panel/api.php', { files: [{ path: 'img/A.webp', content: 'UklGRg==', encoding: 'base64' },
    { path: 'img/a.webp', content: 'UklGRg==', encoding: 'base64' }] });
  assert.equal(dup.status, 400, JSON.stringify(dup.body));
  const mixed = await srv.post('/panel/api.php', { files: [{ path: 'img/x.webp', content: 'UklGRg==', encoding: 'base64' }],
    deletions: ['img/X.webp'] });
  assert.equal(mixed.status, 400, JSON.stringify(mixed.body));
});

test('L-020: przywracanie nie usuwa plików ukrytych wpisanych do manifestu', async () => {
  fs.writeFileSync(site('.ukryty.html'), 'nie usuwać');
  fs.writeFileSync(site('assets/cms-manifest.json'), JSON.stringify({ revision: 'r9', pages: [{ path: '.ukryty.html' }] }));
  const created = await srv.post('/panel/backups.php', { action: 'create', label: 'L-020' });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const restored = await srv.post('/panel/backups.php', { action: 'restore', id: created.body.created.id });
  assert.equal(restored.status, 200, JSON.stringify(restored.body));
  assert.ok(fs.existsSync(site('.ukryty.html')), 'plik ukryty został usunięty');
  assert.equal(restored.body.removedFiles, 0);
});
