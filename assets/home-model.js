export const pageGroups = {
  main: { label: 'Sekcje strony', type: 'section' },
  catalog: { label: 'Kafelki oferty', owner: 'oferta', selector: '.home-catalog-grid', item: '.home-cat-card', type: 'tile' },
  categories: { label: 'Dodatkowe kategorie', owner: 'oferta', selector: '.home-extra-categories', item: '.home-extra-category', type: 'link' },
  products: { label: 'Polecane produkty', owner: 'oferta', selector: '.home-featured-grid', item: '.home-featured-product', type: 'product' },
  services: { label: 'Usługi', owner: 'oferta', selector: '.home-services-grid', item: '.home-service-item', type: 'service' },
  reviews: { label: 'Opinie klientów', owner: 'opinie', selector: '.reviews-track', item: '.review', type: 'review' },
  photos: { label: 'Realizacje i partnerzy', owner: 'galeria', selector: '.photo-band', members: ['realizacje', 'partnerzy'] },
  projects: { label: 'Kafelki realizacji', owner: 'realizacje', selector: '.realization-cards', item: '.realization-card', type: 'project' },
  partners: { label: 'Logotypy partnerów', owner: 'partnerzy', selector: '.partner-row', item: '.partner-logo', type: 'logo' },
  stores: { label: 'Salony', owner: 'kontakt', selector: '.kt-adres', item: '.kt-store-item' },
  details: { label: 'Dane i godziny otwarcia', owner: 'kontakt', selector: '.kt-lista', item: 'li' },
  menu: { label: 'Pozycje menu', owner: 'header', selector: '#site-menu', item: 'a:not(.menu-phone)', type: 'link' },
  footerLinks: { label: 'Odnośniki w stopce', owner: 'footer', selector: '.footer-links', item: 'a', type: 'link' },
};

export const regions = {
  header: ['Nagłówek i menu', 'header.bar'],
  start: ['Baner otwierający', 'main > #start'],
  ofirmie: ['O firmie', 'main > #ofirmie'],
  oferta: ['Oferta', 'main > #oferta'],
  opinie: ['Opinie', 'main > #opinie'],
  galeria: ['Realizacje i partnerzy', 'main > .photo-band'],
  realizacje: ['Realizacje', '.photo-band > #realizacje'],
  partnerzy: ['Partnerzy', '.photo-band > .partners-section'],
  kontakt: ['Kontakt', 'main > #kontakt'],
  footer: ['Stopka', 'footer'],
  shortcuts: ['Skróty kontaktu', '.contact-bubbles'],
  utility: ['Przycisk powrotu na górę', '#scrollTopBtn'],
};

export const mainIds = ['start', 'ofirmie', 'oferta', 'opinie', 'galeria', 'kontakt'];
export const fixedIds = ['header', 'footer', 'shortcuts', 'utility'];
export const sectionTypes = { 'section-review': 'Opinie', 'section-product': 'Produkty', 'section-tile': 'Kafelki', 'section-text': 'Treść' };
export const itemTypes = {
  review: 'Opinia', product: 'Produkt', tile: 'Kafelek', project: 'Realizacja',
  text: 'Tekst ze zdjęciem', link: 'Odnośnik', service: 'Usługa', logo: 'Logotyp',
};
export const kindForSection = (type) => type.slice('section-'.length);
export const nestedGroup = (id) => 'wewnatrz-' + id;
export const normalize = (value) => value.replace(/\s+/gu, ' ').trim();
export const maxText = 2000;
const maxState = 700000;
const revisionPattern = /^(?:original|[a-f0-9-]{36})$/;
const blockPattern = /^[a-zA-Z][a-zA-Z\d-]{0,89}$/;
const keyPattern = /^[a-zA-Z][a-zA-Z\d-]{0,89}:[a-z\d-]+$/;
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const shortText = (value, max) => typeof value === 'string' && value.length <= max && value === normalize(value);
const uniqueBlocks = (values) => Array.isArray(values) && values.length <= 100 &&
  new Set(values).size === values.length && values.every((id) => typeof id === 'string' && blockPattern.test(id));

export function safeLink(value) {
  if (value === '') return true;
  if (typeof value !== 'string' || value.length > 1000 || /[\s\\\u0000-\u001f\u007f]/u.test(value) || value.startsWith('//')) return false;
  try {
    const url = new URL(value, 'https://wolbud.invalid/');
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function safeImage(value) {
  return typeof value === 'string' && (safeLink(value) ||
    (value.length <= 240000 && /^data:image\/(?:webp|png|jpeg);base64,[a-z0-9+/]+=*$/i.test(value)));
}

export function isLegacy(value) {
  return value?.version === 1 && revisionPattern.test(value.revision) && Array.isArray(value.order) &&
    value.order.length === 3 && ['ofirmie', 'oferta', 'opinie'].every((id) => value.order.includes(id) &&
      ['heading', 'intro'].every((key) => shortText(value.fields?.[id]?.[key], maxText)));
}

export function isContent(value) {
  if (value?.version !== 2 || !revisionPattern.test(value.revision) || !uniqueBlocks(value.order) ||
      !object(value.lists) ||
      !object(value.texts) || !object(value.added) || !object(value.media) ||
      new TextEncoder().encode(JSON.stringify(value)).length > maxState) return false;
  if (!Object.entries(value.texts).every(([key, text]) => keyPattern.test(key) && shortText(text, maxText))) return false;
  return Object.entries(value.lists).every(([key, list]) => blockPattern.test(key) && uniqueBlocks(list)) &&
    Object.entries(value.media).every(([id, media]) => blockPattern.test(id) &&
      object(media) && (media.link === undefined || safeLink(media.link)) &&
      (media.image === undefined || safeImage(media.image))) &&
    Object.entries(value.added).every(([id, item]) => /^blok-[a-f0-9-]{36}$/.test(id) &&
      object(item) && blockPattern.test(item.group) && shortText(item.title, 160) && item.title !== '' &&
      shortText(item.body, maxText) && safeLink(item.link) && safeImage(item.image) &&
      Number.isInteger(item.rating) && item.rating >= 1 && item.rating <= 5 &&
      (item.group === 'main'
        ? Object.hasOwn(sectionTypes, item.type) && value.order.includes(id)
        : Object.hasOwn(itemTypes, item.type) && value.lists[item.group]?.includes(id)));
}

export function sameContent(a, b) {
  if (!a || !b) return false;
  const { revision: aRevision, ...aContent } = a;
  const { revision: bRevision, ...bContent } = b;
  return JSON.stringify(aContent) === JSON.stringify(bContent);
}
