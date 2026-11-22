// Tłumaczenie żądania panelu na format Gemini generateContent i odpowiedzi z powrotem (port z ai-proxy.php).
import { HttpError } from './http-util.js';
import { decodeToolArgs, sanitizeGeminiSchema, readToolCall, readToolDef } from './ai-schema.js';

/** @param {any[]} contents @param {string} role @param {any[]} parts */
function appendTurn(contents, role, parts) {
  if (!parts.length) return;
  const last = contents[contents.length - 1];
  if (last && last.role === role) last.parts.push(...parts);
  else contents.push({ role, parts });
}

/** @param {unknown} content */
function toolResult(content) {
  let v = content;
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '') return { result: '' };
    try { v = JSON.parse(t); } catch { return { result: content }; }
  }
  if (Array.isArray(v)) return v.length ? { result: v } : { ok: true };
  if (v && typeof v === 'object') return Object.keys(v).length ? v : { ok: true };
  return { result: v };
}

/** @param {any} msg @param {Map<string, string>} idToName */
function modelParts(msg, idToName) {
  const parts = [];
  if (typeof msg.content === 'string' && msg.content !== '') parts.push({ text: msg.content });
  const calls = msg.tool_calls ?? msg.toolCalls ?? [];
  for (const raw of Array.isArray(calls) ? calls : []) {
    const tc = readToolCall(raw);
    if (!tc) continue;
    if (tc.id) idToName.set(tc.id, tc.name);
    const part = { functionCall: { name: tc.name, args: decodeToolArgs(tc.rawArgs) } };
    if (tc.thoughtSignature) part.thoughtSignature = tc.thoughtSignature;
    parts.push(part);
  }
  return parts;
}

/** @param {any[]} tools */
function declarations(tools) {
  const out = [];
  for (const raw of tools) {
    const def = readToolDef(raw);
    if (!def) continue;
    const decl = { name: def.name, description: def.description };
    const params = sanitizeGeminiSchema(def.parameters);
    if (params && params.properties && Object.keys(params.properties).length) decl.parameters = params;
    out.push(decl);
  }
  return out;
}

/**
 * @param {string} systemPrompt
 * @param {any[]} messages
 * @param {any[]} tools
 */
export function buildGeminiPayload(systemPrompt, messages, tools) {
  const contents = [];
  const idToName = new Map();
  for (const msg of messages) {
    const role = typeof msg?.role === 'string' ? msg.role.trim().toLowerCase() : '';
    if (role === 'user' && typeof msg.content === 'string' && msg.content !== '') {
      appendTurn(contents, 'user', [{ text: msg.content }]);
    } else if (role === 'assistant' || role === 'model') {
      appendTurn(contents, 'model', modelParts(msg, idToName));
    } else if (role === 'tool') {
      const id = typeof msg.tool_call_id === 'string' ? msg.tool_call_id : (typeof msg.toolCallId === 'string' ? msg.toolCallId : '');
      const name = (typeof msg.name === 'string' && msg.name.trim()) || idToName.get(id) || 'unknown_tool';
      appendTurn(contents, 'user', [{ functionResponse: { name, response: toolResult(msg.content ?? '') } }]);
    }
  }
  if (!contents.length) throw new HttpError(400, 'Lista wiadomości nie zawiera żadnej poprawnej treści do wysłania.');
  const payload = { contents };
  if (systemPrompt) payload.systemInstruction = { parts: [{ text: systemPrompt }] };
  const decl = declarations(tools);
  if (decl.length) payload.tools = [{ functionDeclarations: decl }];
  return payload;
}

/**
 * Adres i nagłówki wywołania. Klucz idzie w nagłówku x-goog-api-key, nie w URL (nie wycieknie w błędach adresu).
 * @param {string} model @param {string} apiKey
 */
export function geminiRequest(model, apiKey) {
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    headers: { 'x-goog-api-key': apiKey },
  };
}

/**
 * @param {any} data odpowiedź Gemini
 * @returns {{ text: string, toolCalls: any[] }}
 */
export function parseGeminiResponse(data) {
  const candidates = data?.candidates;
  if (!Array.isArray(candidates) || !candidates.length) {
    const block = data?.promptFeedback?.blockReason;
    if (typeof block === 'string' && block) throw new HttpError(400, `Model AI odrzucił zapytanie ze względów bezpieczeństwa (${block}).`);
    throw new HttpError(502, 'Model AI zwrócił pustą odpowiedź. Spróbuj sformułować polecenie inaczej.');
  }
  const cand = candidates[0] || {};
  const parts = Array.isArray(cand?.content?.parts) ? cand.content.parts : [];
  const texts = [];
  const toolCalls = [];
  for (const part of parts) {
    if (!part || part.thought) continue;
    if (typeof part.text === 'string' && part.text) texts.push(part.text);
    const fc = part.functionCall;
    const name = typeof fc?.name === 'string' ? fc.name.trim() : '';
    if (!name) continue;
    const call = { id: typeof fc.id === 'string' && fc.id ? fc.id : `call_${toolCalls.length + 1}`, name, args: decodeToolArgs(fc.args ?? {}) };
    if (typeof part.thoughtSignature === 'string' && part.thoughtSignature) call.thoughtSignature = part.thoughtSignature;
    toolCalls.push(call);
  }
  const text = texts.join('\n').trim();
  if (!text && !toolCalls.length && (cand.finishReason === 'SAFETY' || cand.finishReason === 'RECITATION')) {
    throw new HttpError(400, `Model AI przerwał odpowiedź ze względów bezpieczeństwa (${cand.finishReason}).`);
  }
  return { text, toolCalls };
}
