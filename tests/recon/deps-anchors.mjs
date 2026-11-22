import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { REPO_ROOT, loadHtml, cleanText, resolveSiteUrl } from './lib-html.mjs';

export async function measureAnchors(pagesData, root = REPO_ROOT) {
  const publicPages = pagesData.pages.filter((p) => p.type !== 'przekierowanie' && p.type !== 'panel');
  const idsByPage = new Map();
  const crossMap = new Map();
  const mobileMap = new Map();
  const samePage = [];

  for (const p of publicPages) {
    const { dom } = await loadHtml(p.path, root);
    idsByPage.set(p.path, new Set(dom.querySelectorAll('[id]').map((e) => e.getAttribute('id'))));
    for (const a of dom.querySelectorAll('a[href], a[data-mobile-home-href]')) {
      const href = a.getAttribute('href');
      if (href && href.includes('#') && !/^(https?:|mailto:|tel:)/i.test(href)) {
        const res = resolveSiteUrl(p.path, href);
        if (res.kind === 'internal' && res.hash && res.path !== p.path) {
          const k = `${res.path}#${res.hash}`;
          if (!crossMap.has(k)) {
            crossMap.set(k, { key: k, targetPage: res.path, targetId: res.hash, count: 0, sources: [], hasDataHomeLink: false });
          }
          const rec = crossMap.get(k);
          rec.count += 1;
          rec.sources.push({ from: p.path, text: cleanText(a.text), isDataHomeLink: a.hasAttribute('data-home-link') });
          if (a.hasAttribute('data-home-link')) rec.hasDataHomeLink = true;
        } else if (res.kind === 'anchor' && res.hash) {
          samePage.push({ page: p.path, id: res.hash, text: cleanText(a.text) });
        }
      }
      const mob = a.getAttribute('data-mobile-home-href');
      if (mob && mob.includes('#')) {
        const id = mob.split('#').pop();
        if (!mobileMap.has(id)) mobileMap.set(id, { id, label: cleanText(a.text), count: 0, filesCount: 0, files: new Set() });
        const m = mobileMap.get(id);
        m.count += 1;
        m.files.add(p.path);
        m.filesCount = m.files.size;
      }
    }
  }

  const crossPageLinks = [...crossMap.values()]
    .map((c) => ({
      ...c,
      targetExists: idsByPage.get(c.targetPage)?.has(c.targetId) || false,
      sourcesCount: new Set(c.sources.map((s) => s.from)).size,
    }))
    .sort((a, b) => b.count - a.count);

  const gl = JSON.parse(await readFile(join(root, 'assets', 'site-globals.json'), 'utf8'));
  const globalsMobileAnchors = (gl.menu || []).map((m) => ({ label: m.label, mobileHref: m.mobileHref }));
  const siteJs = await readFile(join(root, 'assets', 'site.js'), 'utf8');
  const jsGetById = [...new Set([...siteJs.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]))];
  const jsHashRefs = [...new Set([...siteJs.matchAll(/['"]#([a-zA-Z0-9_-]+)['"]/g)].map((m) => m[1]))];
  const hcJs = await readFile(join(root, 'assets', 'home-content.js'), 'utf8');
  const hcJson = JSON.parse(await readFile(join(root, 'assets', 'home-content.json'), 'utf8'));

  return {
    crossPageLinks,
    mobileAnchors: [...mobileMap.values()].map((m) => ({
      ...m,
      existsOnHome: idsByPage.get('index.html')?.has(m.id) || false,
      files: [...m.files],
    })),
    globalsMobileAnchors,
    samePageAnchors: samePage,
    scriptIds: {
      siteJsGetElementById: jsGetById,
      siteJsHashRefs: jsHashRefs,
      homeContentOrder: hcJson.order || [],
      homeContentJsHasStart: hcJs.includes('#start'),
    },
  };
}
