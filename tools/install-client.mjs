#!/usr/bin/env node
/**
 * White-Label CMS Installer CLI (Node.js 18+ ESM, zero zależności npm).
 *
 * Pozwala w jednym poleceniu podpiąć niezmieniony silnik panelu CMS (`panel/`
 * + pakiet bezpieczeństwa PHP pod cyber_Folks / hosting współdzielony) do
 * dowolnej statycznej strony klienta oraz wygenerować `assets/cms-manifest.json`,
 * `assets/site-globals.json`, `panel/site-profile.js` i `panel/config.js`.
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const SOURCE_ROOT = path.resolve(__dirname, '..');

const PANEL_ENGINE_FILES = Object.freeze([
  'index.html',
  'panel.css',
  'preview.css',
  'editor.js',
  'canvas.js',
  'templates.js',
  'storage.js',
  'publish.js',
  'ai-agent.js',
  'ai-prompt.js',
  'sanitizer.js',
  'seo.js',
]);

const PANEL_ENGINE_DIRS = Object.freeze(['ai-recipes']);

const HOSTING_SECURITY_FILES = Object.freeze([
  { src: '_common.php', dest: 'panel/_common.php' },
  { src: 'auth.php', dest: 'panel/auth.php' },
  { src: 'api.php', dest: 'panel/api.php' },
  { src: 'ai-proxy.php', dest: 'panel/ai-proxy.php' },
  { src: 'backups.php', dest: 'panel/backups.php' },
  { src: 'panel.htaccess', dest: 'panel/.htaccess' },
  { src: 'uploads.htaccess', dest: 'img/uploads/.htaccess' },
]);

const CONFIG_EXAMPLE_CANDIDATES = Object.freeze([
  'wolbud-editor-config.example.php',
  'cms-editor-config.example.php',
]);

const IGNORED_SCAN_DIRS = new Set([
  'panel',
  'node_modules',
  'tools',
  '.git',
  '.github',
  '.vscode',
  '.idea',
  '.cms-original-backup',
  '.cms-backups',
]);

const IGNORED_BACKUP_DIRS = new Set([
  '.git',
  'node_modules',
  '.cms-original-backup',
  '.cms-backups',
]);

const IMAGE_ROOT_CANDIDATES = Object.freeze(['img', 'images', 'assets/img']);
const IMAGE_EXTENSIONS = new Set(['.webp', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.avif']);

const VALUE_OPTIONS = new Set([
  'target',
  'brand',
  'company',
  'industry',
  'locations',
  'support-name',
  'support-phone',
  'support-email',
  'mode',
  'repo',
  'branch',
  'accent-color',
  'accent-light',
]);

const BOOLEAN_OPTIONS = new Set([
  'scan-only',
  'create-backup',
  'force-globals',
  'help',
]);

// ============================================================================
// POMOCNIKI TEKSTOWE I ŚCIEŻEK
// ============================================================================

function toPosixPath(filePath) {
  return String(filePath || '').split(path.sep).join('/').replace(/^\/+/, '');
}

function normalizeWhitespace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function decodeHtmlEntities(input) {
  if (!input) return '';
  const named = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    ndash: '–',
    mdash: '—',
    bdquo: '„',
    rdquo: '”',
    ldquo: '“',
    laquo: '«',
    raquo: '»',
    hellip: '…',
    copy: '©',
    middot: '·',
  };

  return String(input).replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (full, entity) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const cp = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : full;
    }
    if (entity.startsWith('#')) {
      const cp = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : full;
    }
    const lower = entity.toLowerCase();
    return Object.prototype.hasOwnProperty.call(named, lower) ? named[lower] : full;
  });
}

function stripTags(html) {
  return normalizeWhitespace(decodeHtmlEntities(String(html || '').replace(/<[^>]*>/g, ' ')));
}

function humanizeSlug(raw) {
  const cleaned = String(raw || '')
    .replace(/\/index\.html?$/i, '')
    .replace(/\.html?$/i, '')
    .split('/')
    .filter(Boolean)
    .map((part) => part.replace(/[-_]+/g, ' ').trim())
    .filter(Boolean)
    .join(' / ');

  if (!cleaned) return 'Strona';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function normalizePhoneHref(phoneDisplay) {
  const raw = String(phoneDisplay || '').trim();
  if (!raw) return 'tel:+48000000000';
  if (/^tel:/i.test(raw)) return raw;
  const digits = raw.replace(/[^\d+]/g, '');
  if (!digits) return 'tel:+48000000000';
  if (digits.startsWith('+')) return `tel:${digits}`;
  if (digits.startsWith('00')) return `tel:+${digits.slice(2)}`;
  if (/^\d{9}$/.test(digits)) return `tel:+48${digits}`;
  return `tel:${digits}`;
}

function cleanTitleToLabel(title) {
  const t = normalizeWhitespace(title);
  if (!t) return '';
  const parts = t.split(/\s*[|–—]\s*|\s+-\s+/);
  return normalizeWhitespace(parts[0] || t);
}

function inferBrandFromTitle(title) {
  const t = normalizeWhitespace(title);
  if (!t) return '';
  const parts = t.split(/\s*[|]\s*/);
  if (parts.length > 1) {
    return normalizeWhitespace(parts[parts.length - 1]);
  }
  return '';
}

