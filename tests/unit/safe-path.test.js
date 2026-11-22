// Ochrona ścieżek zapisu i odczytu: .., %2e%2e, backslash, polskie znaki, długie ścieżki, symlinki, biała lista.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateWritePath, resolveInside } from '../../dev/safe-path.js';
import { resolveStatic } from '../../dev/static.js';

const rejects = (p, status, opts) => assert.throws(() => validateWritePath(p, opts), (e) => e.status === status, `oczekiwano ${status} dla ${p}`);

test('zapis: odrzuca przechodzenie w górę i ścieżki bezwzględne', () => {
  for (const p of ['../x.html', 'a/../../x.html', 'a/..', '/etc/x.html', 'C:/x.html', 'C:\\x.html', 'a//b.html', 'a/', '']) rejects(p, 400);
});

test('zapis: %2e%2e, backslash i bajt zerowy są odrzucane (nie są dekodowane)', () => {
  for (const p of ['%2e%2e/x.html', '%2E%2E%2Fx.html', 'a\\..\\x.html', 'a\\b.html', 'x.html\0.png']) rejects(p, 400);
});

test('zapis: polskie znaki i spacje w nazwie są odrzucane', () => {
  for (const p of ['oferta/okna-drewniane-żółte.html', 'Zdjęcie.jpg', 'moja strona.html']) rejects(p, 400);
});

test('zapis: bardzo długa ścieżka (>255 znaków) jest odrzucana', () => {
  rejects(`${'a/'.repeat(127)}x.html`, 400);
  rejects(`${'b'.repeat(300)}.html`, 400);
});

test('zapis: pliki ukryte, .git i katalogi chronione', () => {
  for (const p of ['.htaccess', 'a/.git/config.html', '.env.html', 'x/.ukryty.html']) rejects(p, 403);
  for (const p of ['panel/index.html', 'node_modules/x.json', 'cms-backups/a.html']) rejects(p, 403);
  for (const p of ['assets/site.css', 'assets/site.js', 'assets/home-content.css']) rejects(p, 403);
});

test('zapis: rozszerzenia spoza białej listy są odrzucane', () => {
  for (const p of ['img/logo.svg', 'assets/app.js', 'x.mjs', 'a.php', 'a.php.html', 'a.html.php', 'x.gif', 'plik', 'x.exe', 'a.sh', 'x.htm']) {
    rejects(p, 403);
  }
});

test('zapis: dozwolone ścieżki przechodzą bez zmian', () => {
  for (const p of ['index.html', 'oferta/okna/index.html', 'assets/cms-manifest.json', 'img/a_b-1.webp', 'sitemap.xml',
    'robots.txt', 'img/x.JPG']) {
    assert.equal(validateWritePath(p), p);
  }
});

test('usuwanie: chronione pliki główne i assets/', () => {
  for (const p of ['index.html', 'sitemap.xml', 'robots.txt', 'assets/cms-manifest.json']) rejects(p, 403, { isDeletion: true });
  assert.equal(validateWritePath('o-firmie/index.html', { isDeletion: true }), 'o-firmie/index.html');
});

/** Tworzy dowiązanie katalogu (junction na Windows nie wymaga uprawnień administratora). */
function linkDir(target, link) {
  fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
}

test('zapis: dowiązanie w ścieżce wyprowadzające poza katalog jest odrzucane', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'wolbud-link-'));
  const root = path.join(base, 'site');
  const outside = path.join(base, 'outside');
  fs.mkdirSync(root);
  fs.mkdirSync(outside);
  linkDir(outside, path.join(root, 'wyjscie'));
  assert.throws(() => resolveInside(root, 'wyjscie/x.html'), (e) => e.status === 403);
  assert.equal(resolveStatic(root, '/wyjscie/'), null);
  fs.rmSync(base, { recursive: true, force: true });
});

test('odczyt (L-017): katalog/ z index.html przechodzi tę samą kontrolę co zwykły plik', (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'wolbud-l017-'));
  const root = path.join(base, 'site');
  fs.mkdirSync(path.join(root, 'dirindex', 'index.html'), { recursive: true });
  fs.writeFileSync(path.join(base, 'sekret.html'), 'OUTSIDE_SECRET');
  fs.mkdirSync(path.join(root, 'fsym'));
  assert.equal(resolveStatic(root, '/dirindex/'), null, 'katalog o nazwie index.html');
  try {
    fs.symlinkSync(path.join(base, 'sekret.html'), path.join(root, 'fsym', 'index.html'), 'file');
  } catch {
    t.diagnostic('brak uprawnień do symlinku pliku: pominięto część z symlinkiem');
    fs.rmSync(base, { recursive: true, force: true });
    return;
  }
  assert.equal(resolveStatic(root, '/fsym/'), null, 'symlink index.html poza root');
  fs.rmSync(base, { recursive: true, force: true });
});

test('odczyt: resolveStatic odrzuca .., zakodowane kropki, backslash, ukryte i nieprawidłowe %', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wolbud-static-'));
  fs.writeFileSync(path.join(root, 'index.html'), 'ok');
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, '.git', 'config'), 'tajne');
  for (const u of ['/../x', '/%2e%2e/x', '/%2e%2e%2fx', '/a%5c..%5cx', '/.git/config', '/%2egit/config', '/%E0%A4%A', '/x%00.html', '/C:/x']) {
    assert.equal(resolveStatic(root, u), null, u);
  }
  assert.deepEqual(resolveStatic(root, '/'), { file: path.join(fs.realpathSync(root), 'index.html') });
  fs.rmSync(root, { recursive: true, force: true });
});
