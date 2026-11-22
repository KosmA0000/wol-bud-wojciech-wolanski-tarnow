// Skaner HTML (port z PHP) i kontrola treści plików oraz tłumaczenie formatów AI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanHtml } from '../../dev/html-scan.js';
import { checkContent } from '../../dev/content-checks.js';
import { buildGeminiPayload } from '../../dev/ai-gemini.js';
import { buildOpenAiPayload, parseOpenAiResponse } from '../../dev/ai-openai.js';

test('scanHtml: bezpieczna strona z dozwolonym skryptem przechodzi', () => {
  assert.equal(scanHtml('<!doctype html><a href="/x">x</a><script defer src="../../assets/site.js?v=97fa1106ac"></script>'), null);
});

test('scanHtml: skrypty, zdarzenia, schematy, iframe, meta refresh są odrzucane', () => {
  const bad = ['<script>alert(1)</script>', '<script src="https://evil/x.js"></script>', '<img src=x onerror=alert(1)>',
    '<a href="jav&#x61;script:alert(1)">x</a>', '<a href="java\tscript:x">x</a>', '<iframe src="x"></iframe>', '<form></form>',
    '<meta http-equiv="refresh" content="0;url=/x">', '<?php echo 1; ?>', '<script src="assets/site.js">', 'a\0b',
    '<img src="data:image/svg+xml;base64,AAA">'];
  for (const html of bad) assert.notEqual(scanHtml(html), null, html);
});

test('checkContent: JSON, sitemap.xml i robots.txt jak w api.php', () => {
  const b = (s) => Buffer.from(s);
  assert.equal(checkContent('assets/a.json', b('{"a":1}')), null);
  assert.notEqual(checkContent('assets/a.json', b('{zle')), null);
  assert.equal(checkContent('sitemap.xml', b('<?xml version="1.0"?><urlset></urlset>')), null);
  assert.notEqual(checkContent('sitemap.xml', b('<?xml version="1.0"?><urlset><loc>https://x/panel/</loc></urlset>')), null);
  assert.equal(checkContent('robots.txt', b('User-agent: *\nDisallow: /panel/\n')), null);
  assert.notEqual(checkContent('robots.txt', b('User-agent: *\nDisallow: /\n')), null);
  assert.notEqual(checkContent('assets/x.css', b('a{b:expression(alert(1))}')), null);
  assert.equal(checkContent('img/a.webp', b('RIFF....')), null);
});

test('Gemini: wiadomości, wywołania narzędzi i wyniki trafiają w poprawne role', () => {
  const p = buildGeminiPayload('system', [
    { role: 'user', content: 'a' },
    { role: 'assistant', content: '', tool_calls: [{ id: 't1', function: { name: 'f', arguments: '{"x":1}' } }] },
    { role: 'tool', tool_call_id: 't1', content: '{"ok":true}' },
  ], [{ type: 'function', function: { name: 'f', description: 'd', parameters: { type: 'object', properties: {} } } }]);
  assert.deepEqual(p.systemInstruction, { parts: [{ text: 'system' }] });
  assert.deepEqual(p.contents[1], { role: 'model', parts: [{ functionCall: { name: 'f', args: { x: 1 } } }] });
  assert.deepEqual(p.contents[2].parts[0].functionResponse, { name: 'f', response: { ok: true } });
  assert.deepEqual(p.tools[0].functionDeclarations[0], { name: 'f', description: 'd' });
  assert.throws(() => buildGeminiPayload('', [{ role: 'x' }], []), (e) => e.status === 400);
});

test('OpenAI: payload i odpowiedź z wywołaniem narzędzia', () => {
  const p = buildOpenAiPayload('s', [{ role: 'user', content: 'a' }], [{ name: 'f', parameters: {} }], 'gpt-x');
  assert.equal(p.model, 'gpt-x');
  assert.deepEqual(p.tools[0].function.parameters, { type: 'object', properties: {} });
  const r = parseOpenAiResponse({ choices: [{ message: { content: ' hej ', tool_calls: [{ id: 'c', function: { name: 'f', arguments: '{"a":2}' } }] } }] });
  assert.deepEqual(r, { text: 'hej', toolCalls: [{ id: 'c', name: 'f', args: { a: 2 } }] });
});