function normalizeLocalHref(rawHref) {
  const href = String(rawHref || '').trim();
  if (!href) return null;
  if (/^(https?:|mailto:|tel:|javascript:|data:|#)/i.test(href)) return null;

  const noQuery = href.split('#')[0].split('?')[0].trim();
  if (!noQuery || noQuery === '.' || noQuery === './' || noQuery === '/') {
    return 'index.html';
  }

  let cleaned = noQuery.replace(/^(\.\/|\/)+/, '');
  if (!cleaned) return 'index.html';
  if (cleaned.startsWith('panel/') || cleaned === 'panel') return null;

  if (cleaned.endsWith('/')) {
    cleaned += 'index.html';
  } else if (!/\.html?$/i.test(cleaned)) {
    cleaned += '/index.html';
  }

  if (cleaned.includes('..')) return null;
  return cleaned;
}

function normalizeAssetPath(rawSrc) {
  const src = String(rawSrc || '').trim();
  if (!src) return '';
  if (/^(https?:|data:|blob:)/i.test(src)) return src;
  return src
    .split('#')[0]
    .split('?')[0]
    .replace(/^(\.\.\/)+/, '')
    .replace(/^(\.\/|\/)+/, '');
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(targetPath) {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

// ============================================================================
// POMOC CLI (--help) I PARSER ARGUMENTÓW
// ============================================================================

export function formatHelpMessage() {
  return `
╔══════════════════════════════════════════════════════════════════════════╗
║   White-Label CMS Installer — Uniwersalny instalator panelu CMS CLI     ║
╚══════════════════════════════════════════════════════════════════════════╝

Podpina niezmieniony silnik panelu CMS (panel/ + pakiet bezpieczeństwa PHP
dla hostingu cyber_Folks lub tryb GitHub Pages) do dowolnej statycznej strony
klienta w jednym poleceniu — bez przepisywania panelu od nowa.

UŻYCIE:
  node tools/install-client.mjs --target <ścieżka> [opcje]

WYMAGANE / GŁÓWNE OPCJE:
  --target <ścieżka>          Katalog główny strony klienta (np. ../strona-klienta
                              lub "." dla bieżącego katalogu).
  --mode <hosting|github>     Tryb publikacji (domyślnie: hosting — pod cyber_Folks).
  --repo <owner/repo>         Repozytorium GitHub (wymagane wyłącznie dla --mode github).
  --branch <gałąź>            Gałąź GitHub (domyślnie: main).

DANE KLIENTA I BRANDING (wpisywane do panel/site-profile.js):
  --brand "<Nazwa>"           Krótka nazwa marki klienta (np. "Dach-Bud Kowalski").
  --company "<Pełna nazwa>"   Pełna nazwa firmy klienta.
  --industry "<Branża>"       Opis branży i oferty dla Asystenta AI.
  --locations "<Lokalizacje>" Miasta / adresy siedziby lub salonów firmy.
  --accent-color "<#hex>"     Główny kolor akcentu panelu (domyślnie: #2c4d19).
  --accent-light "<#hex>"     Jaśniejszy kolor akcentu (domyślnie: #426728).

DANE WSPARCIA TECHNICZNEGO (przycisk „Zadzwoń do mnie” w panelu):
  --support-name "<Nazwa>"    Twoje imię / nazwa agencji.
  --support-phone "<Telefon>" Twój numer telefonu wsparcia (np. "+48 600 123 456").
  --support-email "<Email>"   Twój adres e-mail wsparcia.

TRYBY SPECJALNE:
  --scan-only                 Odświeża wyłącznie assets/cms-manifest.json na
                              istniejącej stronie bez nadpisywania panelu,
                              site-profile.js ani config.js.
  --create-backup             Tworzy lokalną kopię oryginalną strony w
                              <target>/.cms-original-backup/ przed instalacją.
  --force-globals             Wymusza ponowne wygenerowanie assets/site-globals.json
                              nawet jeśli plik już istnieje.
  --help, -h                  Wyświetla tę instrukcję.

PRZYKŁADY UŻYCIA:

  1) Pełna instalacja pod cyber_Folks (zalecane, domyślny tryb hosting):
     node tools/install-client.mjs \\
       --target "../dach-bud-kowalski" \\
       --brand "Dach-Bud" \\
       --company "Dach-Bud Jan Kowalski" \\
       --industry "pokrycia dachowe, więźby, blachodachówka, rynny i obróbki blacharskie" \\
       --locations "Tarnów, ul. Przemysłowa 12" \\
       --support-name "Studio Web · Wsparcie" \\
       --support-phone "+48 600 123 456" \\
       --support-email "pomoc@twoja-agencja.pl" \\
       --create-backup

  2) Instalacja w trybie GitHub Pages:
     node tools/install-client.mjs \\
       --target "../klient-gh" \\
       --mode github \\
       --repo "twoje-konto/klient-strona" \\
       --brand "Studio Fryzur Anna" \\
       --industry "usługi fryzjerskie, koloryzacja i pielęgnacja włosów" \\
       --locations "Kraków, ul. Długa 8"

  3) Odświeżenie samego manifestu po ręcznym dodaniu podstron lub zdjęć:
     node tools/install-client.mjs --target "." --scan-only
`.trim();
}

export function parseCliArgs(argv) {
  const options = {
    target: '',
    brand: '',
    company: '',
    industry: '',
    locations: '',
    supportName: '',
    supportPhone: '',
    supportEmail: '',
    mode: 'hosting',
    repo: '',
    branch: 'main',
    accentColor: '#2c4d19',
    accentLight: '#426728',
    scanOnly: false,
    createBackup: false,
    forceGlobals: false,
    help: false,
  };

  const mapKey = (flag) => {
    switch (flag) {
      case 'target':
      case 't':
        return 'target';
      case 'brand':
        return 'brand';
      case 'company':
        return 'company';
      case 'industry':
        return 'industry';
      case 'locations':
        return 'locations';
      case 'support-name':
        return 'supportName';
      case 'support-phone':
        return 'supportPhone';
      case 'support-email':
        return 'supportEmail';
      case 'mode':
        return 'mode';
      case 'repo':
        return 'repo';
      case 'branch':
        return 'branch';
      case 'accent-color':
        return 'accentColor';
      case 'accent-light':
        return 'accentLight';
      case 'scan-only':
        return 'scanOnly';
      case 'create-backup':
        return 'createBackup';
      case 'force-globals':
        return 'forceGlobals';
      case 'help':
      case 'h':
        return 'help';
      default:
        return null;
    }
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token) continue;

    if (token === '-h' || token === '--help') {
      options.help = true;
      continue;
    }

    if (token === '-t') {
      const nextVal = argv[i + 1];
      if (!nextVal || nextVal.startsWith('-')) {
        throw new Error('Brak wartości dla parametru -t / --target.');
      }
      options.target = nextVal;
      i += 1;
      continue;
    }

    if (!token.startsWith('--')) {
      throw new Error(
        `Nieznany argument pozycyjny: „${token}”. Użyj nazwanych flag (np. --target <ścieżka>) lub sprawdź --help.`,
      );
    }

    const eqIndex = token.indexOf('=');
    const rawFlag = eqIndex === -1 ? token.slice(2) : token.slice(2, eqIndex);
    const inlineValue = eqIndex === -1 ? null : token.slice(eqIndex + 1);

    if (BOOLEAN_OPTIONS.has(rawFlag)) {
      if (inlineValue !== null) {
        const lower = inlineValue.toLowerCase();
        options[mapKey(rawFlag)] = lower === 'true' || lower === '1' || lower === 'yes';
      } else {
        options[mapKey(rawFlag)] = true;
      }
      continue;
    }

    if (VALUE_OPTIONS.has(rawFlag)) {
      let val = inlineValue;
      if (val === null) {
        const nextVal = argv[i + 1];
        if (nextVal === undefined || nextVal.startsWith('--')) {
          throw new Error(`Brak wartości dla parametru --${rawFlag}.`);
        }
        val = nextVal;
        i += 1;
      }
      options[mapKey(rawFlag)] = val;
      continue;
    }

    throw new Error(`Nieznana opcja: „--${rawFlag}”. Uruchom z --help, aby zobaczyć dostępne opcje.`);
  }

  return options;
}

// ============================================================================
// SKANOWANIE STRONY KLIENTA (HTML + OBRAZY + GLOBALNE DANE)
// ============================================================================

function parseHtmlMetadata(html, relPath) {
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? normalizeWhitespace(decodeHtmlEntities(titleMatch[1])) : '';

  let description = '';
  const metaTagRegex = /<meta\b[^>]*>/gi;
  let metaMatch;
  while ((metaMatch = metaTagRegex.exec(html)) !== null) {
    const tag = metaMatch[0];
    if (/\bname\s*=\s*["']description["']/i.test(tag)) {
      const contentMatch = tag.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
      if (contentMatch) {
        description = normalizeWhitespace(decodeHtmlEntities(contentMatch[1] ?? contentMatch[2] ?? ''));
        break;
      }
    }
  }

  const h1Match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const h1 = h1Match ? stripTags(h1Match[1]) : '';

  const hasMetaRefresh = /<meta\b[^>]*http-equiv\s*=\s*["']refresh["'][^>]*>/i.test(html);
  const isRedirect = hasMetaRefresh || /strona przeniesiona|przekierowanie/i.test(title);

  const segments = relPath.split('/');
  let group = 'glowne';
  if (relPath === 'index.html') {
    group = 'home';
  } else if (segments.length === 1) {
    group = 'glowne';
  } else if (segments.length === 2 && segments[1].toLowerCase() === 'index.html') {
    const top = segments[0].toLowerCase();
    if (['kategorie', 'produkty', 'promocje', 'blog', 'aktualnosci'].includes(top)) {
      group = top;
    } else {
      group = 'glowne';
    }
  } else {
    group = segments[0].toLowerCase();
  }

  let label = '';
  if (relPath === 'index.html') {
    label = 'Strona główna';
  } else if (isRedirect) {
    const slugTail = segments.length > 1 ? segments.slice(1).join('/') : relPath;
    label = `${humanizeSlug(slugTail)} (przekierowanie)`;
  } else if (h1 && h1.length <= 90) {
    label = h1;
  } else if (title) {
    label = cleanTitleToLabel(title) || humanizeSlug(relPath);
  } else {
    label = humanizeSlug(relPath);
  }

  const entry = {
    path: relPath,
    label,
    title: title || label,
    description,
    group,
  };
  if (isRedirect) {
    entry.redirect = true;
  }
  return entry;
}

async function walkHtmlFiles(rootDir, currentDir, results) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isSymbolicLink()) continue;

    if (entry.isDirectory()) {
      const lower = entry.name.toLowerCase();
      if (lower.startsWith('.') || IGNORED_SCAN_DIRS.has(lower)) continue;
      await walkHtmlFiles(rootDir, fullPath, results);
      continue;
    }

    if (entry.isFile() && /\.html$/i.test(entry.name)) {
      const relPath = toPosixPath(path.relative(rootDir, fullPath));
      results.push({ fullPath, relPath });
    }
  }
}

async function walkImageFiles(rootDir, imgRootDir, currentDir, seenPaths, results) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isSymbolicLink()) continue;

    if (entry.isDirectory()) {
      if (entry.name.startsWith('.')) continue;
      await walkImageFiles(rootDir, imgRootDir, fullPath, seenPaths, results);
      continue;
    }

    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) continue;

    const relFromSite = toPosixPath(path.relative(rootDir, fullPath));
    if (seenPaths.has(relFromSite)) continue;
    seenPaths.add(relFromSite);

    const relFromImgRoot = toPosixPath(path.relative(imgRootDir, fullPath));
    const parts = relFromImgRoot.split('/');
    const folder = parts.length > 1 ? parts[0] : 'root';
    const isThumb = folder.toLowerCase() === 'thumbs' || /(?:^|[-_])thumb|-\d+x\d+\./i.test(entry.name);

    results.push({
      path: relFromSite,
      folder,
      name: entry.name,
      thumb: isThumb,
    });
  }
}

