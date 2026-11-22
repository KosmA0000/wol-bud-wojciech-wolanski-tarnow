// Wspólne narzędzia testów jednostkowych: tymczasowa mini-strona, serwer dev na losowym porcie, żądania HTTP.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startDevServer } from '../../dev/server.js';

export const FAKE_KEY = 'AIzaFAKE-test-key-1234567890abcdefXYZ';

/** Tworzy katalog tymczasowy z małą stroną (index, podstrona, assets, panel, pliki spoza strony). */
export function makeSite() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wolbud-unit-'));
  const w = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  };
  w('index.html', '<!doctype html><html><head><title>Start</title></head><body><h1>Start</h1></body></html>');
  w('o-firmie/index.html', '<!doctype html><title>O firmie</title><p>O nas</p>');
  w('assets/site.css', 'body{}');
  w('assets/cms-manifest.json', JSON.stringify({ revision: 'r1', pages: [] }));
  w('panel/index.html', '<!doctype html><html><head><title>Panel</title></head><body></body></html>');
  w('panel/config.js', "export const config = Object.freeze({ mode: 'github' });\n");
  w('dev/secret.js', 'nie serwować');
  w('.git/config', 'nie kopiować');
  w('package.json', '{}');
  return root;
}

/** @param {string} source */
export function snapshotTree(source) {
  const out = {};
  for (const e of fs.readdirSync(source, { withFileTypes: true, recursive: true })) {
    if (!e.isFile()) continue;
    const full = path.join(e.parentPath, e.name);
    if (full.includes(`${path.sep}.sandbox${path.sep}`)) continue;
    out[path.relative(source, full)] = fs.readFileSync(full, 'utf8');
  }
  return out;
}

/**
 * Uruchamia serwer dev na porcie 0 z piaskownicą w katalogu tymczasowym.
 * @param {{ envText?: string, fetchImpl?: typeof fetch, rateMax?: number, lines?: string[] }} [o]
 */
export async function startTestServer(o = {}) {
  const root = makeSite();
  const envFile = path.join(root, '..', `${path.basename(root)}.env`);
  if (o.envText !== undefined) fs.writeFileSync(envFile, o.envText);
  const lines = o.lines ?? [];
  const dev = await startDevServer({ port: 0, sandboxPort: 50000 + Math.floor(Math.random() * 9000), root,
    sandboxDir: path.join(root, '.sandbox'), envFile, env: {}, fetchImpl: o.fetchImpl, rateMax: o.rateMax,
    write: (l) => lines.push(l) });
  const base = dev.url.replace(/\/$/, '');
  const token = (await (await fetch(`${base}/panel/auth.php?status=1`)).json()).csrfToken;
  /** @param {string} url @param {unknown} body @param {Record<string, string>} [headers] */
  const post = async (url, body, headers = {}) => {
    const r = await fetch(`${base}${url}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', 'X-CMS-CSRF-Token': token, ...headers } });
    return { status: r.status, body: await r.json() };
  };
  const cleanup = async () => {
    await dev.close();
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(envFile, { force: true });
  };
  return { ...dev, root, base, token, post, lines, envFile, cleanup };
}
