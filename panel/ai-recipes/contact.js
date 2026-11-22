// Przepis AI: zmiana danych kontaktowych (telefon, e-mail, adres salonu) na całej stronie WOL-BUD.
// Aktualizuje globals oraz wszystkie wystąpienia w tel:, mailto:, tekstach, aria-label i linkach Google Maps,
// chodząc wyłącznie po węzłach tekstowych, żeby nie uszkodzić ikon <svg> i <i> wewnątrz linków.

const CONCURRENCY = 8;
const SKIP_TEXT_PARENTS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);

const SALON_DEFAULTS = {
  tarnow: {
    city: 'Tarnów',
    zip: '33-100',
    street: 'ul. Giełdowa 10',
    full: 'ul. Giełdowa 10 (przy placu targowym), 33-100 Tarnów',
    mapPrefix: 'WOL-BUD ',
  },
  radlow: {
    city: 'Radłów',
    zip: '33-130',
    street: 'ul. Kolejowa 5',
    full: 'ul. Kolejowa 5, 33-130 Radłów',
    mapPrefix: '',
  },
};

export const tools = [
  {
    name: 'zmien_dane_kontaktowe',
    description:
      'Zmienia numer telefonu, adres e-mail i/lub adres salonu sprzedaży w całym serwisie: w ustawieniach globalnych (pasek, menu, stopka, dymki kontaktu), we wszystkich linkach tel: i mailto:, w tekstach, atrybutach aria-label/alt oraz linkach Google Maps.',
    parameters: {
      type: 'object',
      properties: {
        telefon: {
          type: 'string',
          description: 'Nowy numer telefonu (np. „600 123 456” lub „+48 600 123 456”).',
        },
        email: {
          type: 'string',
          description: 'Nowy adres e-mail (np. „kontakt@wol-bud.com.pl”).',
        },
        adres: {
          type: 'string',
          description: 'Nowy adres salonu (np. „ul. Krakowska 15, 33-100 Tarnów”).',
        },
        salon: {
          type: 'string',
          enum: ['tarnow', 'radlow'],
          description: 'Opcjonalnie który salon przy zmianie adresu: tarnow albo radlow.',
        },
        staryTelefon: {
          type: 'string',
          description: 'Opcjonalnie konkretny stary numer do podmiany (domyślnie główny numer firmy).',
        },
        staryEmail: {
          type: 'string',
          description: 'Opcjonalnie konkretny stary e-mail do podmiany (domyślnie główny e-mail firmy).',
        },
        staryAdres: {
          type: 'string',
          description: 'Opcjonalnie konkretny stary adres do podmiany.',
        },
      },
    },
  },
];