export async function scanSite(targetDir) {
  const htmlFiles = [];
  await walkHtmlFiles(targetDir, targetDir, htmlFiles);

  const pages = [];
  for (const item of htmlFiles) {
    const content = await fs.readFile(item.fullPath, 'utf8');
    pages.push(parseHtmlMetadata(content, item.relPath));
  }

  const groupPriority = (group) => {
    if (group === 'home') return 0;
    if (group === 'glowne') return 1;
    if (group === 'promocje') return 2;
    if (group === 'kategorie') return 3;
    if (group === 'produkty') return 4;
    return 5;
  };

  pages.sort((a, b) => {
    const gpDiff = groupPriority(a.group) - groupPriority(b.group);
    if (gpDiff !== 0) return gpDiff;
    if (a.group !== b.group) return a.group.localeCompare(b.group, 'pl');
    const redirDiff = Number(Boolean(a.redirect)) - Number(Boolean(b.redirect));
    if (redirDiff !== 0) return redirDiff;
    return a.label.localeCompare(b.label, 'pl') || a.path.localeCompare(b.path, 'pl');
  });

  const seenImages = new Set();
  const images = [];
  for (const relCandidate of IMAGE_ROOT_CANDIDATES) {
    const candidateDir = path.join(targetDir, ...relCandidate.split('/'));
    if (await isDirectory(candidateDir)) {
      await walkImageFiles(targetDir, candidateDir, candidateDir, seenImages, images);
    }
  }

  images.sort((a, b) => a.path.localeCompare(b.path, 'pl'));

  const manifest = {
    version: 2,
    revision: crypto.randomUUID(),
    generatedAt: new Date().toISOString(),
    pages,
    images,
  };

  return manifest;
}

