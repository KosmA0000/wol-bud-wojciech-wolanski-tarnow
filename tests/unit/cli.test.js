// CLI: szkielet npm run validate (kod 0/1, JSON), check:size (limity linii, README) i argumenty serwera dev.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runValidate } from '../../dev/validate.js';
import { checkSize } from '../../dev/check-size.js';
import { parseArgs } from '../../dev/args.js';
import { makeSite } from './helpers.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('validate: istniejący katalog → kod 0 i raport JSON na stdout', () => {
  const site = makeSite();
  const run = spawnSync(process.execPath, [path.join(REPO, 'dev', 'validate.js'), '--root', site], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const report = JSON.parse(run.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.checkedFiles, 2, 'index.html i o-firmie/index.html; panel/index.html nie jest stroną (L-021)');
  assert.deepEqual(report.violations, []);
  fs.rmSync(site, { recursive: true, force: true });
});

test('validate: brak --root albo nieistniejący katalog → kod 1', () => {
  assert.equal(runValidate([]).code, 1);
  assert.equal(runValidate(['--root', path.join(os.tmpdir(), 'nie-ma-takiego-katalogu-wolbud')]).code, 1);
  assert.equal(runValidate(['--zle']).code, 1);
});

test('validate: naruszenie reguły → kod 1 z listą naruszeń', () => {
  const site = makeSite();
  const rule = { id: 'test-rule', check: (_root, files) => files.map((f) => ({ rule: '', file: f, message: 'x' })) };
  const { code, report } = runValidate(['--root', site], [rule]);
  assert.equal(code, 1);
  assert.equal(report.violations.length, 2);
  assert.equal(report.violations[0].rule, 'test-rule');
  fs.rmSync(site, { recursive: true, force: true });
});

test('check:size: plik ponad 200 linii i brak wpisu w README to błędy', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wolbud-size-'));
  fs.mkdirSync(path.join(root, 'dev'));
  fs.writeFileSync(path.join(root, 'dev', 'duzy.js'), 'x\n'.repeat(201));
  fs.writeFileSync(path.join(root, 'dev', 'sredni.js'), 'x\n'.repeat(160));
  fs.writeFileSync(path.join(root, 'dev', 'README.md'), '- duzy.js\n');
  const r = checkSize(root, ['dev']);
  assert.ok(r.errors.some((e) => e.includes('duzy.js: 201')));
  assert.ok(r.errors.some((e) => e.includes('brak wpisu dla sredni.js')));
  assert.ok(r.warnings.some((w) => w.includes('sredni.js: 160')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('check:size: repozytorium spełnia limity', () => {
  assert.deepEqual(checkSize(REPO).errors, []);
});

test('argumenty serwera: port, flagi, błędy po polsku', () => {
  const a = parseArgs(['--port', '4181', '--keep', '--env-file=x.env'], {});
  assert.equal(a.port, 4181);
  assert.equal(a.keep, true);
  assert.equal(path.basename(a.envFile), 'x.env');
  assert.equal(parseArgs([], {}).port, 4180);
  assert.match(parseArgs([], { WOLBUD_ENV_FILE: 'C:/inny/.env.local' }).envFile, /inny/);
  assert.throws(() => parseArgs(['--port', '80'], {}), /Port/);
  assert.throws(() => parseArgs(['--port'], {}), /Brak wartości/);
  assert.throws(() => parseArgs(['--reset', '--keep'], {}), /nie można łączyć/);
  assert.throws(() => parseArgs(['--cos'], {}), /Nieznany argument/);
});
