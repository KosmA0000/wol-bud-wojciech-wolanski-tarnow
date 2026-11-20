export const sections = Object.freeze({
  ofirmie: {
    label: 'O firmie',
    fields: { heading: ['.trust-compact h2', 'Nagłówek', 160], intro: ['.trust-compact p', 'Wprowadzenie', 800] },
  },
  oferta: {
    label: 'Oferta',
    fields: { heading: ['.offer-head h2', 'Nagłówek', 160], intro: ['.offer-head p', 'Wprowadzenie', 500] },
  },
  opinie: {
    label: 'Opinie',
    fields: { heading: ['.reviews-head h2', 'Nagłówek', 160], intro: ['.reviews-note', 'Tekst pod opiniami', 500] },
  },
});

const ids = Object.keys(sections);
export const contentURL = new URL('./home-content.json', import.meta.url);
export const normalize = (value) => value.replace(/\s+/gu, ' ').trim();

export function connectHome(doc) {
  const hero = doc.querySelector('main > #start');
  const nodes = Object.fromEntries(ids.map((id) => [id, doc.getElementById(id)]));
  const order = [];
  let next = hero?.nextElementSibling;
  while (next && nodes[next.id] === next) {
    order.push(next.id);
    next = next.nextElementSibling;
  }
  if (order.length !== ids.length) throw new Error('Brakuje sekcji strony głównej.');

  const targets = {};
  const fields = {};
  for (const id of ids) {
    targets[id] = {};
    fields[id] = {};
    for (const [key, [selector]] of Object.entries(sections[id].fields)) {
      const target = nodes[id].querySelector(selector);
      if (!target) throw new Error('Brakuje pola tekstowego na stronie głównej.');
      targets[id][key] = target;
      fields[id][key] = normalize(target.textContent);
      target.classList.add('home-copy-field');
    }
  }

  return {
    nodes, targets,
    original: { version: 1, revision: 'original', order, fields },
    renderOrder(newOrder) {
      let previous = hero;
      for (const id of newOrder) {
        const section = nodes[id];
        if (previous.nextElementSibling !== section) {
          hero.parentNode.insertBefore(section, previous.nextElementSibling);
        }
        previous = section;
      }
    },
    renderFields(newFields) {
      for (const id of ids) {
        for (const [key, target] of Object.entries(targets[id])) {
          const value = newFields[id][key];
          if (normalize(target.textContent) !== value) target.textContent = value;
        }
      }
    },
  };
}

export function isContent(value) {
  return value?.version === 1 &&
    /^(?:original|[a-f0-9-]{36})$/.test(value.revision) &&
    Array.isArray(value.order) && value.order.length === ids.length &&
    ids.every((id) => value.order.includes(id) &&
      Object.entries(sections[id].fields).every(([key, [, , max]]) => {
        const copy = value.fields?.[id]?.[key];
        return typeof copy === 'string' && copy === normalize(copy) && copy.length > 0 && copy.length <= max;
      }));
}

export async function readPublished(original, { signal, fresh = false } = {}) {
  const url = new URL(contentURL);
  if (fresh) url.searchParams.set('sprawdz', Date.now().toString(36));
  const response = await fetch(url, { cache: 'no-store', signal });
  if (!response.ok) throw new Error('Nie udało się odczytać opublikowanej wersji.');
  const value = await response.json();
  if (value.version === 1 && value.revision === 'original' && !value.fields) return original;
  if (!isContent(value)) throw new Error('Opublikowana treść ma nieprawidłowy format.');
  return value;
}