export function extractGlobalsFromHtml(indexHtml, manifest, options = {}) {
  const html = String(indexHtml || '');
  const brand = options.brand || inferBrandFromTitle(manifest.pages?.[0]?.title) || 'Twoja Firma';
  const company = options.company || brand;
  const locations = options.locations || '';

  // 1. Telefon
  let phoneHref = '';
  let phoneDisplay = '';
  const telAnchorMatch = html.match(/<a\b[^>]*href\s*=\s*["'](tel:[^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
  if (telAnchorMatch) {
    phoneHref = decodeHtmlEntities(telAnchorMatch[1]).replace(/\s+/g, '');
    const innerText = stripTags(telAnchorMatch[2]);
    if (/\d{3}/.test(innerText)) {
      phoneDisplay = innerText;
    } else {
      phoneDisplay = phoneHref.replace(/^tel:/i, '').replace(/^\+48/, '').trim();
    }
  } else {
    const rawTelMatch = html.match(/href\s*=\s*["'](tel:[^"']+)["']/i);
    if (rawTelMatch) {
      phoneHref = decodeHtmlEntities(rawTelMatch[1]).replace(/\s+/g, '');
      phoneDisplay = phoneHref.replace(/^tel:/i, '').trim();
    } else {
      const textPhoneMatch = html.match(/(?:\+48[\s-]?)?\b\d{3}[\s-]\d{3}[\s-]\d{3}\b/);
      if (textPhoneMatch) {
        phoneDisplay = normalizeWhitespace(textPhoneMatch[0]);
        phoneHref = normalizePhoneHref(phoneDisplay);
      }
    }
  }

  // 2. E-mail
  let email = '';
  const mailtoMatch = html.match(/href\s*=\s*["']mailto:([^"'?\s>]+)["']/i);
  if (mailtoMatch) {
    email = decodeHtmlEntities(mailtoMatch[1]).trim();
  } else {
    const emailRegexMatch = html.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
    if (emailRegexMatch) {
      email = emailRegexMatch[0];
    }
  }

  // 3. Facebook
  let facebookUrl = '';
  let facebookLabel = '';
  const fbMatch = html.match(/https?:\/\/(?:www\.)?(?:facebook\.com|fb\.com)\/[A-Za-z0-9._/?=&%-]+/i);
  if (fbMatch) {
    facebookUrl = fbMatch[0].replace(/[),.;]+$/, '');
    facebookLabel = facebookUrl.replace(/^https?:\/\/(?:www\.)?/i, '').replace(/\/+$/, '');
  }

  // 4. Logo i favicon
  let logoSrc = '';
  let logoAlt = brand;
  const headerSegmentMatch = html.match(/<header\b[^>]*>[\s\S]*?<\/header>/i);
  const logoSearchScope = headerSegmentMatch ? headerSegmentMatch[0] : html;
  const imgTagRegex = /<img\b[^>]*>/gi;
  let imgMatch;
  while ((imgMatch = imgTagRegex.exec(logoSearchScope)) !== null) {
    const tag = imgMatch[0];
    const srcMatch = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    if (!srcMatch) continue;
    const altMatch = tag.match(/\balt\s*=\s*["']([^"']*)["']/i);
    const isLikelyLogo = /logo|brand/i.test(tag) || Boolean(headerSegmentMatch);
    if (isLikelyLogo) {
      logoSrc = normalizeAssetPath(decodeHtmlEntities(srcMatch[1]));
      if (altMatch && altMatch[1].trim()) {
        logoAlt = normalizeWhitespace(decodeHtmlEntities(altMatch[1]));
      }
      break;
    }
  }

  if (!logoSrc && Array.isArray(manifest.images)) {
    const logoImage = manifest.images.find((img) => /logo/i.test(img.name));
    if (logoImage) {
      logoSrc = logoImage.path;
    }
  }

  let faviconSrc = '';
  const faviconMatch = html.match(/<link\b[^>]*rel\s*=\s*["'][^"']*icon[^"']*["'][^>]*>/i);
  if (faviconMatch) {
    const hrefMatch = faviconMatch[0].match(/\bhref\s*=\s*["']([^"']+)["']/i);
    if (hrefMatch) {
      faviconSrc = normalizeAssetPath(decodeHtmlEntities(hrefMatch[1]));
    }
  }
  if (!faviconSrc && Array.isArray(manifest.images)) {
    const favImage = manifest.images.find((img) => /favicon/i.test(img.name));
    if (favImage) {
      faviconSrc = favImage.path;
    }
  }

  // 5. Menu z <nav> / <header> lub z wykrytych stron głównych
  const menu = [];
  const seenMenuHref = new Set();
  const navMatch = html.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/i) || headerSegmentMatch;
  if (navMatch) {
    const anchorRegex = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let aMatch;
    while ((aMatch = anchorRegex.exec(navMatch[0])) !== null) {
      const href = normalizeLocalHref(decodeHtmlEntities(aMatch[1]));
      const label = stripTags(aMatch[2]);
      if (!href || !label || label.length > 48 || seenMenuHref.has(href)) continue;
      seenMenuHref.add(href);
      menu.push({ label, href, mobileHref: href });
      if (menu.length >= 10) break;
    }
  }

  if (menu.length === 0 && Array.isArray(manifest.pages)) {
    for (const page of manifest.pages) {
      if (page.redirect) continue;
      if (page.group !== 'home' && page.group !== 'glowne') continue;
      if (seenMenuHref.has(page.path)) continue;
      seenMenuHref.add(page.path);
      menu.push({ label: page.label, href: page.path, mobileHref: page.path });
      if (menu.length >= 8) break;
    }
  }

  const footerLinks = menu
    .filter((item) => item.href !== 'index.html')
    .map((item) => ({ label: item.label, href: item.href }));

  const footerParts = [company];
  if (locations) footerParts.push(locations);
  const footerCopy = `${footerParts.join(' · ')} · `;

  return {
    globals: {
      version: 1,
      phoneDisplay,
      phoneHref,
      email,
      facebookUrl,
      facebookLabel,
      logoSrc,
      logoAlt,
      menu,
      footerLinks,
      footerCopy,
    },
    detected: {
      logoSrc,
      faviconSrc,
      phoneDisplay,
      email,
    },
  };
}

// ============================================================================
// GENERATORY PLIKÓW KONFIGURACJI KLIENTA (site-profile.js & config.js)
// ============================================================================

export function generateSiteProfileCode({
  brandName,
  companyFullName,
  industry,
  locations,
  logoSrc,
  faviconSrc,
  accentColor,
  accentLight,
  protectedPages,
  supportName,
  supportPhoneDisplay,
  supportPhoneHref,
  supportEmail,
  contactPhone,
  contactEmail,
}) {
  const safeBrand = brandName || 'Twoja Firma';
  const safeCompany = companyFullName || safeBrand;
  const safeIndustry = industry || 'usługi i oferta prezentowana na stronie internetowej';
  const safeLocations = locations || 'Polska (uzupełnij lokalizację w panel/site-profile.js)';
  const safeSupportName = supportName || 'Twórca strony · Wsparcie techniczne';
  const safeSupportPhoneDisplay =
    supportPhoneDisplay || '+48 000 000 000 (uzupełnij w panel/site-profile.js)';
  const safeSupportPhoneHref = supportPhoneDisplay
    ? supportPhoneHref || normalizePhoneHref(supportPhoneDisplay)
    : 'tel:+48000000000';
  const safeSupportEmail = supportEmail || 'pomoc@twojadomena.pl';

  const contactBits = [];
  if (contactPhone) contactBits.push(`tel. ${contactPhone}`);
  if (contactEmail) contactBits.push(`e-mail ${contactEmail}`);
  const contactSentence =
    contactBits.length > 0 ? ` Kontakt główny: ${contactBits.join(', ')}.` : '';

  const aiBusinessContext =
    `${safeCompany} działa w obszarze: ${safeIndustry}. ` +
    `Lokalizacja / obszar działania: ${safeLocations}.${contactSentence} ` +
    `Ton komunikacji: konkretny, rzetelny, fachowy i przyjazny — bez pustego marketingowego żargonu, z jasnym wezwaniem do kontaktu.`;

  const aiSuggestions = [
    `Popraw teksty na stronie głównej ${safeBrand}, aby wyraźniej podkreślały kluczowe korzyści i zachęcały do kontaktu`,
    `Utwórz nową podstronę z ofertą promocyjną dopasowaną do branży (${safeIndustry.slice(0, 60)})`,
    'Dodaj sekcję FAQ z najczęstszymi pytaniami klientów o wycenę, terminy i przebieg realizacji',
    'Sprawdź i zaktualizuj dane kontaktowe, godziny pracy oraz linki w menu i stopce',
  ];

  const uniqueProtected = Array.from(new Set(['index.html', ...(protectedPages || [])]));

  return `/**
 * White-Label Site Profile — jedyny plik konfiguracyjny zmieniany per klient.
 * Wygenerowany automatycznie przez tools/install-client.mjs.
 * Zawiera branding panelu, listę chronionych stron, dane wsparcia technicznego
 * oraz kontekst biznesowy dla Asystenta AI.
 */
export const siteProfile = Object.freeze({
  brandName: ${JSON.stringify(safeBrand)},
  studioTitle: ${JSON.stringify(`${safeBrand} Studio`)},
  companyFullName: ${JSON.stringify(safeCompany)},
  industry: ${JSON.stringify(safeIndustry)},
  locations: ${JSON.stringify(safeLocations)},
  foundedYear: null,
  logoSrc: ${JSON.stringify(logoSrc || '')},
  faviconSrc: ${JSON.stringify(faviconSrc || '')},
  accentColor: ${JSON.stringify(accentColor || '#2c4d19')},
  accentLight: ${JSON.stringify(accentLight || '#426728')},
  baselineCommitSha: '',
  protectedPages: Object.freeze(${JSON.stringify(uniqueProtected, null, 4).replace(/\n/g, '\n  ')}),
  support: Object.freeze({
    name: ${JSON.stringify(safeSupportName)},
    role: 'Pomoc z panelem, kopie zapasowe i awarie',
    phoneDisplay: ${JSON.stringify(safeSupportPhoneDisplay)},
    phoneHref: ${JSON.stringify(safeSupportPhoneHref)},
    email: ${JSON.stringify(safeSupportEmail)},
    hours: 'Pon.–Pt. 09:00–17:00',
    note: 'Coś nie działa albo obawiasz się, że popsułeś układ? Zadzwoń lub napisz — zawsze mamy bezpieczną oryginalną kopię zapasową Twojej strony.',
  }),
  aiBusinessContext: ${JSON.stringify(aiBusinessContext)},
  aiSuggestions: Object.freeze(${JSON.stringify(aiSuggestions, null, 4).replace(/\n/g, '\n  ')}),
});
`;
}

export function generateConfigCode({ mode = 'hosting', repository = '', branch = 'main' }) {
  const normalizedMode = mode === 'github' ? 'github' : 'hosting';
  const requireLogin = normalizedMode === 'hosting';

  return `export const config = Object.freeze({
  mode: ${JSON.stringify(normalizedMode)}, // 'github' | 'hosting'
  requireLogin: ${requireLogin}, // true na hostingu PHP (cyber_Folks), false dla GitHub Pages
  repository: ${JSON.stringify(repository || '')},
  branch: ${JSON.stringify(branch || 'main')},
  apiEndpoint: './api.php',
  authEndpoint: './auth.php',
  backupsEndpoint: './backups.php',
  aiProxyEndpoint: './ai-proxy.php',
});
`;
}

// ============================================================================
// KOPIOWANIE PLIKÓW I BACKUP
// ============================================================================

async function copyFileSafe(srcPath, destPath) {
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.copyFile(srcPath, destPath);
}

async function copyDirectoryRecursive(srcDir, destDir, ignoredTopDirs = new Set()) {
  await fs.mkdir(destDir, { recursive: true });
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  let count = 0;

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    if (ignoredTopDirs.has(entry.name)) continue;

    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      count += await copyDirectoryRecursive(srcPath, destPath, new Set());
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath);
      count += 1;
    }
  }
  return count;
}

