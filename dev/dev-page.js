// Strona sterowania trybem lokalnym pod /__dev/: stan piaskownicy, liczniki AI i przycisk resetu.

/** Teksty strony sterowania (interfejs po polsku). */
export const DEV_TEXTS = Object.freeze({
  title: 'WOL-BUD Studio — tryb lokalny',
  intro: 'Zapisy z panelu trafiają tylko do piaskownicy, czyli jednorazowej kopii strony. Źródło się nie zmienia.',
  reset: 'Resetuj piaskownicę',
  confirm: 'Usunąć wszystkie zmiany w piaskownicy i skopiować stronę od nowa?',
  done: 'Piaskownica odtworzona.',
  failed: 'Reset nie powiódł się: ',
  openSite: 'Otwórz stronę',
  openPanel: 'Otwórz panel',
});

/** @param {string} s */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * @param {{ port: number, sandboxDir: string, createdAt: string }} info
 * @returns {string}
 */
export function renderDevPage(info) {
  const t = DEV_TEXTS;
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="robots" content="noindex">
<title>${esc(t.title)}</title><style>body{font:16px system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px}
button{font:inherit;padding:10px 18px;cursor:pointer}pre{background:#f4f4f4;padding:12px;overflow:auto}</style></head>
<body><h1>${esc(t.title)}</h1><p>${esc(t.intro)}</p>
<p><a href="/">${esc(t.openSite)}</a> · <a href="/panel/">${esc(t.openPanel)}</a></p>
<p>Port: ${info.port}<br>Piaskownica: <code>${esc(info.sandboxDir)}</code><br>Utworzona: <span id="created">${esc(info.createdAt)}</span></p>
<button id="reset">${esc(t.reset)}</button> <span id="msg" role="status"></span>
<pre id="status"></pre>
<script>
const T = ${JSON.stringify({ confirm: t.confirm, done: t.done, failed: t.failed })};
async function token() { const r = await fetch('/panel/auth.php?status=1'); return (await r.json()).csrfToken; }
async function refresh() { const r = await fetch('/__dev/status'); document.getElementById('status').textContent = JSON.stringify(await r.json(), null, 2); }
document.getElementById('reset').onclick = async () => {
  if (!confirm(T.confirm)) return;
  const msg = document.getElementById('msg');
  try {
    const r = await fetch('/__dev/reset', { method: 'POST', headers: { 'X-CMS-CSRF-Token': await token() } });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || r.status);
    document.getElementById('created').textContent = d.createdAt;
    msg.textContent = T.done;
  } catch (e) { msg.textContent = T.failed + e.message; }
  refresh();
};
refresh();
</script></body></html>`;
}
