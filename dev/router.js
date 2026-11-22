// Router serwera dev: kontrola Host/Origin, endpointy PHP (emulowane), /__dev/*, pliki strony i panelu.
import path from 'node:path';
import { HttpError, sendJson, sendError, handleMethod } from './http-util.js';
import { handleAuth, requireCsrf } from './api-auth.js';
import { handlePublish } from './api-publish.js';
import { handleBackups } from './api-backups.js';
import { handleAiProxy } from './api-ai-proxy.js';
import { resolveStatic, sendFile, sendText, injectLocalMeta, LOCAL_CONFIG_JS } from './static.js';
import { resetSandbox } from './sandbox.js';
import { renderDevPage } from './dev-page.js';

const PHP_ROUTES = { 'api.php': handlePublish, 'auth.php': handleAuth, 'backups.php': handleBackups, 'ai-proxy.php': handleAiProxy };

/** Odrzuca obce nagłówki Host (DNS rebinding) i międzydomenowe żądania zmieniające stan. */
function checkOrigin(req, port) {
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!hosts.includes(String(req.headers.host || '').toLowerCase())) throw new HttpError(403, 'Niedozwolony nagłówek Host.');
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
  const origin = req.headers.origin;
  if (origin !== undefined && !hosts.map((h) => `http://${h}`).includes(String(origin).toLowerCase())) {
    throw new HttpError(403, 'Żądanie z niedozwolonego źródła (Origin).');
  }
  if (req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'Żądanie z niedozwolonego źródła (Origin).');
}

/** @param {any} req @param {any} res @param {any} ctx @param {string} pathname */
async function handleDev(req, res, ctx, pathname) {
  if (pathname === '/__dev/status') {
    if (handleMethod(req, res, ['GET'], 'GET')) return;
    sendJson(res, 200, { port: ctx.getPort(), sandbox: ctx.sandbox.dir, source: ctx.sandbox.sourceRoot,
      createdAt: ctx.sandboxInfo.createdAt, files: ctx.sandboxInfo.files, ai: ctx.aiStats });
    return;
  }
  if (pathname === '/__dev/reset') {
    if (handleMethod(req, res, ['POST'], 'POST')) return;
    requireCsrf(req, ctx.session);
    ctx.sandboxInfo = resetSandbox(ctx.sandbox);
    ctx.log('sandbox_reset', { sandbox: ctx.sandbox.dir, files: ctx.sandboxInfo.files });
    sendJson(res, 200, { createdAt: ctx.sandboxInfo.createdAt, files: ctx.sandboxInfo.files });
    return;
  }
  if (pathname === '/__dev/' && req.method === 'GET') {
    const html = renderDevPage({ port: ctx.getPort(), sandboxDir: ctx.sandbox.dir, createdAt: ctx.sandboxInfo.createdAt });
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(html);
    return;
  }
  throw new HttpError(404, 'Nie znaleziono.');
}

/** @param {any} req @param {any} res @param {any} ctx @param {URL} url */
function serveFiles(req, res, ctx, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Niedozwolona metoda HTTP. Oczekiwano GET.');
  // L-019: na Windows /panel/Config.js i /PANEL/index.html to te same pliki, więc porównujemy małymi literami.
  const lowerPath = url.pathname.toLowerCase();
  const isPanel = lowerPath === '/panel' || lowerPath.startsWith('/panel/');
  if (lowerPath === '/panel/config.js' && url.searchParams.get('source') !== '1') {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(LOCAL_CONFIG_JS);
    return;
  }
  const root = isPanel ? path.join(ctx.sandbox.sourceRoot, 'panel') : ctx.sandbox.siteRoot;
  const rel = isPanel ? url.pathname.slice('/panel'.length) : url.pathname;
  const hit = resolveStatic(root, rel);
  if (!hit) return sendText(res, 404, 'Nie znaleziono.');
  if ('redirect' in hit) return sendText(res, 301, 'Przeniesiono.', { Location: `${url.pathname}/${url.search}` });
  const isPanelIndex = isPanel && path.basename(hit.file).toLowerCase() === 'index.html'
    && path.dirname(hit.file).toLowerCase() === path.resolve(root).toLowerCase();
  sendFile(res, hit.file, isPanelIndex ? injectLocalMeta : undefined);
}

/**
 * Tworzy obsługę żądań HTTP.
 * @param {Record<string, any>} ctx kontekst z server.js (piaskownica, sesja, logger, liczniki)
 */
export function createApp(ctx) {
  return async (req, res) => {
    try {
      checkOrigin(req, ctx.getPort());
      const url = new URL(req.url || '/', 'http://local');
      const php = url.pathname.match(/^\/panel\/([a-z-]+\.php)$/);
      if (php && PHP_ROUTES[php[1]]) return await PHP_ROUTES[php[1]](req, res, ctx);
      if (php || /\.php$/i.test(url.pathname)) throw new HttpError(404, 'Nie znaleziono.');
      if (url.pathname === '/__dev') return sendText(res, 301, 'Przeniesiono.', { Location: '/__dev/' });
      if (url.pathname.startsWith('/__dev/')) return await handleDev(req, res, ctx, url.pathname);
      return serveFiles(req, res, ctx, url);
    } catch (err) {
      if (res.headersSent) return res.end();
      if (err instanceof HttpError) return sendError(res, err);
      ctx.log('server_error', { url: req.url, message: String(err && err.message) });
      return sendJson(res, 500, { error: 'Wewnętrzny błąd serwera dev.' });
    }
  };
}
