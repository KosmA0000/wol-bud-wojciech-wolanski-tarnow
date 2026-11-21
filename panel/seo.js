/**
 * Deterministyczny, odporny na ingerencję AI moduł Auto-SEO (Browser + Node.js).
 * Generuje i waliduje:
 *  - adresy canonical / Open Graph dla podstron
 *  - plik sitemap.xml dla wszystkich opublikowanych podstron (bez /panel/ i usuniętych)
 *  - plik robots.txt (zawsze Allow: / + Disallow: /panel/ + Sitemap)
 *
 * Asystent AI nie posiada żadnych narzędzi do edycji sitemap.xml ani robots.txt —
 * pliki te powstają wyłącznie deterministycznie w kodzie panelu podczas publikacji.
 */

import { siteProfile } from './site-profile.js';

const FORBIDDEN_SITEMAP_PREFIXES = ['panel/', 'assets/', '.git/', '.github/', 'backups/', 'cms-backups/'];

function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Zwraca znormalizowany bazowy URL witryny bez końcowego slasha (np. https://wol-bud.com.pl).
 */
export function resolveSiteBaseUrl(profile = siteProfile) {
  const configured = typeof profile?.siteUrl === 'string' ? profile.siteUrl.trim() : '';
  if (configured && /^https?:\/\/[^/\s]+/i.test(configured)) {
    return configured.replace(/\/+$/, '');
  }
  if (typeof location !== 'undefined' && /^https?:$/i.test(location.protocol || '')) {
    try {
      const rootUrl = new URL('../', location.href);
      return rootUrl.href.replace(/\/+$/, '');
    } catch {
      return location.origin.replace(/\/+$/, '');
    }
  }
  return 'https://wol-bud.com.pl';
}

/**
 * Zamienia ścieżkę pliku w repozytorium (np. "promocje/jesien/index.html")
 * na czysty adres kanoniczny (np. "https://wol-bud.com.pl/promocje/jesien/").
 */
export function buildCanonicalUrl(pagePath, baseUrl = resolveSiteBaseUrl()) {
  const cleanBase = String(baseUrl || '').replace(/\/+$/, '');
  const raw = String(pagePath || 'index.html')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^(\.\/|\/)+/, '');

  if (!raw || raw === 'index.html') {
    return `${cleanBase}/`;
  }
  if (raw.endsWith('/index.html')) {
    return `${cleanBase}/${raw.slice(0, -'index.html'.length)}`;
  }
  return `${cleanBase}/${raw}`;
}

/**
 * Zwraca priorytet SEO dla sitemap.xml na podstawie ścieżki podstrony.
 */
function inferSitemapPriority(pagePath) {
  const p = String(pagePath || '').toLowerCase();
  if (p === 'index.html') return '1.0';
  if (
    p === 'oferta/index.html' ||
    p === 'uslugi/index.html' ||
    p === 'realizacje/index.html' ||
    p === 'kontakt/index.html' ||
    p === 'o-firmie/index.html' ||
    p === 'nasze-sklepy/index.html' ||
    p.startsWith('kategorie/')
  ) {
    return '0.9';
  }
  if (p.startsWith('promocje/')) return '0.8';
  return '0.7';
}

/**
 * Sprawdza, czy ścieżka kwalifikuje się do umieszczenia w publicznej mapie witryny sitemap.xml.
 */
export function isIndexablePublicPagePath(pagePath) {
  if (typeof pagePath !== 'string') return false;
  const clean = pagePath.trim().replace(/\\/g, '/').replace(/^(\.\/|\/)+/, '');
  if (!clean || !clean.toLowerCase().endsWith('.html')) return false;
  if (clean.includes('..') || clean.includes('//') || clean.startsWith('.')) return false;
  const lower = clean.toLowerCase();
  if (FORBIDDEN_SITEMAP_PREFIXES.some((prefix) => lower.startsWith(prefix))) return false;
  if (lower.includes('/.')) return false;
  return true;
}

/**
 * Deterministycznie generuje poprawny plik sitemap.xml dla listy opublikowanych podstron.
 */
