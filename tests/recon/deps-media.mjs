import { readdir, readFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { REPO_ROOT, loadHtml, resolveSiteUrl } from './lib-html.mjs';

async function walkFiles(dir, relBase = '') {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const rel = relBase ? `${relBase}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await walkFiles(join(dir, e.name), rel)));
    else if (e.isFile()) out.push(rel);
  }
  return out.sort();
}

function addMediaUse(usedMap, path, use) {
  if (!path.startsWith('img/')) return;
  if (!usedMap.has(path)) usedMap.set(path, []);
  usedMap.get(path).push(use);
}

export async function measureMedia(pagesData, root = REPO_ROOT) {
  const sitePages = pagesData.pages.filter((p) => p.type !== 'panel');
  const allImgFiles = (await walkFiles(join(root, 'img'))).map((f) => `img/${f}`);
  const imgSet = new Set(allImgFiles);
  const usedMap = new Map();
  const byAttr = {};
  const missingAltUsages = [];
  const brokenRefs = [];

  for (const p of sitePages) {
    const { dom } = await loadHtml(p.path, root);
    const track = (attr, rawVal, altText, skipEmptyAlt = false) => {
      if (!rawVal) return;
      const r = resolveSiteUrl(p.path, rawVal);
      if (r.kind !== 'internal') return;
      byAttr[attr] = (byAttr[attr] || 0) + 1;
      if (!imgSet.has(r.path)) brokenRefs.push({ page: p.path, attr, path: r.path });
      addMediaUse(usedMap, r.path, { file: p.path, attr, alt: altText });
      if (!skipEmptyAlt && (altText === null || altText.trim() === '')) {
        missingAltUsages.push({ page: p.path, attr, path: r.path });
      }
    };
    for (const img of dom.querySelectorAll('img')) {
      if (img.getAttribute('id') === 'lightboxImg') continue;
      track('img[src]', img.getAttribute('src'), img.getAttribute('alt'));
      const dls = img.getAttribute('data-lightbox-src');
      if (dls) track('data-lightbox-src', dls, img.getAttribute('alt'));
    }
    for (const el of dom.querySelectorAll('[data-src],[data-lightbox-src],[data-palette-src],[srcset]')) {
      if (el.rawTagName?.toLowerCase() !== 'img' && el.getAttribute('data-lightbox-src')) {
        const alt = el.querySelector('img')?.getAttribute('alt') || el.getAttribute('aria-label') || null;
        track('data-lightbox-src', el.getAttribute('data-lightbox-src'), alt);
      }
      if (el.getAttribute('data-src')) track('data-src', el.getAttribute('data-src'), el.querySelector('img')?.getAttribute('alt') || null);
      if (el.getAttribute('data-palette-src')) track('data-palette-src', el.getAttribute('data-palette-src'), el.querySelector('img')?.getAttribute('alt') || null);
      const ss = el.getAttribute('srcset');
      if (ss) for (const part of ss.split(',')) track('srcset', part.trim().split(/\s+/)[0], el.getAttribute('alt') || null);
    }
    for (const ln of dom.querySelectorAll('link[rel*="icon"][href]')) track('link[icon]', ln.getAttribute('href'), null, true);
    for (const og of dom.querySelectorAll('meta[property="og:image"]')) track('meta[og:image]', og.getAttribute('content'), null, true);
    for (const stEl of dom.querySelectorAll('[style]')) {
      const st = stEl.getAttribute('style') || '';
      for (const m of st.matchAll(/url\(["']?([^"')]+)["']?\)/gi)) track('style:url', m[1], null, true);
    }
  }

  for (const cssFile of ['assets/site.css', 'assets/home-content.css']) {
    const css = await readFile(join(root, ...cssFile.split('/')), 'utf8');
    for (const m of css.matchAll(/url\(["']?([^"')]+)["']?\)/gi)) {
      const resolved = posix.normalize(posix.join('assets', m[1]));
      if (resolved.startsWith('img/')) {
        byAttr[`css:${cssFile}`] = (byAttr[`css:${cssFile}`] || 0) + 1;
        addMediaUse(usedMap, resolved, { file: cssFile, attr: 'css:url', alt: null });
      }
    }
  }
  const gl = JSON.parse(await readFile(join(root, 'assets', 'site-globals.json'), 'utf8'));
  if (gl.logoSrc && imgSet.has(gl.logoSrc)) {
    byAttr['json:site-globals'] = 1;
    addMediaUse(usedMap, gl.logoSrc, { file: 'assets/site-globals.json', attr: 'logoSrc', alt: gl.logoAlt || null });
  }

  const mf = JSON.parse(await readFile(join(root, 'assets', 'cms-manifest.json'), 'utf8'));
  const mfImgSet = new Set((mf.images || []).map((x) => x.path));
  const usedFiles = allImgFiles.filter((f) => usedMap.has(f));
  const unusedFiles = allImgFiles.filter((f) => !usedMap.has(f));
  const multiAltFiles = usedFiles
    .map((f) => {
      const alts = [...new Set(usedMap.get(f).map((u) => u.alt).filter((a) => a !== null && a.trim() !== ''))];
      return { path: f, usesCount: usedMap.get(f).length, distinctAlts: alts };
    })
    .filter((x) => x.distinctAlts.length > 1);

  return {
    totalFilesInImg: allImgFiles.length,
    usedFilesCount: usedFiles.length,
    unusedFilesCount: unusedFiles.length,
    unusedFiles,
    byAttrCounts: byAttr,
    missingAltUsages,
    multiAltFiles,
    brokenRefs,
    inImgNotInManifest: allImgFiles.filter((f) => !mfImgSet.has(f)),
    inManifestNotInImg: [...mfImgSet].filter((f) => !imgSet.has(f)),
    topUsed: usedFiles
      .map((f) => ({ path: f, usesCount: usedMap.get(f).length, filesCount: new Set(usedMap.get(f).map((u) => u.file)).size, inManifest: mfImgSet.has(f) }))
      .sort((a, b) => b.usesCount - a.usesCount)
      .slice(0, 20),
  };
}
