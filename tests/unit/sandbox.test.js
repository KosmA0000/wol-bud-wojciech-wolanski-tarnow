// Piaskownica: kopia bez plików spoza strony, izolacja portów, reset odtwarza stan, źródło bez zmian.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sandboxPaths, resetSandbox, ensureSandbox, removeSandbox } from '../../dev/sandbox.js';
import { makeSite, snapshotTree } from './helpers.js';

test('kopia zawiera stronę, a pomija panel, dev, pliki ukryte i package.json', () => {
  const src = makeSite();
  const sb = sandboxPaths(src, path.join(src, '.sandbox'), 51001);
  resetSandbox(sb);
  assert.ok(fs.existsSync(path.join(sb.siteRoot, 'index.html')));
  assert.ok(fs.existsSync(path.join(sb.siteRoot, 'o-firmie', 'index.html')));
  for (const rel of ['panel', 'dev', '.git', 'package.json', '.sandbox']) assert.ok(!fs.existsSync(path.join(sb.siteRoot, rel)), rel);
  fs.rmSync(src, { recursive: true, force: true });
});

test('reset usuwa zmiany w piaskownicy i nie rusza źródła', () => {
  const src = makeSite();
  const before = snapshotTree(src);
  const sb = sandboxPaths(src, path.join(src, '.sandbox'), 51002);
  resetSandbox(sb);
  fs.writeFileSync(path.join(sb.siteRoot, 'index.html'), 'ZMIENIONE');
  fs.writeFileSync(path.join(sb.siteRoot, 'nowy.html'), 'nowy');
  fs.rmSync(path.join(sb.siteRoot, 'o-firmie'), { recursive: true });
  resetSandbox(sb);
  assert.equal(fs.readFileSync(path.join(sb.siteRoot, 'index.html'), 'utf8'), before['index.html']);
  assert.ok(!fs.existsSync(path.join(sb.siteRoot, 'nowy.html')));
  assert.ok(fs.existsSync(path.join(sb.siteRoot, 'o-firmie', 'index.html')));
  assert.deepEqual(snapshotTree(src), before);
  fs.rmSync(src, { recursive: true, force: true });
});

test('każdy port ma własną piaskownicę', () => {
  const src = makeSite();
  const a = sandboxPaths(src, path.join(src, '.sandbox'), 51003);
  const b = sandboxPaths(src, path.join(src, '.sandbox'), 51004);
  resetSandbox(a);
  resetSandbox(b);
  fs.writeFileSync(path.join(a.siteRoot, 'index.html'), 'tylko A');
  assert.notEqual(fs.readFileSync(path.join(b.siteRoot, 'index.html'), 'utf8'), 'tylko A');
  assert.notEqual(a.dir, b.dir);
  fs.rmSync(src, { recursive: true, force: true });
});

test('ensureSandbox: --keep wznawia istniejącą, domyślnie świeża kopia', () => {
  const src = makeSite();
  const sb = sandboxPaths(src, path.join(src, '.sandbox'), 51005);
  ensureSandbox(sb, true);
  fs.writeFileSync(path.join(sb.siteRoot, 'zmiana.html'), 'x');
  ensureSandbox(sb, false);
  assert.ok(fs.existsSync(path.join(sb.siteRoot, 'zmiana.html')));
  ensureSandbox(sb, true);
  assert.ok(!fs.existsSync(path.join(sb.siteRoot, 'zmiana.html')));
  fs.rmSync(src, { recursive: true, force: true });
});

test('odmowa usunięcia katalogu spoza piaskownicy i nieprawidłowego portu', () => {
  const src = makeSite();
  const sb = sandboxPaths(src, path.join(src, '.sandbox'), 51006);
  assert.throws(() => removeSandbox({ ...sb, dir: src }), /Odmowa/);
  assert.throws(() => sandboxPaths(src, path.join(src, '.sandbox'), 0), /port/);
  const base = path.join(src, 'baza');
  const nested = path.join(base, '51007', 'site', 'zrodlo');
  fs.mkdirSync(nested, { recursive: true });
  fs.writeFileSync(path.join(nested, 'index.html'), 'źródło');
  assert.throws(() => resetSandbox(sandboxPaths(nested, base, 51007)), /źródła/);
  assert.ok(fs.existsSync(path.join(nested, 'index.html')));
  fs.rmSync(src, { recursive: true, force: true });
});