export function generateSitemapXml(pages, { siteUrl = resolveSiteBaseUrl(), lastmod = null } = {}) {
  const base = String(siteUrl || resolveSiteBaseUrl()).replace(/\/+$/, '');
  const dateStr =
    typeof lastmod === 'string' && /^\d{4}-\d{2}-\d{2}/.test(lastmod)
      ? lastmod.slice(0, 10)
      : new Date().toISOString().slice(0, 10);

  const uniquePaths = [];
  const seen = new Set();
  const list = Array.isArray(pages) ? pages : [];

  for (const entry of list) {
    if (!entry) continue;
    if (typeof entry === 'object' && entry.deleted) continue;
    const rawPath = typeof entry === 'string' ? entry : entry.path;
    if (!isIndexablePublicPagePath(rawPath)) continue;
    const clean = rawPath.trim().replace(/\\/g, '/').replace(/^(\.\/|\/)+/, '');
    if (seen.has(clean)) continue;
    seen.add(clean);
    uniquePaths.push(clean);
  }

  // Zawsze gwarantuj obecność strony głównej na pierwszym miejscu
  if (!seen.has('index.html')) {
    uniquePaths.unshift('index.html');
  } else {
    const idx = uniquePaths.indexOf('index.html');
    if (idx > 0) {
      uniquePaths.splice(idx, 1);
      uniquePaths.unshift('index.html');
    }
  }

  const urlsXml = uniquePaths
    .map((p) => {
      const loc = escapeXml(buildCanonicalUrl(p, base));
      const priority = inferSitemapPriority(p);
      return [
        '  <url>',
        `    <loc>${loc}</loc>`,
        `    <lastmod>${dateStr}</lastmod>`,
        `    <priority>${priority}</priority>`,
        '  </url>',
      ].join('\n');
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urlsXml,
    '</urlset>',
    '',
  ].join('\n');
}

/**
 * Deterministycznie generuje bezpieczny plik robots.txt (nigdy nie blokuje strony, zawsze blokuje /panel/).
 */
export function generateRobotsTxt({ siteUrl = resolveSiteBaseUrl() } = {}) {
  const base = String(siteUrl || resolveSiteBaseUrl()).replace(/\/+$/, '');
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /panel/',
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n');
}

/**
 * Waliduje zawartość sitemap.xml przed publikacją (chroni przed XXE, skryptami, PHP i pustą mapą).
 */
export function validateSafeSitemapXml(xml) {
  const src = String(xml ?? '');
  if (!src.trim()) {
    return { ok: false, reason: 'Plik sitemap.xml nie może być pusty.' };
  }
  if (/<\?(?:php|=)|\b<script\b|<!ENTITY\b|<!DOCTYPE\b|javascript:/i.test(src)) {
    return { ok: false, reason: 'Plik sitemap.xml zawiera niedozwolone znaczniki.' };
  }
  if (!src.trimStart().startsWith('<?xml') || !src.includes('<urlset') || !src.includes('<loc>')) {
    return { ok: false, reason: 'Plik sitemap.xml nie ma poprawnej struktury XML Sitemaps.' };
  }
  if (/<loc>[^<]*\/panel(?:\/|<)/i.test(src)) {
    return { ok: false, reason: 'Plik sitemap.xml nie może zawierać ścieżki /panel/.' };
  }
  return { ok: true };
}

/**
 * Waliduje zawartość robots.txt (gwarantuje, że nie da się wyindeksować całej strony ani odsłonić /panel/).
 */
export function validateSafeRobotsTxt(txt) {
  const src = String(txt ?? '');
  if (!src.trim()) {
    return { ok: false, reason: 'Plik robots.txt nie może być pusty.' };
  }
  if (/<\?(?:php|=)|<script\b/i.test(src)) {
    return { ok: false, reason: 'Plik robots.txt zawiera niedozwolony kod.' };
  }
  // Bezwzględny zakaz "Disallow: /" na końcu linii — chroni przed przypadkowym wyindeksowaniem całej witryny!
  if (/^\s*Disallow\s*:\s*\/\s*$/im.test(src)) {
    return {
      ok: false,
      reason: 'Zablokowano niebezpieczną regułę „Disallow: /” w robots.txt (wyindeksowałaby całą witrynę z Google).',
    };
  }
  if (!/^\s*Disallow\s*:\s*\/panel\/?\s*$/im.test(src)) {
    return {
      ok: false,
      reason: 'Plik robots.txt musi zawierać regułę „Disallow: /panel/”.',
    };
  }
  return { ok: true };
}
