import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, extname, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

export function startStaticServer({ root = DEFAULT_ROOT, port = 4182, host = '127.0.0.1' } = {}) {
  const absRoot = resolve(root);
  const server = createServer(async (req, res) => {
    try {
      const p = decodeURIComponent(new URL(req.url, `http://${host}`).pathname);
      const target = resolve(absRoot, '.' + p + (p.endsWith('/') ? 'index.html' : ''));
      if (!target.startsWith(absRoot + sep) || !(await stat(target)).isFile()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': TYPES[extname(target).toLowerCase()] || 'application/octet-stream' });
      createReadStream(target).pipe(res);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  return new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const addr = server.address();
      resolvePromise({ server, url: `http://${host}:${addr.port}`, port: addr.port });
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4182);
  const root = process.env.SITE_ROOT || DEFAULT_ROOT;
  startStaticServer({ root, port }).then(({ url }) => console.log(`Static test server listening at ${url}`));
}