function stripDiacritics(str) {
  return String(str || '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normText(str) {
  return stripDiacritics(str)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isRedirectDoc(doc) {
  const metas = doc.querySelectorAll('meta[http-equiv]');
  for (const m of metas) {
    if (String(m.getAttribute('http-equiv') || '').trim().toLowerCase() === 'refresh') {
      return true;
    }
  }
  return false;
}

function getDocTitle(doc) {
  return (doc.querySelector('title')?.textContent || doc.title || '').replace(/\s+/g, ' ').trim();
}

function normalizePhoneCore(raw) {
  const digits = String(raw || '').replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.length === 13 && digits.startsWith('0048')) return digits.slice(4);
  if (digits.length === 11 && digits.startsWith('48')) return digits.slice(2);
  return digits;
}

function formatNewPhone(raw) {
  const trimmed = String(raw || '')
    .trim()
    .replace(/^tel:/i, '')
    .trim();
  const rawDigits = trimmed.replace(/[^\d+]/g, '');
  const core = normalizePhoneCore(trimmed);

  let display = trimmed;
  if (/^\d{9}$/.test(trimmed)) {
    display = core.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
  }

  let href = '';
  if (rawDigits.startsWith('+')) {
    href = `tel:${rawDigits}`;
  } else if (core.length === 9) {
    href = `tel:+48${core}`;
  } else if (rawDigits) {
    href = `tel:${rawDigits}`;
  }

  return { display, href, core };
}

function buildPhoneRegex(rawOld) {
  const core = normalizePhoneCore(rawOld);
  if (core.length < 7) return null;
  const sep = '[\\s\\u00a0.-]*';
  const body = core.split('').join(sep);
  return new RegExp(`(?<!\\d)(?:(?:\\+|00)?48${sep})?${body}(?!\\d)`, 'g');
}

function replacePhoneInText(text, regex, newDisplay) {
  if (!regex || typeof text !== 'string' || !text) return { text, count: 0 };
  let count = 0;
  regex.lastIndex = 0;
  const next = text.replace(regex, (match) => {
    count++;
    const compact = match.replace(/[\s\u00a0.-]+/g, '');
    if (compact.startsWith('+48') && !newDisplay.startsWith('+')) {
      return `+48 ${newDisplay}`;
    }
    if (compact.startsWith('0048') && !newDisplay.startsWith('+') && !newDisplay.startsWith('00')) {
      return `0048 ${newDisplay}`;
    }
    return newDisplay;
  });
  return { text: next, count };
}

function buildEmailRegex(rawOld) {
  const email = String(rawOld || '').trim();
  if (!email) return null;
  return new RegExp(
    `(?<![A-Za-z0-9._%+-])${escapeRegExp(email)}(?![A-Za-z0-9._%+-])`,
    'gi'
  );
}

function replaceRegexInText(text, regex, replacement) {
  if (!regex || typeof text !== 'string' || !text) return { text, count: 0 };
  let count = 0;
  regex.lastIndex = 0;
  const next = text.replace(regex, () => {
    count++;
    return replacement;
  });
  return { text: next, count };
}

function walkTextNodes(root, fn) {
  if (!root) return;
  const walk = (node) => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 3) {
        fn(child);
      } else if (child.nodeType === 1 && !SKIP_TEXT_PARENTS.has(child.tagName)) {
        walk(child);
      }
    }
  };
  walk(root);
}

function detectSalonKey(salonArg, adresArg) {
  const explicit = normText(salonArg);
  if (explicit.includes('tarnow')) return 'tarnow';
  if (explicit.includes('radlow')) return 'radlow';

  const addrNorm = normText(adresArg);
  const mentionsTarnow = addrNorm.includes('tarnow') || addrNorm.includes('33-100');
  const mentionsRadlow = addrNorm.includes('radlow') || addrNorm.includes('33-130');

  if (mentionsTarnow && !mentionsRadlow) return 'tarnow';
  if (mentionsRadlow && !mentionsTarnow) return 'radlow';
  return null;
}

async function readSalonInfoFromIndex(salonKey, ctx) {
  const fallback = SALON_DEFAULTS[salonKey];
  if (!fallback) return null;
  const info = { ...fallback };

  const indexHtml = await ctx.readPage('index.html');
  if (!indexHtml) return info;

  const doc = ctx.parse(indexHtml);
  const cityNorm = normText(info.city);
  let foundSidebarStreet = false;

  for (const p of doc.querySelectorAll('.sidebar-store p')) {
    const txt = p.textContent.replace(/\s+/g, ' ').trim();
    if (normText(txt).includes(cityNorm)) {
      const idx = txt.indexOf(':');
      if (idx >= 0) {
        const street = txt.slice(idx + 1).trim();
        if (street) {
          info.street = street;
          foundSidebarStreet = true;
        }
      }
      break;
    }
  }

  for (const item of doc.querySelectorAll('.kt-store-item')) {
    const title = item.querySelector('.kt-store-title')?.textContent || '';
    const addr = item.querySelector('.kt-store-addr')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    if (normText(title).includes(cityNorm) || normText(addr).includes(cityNorm)) {
      if (addr) {
        info.full = addr;
        if (!foundSidebarStreet) {
          const streetMatch = addr.split(/[,(]/)[0]?.trim();
          if (streetMatch) info.street = streetMatch;
        }
      }
      break;
    }
  }

  return info;
}

async function detectEmailFromIndex(ctx) {
  const indexHtml = await ctx.readPage('index.html');
  if (!indexHtml) return '';
  const doc = ctx.parse(indexHtml);
  for (const a of doc.querySelectorAll('a[href^="mailto:"], a[href^="MAILTO:"]')) {
    const href = a.getAttribute('href') || '';
    const addr = href.slice(7).split('?')[0].trim();
    if (addr && addr.includes('@')) return addr;
  }
  return '';
}

function parseNewAddress(rawAdres, salonInfo) {
  const clean = String(rawAdres || '').trim();
  const commaIdx = clean.indexOf(',');
  if (commaIdx >= 0) {
    const street = clean.slice(0, commaIdx).trim() || clean;
    return { newStreet: street, newFull: clean };
  }
  const newStreet = clean;
  const newFull =
    salonInfo?.zip && salonInfo?.city
      ? `${newStreet}, ${salonInfo.zip} ${salonInfo.city}`
      : newStreet;
  return { newStreet, newFull };
}

async function readAllPages(pages, ctx) {
  const htmlByPath = new Map();
  for (let i = 0; i < pages.length; i += CONCURRENCY) {
    const batch = pages.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((p) => ctx.readPage(p.path)));
    batch.forEach((p, idx) => {
      if (typeof results[idx] === 'string') {
        htmlByPath.set(p.path, results[idx]);
      }
    });
  }
  return htmlByPath;
}

