import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { REPO_ROOT, TESTS_ROOT, walkHtml, loadHtml, classifyPage } from '../recon/lib-html.mjs';
import { startStaticServer } from '../e2e/server.mjs';
import { comparePngBuffers } from './lib-compare.mjs';

const DEFAULT_BASELINE = 'C:\\Users\\User\\OpenBot\\Shared\\wolbud\\rekonesans\\screenshots-baseline';
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
];

function argVal(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const updateBaseline = process.argv.includes('--update-baseline');
const siteRoot = resolve(argVal('--root', REPO_ROOT));
const baselineDir = resolve(argVal('--baseline', process.env.VISUAL_BASELINE_DIR || DEFAULT_BASELINE));
const filter = argVal('--filter', null);
const concurrency = Number(argVal('--concurrency', '1'));
const diffDir = resolve(TESTS_ROOT, '.visual-tmp', 'diffs');

function pageSlug(relPath) {
  return relPath.replace(/\/index\.html$/, '').replace(/\.html$/, '').replace(/\//g, '__') || 'index';
}

async function listPublicPages(root) {
  const all = await walkHtml(root, false);
  const out = [];
  for (const rel of all) {
    const { dom } = await loadHtml(rel, root);
    if (classifyPage(rel, dom).type !== 'przekierowanie') out.push(rel);
  }
  return filter ? out.filter((p) => p.includes(filter)) : out;
}

async function captureBuffer(browser, baseUrl, relPath, vp) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => route.abort());
  try {
    await page.goto(`${baseUrl}/${relPath}`, { waitUntil: 'networkidle', timeout: 25_000 });
    await page.evaluate(async () => {
      for (const img of document.querySelectorAll('img')) {
        if (img.loading === 'lazy') img.loading = 'eager';
        img.decoding = 'sync';
      }
      await Promise.race([
        Promise.all(
          [...document.images].filter((i) => i.getAttribute('src')).map(async (i) => {
            if (!i.complete) await new Promise((r) => { i.onload = r; i.onerror = r; });
            if (i.decode) await i.decode().catch(() => {});
          })
        ),
        new Promise((r) => setTimeout(r, 12_000)),
      ]);
      window.scrollTo(0, 0);
      if (document.fonts?.ready) await document.fonts.ready;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    });
    await page.waitForLoadState('networkidle').catch(() => {});
    return await page.screenshot({ fullPage: true, animations: 'disabled' });
  } finally {
    await context.close();
  }
}

const pages = await listPublicPages(siteRoot);
const { server, url } = await startStaticServer({ root: siteRoot, port: 0 });
const LAUNCH_OPTS = {
  headless: true,
  args: [
    '--disable-gpu',
    '--disable-lcd-text',
    '--font-render-hinting=none',
    '--disable-font-subpixel-positioning',
    '--force-color-profile=srgb',
    '--disable-skia-runtime-opts',
    '--num-raster-threads=1',
  ],
};

const jobs = [];
for (const vp of VIEWPORTS) {
  await mkdir(join(baselineDir, vp.name), { recursive: true });
  for (const p of pages) jobs.push({ vp, path: p, file: join(baselineDir, vp.name, `${pageSlug(p)}.png`) });
}

const results = [];
let idx = 0;
async function worker() {
  const browser = await chromium.launch(LAUNCH_OPTS);
  try {
    while (idx < jobs.length) {
      const job = jobs[idx++];
      const buf = await captureBuffer(browser, url, job.path, job.vp);
      if (updateBaseline) {
        await writeFile(job.file, buf);
        results.push({ ok: true, vp: job.vp.name, path: job.path, bytes: buf.length });
      } else {
        let baseBuf;
        try { baseBuf = await readFile(job.file); } catch {
          results.push({ ok: false, vp: job.vp.name, path: job.path, reason: 'Brak pliku bazowego' });
          continue;
        }
        const diffPath = join(diffDir, job.vp.name, `${pageSlug(job.path)}.png`);
        const cmp = await comparePngBuffers(baseBuf, buf, diffPath);
        results.push({ ...cmp, vp: job.vp.name, path: job.path });
      }
    }
  } finally {
    await browser.close();
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()));
server.close();

const failed = results.filter((r) => !r.ok);
const manifest = { mode: updateBaseline ? 'baseline' : 'compare', siteRoot, baselineDir, pagesCount: pages.length, viewports: VIEWPORTS, totalScreenshots: results.length, failedCount: failed.length, failed };
await writeFile(join(baselineDir, 'visual-report.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log(`Visual [${manifest.mode}]: ${results.length - failed.length}/${results.length} OK (${pages.length} stron x ${VIEWPORTS.length} szerokości).`);
for (const f of failed.slice(0, 20)) console.error(`FAIL [${f.vp}] ${f.path}: ${f.reason}`);
if (failed.length > 0) process.exit(1);
