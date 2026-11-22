import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { REPO_ROOT, loadHtml, cleanText } from './lib-html.mjs';

function textBucket(node) {
  const el = node.parentNode;
  if (!el || !el.closest) return 'tresc';
  if (el.closest('title')) return 'title';
  if (el.closest('h1')) return 'h1';
  if (el.closest('nav#site-menu')) return 'region:menu';
  if (el.closest('footer')) return 'region:stopka';
  if (el.closest('.cat-quick-nav')) return 'region:pasek';
  if (el.closest('aside.subpage-sidebar')) return 'region:sidebar';
  if (el.closest('nav.breadcrumbs')) return 'region:okruszki';
  if (el.closest('nav.product-nav-bar')) return 'region:product-nav-bar';
  if (el.closest('.home-cat-card, .home-extra-category, .subcat-card, .cat-prod-card, .home-featured-product')) return 'kafel-karta-pigulka';
  return 'tresc';
}

function collectTextNodes(node, out = []) {
  if (!node) return out;
  if (node.nodeType === 3) {
    const t = cleanText(node.rawText);
    if (t) out.push({ text: t, bucket: textBucket(node) });
  } else if (node.rawTagName !== 'script' && node.rawTagName !== 'style') {
    for (const c of node.childNodes || []) collectTextNodes(c, out);
  }
  return out;
}

const escRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const countMatches = (str, rx) => {
  let n = 0;
  rx.lastIndex = 0;
  while (rx.exec(str)) n++;
  return n;
};

export async function measureNameDeps(pagesData, root = REPO_ROOT) {
  const publicPages = pagesData.pages.filter((p) => p.type !== 'przekierowanie' && p.type !== 'panel');
  const mf = JSON.parse(await readFile(join(root, 'assets', 'cms-manifest.json'), 'utf8'));
  const mfMap = new Map((mf.pages || []).map((p) => [p.path, p.label || null]));

  const parsedDocs = [];
  for (const p of publicPages) {
    const { dom } = await loadHtml(p.path, root);
    const attrs = dom.querySelectorAll('[alt],[aria-label],[title],meta[name="description"]').map((el) => ({
      alt: el.getAttribute('alt'),
      ariaLabel: el.getAttribute('aria-label'),
      title: el.getAttribute('title'),
      metaDesc: el.rawTagName?.toLowerCase() === 'meta' ? el.getAttribute('content') : null,
    }));
    parsedDocs.push({ path: p.path, nodes: collectTextNodes(dom), attrs });
  }
  const gl = JSON.parse(await readFile(join(root, 'assets', 'site-globals.json'), 'utf8'));
  const hc = JSON.parse(await readFile(join(root, 'assets', 'home-content.json'), 'utf8'));
  const jsonTextChunks = [
    ['assets/cms-manifest.json', (mf.pages || []).flatMap((x) => [x.label, x.title, x.description]).filter(Boolean)],
    ['assets/site-globals.json', [...(gl.menu || []).map((x) => x.label), ...(gl.footerLinks || []).map((x) => x.label), gl.footerCopy, gl.logoAlt].filter(Boolean)],
    ['assets/home-content.json', Object.values(hc.fields || {}).flatMap((o) => [o.heading, o.intro]).filter(Boolean)],
  ];

  const names = {};
  for (const p of publicPages) {
    const titleCore = (p.title || '').split(' | ')[0].trim();
    const manifestLabel = mfMap.get(p.path) || null;
    const canonical = [p.h1, titleCore, manifestLabel].filter((v) => v && v.length >= 4);
    const terms = [...new Set(canonical)];
    const rxEx = terms.map((t) => new RegExp(`(?<![\\p{L}\\p{N}_])${escRx(t)}(?![\\p{L}\\p{N}_])`, 'gu'));
    const rxCi = terms.map((t) => new RegExp(`(?<![\\p{L}\\p{N}_])${escRx(t)}(?![\\p{L}\\p{N}_])`, 'giu'));
    const byPlace = {};
    const files = new Set();
    let exact = 0;
    let caseVariant = 0;

    const addHit = (bucket, file, exN, ciN) => {
      if (ciN <= 0) return;
      files.add(file);
      byPlace[bucket] = (byPlace[bucket] || 0) + ciN;
      exact += exN;
      caseVariant += Math.max(0, ciN - exN);
    };

    for (const d of parsedDocs) {
      for (const n of d.nodes) {
        const ex = rxEx.reduce((s, r) => s + countMatches(n.text, r), 0);
        const ci = rxCi.reduce((s, r) => s + countMatches(n.text, r), 0);
        if (ci > 0) addHit(n.bucket, d.path, ex, ci);
      }
      for (const a of d.attrs) {
        for (const [k, v] of [['attr:alt', a.alt], ['attr:aria-label', a.ariaLabel], ['attr:title', a.title], ['meta:description', a.metaDesc]]) {
          if (!v) continue;
          addHit(k, d.path, rxEx.reduce((s, r) => s + countMatches(v, r), 0), rxCi.reduce((s, r) => s + countMatches(v, r), 0));
        }
      }
    }
    for (const [jFile, chunks] of jsonTextChunks) {
      for (const ch of chunks) {
        addHit(`json:${jFile}`, jFile, rxEx.reduce((s, r) => s + countMatches(ch, r), 0), rxCi.reduce((s, r) => s + countMatches(ch, r), 0));
      }
    }

    names[p.path] = {
      h1: p.h1,
      titleCore,
      manifestLabel,
      variantsDiffer: terms.length > 1,
      terms,
      total: exact + caseVariant,
      exact,
      caseVariant,
      filesCount: files.size,
      files: [...files],
      byPlace,
    };
  }

  return {
    inflectionNote: 'brak danych: brak lematyzatora języka polskiego — zmierzono dopasowania dokładne, różnice wielkości liter (caseVariant) oraz różnice h1/title/manifest.label',
    pages: names,
  };
}