export async function run(name, args = {}, ctx) {
  if (name !== 'zmien_dane_kontaktowe') {
    return { ok: false, error: `Nieznany przepis: ${name}` };
  }

  const rawTel = typeof args.telefon === 'string' ? args.telefon.trim() : '';
  const rawEmail = typeof args.email === 'string' ? args.email.trim() : '';
  const rawAdres = typeof args.adres === 'string' ? args.adres.trim() : '';
  const rawSalon = typeof args.salon === 'string' ? args.salon.trim() : '';
  const rawStaryAdres = typeof args.staryAdres === 'string' ? args.staryAdres.trim() : '';

  if (!rawTel && !rawEmail && !rawAdres) {
    return {
      ok: false,
      needsAnswer: 'Jakie dane kontaktowe chcesz zmienić?',
      options: ['Telefon', 'E-mail', 'Adres salonu'],
    };
  }

  // Walidacja e-maila przed jakimkolwiek zapisem
  let nextEmail = '';
  if (rawEmail) {
    nextEmail = rawEmail.replace(/^mailto:/i, '').trim();
    if (!nextEmail.includes('@') || /\s/.test(nextEmail)) {
      return {
        ok: false,
        error: `Nieprawidłowy adres e-mail: „${rawEmail}”.`,
      };
    }
  }

  // Walidacja telefonu przed zapisem
  let nextPhone = null;
  if (rawTel) {
    nextPhone = formatNewPhone(rawTel);
    if (nextPhone.core.length < 7) {
      return {
        ok: false,
        error: `Numer telefonu „${rawTel}” jest za krótki.`,
      };
    }
  }

  // Rozpoznanie salonu przy zmianie adresu przed jakimkolwiek zapisem
  let salonKey = null;
  let addrPlan = null;
  if (rawAdres) {
    if (rawStaryAdres) {
      const parsed = parseNewAddress(rawAdres, null);
      const oldComma = rawStaryAdres.indexOf(',');
      const oldStreet =
        oldComma >= 0 ? rawStaryAdres.slice(0, oldComma).trim() : rawStaryAdres;
      addrPlan = {
        oldFull: rawStaryAdres,
        oldStreet,
        newFull: parsed.newFull,
        newStreet: parsed.newStreet,
        mapPrefix: '',
      };
    } else {
      salonKey = detectSalonKey(rawSalon, rawAdres);
      if (!salonKey) {
        return {
          ok: false,
          needsAnswer:
            'Na stronie są dwa salony sprzedaży. Którego salonu adres chcesz zmienić?',
          options: ['Salon Tarnów (ul. Giełdowa 10)', 'Salon Radłów (ul. Kolejowa 5)'],
        };
      }
      const salonInfo = await readSalonInfoFromIndex(salonKey, ctx);
      const parsed = parseNewAddress(rawAdres, salonInfo);
      addrPlan = {
        oldFull: salonInfo.full,
        oldStreet: salonInfo.street,
        newFull: parsed.newFull,
        newStreet: parsed.newStreet,
        mapPrefix: salonInfo.mapPrefix,
      };
    }
  }

  const globals = ctx.getGlobals();

  const oldTelSource =
    typeof args.staryTelefon === 'string' && args.staryTelefon.trim()
      ? args.staryTelefon.trim()
      : globals.phoneDisplay || '534 091 021';
  const oldPhoneCore = normalizePhoneCore(oldTelSource);
  const oldPhoneRegex = nextPhone ? buildPhoneRegex(oldTelSource) : null;

  let oldEmailSource =
    typeof args.staryEmail === 'string' && args.staryEmail.trim()
      ? args.staryEmail.trim().replace(/^mailto:/i, '').trim()
      : String(globals.email || '').trim();
  if (!oldEmailSource && nextEmail) {
    oldEmailSource = (await detectEmailFromIndex(ctx)) || 'biuro@wol-bud.com.pl';
  }
  const oldEmailRegex = nextEmail ? buildEmailRegex(oldEmailSource) : null;

  const oldFullAddrRegex =
    addrPlan?.oldFull
      ? new RegExp(escapeRegExp(addrPlan.oldFull), 'gi')
      : null;
  const oldStreetAddrRegex = addrPlan?.oldStreet
    ? new RegExp(escapeRegExp(addrPlan.oldStreet), 'gi')
    : null;

  const pages = ctx
    .listPages()
    .filter((p) => p && p.path && p.path !== 'panel' && !p.path.startsWith('panel/'));
  const htmlByPath = await readAllPages(pages, ctx);

  const changedPages = [];
  let replacementCount = 0;

  for (const p of pages) {
    const html = htmlByPath.get(p.path);
    if (!html) continue;

    const doc = ctx.parse(html);
    if (isRedirectDoc(doc)) continue;

    let pageChanged = false;

    // A. Linki tel:, mailto:, Google Maps
    if (nextPhone && oldPhoneCore) {
      doc.querySelectorAll('a[href]').forEach((a) => {
        const href = a.getAttribute('href') || '';
        if (/^tel:/i.test(href) && normalizePhoneCore(href.slice(4)) === oldPhoneCore) {
          if (href !== nextPhone.href) {
            a.setAttribute('href', nextPhone.href);
            pageChanged = true;
            replacementCount++;
          }
        }
      });
    }

    if (nextEmail) {
      const oldLower = oldEmailSource.toLowerCase();
      doc.querySelectorAll('a[href]').forEach((a) => {
        const href = a.getAttribute('href') || '';
        if (!/^mailto:/i.test(href)) return;
        const rest = href.slice(7);
        const qIdx = rest.indexOf('?');
        const addr = (qIdx >= 0 ? rest.slice(0, qIdx) : rest).trim();
        const query = qIdx >= 0 ? rest.slice(qIdx) : '';
        if (addr.toLowerCase() === oldLower) {
          const nextHref = `mailto:${nextEmail}${query}`;
          if (href !== nextHref) {
            a.setAttribute('href', nextHref);
            pageChanged = true;
            replacementCount++;
          }
        }
      });
    }

    if (addrPlan) {
      const oldStreetLower = addrPlan.oldStreet.toLowerCase();
      doc.querySelectorAll('a[href*="google.com/maps"]').forEach((a) => {
        const href = a.getAttribute('href') || '';
        let decoded = href;
        try {
          decoded = decodeURIComponent(href.replace(/\+/g, ' '));
        } catch {
          decoded = href;
        }
        if (decoded.toLowerCase().includes(oldStreetLower)) {
          const nextHref = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
            `${addrPlan.mapPrefix}${addrPlan.newFull}`
          )}`;
          if (href !== nextHref) {
            a.setAttribute('href', nextHref);
            pageChanged = true;
            replacementCount++;
          }
        }
      });
    }

    // B. Atrybuty aria-label, title, alt i meta[name="description"]
    const applyToString = (val) => {
      let cur = val;
      let hits = 0;
      if (nextPhone && oldPhoneRegex) {
        const res = replacePhoneInText(cur, oldPhoneRegex, nextPhone.display);
        cur = res.text;
        hits += res.count;
      }
      if (nextEmail && oldEmailRegex) {
        const res = replaceRegexInText(cur, oldEmailRegex, nextEmail);
        cur = res.text;
        hits += res.count;
      }
      if (addrPlan) {
        if (oldFullAddrRegex) {
          const res = replaceRegexInText(cur, oldFullAddrRegex, addrPlan.newFull);
          cur = res.text;
          hits += res.count;
        }
        if (oldStreetAddrRegex) {
          const res = replaceRegexInText(cur, oldStreetAddrRegex, addrPlan.newStreet);
          cur = res.text;
          hits += res.count;
        }
      }
      return { next: cur, hits };
    };

    for (const attr of ['aria-label', 'title', 'alt']) {
      doc.querySelectorAll(`[${attr}]`).forEach((el) => {
        const prev = el.getAttribute(attr);
        const { next, hits } = applyToString(prev);
        if (hits > 0 && next !== prev) {
          el.setAttribute(attr, next);
          pageChanged = true;
          replacementCount += hits;
        }
      });
    }

    const metaDesc = doc.querySelector('meta[name="description"]');
    if (metaDesc) {
      const prev = metaDesc.getAttribute('content') || '';
      const { next, hits } = applyToString(prev);
      if (hits > 0 && next !== prev) {
        metaDesc.setAttribute('content', next);
        pageChanged = true;
        replacementCount += hits;
      }
    }

    // C. Węzły tekstowe (bezpieczne dla ikon <svg> i <i>)
    walkTextNodes(doc.body, (node) => {
      const prev = node.nodeValue;
      const { next, hits } = applyToString(prev);
      if (hits > 0 && next !== prev) {
        node.nodeValue = next;
        pageChanged = true;
        replacementCount += hits;
      }
    });

    if (pageChanged) {
      await ctx.writePage(p.path, ctx.serialize(doc), {
        label: p.label,
        title: getDocTitle(doc),
        group: p.group,
      });
      changedPages.push(p.path);
    }
  }

  // D. Aktualizacja globals
  let globalsChanged = false;
  const isMainPhone =
    nextPhone &&
    (!args.staryTelefon ||
      !globals.phoneDisplay ||
      oldPhoneCore === normalizePhoneCore(globals.phoneDisplay));
  if (isMainPhone) {
    if (globals.phoneDisplay !== nextPhone.display) {
      globals.phoneDisplay = nextPhone.display;
      globalsChanged = true;
    }
    if (globals.phoneHref !== nextPhone.href) {
      globals.phoneHref = nextPhone.href;
      globalsChanged = true;
    }
  }
  if (nextPhone && oldPhoneRegex && typeof globals.footerCopy === 'string') {
    const res = replacePhoneInText(
      globals.footerCopy,
      oldPhoneRegex,
      nextPhone.display
    );
    if (res.count > 0 && res.text !== globals.footerCopy) {
      globals.footerCopy = res.text;
      globalsChanged = true;
      replacementCount += res.count;
    }
  }

  const currentGlobalEmail = String(globals.email || '').trim().toLowerCase();
  const isMainEmail =
    nextEmail &&
    (!args.staryEmail ||
      !currentGlobalEmail ||
      oldEmailSource.toLowerCase() === currentGlobalEmail);
  if (isMainEmail && globals.email !== nextEmail) {
    globals.email = nextEmail;
    globalsChanged = true;
  }
  if (nextEmail && oldEmailRegex && typeof globals.footerCopy === 'string') {
    const res = replaceRegexInText(globals.footerCopy, oldEmailRegex, nextEmail);
    if (res.count > 0 && res.text !== globals.footerCopy) {
      globals.footerCopy = res.text;
      globalsChanged = true;
      replacementCount += res.count;
    }
  }

  if (globalsChanged) {
    await ctx.setGlobals(globals);
  }

  const changedThings = [];
  if (nextPhone) changedThings.push(`telefon na ${nextPhone.display}`);
  if (nextEmail) changedThings.push(`e-mail na ${nextEmail}`);
  if (addrPlan) changedThings.push(`adres salonu na ${addrPlan.newFull}`);

  return {
    ok: true,
    changedPages,
    summary: `Gotowe: zmieniłem ${changedThings.join(', ')} (${replacementCount} wystąpień na ${changedPages.length} stronach${globalsChanged ? ' oraz w ustawieniach globalnych' : ''}). Polecenie „cofnij” przywraca całą operację.`,
  };
}
