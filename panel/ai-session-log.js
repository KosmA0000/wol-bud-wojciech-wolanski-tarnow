// Zapis sesji AI do analizy błędów: każda tura (prośba klienta, co AI widziało, każde wywołanie modelu,
// każde narzędzie z argumentami i wynikiem, czasy, błędy, odpowiedź). Trzymane w przeglądarce (IndexedDB),
// ostatnie 300 tur. Pobieranie: przycisk „⬇ Zapis AI” w szufladzie AI albo window.__wolbudAiLog.download().
// Klucze API nie są zapisywane (nie przechodzą przez ten moduł).

const DB_NAME = 'wolbud-ai-session-log';
const STORE = 'turns';
const MAX_TURNS = 300;
const CAP_RESULT = 6000;
const CAP_CONTEXT = 40000;

const cap = (v, n) => {
  let s;
  try {
    s = typeof v === 'string' ? v : JSON.stringify(v);
  } catch {
    s = String(v);
  }
  if (s == null) return s;
  return s.length > n ? s.slice(0, n) + `… [ucięto ${s.length - n} znaków]` : s;
};

let dbPromise = null;
function db() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function put(turn) {
  try {
    const d = await db();
    await new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(turn);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    const all = await allTurns();
    if (all.length > MAX_TURNS) {
      const tx = d.transaction(STORE, 'readwrite');
      for (const t of all.slice(0, all.length - MAX_TURNS)) tx.objectStore(STORE).delete(t.id);
    }
  } catch (e) {
    console.warn('ai-session-log: zapis nieudany', e);
  }
}

export async function allTurns() {
  try {
    const d = await db();
    const rows = await new Promise((resolve, reject) => {
      const req = d.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    return rows.sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
  } catch {
    return [];
  }
}

export async function clearTurns() {
  const d = await db();
  await new Promise((resolve) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = resolve;
    tx.onerror = resolve;
  });
}

function currentPage() {
  try {
    return new URLSearchParams(location.search).get('strona') || 'index.html';
  } catch {
    return '';
  }
}

/** Zaczyna zapis jednej tury AI. Zwraca obiekt z metodami model/toolStart/tool/retry/end. */
export function startAiTrace({ userMessage = '', history = [], contextSummary = '', settings = {}, images = [] } = {}) {
  const t0 = performance.now();
  const turn = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    startedAt: new Date().toISOString(),
    page: currentPage(),
    userMessage: String(userMessage || ''),
    historyLength: Array.isArray(history) ? history.length : 0,
    images: Array.isArray(images) ? images.length : 0,
    provider: settings?.provider || '',
    model: settings?.model || '',
    context: cap(contextSummary, CAP_CONTEXT),
    modelCalls: [],
    tools: [],
    retries: [],
    reply: null,
    error: null,
    durationMs: null,
  };
  const pending = new Map();
  let lastModelAt = t0;
  return {
    turn,
    model({ round, text, toolCalls }) {
      const now = performance.now();
      turn.modelCalls.push({
        round,
        ms: Math.round(now - lastModelAt),
        text: cap(text || '', 4000),
        toolCalls: (toolCalls || []).map((c) => ({ name: c.name, args: c.args || {} })),
      });
      lastModelAt = now;
    },
    toolStart({ id }) {
      pending.set(id, performance.now());
    },
    tool({ id, name, args, ok, summary, result }) {
      const s = pending.get(id);
      pending.delete(id);
      turn.tools.push({
        name,
        args: args || {},
        ok: Boolean(ok),
        summary: cap(summary || '', 500),
        ms: s ? Math.round(performance.now() - s) : null,
        result: cap(result, CAP_RESULT),
      });
      lastModelAt = performance.now();
    },
    retry(info) {
      turn.retries.push({ at: Math.round(performance.now() - t0), ...info });
    },
    end({ reply = null, error = null } = {}) {
      turn.reply = reply == null ? null : String(reply);
      turn.error = error == null ? null : String(error);
      turn.durationMs = Math.round(performance.now() - t0);
      turn.finishedAt = new Date().toISOString();
      return put(turn);
    },
  };
}

export async function buildExport() {
  const turns = await allTurns();
  return {
    format: 'wolbud-ai-session-log/1',
    exportedAt: new Date().toISOString(),
    panelUrl: location.href,
    userAgent: navigator.userAgent,
    turns,
  };
}

export async function downloadLog() {
  const data = await buildExport();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `zapis-ai-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
  return data.turns.length;
}

if (typeof window !== 'undefined') {
  window.__wolbudAiLog = { all: allTurns, export: buildExport, download: downloadLog, clear: clearTurns };
  const bind = () => {
    const btn = document.getElementById('ai-download-log');
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', async () => {
      const n = await downloadLog();
      btn.title = `Pobrano zapis ${n} tur AI`;
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
}
