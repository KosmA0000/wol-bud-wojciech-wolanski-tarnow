// L-021: nagłówki limitu, kolejność limitu i braku klucza, liczniki błędów, stan bez klucza, model z białych znaków, validate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startTestServer, FAKE_KEY } from './helpers.js';
import { resolveAiConfig } from '../../dev/ai-config.js';
import { runValidate } from '../../dev/validate.js';

const ask = { messages: [{ role: 'user', content: 'Zmień tytuł' }], tools: [] };
const okFetch = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }), { status: 200 });

test('L-021: 429 ma Retry-After i X-RateLimit-*', async (t) => {
  const srv = await startTestServer({ envText: `GEMINI_API_KEY=${FAKE_KEY}\n`, fetchImpl: okFetch, rateMax: 1 });
  t.after(() => srv.cleanup());
  assert.equal((await srv.post('/panel/ai-proxy.php', ask)).status, 200);
  const r = await fetch(`${srv.base}/panel/ai-proxy.php`, { method: 'POST', body: JSON.stringify(ask),
    headers: { 'Content-Type': 'application/json', 'X-CMS-CSRF-Token': srv.token } });
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get('retry-after')) >= 1, 'Retry-After');
  assert.equal(r.headers.get('x-ratelimit-limit'), '1');
  assert.equal(r.headers.get('x-ratelimit-remaining'), '0');
});

test('L-021: brak klucza daje 503 za każdym razem i nie zużywa limitu', async (t) => {
  const srv = await startTestServer({ envText: 'GEMINI_API_KEY=\n', fetchImpl: okFetch, rateMax: 1 });
  t.after(() => srv.cleanup());
  for (let i = 0; i < 3; i += 1) assert.equal((await srv.post('/panel/ai-proxy.php', ask)).status, 503);
});

test('L-021: błąd odczytu odpowiedzi dostawcy (SAFETY) liczy się jako nieudane wywołanie', async (t) => {
  const blocked = async () => new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }), { status: 200 });
  const srv = await startTestServer({ envText: `GEMINI_API_KEY=${FAKE_KEY}\n`, fetchImpl: blocked });
  t.after(() => srv.cleanup());
  const r = await srv.post('/panel/ai-proxy.php', ask);
  assert.notEqual(r.status, 200);
  const st = await (await fetch(`${srv.base}/__dev/status`)).json();
  assert.equal(st.ai.failed, 1);
  assert.equal(st.ai.ok, 0);
});

test('L-021: stan bez klucza podaje provider null', async (t) => {
  const srv = await startTestServer({ envText: 'GEMINI_API_KEY=\n' });
  t.after(() => srv.cleanup());
  const st = await (await fetch(`${srv.base}/panel/ai-proxy.php?status=1`)).json();
  assert.deepEqual([st.configured, st.provider, st.model], [false, null, null]);
});

test('L-021: WOLBUD_AI_MODEL z samych spacji to model domyślny', () => {
  const cfg = resolveAiConfig({ GEMINI_API_KEY: 'k', WOLBUD_AI_MODEL: '   ' });
  assert.equal(cfg.configured && cfg.modelSource, 'default');
});

test('L-021: validate nie liczy plików panelu jako stron', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wolbud-validate-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html>');
  fs.mkdirSync(path.join(root, 'panel'));
  fs.writeFileSync(path.join(root, 'panel', 'index.html'), '<!doctype html>');
  assert.equal(runValidate(['--root', root]).report.checkedFiles, 1);
  fs.rmSync(root, { recursive: true, force: true });
});
