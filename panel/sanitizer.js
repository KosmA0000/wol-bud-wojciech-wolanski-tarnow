/**
 * Kliencki rdzeń bezpieczeństwa CMS (działa w przeglądarce oraz w Node.js).
 * - Sanityzacja adresów URL, tekstów i fragmentów HTML
 * - Skaner bezpieczeństwa zserializowanego dokumentu HTML przed publikacją
 * - Walidacja ścieżek repozytorium (lustrzane odbicie walidacji PHP)
 * - Guardrails dla wywołań narzędzi asystenta AI
 */

const FORBIDDEN_TAGS = new Set([
  'script',
  'iframe',
  'object',
  'embed',
  'applet',
  'base',
  'meta',
  'link',
  'style',
  'form',
  'input',
  'textarea',
  'select',
  'noscript',
  'template',
]);

const FORBIDDEN_PAIRED_TAGS = [
  'script',
  'iframe',
  'object',
  'embed',
  'applet',
  'style',
  'noscript',
  'template',
  'textarea',
  'select',
  'form',
];

const URL_ATTRS = new Set([
  'href',
  'src',
  'data-lightbox-src',
  'data-src',
]);

const SERIALIZED_URL_ATTRS = new Set([
  'href',
  'src',
  'xlink:href',
  'action',
  'formaction',
  'data',
  'poster',
  'data-lightbox-src',
  'data-src',
  'cite',
  'background',
]);

const ALLOWED_REPO_EXTENSIONS = new Set([
  '.html',
  '.json',
  '.webp',
  '.png',
  '.jpg',
  '.jpeg',
  '.svg',
]);

const ALLOWED_ROOT_SEO_FILES = new Set(['sitemap.xml', 'robots.txt']);

const FORBIDDEN_REPO_PREFIXES = ['panel/', '.github/', '.git/', 'backups/'];
const FORBIDDEN_REPO_EXACT = new Set(['panel', '.github', '.git', 'backups']);
const FORBIDDEN_REPO_EXTENSIONS = new Set([
  '.php',
  '.phtml',
  '.phar',
  '.htaccess',
  '.htpasswd',
  '.env',
  '.js',
  '.mjs',
  '.cjs',
]);

const ALLOWED_SITE_SCRIPT_SRC_RE =
  /^(?:\.\/|(?:\.\.\/){0,5})assets\/(?:site|home-page)\.js(?:\?v=[a-zA-Z0-9._-]+)?$/;

const SAFE_IMAGE_DATA_URL_RE =
  /^data:image\/(?:webp|png|jpeg);base64,[a-zA-Z0-9+/=\s]+$/i;

const DANGEROUS_STYLE_RE =
  /(?:expression\s*\(|javascript\s*:|vbscript\s*:|behavior\s*:|@import|data\s*:\s*text\/html)/i;

const READ_ONLY_AI_TOOLS = new Set([
  'get_page_structure',
  'get_page_info',
  'get_page_meta',
  'get_element',
  'list_pages',
  'list_elements',
  'list_sections',
  'list_images',
  'inspect_page',
  'inspect_element',
  'search_elements',
  'find_elements',
  'read_page',
  'get_section_html',
  'read_page_summary',
  'search_site_wide',
]);

const TEXT_MUTATING_AI_TOOLS = new Set([
  'update_element_text',
  'add_text_block',
  'set_page_meta',
  'create_page',
  'update_element_html',
  'update_section_html',
  'insert_custom_section',
  'sync_element_across_site',
  'replace_text_across_site',
  'add_section',
  'insert_section',
  'update_page_meta',
  'add_card',
]);

/**
 * Dekoduje encje HTML i kodowanie procentowe na potrzeby wykrywania obfuskacji schematu URL.
 */
function decodeForSchemeInspection(input) {
  let decoded = input
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : '';
    })
    .replace(/&#([0-9]+);?/g, (_, dec) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : '';
    })
    .replace(/&colon;/gi, ':')
    .replace(/&tab;/gi, '\t')
    .replace(/&newline;/gi, '\n');

  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Celowo ignorujemy niepoprawne sekwencje %XX — dalsze reguły i tak zablokują obfuskację.
  }

  return decoded;
}

/**
 * Usuwa tagi PHP/ASP iteracyjnie, aby zablokować obejścia typu `<<?php?php`.
 */
function stripServerTags(text) {
  let current = text;
  let previous;
  do {
    previous = current;
    current = current
      .replace(/<\?(?:php|=)?/gi, '')
      .replace(/\?>/g, '')
      .replace(/<%/g, '')
      .replace(/%>/g, '');
  } while (current !== previous);
  return current;
}