async function createOriginalBackup(targetDir) {
  const backupDir = path.join(targetDir, '.cms-original-backup');
  if (await pathExists(backupDir)) {
    return { created: false, backupDir, fileCount: 0, alreadyExists: true };
  }
  const fileCount = await copyDirectoryRecursive(targetDir, backupDir, IGNORED_BACKUP_DIRS);
  return { created: true, backupDir, fileCount, alreadyExists: false };
}

// ============================================================================
// GŁÓWNA PROCEDURA INSTALACJI
// ============================================================================

export async function installClient(options) {
  const mode = String(options.mode || 'hosting').trim().toLowerCase();
  if (mode !== 'hosting' && mode !== 'github') {
    throw new Error(`Nieprawidłowa wartość --mode „${options.mode}”. Dozwolone: hosting | github.`);
  }

  let targetRaw = options.target;
  if (!targetRaw) {
    if (options.scanOnly) {
      targetRaw = process.cwd();
    } else {
      throw new Error(
        'Nie podano katalogu docelowego (--target <ścieżka>). Użyj np. --target "../strona-klienta" albo --target "." dla bieżącego katalogu. Pełna instrukcja: --help.',
      );
    }
  }

  const targetDir = path.resolve(targetRaw);
  if (!(await isDirectory(targetDir))) {
    throw new Error(`Katalog docelowy nie istnieje lub nie jest katalogiem: ${targetDir}`);
  }

  const normalizedSource = path.resolve(SOURCE_ROOT);
  const sameAsSource =
    process.platform === 'win32'
      ? targetDir.toLowerCase() === normalizedSource.toLowerCase()
      : targetDir === normalizedSource;

  if (sameAsSource && !options.scanOnly) {
    throw new Error(
      'Katalog docelowy wskazuje bezpośrednio na główne repozytorium szablonu CMS. ' +
        'Aby odświeżyć sam manifest w tym katalogu użyj flagi --scan-only, a do instalacji u klienta wskaż inny katalog (--target ../klient).',
    );
  }

  if (!options.scanOnly && mode === 'github') {
    const repo = String(options.repo || '').trim();
    if (!repo || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
      throw new Error(
        'W trybie --mode github wymagany jest poprawny parametr --repo "<owner/repo>" (np. --repo "moje-konto/strona-klienta").',
      );
    }
  }

  const summary = {
    targetDir,
    mode,
    scanOnly: Boolean(options.scanOnly),
    backup: null,
    copiedPanelFiles: [],
    missingPanelFiles: [],
    copiedHostingFiles: [],
    missingHostingFiles: [],
    configExamplePath: null,
    manifestPath: path.join(targetDir, 'assets', 'cms-manifest.json'),
    globalsPath: path.join(targetDir, 'assets', 'site-globals.json'),
    globalsCreated: false,
    profilePath: path.join(targetDir, 'panel', 'site-profile.js'),
    configPath: path.join(targetDir, 'panel', 'config.js'),
    manifest: null,
    warnings: [],
  };

  // 0. Opcjonalna kopia oryginalna
  if (options.createBackup) {
    summary.backup = await createOriginalBackup(targetDir);
  }

  // 1. Skanowanie strony klienta (HTML + obrazy)
  const manifest = await scanSite(targetDir);
  summary.manifest = manifest;

  await fs.mkdir(path.join(targetDir, 'assets'), { recursive: true });
  await fs.writeFile(summary.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  // 2. Odczyt index.html do automatycznego wykrycia telefonu/emaila/logo/menu
  const indexHtmlPath = path.join(targetDir, 'index.html');
  const indexHtml = (await pathExists(indexHtmlPath)) ? await fs.readFile(indexHtmlPath, 'utf8') : '';

  const fallbackBrand =
    options.brand ||
    inferBrandFromTitle(manifest.pages?.[0]?.title) ||
    humanizeSlug(path.basename(targetDir));

  const extracted = extractGlobalsFromHtml(indexHtml, manifest, {
    brand: fallbackBrand,
    company: options.company || fallbackBrand,
    locations: options.locations || '',
  });

  const globalsAlreadyExist = await pathExists(summary.globalsPath);
  if (!globalsAlreadyExist || options.forceGlobals) {
    await fs.writeFile(
      summary.globalsPath,
      `${JSON.stringify(extracted.globals, null, 2)}\n`,
      'utf8',
    );
    summary.globalsCreated = true;
  }

  // Tryb --scan-only kończy pracę tutaj (nie dotyka panel/, site-profile.js ani config.js)
  if (options.scanOnly) {
    return summary;
  }

  // 3. Kopiowanie niezmienionego silnika panelu (panel/)
  const srcPanelDir = path.join(SOURCE_ROOT, 'panel');
  const destPanelDir = path.join(targetDir, 'panel');
  await fs.mkdir(destPanelDir, { recursive: true });

  for (const filename of PANEL_ENGINE_FILES) {
    const srcFile = path.join(srcPanelDir, filename);
    const destFile = path.join(destPanelDir, filename);
    if (await pathExists(srcFile)) {
      await copyFileSafe(srcFile, destFile);
      summary.copiedPanelFiles.push(`panel/${filename}`);
    } else {
      summary.missingPanelFiles.push(`panel/${filename}`);
      summary.warnings.push(`Brak pliku źródłowego panel/${filename} w repozytorium szablonu.`);
    }
  }

  // Przepisy Asystenta AI (katalog panel/ai-recipes/: łańcuchy zmian, wiedza o stronie, cofanie)
  for (const dir of PANEL_ENGINE_DIRS) {
    const srcDir = path.join(srcPanelDir, dir);
    if (await isDirectory(srcDir)) {
      await copyDirectoryRecursive(srcDir, path.join(destPanelDir, dir));
      summary.copiedPanelFiles.push(`panel/${dir}/`);
    } else {
      summary.warnings.push(`Brak katalogu źródłowego panel/${dir} w repozytorium szablonu.`);
    }
  }

  // 4. Gdy --mode hosting: kopiowanie kompletnego pakietu bezpieczeństwa PHP
  if (mode === 'hosting') {
    const srcHostingDir = path.join(SOURCE_ROOT, '.github', 'hosting');
    await fs.mkdir(path.join(targetDir, 'img', 'uploads'), { recursive: true });

    for (const item of HOSTING_SECURITY_FILES) {
      const srcFile = path.join(srcHostingDir, item.src);
      const destFile = path.join(targetDir, ...item.dest.split('/'));
      if (await pathExists(srcFile)) {
        await copyFileSafe(srcFile, destFile);
        summary.copiedHostingFiles.push(item.dest);
      } else {
        summary.missingHostingFiles.push(`.github/hosting/${item.src}`);
        summary.warnings.push(
          `Brak pliku pakietu PHP .github/hosting/${item.src} (pominięto kopiowanie do ${item.dest}).`,
        );
      }
    }

    for (const candidate of CONFIG_EXAMPLE_CANDIDATES) {
      const srcExample = path.join(srcHostingDir, candidate);
      if (await pathExists(srcExample)) {
        const destExample = path.join(targetDir, 'cms-editor-config.example.php');
        await copyFileSafe(srcExample, destExample);
        summary.configExamplePath = destExample;
        break;
      }
    }
  }

  // 5. Wykrycie stron chronionych (index.html + wykryte strony główne)
  const detectedProtected = manifest.pages
    .filter((p) => !p.redirect && (p.group === 'home' || p.group === 'glowne'))
    .map((p) => p.path)
    .slice(0, 15);

  const profileCode = generateSiteProfileCode({
    brandName: fallbackBrand,
    companyFullName: options.company || fallbackBrand,
    industry: options.industry,
    locations: options.locations,
    logoSrc: extracted.detected.logoSrc,
    faviconSrc: extracted.detected.faviconSrc,
    accentColor: options.accentColor,
    accentLight: options.accentLight,
    protectedPages: detectedProtected,
    supportName: options.supportName,
    supportPhoneDisplay: options.supportPhone,
    supportPhoneHref: normalizePhoneHref(options.supportPhone),
    supportEmail: options.supportEmail,
    contactPhone: extracted.detected.phoneDisplay,
    contactEmail: extracted.detected.email,
  });

  const configCode = generateConfigCode({
    mode,
    repository: mode === 'github' ? options.repo : '',
    branch: options.branch || 'main',
  });

  await fs.writeFile(summary.profilePath, profileCode, 'utf8');
  await fs.writeFile(summary.configPath, configCode, 'utf8');

  return summary;
}

// ============================================================================
// RAPORT KOŃCOWY I CHECKLISTA WDROŻENIOWA PO POLSKU
// ============================================================================

function printReport(summary, options) {
  console.log('');
  console.log('====================================================================');
  console.log(
    summary.scanOnly
      ? '  ODŚWIEŻONO MANIFEST CMS (--scan-only)'
      : '  INSTALACJA PANELU WHITE-LABEL CMS ZAKOŃCZONA POMYŚLNIE',
  );
  console.log('====================================================================');
  console.log(`Katalog docelowy : ${summary.targetDir}`);
  if (!summary.scanOnly) {
    console.log(`Tryb publikacji  : ${summary.mode === 'hosting' ? 'hosting (PHP / cyber_Folks)' : `github (${options.repo})`}`);
  }
  console.log(
    `Zeskanowano      : ${summary.manifest.pages.length} stron HTML, ${summary.manifest.images.length} obrazów`,
  );
  console.log(`Nowa rewizja     : ${summary.manifest.revision}`);
  console.log(`Manifest zapisano: ${path.relative(summary.targetDir, summary.manifestPath) || 'assets/cms-manifest.json'}`);

  if (summary.globalsCreated) {
    console.log('Dane globalne    : utworzono assets/site-globals.json (wyciągnięto wstępne dane z index.html)');
  } else {
    console.log('Dane globalne    : zachowano istniejący assets/site-globals.json');
  }

  if (summary.backup) {
    if (summary.backup.alreadyExists) {
      console.log('Kopia oryginalna : już istnieje w .cms-original-backup/ (zachowano bez nadpisywania)');
    } else {
      console.log(`Kopia oryginalna : utworzono w .cms-original-backup/ (${summary.backup.fileCount} plików)`);
    }
  }

  if (!summary.scanOnly) {
    console.log(`Silnik panelu    : skopiowano ${summary.copiedPanelFiles.length}/${PANEL_ENGINE_FILES.length} plików do panel/`);
    console.log('Konfiguracja     : wygenerowano panel/site-profile.js oraz panel/config.js');
    if (summary.mode === 'hosting') {
      console.log(
        `Pakiet PHP       : skopiowano ${summary.copiedHostingFiles.length}/${HOSTING_SECURITY_FILES.length} plików bezpieczeństwa`,
      );
      if (summary.configExamplePath) {
        console.log('Wzór konfiguracji: cms-editor-config.example.php');
      }
    }
  }

  if (summary.warnings.length > 0) {
    console.log('');
    console.log('UWAGI / OSTRZEŻENIA:');
    for (const warn of summary.warnings) {
      console.log(`  [!] ${warn}`);
    }
  }

  if (summary.scanOnly) {
    console.log('');
    console.log('Gotowe! Pliki panel/site-profile.js i panel/config.js pozostały nietknięte.');
    return;
  }

  if (summary.mode === 'hosting') {
    console.log('');
    console.log('--------------------------------------------------------------------');
    console.log('  CHECKLISTA WDROŻENIA NA HOSTING cyber_Folks (PHP 8.1+)');
    console.log('--------------------------------------------------------------------');
    console.log('1. WYGENERUJ HASH SILNEGO HASŁA EDYTORA (Argon2id — zalecane na PHP 8.1+):');
    console.log('   php -r \'echo password_hash("TWOJE_SILNE_HASLO", PASSWORD_ARGON2ID) . PHP_EOL;\'');
    console.log('   (alternatywnie Bcrypt / domyślny algorytm PHP):');
    console.log('   php -r \'echo password_hash("TWOJE_SILNE_HASLO", PASSWORD_DEFAULT) . PHP_EOL;\'');
    console.log('');
    console.log('2. WAŻNE — PRZENIEŚ PLIK KONFIGURACJI POZA public_html/:');
    console.log('   [!] NIE ZOSTAWIAJ pliku cms-editor-config.example.php wewnątrz public_html/!');
    console.log('   Wgraj go POZIOM WYŻEJ niż public_html/ jako /home/<konto>/cms-editor-config.php');
    console.log('   (panel/_common.php obsługuje też starszą nazwę wolbud-editor-config.php),');
    console.log('   wklej wygenerowany hash hasła (oraz opcjonalnie klucz API AI) i ustaw chmod 0600.');
    console.log('   Po skopiowaniu usuń lokalny plik cms-editor-config.example.php z katalogu witryny.');
    console.log('');
    console.log('3. WGRAJ PLIKI STRONY DO public_html/ (FTP / SFTP / SSH):');
    console.log('   - Wszystkie podstrony HTML, assets/ (w tym cms-manifest.json i site-globals.json)');
    console.log('   - Katalog img/ wraz z img/uploads/.htaccess (blokuje wykonywanie PHP w uploadach)');
    console.log('   - Katalog panel/ wraz z panel/.htaccess, _common.php, auth.php, api.php,');
    console.log('     backups.php, ai-proxy.php, site-profile.js i config.js');
    console.log('   - NIE wgrywaj folderu .cms-original-backup/ do public_html/ — zachowaj go bezpiecznie');
    console.log('     poza katalogiem publicznym lub w archiwum agencji.');
    console.log('');
    console.log('4. SPRAWDŹ USTAWIENIA W PANELU cyber_Folks:');
    console.log('   - Włącz certyfikat SSL (HTTPS — wymagane dla bezpiecznych ciasteczek sesji).');
    console.log('   - Upewnij się, że dla domeny wybrano PHP 8.1 lub nowsze (z rozszerzeniami json, curl).');
    console.log('   - Zweryfikuj uprawnienia zapisu PHP w public_html/ oraz katalogu nadrzędnym (kopie/blokady).');
    console.log('');
    console.log('5. PRZETESTUJ DZIAŁANIE PANELU:');
    console.log('   - Otwórz https://<domena-klienta>/panel/ i zaloguj się utworzonym hasłem.');
    console.log('   - Sprawdź przycisk wsparcia („Zadzwoń do mnie”) i dane w panel/site-profile.js.');
    console.log('   - Jeśli skonfigurowano Asystenta AI, zweryfikuj /panel/ai-proxy.php?status=1.');
    console.log('   - Wykonaj drobną testową publikację i sprawdź, czy powstała kopia w Historii kopii.');
  } else {
    console.log('');
    console.log('--------------------------------------------------------------------');
    console.log('  CHECKLISTA WDROŻENIA NA GITHUB PAGES');
    console.log('--------------------------------------------------------------------');
    console.log(`1. Wypchnij pliki z ${summary.targetDir} do repozytorium ${options.repo} (gałąź ${options.branch || 'main'}).`);
    console.log('2. W ustawieniach GitHub repozytorium włącz GitHub Pages (Deploy from a branch).');
    console.log('3. Wygeneruj Fine-Grained Personal Access Token (PAT) wyłącznie dla tego repozytorium');
    console.log('   z uprawnieniem Contents: Read and write.');
    console.log('4. Otwórz panel pod adresem https://<owner>.github.io/<repo>/panel/ i zweryfikuj publikację.');
  }
  console.log('');
}

// ============================================================================
// PUNKT WEJŚCIA CLI
// ============================================================================

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    const resolvedEntry = fsSync.realpathSync(path.resolve(entry));
    const resolvedSelf = fsSync.realpathSync(__filename);
    return process.platform === 'win32'
      ? resolvedEntry.toLowerCase() === resolvedSelf.toLowerCase()
      : resolvedEntry === resolvedSelf;
  } catch {
    return path.resolve(entry) === path.resolve(__filename);
  }
}

async function main() {
  try {
    const argv = process.argv.slice(2);
    if (argv.length === 0) {
      console.error('Błąd: nie podano parametrów wywołania (wymagane np. --target <ścieżka>).');
      console.error('Uruchom `node tools/install-client.mjs --help`, aby zobaczyć pełną instrukcję i przykłady.');
      process.exitCode = 1;
      return;
    }

    const options = parseCliArgs(argv);
    if (options.help) {
      console.log(formatHelpMessage());
      return;
    }

    const summary = await installClient(options);
    printReport(summary, options);
  } catch (err) {
    console.error(`\n[BŁĄD] ${err?.message || String(err)}`);
    console.error('Wskazówka: uruchom `node tools/install-client.mjs --help`, aby wyświetlić instrukcję użycia.\n');
    process.exitCode = 1;
  }
}

if (isDirectRun()) {
  main();
}
