// Dekoder encji HTML do wykrywania schematów ukrytych w atrybutach (L-018).
// Zakres: wszystkie encje nazwane HTML5, które dają znaki ASCII (tylko nimi da się zapisać schemat typu
// javascript:, data:text/html, expression( — znak spoza ASCII psuje nazwę schematu, więc przeglądarka go nie uzna),
// oraz encje liczbowe z bezpiecznym zakresem. Nazwy porównywane bez wielkości liter: nadmiarowe dekodowanie
// może najwyżej odrzucić więcej, nigdy mniej.

/** Encje nazwane HTML5 o wartości ASCII (WHATWG entities.json), klucze małymi literami. */
const ASCII_NAMED = Object.freeze({
  tab: '\t', newline: '\n', excl: '!', quot: '"', num: '#', dollar: '$', percnt: '%', amp: '&', apos: "'",
  lpar: '(', rpar: ')', ast: '*', midast: '*', plus: '+', comma: ',', period: '.', sol: '/', colon: ':',
  semi: ';', lt: '<', equals: '=', gt: '>', quest: '?', commat: '@', lsqb: '[', lbrack: '[', bsol: '\\',
  rsqb: ']', rbrack: ']', hat: '^', lowbar: '_', underbar: '_', grave: '`', diacriticalgrave: '`',
  lcub: '{', lbrace: '{', verbar: '|', vert: '|', verticalline: '|', rcub: '}', rbrace: '}', fjlig: 'fj',
  nbsp: ' ',
});

const REPLACEMENT = '�';

/**
 * Kod liczbowy na znak jak w przeglądarce: 0, surogaty i wartości ponad 0x10FFFF dają U+FFFD (bez wyjątku).
 * @param {string} digits @param {number} radix
 */
function fromNumeric(digits, radix) {
  if (digits.length > 8) return REPLACEMENT;
  const n = parseInt(digits, radix);
  if (!Number.isFinite(n) || n === 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return REPLACEMENT;
  return String.fromCodePoint(n);
}

/**
 * Jednokrotne dekodowanie encji (tak jak przeglądarka w wartości atrybutu). Średnik opcjonalny.
 * Nieznane encje zostają bez zmian.
 * @param {string} value
 * @returns {string}
 */
export function decodeEntities(value) {
  return value.replace(/&(?:#x0*([0-9a-f]+)|#0*(\d+)|([a-z][a-z0-9]*));?/gi, (m, hex, dec, name) => {
    if (hex !== undefined) return fromNumeric(hex, 16);
    if (dec !== undefined) return fromNumeric(dec, 10);
    return ASCII_NAMED[name.toLowerCase()] ?? m;
  });
}
