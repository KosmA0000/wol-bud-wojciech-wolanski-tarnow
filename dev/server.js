// Punkt wejścia: npm run dev -- --port <port>. Serwer tylko na 127.0.0.1, zapisy tylko do piaskownicy portu.
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { parseArgs } from './args.js';
import { sandboxPaths, ensureSandbox, resetSandbox } from './sandbox.js';
import { createSession } from './api-auth.js';
import { createAiStats } from './api-ai-proxy.js';
import { createRateLimiter } from './rate-limit.js';
import { createLogger } from './log.js';
import { loadEnv, secretValues } from './env-file.js';
import { createApp } from './router.js';

export const HOST = '127.0.0.1';

/**
 * Tworzy i uruchamia serwer. port 0 = losowy wolny (testy); piaskownica wtedy pod nazwą sandboxPort.
 * @param {{ port: number, root: string, sandboxDir: string, envFile: string, keep?: boolean, quiet?: boolean,
 *   sandboxPort?: number, env?: Record<string, string|undefined>, fetchImpl?: typeof fetch,
 *   write?: (line: string) => void, rateMax?: number }} o
 */
export async function startDevServer(o) {
  const sandbox = sandboxPaths(o.root, o.sandboxDir, o.sandboxPort ?? o.port);
  const env = o.env ?? process.env;
  const log = createLogger({ quiet: o.quiet, write: o.write, getSecrets: () => secretValues(loadEnv(o.envFile, env).values) });
  const ctx = {
    sandbox, siteRoot: sandbox.siteRoot, privateDir: sandbox.privateDir,
    sandboxInfo: ensureSandbox(sandbox, !o.keep), session: createSession(), aiStats: createAiStats(),
    rateLimiter: createRateLimiter({ max: o.rateMax ?? 30 }), envFile: o.envFile, env, fetchImpl: o.fetchImpl, log,
    getPort: () => /** @type {import('node:net').AddressInfo} */ (server.address()).port,
  };
  const server = http.createServer(createApp(ctx));
  server.requestTimeout = 120_000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(o.port, HOST, () => resolve(undefined));
  });
  return { server, ctx, url: `http://${HOST}:${ctx.getPort()}/`, close: () => new Promise((r) => server.close(() => r(undefined))) };
}

/** @param {import('./args.js').DevArgs} args */
async function main(args) {
  if (args.reset) {
    const info = resetSandbox(sandboxPaths(args.root, args.sandboxDir, args.port));
    process.stdout.write(`Piaskownica portu ${args.port} odtworzona (${info.files} plików).\n`);
    return;
  }
  const { url, ctx } = await startDevServer(args);
  const { values, fileFound } = loadEnv(args.envFile);
  const keys = ['GEMINI_API_KEY', 'OPENAI_API_KEY'].filter((k) => values[k]);
  process.stdout.write([
    `WOL-BUD dev: ${url}  (panel: ${url}panel/, sterowanie: ${url}__dev/)`,
    `Piaskownica: ${ctx.sandbox.siteRoot} (${ctx.sandboxInfo.files} plików, ${args.keep ? 'wznowiona' : 'świeża kopia'})`,
    `Klucze AI: ${keys.length ? keys.join(', ') : 'brak'} (${fileFound ? 'plik .env.local znaleziony' : 'brak pliku .env.local'}; wartości nie są wypisywane)`,
    '',
  ].join('\n'));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    await main(parseArgs(process.argv.slice(2)));
  } catch (err) {
    const msg = err && err.code === 'EADDRINUSE' ? 'Port jest zajęty. Wybierz inny: npm run dev -- --port <port>.' : String(err && err.message);
    process.stderr.write(`Błąd serwera dev: ${msg}\n`);
    process.exit(1);
  }
}
