import { connectHome, readPublished } from './home-content.js?v=3';

const source = document.querySelector('script[data-wolbud-content]');
const home = connectHome(document, source?.dataset.wolbudContent);
const ready = readPublished(home, { signal: AbortSignal.timeout(8000) }).then((state) => {
  home.render(state);
  if (location.hash && state.order.join() !== home.original.order.join()) {
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'instant' });
  }
  return state;
});

window.wolbudHome = { home, ready };
ready.catch(console.warn);