/**
 * Koduje znaki specjalne w wartości atrybutu HTML.
 */
function escapeAttrValue(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Dekoduje podstawowe encje HTML z wartości atrybutu przed sanityzacją.
 */
function decodeBasicEntities(value) {
  return String(value)
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

/**
 * Wykrywa znormalizowany schemat URL występujący przed pierwszym `/`, `?` lub `#`.
 */
function extractObfuscatedScheme(raw) {
  const decoded = decodeForSchemeInspection(raw);
  const compact = decoded.replace(/[\u0000-\u0020\u007F]+/g, '');
  const firstDelimiter = compact.search(/[/?#]/);
  const prefix = firstDelimiter === -1 ? compact : compact.slice(0, firstDelimiter);
  const colonIdx = prefix.indexOf(':');
  if (colonIdx <= 0) return null;
  return prefix.slice(0, colonIdx).toLowerCase();
}

/**
 * Sanityzuje adres URL. Zwraca bezpieczny URL albo `'#'`, jeśli adres jest niebezpieczny.
 *
 * @param {string} rawUrl
 * @param {{ allowRelative?: boolean, allowImageDataUrl?: boolean, allowBlob?: boolean }} [options]
 * @returns {string}
 */
export function sanitizeUrl(
  rawUrl,
  { allowRelative = true, allowImageDataUrl = false, allowBlob = false } = {}
) {
  if (typeof rawUrl !== 'string') return '#';
  if (rawUrl.includes('\0')) return '#';

  const trimmed = rawUrl.trim();
  if (!trimmed) return '#';

  // Odrzuć niebezpieczne znaki i ukośniki wsteczne (mogą służyć do obejścia //)
  if (/[<>"'`\\]/.test(trimmed)) return '#';

  // Usuń znaki kontrolne (np. \t, \n, \r) w środku adresu na potrzeby dalszej analizy
  const cleaned = trimmed.replace(/[\u0001-\u001F\u007F]+/g, '');
  if (!cleaned) return '#';

  // Blokuj protocol-relative URL (//evil.com)
  if (cleaned.startsWith('//')) return '#';

  // Zezwól na czyste kotwice #anchor
  if (cleaned.startsWith('#')) {
    if (/\s/.test(cleaned)) return '#';
    return cleaned;
  }

  // Wykryj schemat nawet po obfuskacji znakami białymi, kontrolnymi, encjami HTML lub %XX
  const scheme = extractObfuscatedScheme(trimmed);

  if (scheme !== null) {
    if (
      scheme === 'javascript' ||
      scheme === 'vbscript' ||
      scheme === 'file' ||
      scheme === 'livescript' ||
      scheme === 'mocha'
    ) {
      return '#';
    }

    if (scheme === 'data') {
      if (allowImageDataUrl && SAFE_IMAGE_DATA_URL_RE.test(cleaned)) {
        return cleaned;
      }
      return '#';
    }

    if (scheme === 'blob') {
      if (allowBlob && /^blob:(?:https?:\/\/[^\s<>"']+|null\/[^\s<>"']+)$/i.test(cleaned)) {
        return cleaned;
      }
      return '#';
    }

    if (scheme === 'http' || scheme === 'https') {
      if (!/^https?:\/\/[^\s<>"']+$/i.test(cleaned)) return '#';
      return cleaned;
    }

    if (scheme === 'tel') {
      if (!/^tel:[+0-9().\s-]+$/i.test(cleaned)) return '#';
      return cleaned;
    }

    if (scheme === 'mailto') {
      if (!/^mailto:[^\s<>"']+$/i.test(cleaned)) return '#';
      return cleaned;
    }

    // Każdy inny nieznany schemat jest domyślnie blokowany
    return '#';
  }

  // Jeśli w surowym ciągu były znaki kontrolne (\t, \n, \r) lub obfuskacja encjami z dwukropkiem — odrzuć
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return '#';

  if (!allowRelative) return '#';

  // Dodatkowa ochrona przed ukrytym protokołem po dekodowaniu
  const compactDecoded = decodeForSchemeInspection(cleaned)
    .replace(/\s+/g, '')
    .toLowerCase();
  if (
    compactDecoded.startsWith('//') ||
    compactDecoded.startsWith('javascript:') ||
    compactDecoded.startsWith('vbscript:') ||
    compactDecoded.startsWith('data:') ||
    compactDecoded.startsWith('file:') ||
    compactDecoded.startsWith('blob:')
  ) {
    return '#';
  }

  return cleaned;
}

/**
 * Oczyszcza czysty tekst z bajtów NUL, znaków kontrolnych (poza \n i \t) oraz tagów PHP.
 *
 * @param {string} rawText
 * @param {number} [maxLen=8000]
 * @returns {string}
 */
export function sanitizeText(rawText, maxLen = 8000) {
  if (rawText === null || rawText === undefined) return '';
  let text = String(rawText);

  // Normalizuj końce linii CRLF -> LF, usuń NUL i znaki kontrolne poza \n i \t
  text = text
    .replace(/\r\n/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

  // Oczyść potencjalne próby wstrzyknięcia tagów PHP/ASP
  text = stripServerTags(text);

  if (typeof maxLen === 'number' && Number.isFinite(maxLen) && maxLen >= 0) {
    text = text.slice(0, maxLen);
  }

  return text;
}

/**
 * Parsuje atrybuty z ciągu wewnątrz tagu HTML (obsługuje "", '', wartości bez cudzysłowów i flagi).
 */
function parseTagAttributes(attrString) {
  const attrs = [];
  const len = attrString.length;
  let i = 0;

  while (i < len) {
    while (i < len && /[\s/]/.test(attrString[i])) i++;
    if (i >= len) break;

    const nameStart = i;
    while (i < len && !/[\s=/>]/.test(attrString[i])) i++;
    const name = attrString.slice(nameStart, i);
    if (!name) {
      i++;
      continue;
    }

    while (i < len && /\s/.test(attrString[i])) i++;

    let hasValue = false;
    let value = '';
    if (i < len && attrString[i] === '=') {
      hasValue = true;
      i++;
      while (i < len && /\s/.test(attrString[i])) i++;
      if (i < len && (attrString[i] === '"' || attrString[i] === "'")) {
        const quote = attrString[i++];
        const valStart = i;
        while (i < len && attrString[i] !== quote) i++;
        value = attrString.slice(valStart, i);
        if (i < len && attrString[i] === quote) i++;
      } else {
        const valStart = i;
        while (i < len && !/[\s>]/.test(attrString[i])) i++;
        value = attrString.slice(valStart, i);
      }
    }

    attrs.push({ name, hasValue, value });
  }

  return attrs;
}

/**
 * Skanuje wszystkie tagi HTML w dokumencie z poszanowaniem komentarzy i cudzysłowów w atrybutach.
 */
function scanHtmlTags(html) {
  const tags = [];
  const len = html.length;
  let i = 0;

  while (i < len) {
    const lt = html.indexOf('<', i);
    if (lt === -1) break;

    // Komentarz HTML <!-- ... -->
    if (html.startsWith('<!--', lt)) {
      const endComment = html.indexOf('-->', lt + 4);
      i = endComment === -1 ? len : endComment + 3;
      continue;
    }

    // Deklaracje <!doctype ...> lub <![CDATA[...]]>
    if (html[lt + 1] === '!') {
      const gt = html.indexOf('>', lt + 2);
      i = gt === -1 ? len : gt + 1;
      continue;
    }

    // Tag zamykający </...>
    if (html[lt + 1] === '/') {
      const gt = html.indexOf('>', lt + 2);
      i = gt === -1 ? len : gt + 1;
      continue;
    }

    // Sprawdź czy po `<` jest litera nazwy tagu
    const nextChar = html[lt + 1];
    if (!nextChar || !/[a-zA-Z]/.test(nextChar)) {
      i = lt + 1;
      continue;
    }

    let j = lt + 1;
    while (j < len && /[a-zA-Z0-9:-]/.test(html[j])) j++;
    const tagName = html.slice(lt + 1, j).toLowerCase();

    // Znajdź zamykające `>` poza cudzysłowami
    let quote = null;
    const attrStart = j;
    while (j < len) {
      const ch = html[j];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '>') {
        break;
      }
      j++;
    }

    const attrEnd = j;
    const rawAttrStr = html.slice(attrStart, attrEnd);
    const selfClosing = rawAttrStr.trimEnd().endsWith('/');
    const attrs = parseTagAttributes(selfClosing ? rawAttrStr.trimEnd().slice(0, -1) : rawAttrStr);

    tags.push({
      tagName,
      start: lt,
      end: j < len ? j + 1 : len,
      selfClosing,
      attrs,
    });

    i = j < len ? j + 1 : len;
  }

  return tags;
}

/**
 * Fallback sanityzacji fragmentu HTML bez DOMParser (np. w Node.js).
 */
function sanitizeHtmlFragmentRegex(html, { previewMode = true } = {}) {
  let out = String(html).replace(/\0/g, '');
  out = stripServerTags(out);

  // Iteracyjnie usuwaj zabronione tagi parowane wraz z zawartością
  const pairedPattern = new RegExp(
    `<(${FORBIDDEN_PAIRED_TAGS.join('|')})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`,
    'gi'
  );
  let prev;
  do {
    prev = out;
    out = out.replace(pairedPattern, '');
  } while (out !== prev);

  // Usuń pozostałe (niezamknięte / pojedyncze / zamykające) zabronione tagi
  const allForbidden = Array.from(FORBIDDEN_TAGS).join('|');
  const strayForbiddenRe = new RegExp(`<\\/?(?:${allForbidden})\\b[^>]*>`, 'gi');
  do {
    prev = out;
    out = out.replace(strayForbiddenRe, '');
  } while (out !== prev);

  // Przepuść wszystkie pozostałe tagi przez parser atrybutów
  const tags = scanHtmlTags(out);
  if (tags.length === 0) return out;

  let result = '';
  let cursor = 0;

  for (const tag of tags) {
    result += out.slice(cursor, tag.start);
    cursor = tag.end;

    if (FORBIDDEN_TAGS.has(tag.tagName)) {
      continue;
    }

    const safeAttrs = [];
    for (const attr of tag.attrs) {
      const lowerName = attr.name.toLowerCase();
      if (/^on/i.test(lowerName)) continue;
      if (lowerName === 'srcdoc' || lowerName === 'formaction') continue;

      const decodedVal = decodeBasicEntities(attr.value);

      if (lowerName === 'xlink:href') {
        const safe = sanitizeUrl(decodedVal, { allowRelative: true });
        if (safe === '#' && decodedVal.trim() !== '#') continue;
        safeAttrs.push(`${attr.name}="${escapeAttrValue(safe)}"`);
        continue;
      }

      if (URL_ATTRS.has(lowerName)) {
        const isImgSrc = tag.tagName === 'img' && lowerName === 'src';
        if (decodedVal.trim() === '' && lowerName === 'src') {
          safeAttrs.push(`${attr.name}=""`);
          continue;
        }
        const safe = sanitizeUrl(decodedVal, {
          allowRelative: true,
          allowImageDataUrl: isImgSrc && Boolean(previewMode),
        });
        safeAttrs.push(`${attr.name}="${escapeAttrValue(safe)}"`);
        continue;
      }

      if (lowerName === 'style') {
        if (DANGEROUS_STYLE_RE.test(decodedVal)) continue;
      }

      if (attr.hasValue) {
        safeAttrs.push(`${attr.name}="${escapeAttrValue(decodedVal)}"`);
      } else {
        safeAttrs.push(attr.name);
      }
    }

    const attrJoin = safeAttrs.length > 0 ? ' ' + safeAttrs.join(' ') : '';
    const closing = tag.selfClosing ? ' /' : '';
    result += `<${tag.tagName}${attrJoin}${closing}>`;
  }

  result += out.slice(cursor);
  return stripServerTags(result);
}

/**
 * Sanityzuje fragment HTML (przeglądarka: DOMParser, Node.js: fallback regex + parser atrybutów).
 *
 * @param {string} html
 * @param {{ previewMode?: boolean }} [options]
 * @returns {string}
 */
export function sanitizeHtmlFragment(html, { previewMode = true } = {}) {
  if (typeof html !== 'string' || !html) return '';

  const preCleaned = stripServerTags(html.replace(/\0/g, ''));

  if (typeof DOMParser === 'function') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(
      `<!doctype html><html><body>${preCleaned}</body></html>`,
      'text/html'
    );

    const cleanNode = (node) => {
      if (!node) return;

      // Node.COMMENT_NODE === 8
      if (node.nodeType === 8) {
        if (/<\?|<%/.test(node.nodeValue || '')) {
          node.remove();
        }
        return;
      }

      // Node.ELEMENT_NODE === 1
      if (node.nodeType === 1) {
        const tagName = node.tagName.toLowerCase();
        if (FORBIDDEN_TAGS.has(tagName)) {
          node.remove();
          return;
        }

        for (const attr of Array.from(node.attributes)) {
          const lowerName = attr.name.toLowerCase();

          if (/^on/i.test(lowerName) || lowerName === 'srcdoc' || lowerName === 'formaction') {
            node.removeAttribute(attr.name);
            continue;
          }

          if (lowerName === 'xlink:href') {
            const safe = sanitizeUrl(attr.value, { allowRelative: true });
            if (safe === '#' && attr.value.trim() !== '#') {
              node.removeAttribute(attr.name);
            } else {
              node.setAttribute(attr.name, safe);
            }
            continue;
          }

          if (URL_ATTRS.has(lowerName)) {
            const isImgSrc = tagName === 'img' && lowerName === 'src';
            if (attr.value.trim() === '' && lowerName === 'src') {
              continue;
            }
            const safe = sanitizeUrl(attr.value, {
              allowRelative: true,
              allowImageDataUrl: isImgSrc && Boolean(previewMode),
            });
            node.setAttribute(attr.name, safe);
            continue;
          }

          if (lowerName === 'style' && DANGEROUS_STYLE_RE.test(attr.value)) {
            node.removeAttribute(attr.name);
          }
        }
      }

      for (const child of Array.from(node.childNodes)) {
        cleanNode(child);
      }
    };

    for (const child of Array.from(doc.body.childNodes)) {
      cleanNode(child);
    }

    return stripServerTags(doc.body.innerHTML);
  }

  return sanitizeHtmlFragmentRegex(preCleaned, { previewMode });
}

/**
 * Końcowy skaner bezpieczeństwa zserializowanego dokumentu HTML przed publikacją.
 *
 * @param {string} fullHtml
 * @returns {{ ok: boolean, violations: string[] }}
 */
export function assertSafeSerializedHtml(fullHtml) {
  const violations = [];

  if (typeof fullHtml !== 'string') {
    return {
      ok: false,
      violations: ['Przekazany dokument HTML nie jest poprawnym ciągiem znaków.'],
    };
  }

  if (fullHtml.includes('\0')) {
    violations.push('Wykryto niedozwolony bajt NUL (\\0) w dokumencie HTML.');
  }

  // 1. Tagi serwerowe PHP / ASP
  if (/<\?(?:php|=)/i.test(fullHtml)) {
    violations.push('Wykryto niedozwolony tag PHP (<?php lub <?=) w dokumencie HTML.');
  }
  if (/<%/.test(fullHtml)) {
    violations.push('Wykryto niedozwolony tag serwerowy (<%) w dokumencie HTML.');
  }

  // 2. Kontrola tagów <script>
  const scriptPairRe = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let scriptMatch;
  while ((scriptMatch = scriptPairRe.exec(fullHtml)) !== null) {
    const rawAttrStr = scriptMatch[1] || '';
    const innerBody = scriptMatch[2] || '';
    const attrs = parseTagAttributes(rawAttrStr);
    const srcAttr = attrs.find((a) => a.name.toLowerCase() === 'src');

    if (innerBody.trim().length > 0) {
      violations.push('Wykryto niedozwolony kod inline wewnątrz znacznika <script>.');
    }

    if (!srcAttr || !srcAttr.hasValue) {
      violations.push('Wykryto niedozwolony znacznik <script> bez dozwolonego atrybutu src.');
    } else {
      const srcVal = decodeBasicEntities(srcAttr.value).trim();
      if (!ALLOWED_SITE_SCRIPT_SRC_RE.test(srcVal)) {
        violations.push(
          `Wykryto niedozwolony skrypt zewnętrzny: "${srcVal}" (dozwolone są wyłącznie assets/site.js oraz assets/home-page.js).`
        );
      }
    }
  }

  // Wykryj niezamknięte tagi <script ...>
  const withoutPairedScripts = fullHtml.replace(scriptPairRe, '');
  if (/<script\b/i.test(withoutPairedScripts)) {
    violations.push('Wykryto niezamknięty lub nieprawidłowy znacznik <script>.');
  }

  // 3. Skanowanie wszystkich tagów HTML (poza treścią tekstową)
  const tags = scanHtmlTags(fullHtml);
  for (const tag of tags) {
    if (tag.tagName === 'iframe' || tag.tagName === 'object' || tag.tagName === 'embed') {
      violations.push(`Wykryto niedozwolony znacznik osadzony <${tag.tagName}>.`);
    }

    for (const attr of tag.attrs) {
      const attrLower = attr.name.toLowerCase();

      if (/^on[a-z]+$/i.test(attrLower)) {
        violations.push(
          `Wykryto niedozwolony inline handler zdarzeń "${attr.name}" w znaczniku <${tag.tagName}>.`
        );
        continue;
      }

      if (attrLower === 'srcdoc' || attrLower === 'formaction') {
        violations.push(
          `Wykryto niedozwolony atrybut "${attr.name}" w znaczniku <${tag.tagName}>.`
        );
        continue;
      }

      if (attr.hasValue) {
        const decodedVal = decodeBasicEntities(attr.value);
        const inspected = decodeForSchemeInspection(decodedVal)
          .replace(/[\u0000-\u0020\u007F]+/g, '')
          .toLowerCase();

        if (
          inspected.includes('javascript:') ||
          inspected.includes('vbscript:') ||
          inspected.includes('data:text/html')
        ) {
          violations.push(
            `Wykryto niebezpieczny schemat URL w atrybucie "${attr.name}" znacznika <${tag.tagName}>.`
          );
        } else if (SERIALIZED_URL_ATTRS.has(attrLower)) {
          const scheme = extractObfuscatedScheme(decodedVal);
          if (scheme === 'data' && !SAFE_IMAGE_DATA_URL_RE.test(decodedVal.trim())) {
            violations.push(
              `Wykryto niedozwolony schemat data: w atrybucie "${attr.name}" znacznika <${tag.tagName}>.`
            );
          }
        }
      }
    }
  }

  // Ochrona SEO: na stronach publicznych blokuj przypadkowe / złośliwe <meta name="robots" content="...noindex...">
  if (/<meta\b[^>]*\bname\s*=\s*["']?robots["']?[^>]*\bcontent\s*=\s*["'][^"']*\bnoindex\b/i.test(fullHtml) ||
      /<meta\b[^>]*\bcontent\s*=\s*["'][^"']*\bnoindex\b[^>]*\bname\s*=\s*["']?robots["']?/i.test(fullHtml)) {
    violations.push(
      'Zablokowano dyrektywę „noindex” w znaczniku <meta name="robots"> — chroni to stronę przed wyindeksowaniem z Google.'
    );
  }

  return {
    ok: violations.length === 0,
    violations,
  };
}

/**
 * Normalizuje ścieżkę repozytorium do porównań (bez wiodącego `./`).
 */
function normalizeComparablePath(path) {
  return String(path || '')
    .trim()
    .replace(/^\.\/+/, '')
    .toLowerCase();
}

/**
 * Waliduje ścieżkę pliku w repozytorium (lustrzane odbicie walidacji po stronie PHP).
 *
 * @param {string} path
 * @param {{ allowDelete?: boolean, protectedPages?: readonly string[] }} [options]
 * @returns {{ ok: boolean, reason?: string }}
 */
export function validateRepoPath(
  path,
  { allowDelete = false, protectedPages = [] } = {}
) {
  if (typeof path !== 'string' || !path.trim()) {
    return { ok: false, reason: 'Ścieżka pliku nie może być pusta.' };
  }

  if (path.includes('\0')) {
    return { ok: false, reason: 'Ścieżka zawiera niedozwolony bajt NUL.' };
  }

  if (path.startsWith('/') || path.startsWith('\\')) {
    return { ok: false, reason: 'Ścieżka nie może zaczynać się od ukośnika.' };
  }

  if (path.endsWith('/') || path.includes('//')) {
    return { ok: false, reason: 'Ścieżka zawiera nieprawidłowe ukośniki.' };
  }

  if (path.includes('..')) {
    return { ok: false, reason: 'Ścieżka nie może zawierać sekwencji wychodzących poza katalog (..).' };
  }

  if (!/^[a-zA-Z0-9/._-]+$/.test(path)) {
    return {
      ok: false,
      reason: 'Ścieżka zawiera niedozwolone znaki (dozwolone są wyłącznie a-z, A-Z, 0-9, /, ., _, -).',
    };
  }

  const lower = path.toLowerCase();
  const segments = lower.split('/');

  // Sprawdź zabronione katalogi (panel/, .github/, .git/, backups/)
  if (
    FORBIDDEN_REPO_EXACT.has(lower) ||
    FORBIDDEN_REPO_PREFIXES.some((prefix) => lower.startsWith(prefix))
  ) {
    return {
      ok: false,
      reason: 'Dostęp do chronionego katalogu systemowego (panel/, .github/, .git/, backups/) jest zabroniony.',
    };
  }

  // Zablokuj pliki ukryte typu .htaccess, .env lub segmenty zaczynające się od kropki
  for (const seg of segments) {
    if (!seg || seg === '.' || seg.startsWith('.')) {
      return {
        ok: false,
        reason: 'Pliki ukryte oraz konfiguracyjne (np. .htaccess, .env) są zabronione.',
      };
    }
  }

  const fileName = segments[segments.length - 1];
  const dotIdx = fileName.lastIndexOf('.');
  const ext = dotIdx > 0 ? fileName.slice(dotIdx) : '';

  if (FORBIDDEN_REPO_EXTENSIONS.has(ext) || fileName.includes('.php.')) {
    return {
      ok: false,
      reason: `Publikacja lub modyfikacja plików typu "${ext || fileName}" jest zabroniona ze względów bezpieczeństwa.`,
    };
  }

  const isRootSeoFile = ALLOWED_ROOT_SEO_FILES.has(lower);

  if (!isRootSeoFile && !ALLOWED_REPO_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      reason: `Niedozwolone rozszerzenie pliku "${ext || '(brak)'}". Dozwolone: .html, .json, .webp, .png, .jpg, .jpeg, .svg oraz sitemap.xml / robots.txt.`,
    };
  }

  if (allowDelete) {
    const protectedSet = new Set(
      (Array.isArray(protectedPages) ? protectedPages : []).map(normalizeComparablePath)
    );
    protectedSet.add('index.html');
    protectedSet.add('sitemap.xml');
    protectedSet.add('robots.txt');

    if (protectedSet.has(lower)) {
      return {
        ok: false,
        reason: `Plik "${path}" znajduje się na liście stron chronionych i nie może zostać usunięty.`,
      };
    }

    if (lower.startsWith('assets/')) {
      return {
        ok: false,
        reason: 'Pliki z katalogu assets/ są chronione i nie mogą zostać usunięte.',
      };
    }
  }

  return { ok: true };
}

/**
 * Sprawdza rekurencyjnie czy wartości tekstowe w argumentach narzędzia AI zawierają złośliwy kod.
 */
function containsDangerousAiPayload(value) {
  if (typeof value === 'string') {
    const compact = decodeForSchemeInspection(value)
      .replace(/[\u0000-\u0020\u007F]+/g, '')
      .toLowerCase();

    if (
      /<script\b/i.test(value) ||
      /<\?(?:php|=)?/i.test(value) ||
      /<%/.test(value) ||
      /\bon[a-z]+\s*=/i.test(value) ||
      /<(?:iframe|object|embed)\b/i.test(value) ||
      compact.includes('javascript:') ||
      compact.includes('vbscript:') ||
      compact.includes('data:text/html')
    ) {
      return true;
    }
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsDangerousAiPayload(item));
  }

  if (value && typeof value === 'object') {
    return Object.values(value).some((v) => containsDangerousAiPayload(v));
  }

  return false;
}

/**
 * Strażnik bezpieczeństwa wywołań narzędzi AI w ramach pojedynczej tury użytkownika.
 */
export class AiGuardrailTracker {
  /**
   * @param {{
   *   protectedPages?: readonly string[],
   *   maxDeletesPerTurn?: number,
   *   maxPageDeletesPerTurn?: number,
   *   maxMutationsPerTurn?: number,
   * }} [options]
   */
  constructor({
    protectedPages = [],
    maxDeletesPerTurn = 3,
    maxPageDeletesPerTurn = 1,
    maxMutationsPerTurn = 30,
  } = {}) {
    this.protectedPages = new Set(
      (Array.isArray(protectedPages) ? protectedPages : []).map(normalizeComparablePath)
    );
    this.protectedPages.add('index.html');

    this.maxDeletesPerTurn = maxDeletesPerTurn;
    this.maxPageDeletesPerTurn = maxPageDeletesPerTurn;
    this.maxMutationsPerTurn = maxMutationsPerTurn;

    this.deleteCount = 0;
    this.pageDeleteCount = 0;
    this.mutationCount = 0;
  }

  /**
   * Resetuje liczniki przed nową turą konwersacji użytkownika.
   */
  reset() {
    this.deleteCount = 0;
    this.pageDeleteCount = 0;
    this.mutationCount = 0;
  }

  /**
   * Weryfikuje pojedyncze wywołanie narzędzia AI i aktualizuje liczniki bezpieczeństwa.
   *
   * @param {string} name
   * @param {Record<string, any>} [args]
   * @returns {{ allowed: boolean, reason?: string, requiresConfirm?: boolean }}
   */
  checkToolCall(name, args = {}) {
    if (typeof name !== 'string' || !name.trim()) {
      return {
        allowed: false,
        reason: 'Nieprawidłowa nazwa narzędzia AI.',
      };
    }

    const toolName = name.trim();
    const safeArgs = args && typeof args === 'object' ? args : {};

    // Narzędzia wyłącznie odczytowe nie zużywają limitu mutacji
    if (READ_ONLY_AI_TOOLS.has(toolName)) {
      return { allowed: true };
    }

    // 1. Ochrona przed masowym usuwaniem elementów
    if (toolName === 'delete_element') {
      if (this.deleteCount >= this.maxDeletesPerTurn) {
        return {
          allowed: false,
          reason: `Osiągnięto limit usuwania elementów w jednej turze (${this.maxDeletesPerTurn}). Aby uniknąć przypadkowego usunięcia treści strony, podziel operację na mniejsze kroki.`,
        };
      }
    }

    // 2. Bezwzględna ochrona kluczowych stron i limit usuwania podstron
    if (toolName === 'delete_page') {
      const rawInput =
        typeof safeArgs.pagePath === 'string'
          ? safeArgs.pagePath
          : typeof safeArgs.path === 'string'
            ? safeArgs.path
            : '';
      let rawPath = rawInput.trim().replace(/^\.\/+/, '').replace(/^\/+/, '').replace(/\/+$/, '');
      if (rawPath && !rawPath.toLowerCase().endsWith('.html')) {
        rawPath = `${rawPath}/index.html`;
      }
      const normalized = normalizeComparablePath(rawPath).replace(/^\/+/, '');

      if (
        !normalized ||
        normalized === 'index.html' ||
        this.protectedPages.has(normalized) ||
        normalized.startsWith('assets/') ||
        normalized.startsWith('panel/') ||
        normalized.startsWith('.git/') ||
        normalized.startsWith('.github/') ||
        normalized.startsWith('backups/')
      ) {
        return {
          allowed: false,
          reason: `Strona "${rawPath || '(nieznana)'}" jest chroniona i nie może zostać usunięta przez asystenta AI.`,
        };
      }

      const pathCheck = validateRepoPath(rawPath, {
        allowDelete: true,
        protectedPages: Array.from(this.protectedPages),
      });
      if (!pathCheck.ok) {
        return {
          allowed: false,
          reason: pathCheck.reason || 'Nieprawidłowa lub chroniona ścieżka strony.',
        };
      }

      if (this.pageDeleteCount >= this.maxPageDeletesPerTurn) {
        return {
          allowed: false,
          reason: `W jednej turze można usunąć maksymalnie ${this.maxPageDeletesPerTurn} podstronę. Podziel zadanie na osobne kroki.`,
        };
      }
    }

    // 3. Kontrola adresów URL w linkach
    if (toolName === 'update_element_link') {
      const rawHref =
        typeof safeArgs.href === 'string'
          ? safeArgs.href
          : typeof safeArgs.url === 'string'
            ? safeArgs.url
            : '';
      if (!rawHref.trim()) {
        return {
          allowed: false,
          reason: 'Adres URL w narzędziu update_element_link nie może być pusty.',
        };
      }
      const sanitized = sanitizeUrl(rawHref, { allowRelative: true });
      if (sanitized === '#' && rawHref.trim() !== '#') {
        return {
          allowed: false,
          reason: `Zablokowano niebezpieczny adres URL: "${rawHref}". Dozwolone są wyłącznie bezpieczne linki http(s), tel:, mailto:, kotwice i ścieżki względne.`,
        };
      }
    }

    // 4. Kontrola wstrzyknięć XSS / PHP w treściach tekstowych i tworzeniu stron
    if (TEXT_MUTATING_AI_TOOLS.has(toolName)) {
      if (containsDangerousAiPayload(safeArgs)) {
        return {
          allowed: false,
          reason: `Zablokowano niebezpieczną treść w narzędziu "${toolName}" (wykryto niedozwolony skrypt, tag PHP lub handler zdarzeń).`,
        };
      }

      if (toolName === 'create_page') {
        const candidatePath =
          typeof safeArgs.pagePath === 'string'
            ? safeArgs.pagePath
            : typeof safeArgs.path === 'string'
              ? safeArgs.path
              : null;
        if (candidatePath !== null) {
          const check = validateRepoPath(candidatePath.trim().replace(/^\.\/+/, ''));
          if (!check.ok) {
            return {
              allowed: false,
              reason: check.reason || 'Nieprawidłowa ścieżka nowej strony.',
            };
          }
        }
      }
    }

    // 5. Globalny limit mutacji w jednej turze
    if (this.mutationCount >= this.maxMutationsPerTurn) {
      return {
        allowed: false,
        reason: `Przekroczono limit zmian w jednej turze (${this.maxMutationsPerTurn}). Podziel zadanie na mniejsze kroki.`,
      };
    }

    // Zaktualizuj liczniki po przejściu wszystkich walidacji
    this.mutationCount += 1;

    if (toolName === 'delete_element') {
      this.deleteCount += 1;
    }

    if (toolName === 'delete_page') {
      this.pageDeleteCount += 1;
      return { allowed: true, requiresConfirm: true };
    }

    return { allowed: true };
  }
}
