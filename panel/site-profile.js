/**
 * White-Label Site Profile — jedyny plik konfiguracyjny zmieniany per klient.
 * Zawiera branding panelu, listę chronionych stron, punkt przywracania (baseline)
 * oraz kontekst biznesowy dla asystenta AI.
 */
export const siteProfile = Object.freeze({
  brandName: 'WOL-BUD',
  studioTitle: 'WOL-BUD Studio',
  companyFullName: 'WOL-BUD Wojciech Wolański',
  siteUrl: 'https://wol-bud.com.pl',
  ogImageSrc: 'img/wolbud-logo.webp',
  industry:
    'okna PCV i aluminiowe, drzwi zewnętrzne i wewnętrzne, bramy garażowe, rolety, parapety oraz ciepły montaż warstwowy',
  locations: 'Tarnów (ul. Giełdowa 10) i Radłów (ul. Kolejowa 5)',
  foundedYear: 1995,
  logoSrc: 'img/wolbud-logo.webp',
  faviconSrc: 'img/favicon.png',
  accentColor: '#2c4d19',
  accentLight: '#426728',
  baselineCommitSha: '7343a1aa2251cbc9c831337b8b9aad85e919c7c3',
  protectedPages: Object.freeze([
    'index.html',
    'oferta/index.html',
    'uslugi/index.html',
    'realizacje/index.html',
    'o-firmie/index.html',
    'nasze-sklepy/index.html',
    'kontakt/index.html',
  ]),
  support: Object.freeze({
    name: 'Twórca strony · Wsparcie techniczne',
    role: 'Pomoc z panelem, kopie zapasowe i awarie',
    phoneDisplay: '+48 000 000 000 (uzupełnij w site-profile.js)',
    phoneHref: 'tel:+48000000000',
    email: 'pomoc@twojadomena.pl',
    hours: 'Pon.–Pt. 09:00–17:00',
    note: 'Coś nie działa albo obawiasz się, że popsułeś układ? Zadzwoń lub napisz — zawsze mamy bezpieczną oryginalną kopię zapasową Twojej strony.',
  }),
  aiBusinessContext:
    'WOL-BUD Wojciech Wolański to rodzinna firma działająca od 1995 roku z dwoma salonami sprzedaży: w Tarnowie (ul. Giełdowa 10) oraz w Radłowie (ul. Kolejowa 5). ' +
    'Specjalizuje się w sprzedaży i profesjonalnym montażu stolarki otworowej: okien PCV i aluminiowych, drzwi zewnętrznych i wewnętrznych, bram garażowych, rolet zewnętrznych i wewnętrznych, żaluzji, plis, moskitier, parapetów, blatów oraz daszków poliwęglanowych. ' +
    'Zapewnia bezpłatny pomiar, doradztwo i wycenę, ciepły montaż warstwowy (m.in. okna Petecki z materiałami Illbruck), serwis okien i drzwi, prace wykończeniowe i murarskie oraz kompleksową obsługę inwestycji. ' +
    'Kontakt główny: tel. 534 091 021, e-mail biuro@wol-bud.com.pl. ' +
    'Ton komunikacji: konkretny, rzetelny, fachowy i przyjazny — bez pustego marketingowego żargonu, skierowany do inwestorów indywidualnych budujących lub remontujących dom oraz do firm i instytucji.',
  aiSuggestions: Object.freeze([
    'Popraw opis na stronie głównej, aby mocniej podkreślał bezpłatny pomiar i ciepły montaż',
    'Utwórz nową podstronę z promocją sezonową na okna PCV i bramy garażowe z wezwaniem do kontaktu',
    'Dodaj sekcję FAQ z najczęstszymi pytaniami o czas realizacji, pomiar i montaż warstwowy',
    'Zaktualizuj godziny otwarcia salonów w Tarnowie i Radłowie oraz sprawdź poprawność linków kontaktowych',
  ]),
});
