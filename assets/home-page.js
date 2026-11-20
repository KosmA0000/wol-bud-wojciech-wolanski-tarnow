import { connectHome, readPublished } from './home-content.js';

const home = connectHome(document);
const ready = readPublished(home.original, { signal: AbortSignal.timeout(8000) }).then((state) => {
  home.renderOrder(state.order);
  home.renderFields(state.fields);
  if (location.hash && state.order.join() !== home.original.order.join()) {
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'instant' });
  }
  return state;
});

window.wolbudHome = { home, ready };
ready.catch(console.warn);
