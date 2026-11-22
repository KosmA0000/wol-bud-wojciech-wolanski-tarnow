import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { REPO_ROOT, loadHtml, cleanText } from './lib-html.mjs';

const JSON_FILES = ['assets/site-globals.json', 'assets/cms-manifest.json', 'assets/home-content.json'];
const EXTRA_FILES = ['sitemap.xml', 'robots.txt', 'assets/site.js'];

function regionOf(el) {
  if (!el || !el.closest) return 'tresc';
  if (el.closest('header.bar')) return el.closest('nav#site-menu') ? 'region:menu' : 'region:header';
  if (el.closest('footer')) return 'region:footer';
  if (el.closest('aside.subpage-sidebar')) return 'region:sidebar';
  if (el.closest('nav.contact-bubbles')) return 'region:contact-bubbles';
  return 'tresc';
}

function collectNodes(node, out = []) {
  if (!node) return out;
  if (node.nodeType === 3) {
    const t = cleanText(node.rawText);
    if (t) out.push({ text: t, place: regionOf(node.parentNode) });
  } else if (node.rawTagName !== 'script' && node.rawTagName !== 'style') {
    for (const c of node.childNodes || []) collectNodes(c, out);
  }
  return out;
}

function buildSpecs(globals) {
  const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [
    { key: 'phoneMain', label: globals.phoneDisplay, inGlobals: true, textRx: /534[\s\u00a0-]*091[\s\u00a0-]*021/g, attrs: [['href', /^tel:(?:\+48)?534091021$/i, (v) => (v.includes('+48') ? 'href:tel+48' : 'href:telBez48')], ['aria-label', /534[\s\u00a0-]*091[\s\u00a0-]*021/, () => 'aria-label']] },
    { key: 'email', label: globals.email, inGlobals: true, textRx: new RegExp(esc(globals.email), 'gi'), attrs: [['href', /^mailto:biuro@wol-bud\.com\.pl$/i, () => 'href:mailto'], ['aria-label', /biuro@wol-bud\.com\.pl/i, () => 'aria-label']] },
    { key: 'facebook', label: globals.facebookLabel, inGlobals: true, textRx: /facebook\.com\/sklep\.wol\.bud\.tarnow/gi, attrs: [['href', /facebook\.com\/sklep\.wol\.bud\.tarnow/i, () => 'href:fb'], ['aria-label', /facebook\.com\/sklep\.wol\.bud\.tarnow/i, () => 'aria-label']] },
    { key: 'logo', label: globals.logoSrc, inGlobals: true, textRx: null, attrs: [['src', /img\/wolbud-logo\.webp$/i, () => 'img:src'], ['alt', new RegExp(esc(globals.logoAlt), 'i'), () => 'img:alt-logo']] },
    { key: 'footerCopy', label: globals.footerCopy, inGlobals: true, textRx: /WOL-BUD Wojciech Wolański\s*·\s*Sprzedaż i profesjonalny montaż okien, drzwi i bram od 1995 roku/g, attrs: [] },
    { key: 'phoneTarnowLandline', label: '14 626 80 32', inGlobals: false, textRx: /14\s*626\s*80\s*32/g, attrs: [['href', /^tel:(?:\+48)?146268032$/i, () => 'href:tel']] },
    { key: 'phoneRadlowLandline', label: '14 678 23 65', inGlobals: false, textRx: /14\s*678\s*23\s*65/g, attrs: [['href', /^tel:(?:\+48)?146782365$/i, () => 'href:tel']] },
    { key: 'phoneRadlowMob', label: '609 734 290', inGlobals: false, textRx: /609\s*734\s*290/g, attrs: [['href', /^tel:(?:\+48)?609734290$/i, () => 'href:tel']] },
    { key: 'addrTarnow', label: 'ul. Giełdowa 10 / 33-100 Tarnów', inGlobals: false, textRx: /ul\.\s*Giełdowa\s*10/gi, attrs: [] },
    { key: 'addrRadlow', label: 'ul. Kolejowa 5 / 33-130 Radłów', inGlobals: false, textRx: /ul\.\s*Kolejowa\s*5/gi, attrs: [] },
    { key: 'mapsTarnow', label: 'Google Maps: Tarnów Giełdowa 10', inGlobals: false, textRx: null, attrs: [['href', /destination=WOL-BUD\+ul\.\+Gie/i, () => 'href:maps']] },
    { key: 'mapsRadlow', label: 'Google Maps: Radłów Kolejowa 5', inGlobals: false, textRx: null, attrs: [['href', /destination=ul\.\+Kolejowa\+5/i, () => 'href:maps']] },
    { key: 'mapsGoogleReviews', label: 'Google Maps: wizytówka opinii WOL-BUD', inGlobals: false, textRx: null, attrs: [['href', /google\.com\/maps\/place\/WOL-BUD/i, () => 'href:maps-place']] },
    { key: 'hours', label: 'Godziny otwarcia salonów', inGlobals: false, textRx: /(?:0?8(?::00)?[–-]16(?::00)?|0?9(?::00)?[–-]12(?::00)?|Pn[–-]Pt\s*8[–-]16|Sb\s*9[–-]12)/g, attrs: [] },
    { key: 'nip', label: 'NIP: 8731011790', inGlobals: false, textRx: /8731011790/g, attrs: [] },
    { key: 'companyFull', label: 'Firma Usługowo–Handlowa „WOL-BUD” Wojciech Wolański', inGlobals: false, textRx: /Firma\s+Usługowo[–-]Handlowa\s+[„"]WOL-BUD[”"]\s+Wojciech\s+Wolański/g, attrs: [] },
    { key: 'companyOwner', label: 'WOL-BUD Wojciech Wolański', inGlobals: false, textRx: /WOL-BUD\s+Wojciech\s+Wolański/g, attrs: [] },
    { key: 'companyBrand', label: 'WOL-BUD (marka w tekście/tytułach)', inGlobals: false, textRx: /WOL-BUD/g, attrs: [['alt', /WOL-BUD/i, () => 'attr:alt'], ['aria-label', /WOL-BUD/i, () => 'attr:aria-label'], ['content', /WOL-BUD/i, () => 'meta:description']] },
    { key: 'foundedYear', label: 'Rok założenia 1995 / staż 31 lat', inGlobals: false, textRx: /(?:1995|31\s+lat|31-letnie)/g, attrs: [['content', /1995/i, () => 'meta:description']] },
    { key: 'googleRating', label: 'Ocena Google (4,4 / 48 opinii / 16.10.2026)', inGlobals: false, textRx: /(?:4,4|48 opinii|16\.10\.2026)/g, attrs: [] },
    { key: 'domain', label: 'Domena wol-bud.com.pl', inGlobals: false, textRx: /wol-bud\.com\.pl/gi, attrs: [['href', /wol-bud\.com\.pl/i, () => 'href:domain']] },
  ];
}

