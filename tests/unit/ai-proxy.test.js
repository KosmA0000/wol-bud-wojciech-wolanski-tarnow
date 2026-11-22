// Emulacja ai-proxy.php: brak klucza, maskowanie klucza w logach i błędach, jawny model, brak cichego fallbacku, limit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, FAKE_KEY } from './helpers.js';
import { maskSecrets, createLogger } from '../../dev/log.js';
import { parseEnv } from '../../dev/env-file.js';

const ask = { messages: [{ role: 'user', content: 'Zmień tytuł' }], tools: [{ type: 'function', function: { name: 'set_title',
  description: 'Ustaw tytuł', parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } } }] };

/** Udawany fetch dostawcy: zapisuje wywołania i zwraca podaną odpowiedź. */
function fakeFetch(status, body) {
  const calls = [];
  const impl = async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify(body), { status }); };
  return { impl, calls };
}

test('brak klucza: 503 z polskim komunikatem, bez wywołania dostawcy', async () => {
  const f = fakeFetch(200, {});
  const srv = await startTestServer({ envText: 'GEMINI_API_KEY=\n', fetchImpl: f.impl });
  const r = await srv.post('/panel/ai-proxy.php', ask);
  assert.equal(r.status, 503);
  assert.match(r.body.error, /brak klucza GEMINI_API_KEY/);
  assert.equal(f.calls.length, 0);
  const st = await (await fetch(`${srv.base}/panel/ai-proxy.php?status=1`)).json();
  assert.equal(st.configured, false);
  await srv.cleanup();
});

test('brak pliku .env.local: też 503', async () => {
  const srv = await startTestServer();
  assert.equal((await srv.post('/panel/ai-proxy.php', ask)).status, 503);
  await srv.cleanup();
});

test('odpowiedź podaje faktycznie użyty model; klucz w nagłówku, nie w URL i nie w odpowiedzi', async () => {
  const f = fakeFetch(200, { candidates: [{ content: { parts: [{ text: 'Gotowe' }, { functionCall: { name: 'set_title', args: { text: 'A' } } }] } }] });
  const lines = [];
  const srv = await startTestServer({ envText: `GEMINI_API_KEY="${FAKE_KEY}"\n`, fetchImpl: f.impl, lines });
  const r = await srv.post('/panel/ai-proxy.php', { ...ask, model: 'gemini-test-model' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.model, 'gemini-test-model');
  assert.equal(r.body.fallbackUsed, false);
  assert.deepEqual(r.body.toolCalls, [{ id: 'call_1', name: 'set_title', args: { text: 'A' } }]);
  assert.match(f.calls[0].url, /models\/gemini-test-model:generateContent$/);
  assert.equal(f.calls[0].init.headers['x-goog-api-key'], FAKE_KEY);
  assert.ok(!JSON.stringify(r.body).includes(FAKE_KEY));
  assert.ok(lines.some((l) => l.includes('"event":"ai_call"') && l.includes('gemini-test-model')));
  assert.ok(lines.every((l) => !l.includes(FAKE_KEY)));
  const st = await (await fetch(`${srv.base}/__dev/status`)).json();
  assert.deepEqual(st.ai.byModel, { 'gemini-test-model': 1 });
  await srv.cleanup();
});

test('404 modelu: błąd jawnie, jedno wywołanie (bez cichej zmiany modelu)', async () => {
  const f = fakeFetch(404, { error: { message: `model not found key=${FAKE_KEY}` } });
  const lines = [];
  const srv = await startTestServer({ envText: `GEMINI_API_KEY=${FAKE_KEY}\n`, fetchImpl: f.impl, lines });
  const r = await srv.post('/panel/ai-proxy.php', ask);
  assert.equal(r.status, 404);
  assert.equal(r.body.model, 'gemini-3-flash-preview');
  assert.equal(f.calls.length, 1);
  assert.ok(lines.every((l) => !l.includes(FAKE_KEY)));
  await srv.cleanup();
});

test('błąd 400 dostawcy z kluczem w treści: klucz zamaskowany w odpowiedzi', async () => {
  const f = fakeFetch(400, { error: { message: `Bad request for ${FAKE_KEY}` } });
  const srv = await startTestServer({ envText: `GEMINI_API_KEY=${FAKE_KEY}\n`, fetchImpl: f.impl });
  const r = await srv.post('/panel/ai-proxy.php', ask);
  assert.equal(r.status, 400);
  assert.ok(!r.body.error.includes(FAKE_KEY));
  assert.match(r.body.error, /\[UKRYTO\]/);
  await srv.cleanup();
});

test('limit żądań na minutę: 429 po przekroczeniu', async () => {
  const f = fakeFetch(200, { candidates: [{ content: { parts: [{ text: 'ok' }] } }] });
  const srv = await startTestServer({ envText: `GEMINI_API_KEY=${FAKE_KEY}\n`, fetchImpl: f.impl, rateMax: 2 });
  assert.equal((await srv.post('/panel/ai-proxy.php', ask)).status, 200);
  assert.equal((await srv.post('/panel/ai-proxy.php', ask)).status, 200);
  const third = await srv.post('/panel/ai-proxy.php', ask);
  assert.equal(third.status, 429);
  assert.match(third.body.error, /limit 2 na minutę/);
  assert.equal(f.calls.length, 2);
  await srv.cleanup();
});

test('maskSecrets i logger: klucz dosłownie, zakodowany w URL, ?key= i Bearer', () => {
  const key = 'sk-proj_ABCdef1234567890+/=';
  const text = `a ${key} b ${encodeURIComponent(key)} c https://x/y?key=abc123&z=1 Authorization: Bearer abcdefgh12345678`;
  const masked = maskSecrets(text, [key]);
  assert.ok(!masked.includes(key) && !masked.includes(encodeURIComponent(key)) && !masked.includes('abc123'));
  assert.ok(!masked.includes('abcdefgh12345678'));
  const lines = [];
  createLogger({ write: (l) => lines.push(l), getSecrets: () => [key] })('x', { key, nested: { url: `?key=${key}` } });
  assert.ok(!lines[0].includes(key));
});

test('parseEnv: komentarze, cudzysłowy, export, puste wartości', () => {
  assert.deepEqual(parseEnv('# k\nexport A="1"\nB=\'2\'\nC=\n=zle\n D = 4 \r\n'), { A: '1', B: '2', C: '', D: '4' });
});
