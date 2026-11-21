const STORAGE_KEY = 'wolbud:cms:ai-settings';

export const DEFAULT_AI_SETTINGS = Object.freeze({
  provider: 'gemini',
  model: 'gemini-4-hydrogen',
  apiKey: '',
  proxyUrl: './ai-proxy.php',
});

export const AI_MODELS = Object.freeze({
  gemini: [
    { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen (HIGH)' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  ],
  openai: [
    { id: 'gpt-4.1', label: 'GPT-4.1' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
  ],
  openrouter: [
    { id: 'nvidia/nemotron-3.5-super-vl:free', label: 'Nemotron 3.5 Super VL (free)' },
  ],
});

const RAW_TOOLS = [
  {
    name: 'list_files',
    description: 'Zwraca listę wszystkich plików/podstron witryny.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'read_file',
    description: 'Czyta surową zawartość dowolnego pliku strony (HTML/CSS/JS).',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Ścieżka pliku, np. index.html, oferta/index.html, assets/site.css' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Zapisuje surową zawartość dowolnego pliku strony (tworzy lub nadpisuje).',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Ścieżka pliku, np. index.html, kategorie/kebab/index.html' },
        content: { type: 'string', description: 'Pełna zawartość pliku.' },
      },
      required: ['path', 'content'],
    },
  },
];

export function loadAiSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_AI_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_AI_SETTINGS };
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

export function saveAiSettings(settings) {
  const next = { ...DEFAULT_AI_SETTINGS, ...(settings || {}) };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

export async function checkProxyStatus(proxyUrl = './ai-proxy.php') {
  try {
    const sep = proxyUrl.includes('?') ? '&' : '?';
    const res = await fetch(`${proxyUrl}${sep}status=1`, { method: 'GET', cache: 'no-store' });
    if (!res.ok) return { available: false, configured: false };
    const data = await res.json();
    return { available: true, configured: Boolean(data?.configured), ...data };
  } catch {
    return { available: false, configured: false };
  }
}

export async function runAiTurn({
  userMessage,
  history = [],
  contextSummary = '',
  settings,
  csrfToken = '',
  toolExecutor,
  onToolCall,
  onToolResult,
  signal,
}) {
  const s = { ...DEFAULT_AI_SETTINGS, ...(settings || loadAiSettings()) };
  const isLocalProxy = Boolean(document.querySelector('meta[name="cms-local-proxy"]'));
  const useDirectGemini = !isLocalProxy && s.provider !== 'proxy' && Boolean(s.apiKey);

  const messages = [
    ...history.slice(-12).map((m) => ({ role: m.role, content: m.text })),
    { role: 'user', content: userMessage },
  ];
  const tools = RAW_TOOLS.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
  const toolLog = [];
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (csrfToken) headers['X-CMS-CSRF-Token'] = csrfToken;

  const callModel = async () => {
    if (useDirectGemini) {
      const model = s.model || 'gemini-4-hydrogen';
      const geminiContents = [];
      for (const m of messages) {
        if (m.role === 'tool') {
          geminiContents.push({
            role: 'user',
            parts: [{ functionResponse: { name: m.name, id: m.tool_call_id, response: JSON.parse(m.content || '{}') } }],
          });
        } else if (m.role === 'assistant') {
          const parts = [];
          if (m.content) parts.push({ text: m.content });
          for (const tc of m.tool_calls || []) {
            const p = { functionCall: { name: tc.function.name, id: tc.id, args: JSON.parse(tc.function.arguments || '{}') } };
            if (tc.thoughtSignature) p.thoughtSignature = tc.thoughtSignature;
            parts.push(p);
          }
          geminiContents.push({ role: 'model', parts });
        } else {
          geminiContents.push({ role: 'user', parts: [{ text: String(m.content || '') }] });
        }
      }
      const gTools = [{
        functionDeclarations: RAW_TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          ...(Object.keys(t.parameters.properties || {}).length > 0
            ? {
                parameters: {
                  type: 'OBJECT',
                  properties: Object.fromEntries(
                    Object.entries(t.parameters.properties).map(([k, v]) => [k, { type: v.type.toUpperCase(), description: v.description }])
                  ),
                  required: t.parameters.required,
                },
              }
            : {}),
        })),
      }];
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(s.apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal,
          body: JSON.stringify({
            ...(contextSummary ? { systemInstruction: { parts: [{ text: contextSummary }] } } : {}),
            contents: geminiContents,
            tools: gTools,
            generationConfig: model.includes('hydrogen') ? { thinkingConfig: { thinkingLevel: 'HIGH' } } : {},
          }),
        }
      );
      if (!res.ok) throw new Error(`Błąd Gemini API (HTTP ${res.status})`);
      const data = await res.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const text = parts.filter((p) => !p.thought && p.text).map((p) => p.text).join('\n').trim();
      const toolCalls = parts.filter((p) => p.functionCall).map((p, i) => ({
        id: p.functionCall.id || `g_${Date.now()}_${i}`,
        name: p.functionCall.name,
        args: p.functionCall.args || {},
        ...(p.thoughtSignature ? { thoughtSignature: p.thoughtSignature } : {}),
      }));
      return { text, toolCalls };
    }

    const res = await fetch(s.proxyUrl || './ai-proxy.php', {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({
        systemPrompt: contextSummary || '',
        messages,
        tools,
        ...(s.provider && s.provider !== 'proxy' ? { provider: s.provider } : {}),
        ...(s.model ? { model: s.model } : {}),
      }),
    });
    if (!res.ok) {
      throw new Error(
        res.status === 405
          ? 'HTTP 405 — na GitHub Pages nie działa PHP proxy. Otwórz lokalnie http://127.0.0.1:4180/panel/ albo wpisz klucz Gemini API w ustawieniach AI.'
          : `Błąd serwera AI (HTTP ${res.status})`
      );
    }
    return res.json();
  };

  for (let round = 0; round < 16; round += 1) {
    const data = await callModel();
    const calls = Array.isArray(data?.toolCalls) ? data.toolCalls : [];
    const text = typeof data?.text === 'string' ? data.text.trim() : '';

    if (calls.length === 0) {
      return { reply: text || 'Gotowe.', toolLog };
    }

    messages.push({
      role: 'assistant',
      content: text,
      tool_calls: calls.map((tc, i) => ({
        id: tc.id || `call_${round}_${i}`,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.args || {}) },
        ...(tc.thoughtSignature ? { thoughtSignature: tc.thoughtSignature } : {}),
      })),
    });

    for (let i = 0; i < calls.length; i += 1) {
      const tc = calls[i];
      const id = tc.id || `call_${round}_${i}`;
      const args = tc.args || {};
      await onToolCall?.({ id, name: tc.name, args });
      let result;
      let ok = true;
      try {
        result = await toolExecutor(tc.name, args);
        if (result?.ok === false || result?.error) ok = false;
      } catch (e) {
        ok = false;
        result = { ok: false, error: e?.message || String(e) };
      }
      const summary = ok ? 'OK' : (result?.error || 'Błąd');
      toolLog.push({ name: tc.name, args, ok, summary });
      await onToolResult?.({ id, name: tc.name, args, ok, summary, result });
      messages.push({
        role: 'tool',
        tool_call_id: id,
        name: tc.name,
        content: JSON.stringify(result),
      });
    }
  }

  return { reply: 'Zakończono.', toolLog };
}