export async function measureCompanyData(pagesData, root = REPO_ROOT) {
  const globals = JSON.parse(await readFile(join(root, 'assets', 'site-globals.json'), 'utf8'));
  const specs = buildSpecs(globals);
  const stats = Object.fromEntries(specs.map((s) => [s.key, {
    key: s.key, label: s.label, inGlobals: s.inGlobals, totalHtml: 0, totalNonHtml: 0,
    byPlace: {}, byFormat: {}, filesHtml: new Set(), filesNonHtml: new Set(),
  }]));
  const sitePages = pagesData.pages.filter((p) => p.type !== 'panel');

  for (const p of sitePages) {
    const { dom } = await loadHtml(p.path, root);
    const nodes = collectNodes(dom);
    const allEls = dom.querySelectorAll('a, img, meta, link');
    for (const s of specs) {
      const st = stats[s.key];
      if (s.textRx) {
        for (const n of nodes) {
          const hits = n.text.match(s.textRx);
          if (!hits) continue;
          st.totalHtml += hits.length;
          st.filesHtml.add(p.path);
          st.byPlace[n.place] = (st.byPlace[n.place] || 0) + hits.length;
          st.byFormat.text = (st.byFormat.text || 0) + hits.length;
        }
      }
      for (const el of allEls) {
        for (const [attr, rx, fmtFn] of s.attrs) {
          const val = el.getAttribute(attr);
          if (!val || !rx.test(val)) continue;
          const place = regionOf(el);
          const fmt = fmtFn(val);
          st.totalHtml += 1;
          st.filesHtml.add(p.path);
          st.byPlace[place] = (st.byPlace[place] || 0) + 1;
          st.byFormat[fmt] = (st.byFormat[fmt] || 0) + 1;
        }
      }
    }
  }

  for (const rel of [...JSON_FILES, ...EXTRA_FILES]) {
    const raw = await readFile(join(root, ...rel.split('/')), 'utf8');
    for (const s of specs) {
      const st = stats[s.key];
      let n = 0;
      if (s.textRx) n += (raw.match(s.textRx) || []).length;
      if (s.key === 'phoneMain') n += (raw.match(/tel:(?:\+48)?534091021/gi) || []).length;
      if (s.key === 'logo' && raw.includes(globals.logoSrc)) n += 1;
      if (n > 0) {
        st.totalNonHtml += n;
        st.filesNonHtml.add(rel);
        st.byPlace[`file:${rel}`] = (st.byPlace[`file:${rel}`] || 0) + n;
      }
    }
  }

  const formatted = Object.values(stats).map((st) => ({
    key: st.key, label: st.label, inGlobals: st.inGlobals,
    totalAll: st.totalHtml + st.totalNonHtml, totalHtml: st.totalHtml, totalNonHtml: st.totalNonHtml,
    htmlFilesCount: st.filesHtml.size, nonHtmlFiles: [...st.filesNonHtml],
    byPlace: st.byPlace, byFormat: st.byFormat, htmlFiles: [...st.filesHtml],
  }));
  return { inGlobals: formatted.filter((x) => x.inGlobals), candidates: formatted.filter((x) => !x.inGlobals) };
}
