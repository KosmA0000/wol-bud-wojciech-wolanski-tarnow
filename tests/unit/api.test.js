// Emulacja api.php, backups.php, auth.php i /__dev/reset przez prawdziwy serwer HTTP na losowym porcie.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startTestServer, snapshotTree } from './helpers.js';

const srv = await startTestServer();
after(() => srv.cleanup());
const site = (rel) => path.join(srv.ctx.siteRoot, ...rel.split('/'));
const page = '<!doctype html><title>Nowa</title><script defer src="../assets/site.js?v=1"></script><p>ok</p>';

test('serwer słucha tylko na 127.0.0.1 i odrzuca obcy Host', async () => {
  assert.equal(srv.server.address().address, '127.0.0.1');
  const port = srv.server.address().port;
  const { request } = await import('node:http');
  const status = await new Promise((resolve) => {
    request({ host: '127.0.0.1', port, path: '/', headers: { Host: 'evil.example' } }, (r) => { r.resume(); resolve(r.statusCode); }).end();
  });
  assert.equal(status, 403);
});

test('panel ze źródła: znacznik trybu lokalnego i konfiguracja hosting', async () => {
  assert.match(await (await fetch(`${srv.base}/panel/`)).text(), /name="cms-local-proxy"/);
  assert.match(await (await fetch(`${srv.base}/panel/config.js`)).text(), /mode: 'hosting'/);
  assert.match(await (await fetch(`${srv.base}/panel/config.js?source=1`)).text(), /mode: 'github'/);
  assert.equal((await fetch(`${srv.base}/dev/secret.js`)).status, 404);
});

test('api.php: bez tokenu 401, z obcego Origin 403', async () => {
  const body = { files: [{ path: 'a.html', content: page }] };
  assert.equal((await srv.post('/panel/api.php', body, { 'X-CMS-CSRF-Token': 'zly' })).status, 401);
  assert.equal((await srv.post('/panel/api.php', body, { Origin: 'http://evil.example' })).status, 403);
});

test('api.php: zapis trafia tylko do piaskownicy, źródło bez zmian', async () => {
  const before = snapshotTree(srv.root);
  const r = await srv.post('/panel/api.php', { files: [{ path: 'oferta/nowa.html', content: page },
    { path: 'assets/cms-manifest.json', content: '{"revision":"r2","pages":[]}' }],
  deletions: ['o-firmie/index.html'], expectedRevision: 'r1', nextRevision: 'r2' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual({ ...r.body, backupId: 'x' }, { ok: true, revision: 'r2', written: 2, deleted: 1, backupId: 'x' });
  assert.ok(fs.existsSync(site('oferta/nowa.html')));
  assert.ok(!fs.existsSync(site('o-firmie/index.html')));
  assert.deepEqual(snapshotTree(srv.root), before);
  assert.equal((await fetch(`${srv.base}/oferta/nowa.html`)).status, 200);
});

test('api.php: konflikt rewizji 409, spoza białej listy 403, skrypt inline 400', async () => {
  const conflict = await srv.post('/panel/api.php', { files: [{ path: 'b.html', content: page }], expectedRevision: 'stara' });
  assert.equal(conflict.status, 409);
  for (const p of ['img/x.svg', 'assets/x.js', 'x.php', 'panel/index.html']) {
    assert.equal((await srv.post('/panel/api.php', { files: [{ path: p, content: 'x' }] })).status, 403, p);
  }
  const bad = await srv.post('/panel/api.php', { files: [{ path: 'c.html', content: '<script>alert(1)</script>' }] });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code, 'SECURITY_ERROR');
  assert.ok(!fs.existsSync(site('c.html')));
});

test('api.php: paczka z jednym złym plikiem nie zapisuje nic', async () => {
  const r = await srv.post('/panel/api.php', { files: [{ path: 'dobry.html', content: page }, { path: '../zly.html', content: page }] });
  assert.equal(r.status, 400);
  assert.ok(!fs.existsSync(site('dobry.html')));
});

test('api.php: limit rozmiaru żądania 413', async () => {
  const big = 'x'.repeat(26 * 1024 * 1024);
  const r = await srv.post('/panel/api.php', `{"files":[{"path":"a.txt","content":"${big}"}]}`);
  assert.equal(r.status, 413);
});

test('backups.php: lista z kopią original, kopia ręczna i przywrócenie', async () => {
  const list = await (await fetch(`${srv.base}/panel/backups.php`)).json();
  assert.ok(list.backups.some((b) => b.id === 'original'));
  const created = await srv.post('/panel/backups.php', { action: 'create', label: 'Moja kopia' });
  assert.equal(created.status, 200);
  assert.equal(created.body.created.label, 'Moja kopia');
  fs.writeFileSync(site('index.html'), '<!doctype html><title>po</title>');
  const restored = await srv.post('/panel/backups.php', { action: 'restore', id: created.body.created.id });
  assert.equal(restored.status, 200, JSON.stringify(restored.body));
  assert.match(fs.readFileSync(site('index.html'), 'utf8'), /<h1>Start<\/h1>/);
  assert.equal((await srv.post('/panel/backups.php', { action: 'restore', id: '../original' })).status, 400);
  assert.equal((await srv.post('/panel/backups.php', { action: 'delete', id: 'original' })).status, 400);
});

test('/__dev/reset: wymaga tokenu, odtwarza piaskownicę ze źródła', async () => {
  fs.writeFileSync(site('index.html'), 'ZEPSUTE');
  assert.equal((await srv.post('/__dev/reset', '', { 'X-CMS-CSRF-Token': '' })).status, 401);
  const r = await srv.post('/__dev/reset', '');
  assert.equal(r.status, 200);
  assert.equal(fs.readFileSync(site('index.html'), 'utf8'), fs.readFileSync(path.join(srv.root, 'index.html'), 'utf8'));
  assert.ok(fs.existsSync(site('o-firmie/index.html')));
  assert.ok(!fs.existsSync(site('oferta/nowa.html')));
});
