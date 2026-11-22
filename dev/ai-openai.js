// Tłumaczenie żądania panelu na OpenAI chat/completions i odpowiedzi z powrotem (port z ai-proxy.php).
import { HttpError } from './http-util.js';
import { decodeToolArgs, sanitizeOpenAiSchema, toJsonObject, readToolCall, readToolDef } from './ai-schema.js';

/** @param {any} msg @param {{ n: number }} counter */
function assistantMessage(msg, counter) {
  const text = typeof msg.content === 'string' ? msg.content : '';
  const calls = [];
  const raw = msg.tool_calls ?? msg.toolCalls ?? [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const tc = readToolCall(item);
    if (!tc) continue;
    counter.n += 1;
    const args = typeof tc.rawArgs === 'string'
      ? (tc.rawArgs.trim() ? tc.rawArgs : '{}')
      : JSON.stringify(toJsonObject(tc.rawArgs));
    calls.push({ id: tc.id || `call_${counter.n}`, type: 'function', function: { name: tc.name, arguments: args } });
  }
  return calls.length ? { role: 'assistant', content: text || null, tool_calls: calls } : { role: 'assistant', content: text };
}

/**
 * @param {string} systemPrompt
 * @param {any[]} messages
 * @param {any[]} tools
 * @param {string} model
 */
export function buildOpenAiPayload(systemPrompt, messages, tools, model) {
  const out = systemPrompt ? [{ role: 'system', content: systemPrompt }] : [];
  const counter = { n: 0 };
  for (const msg of messages) {
    const role = typeof msg?.role === 'string' ? msg.role.trim().toLowerCase() : '';
    if (role === 'user') {
      out.push({ role: 'user', content: typeof msg.content === 'string' ? msg.content : '' });
    } else if (role === 'assistant' || role === 'model') {
      out.push(assistantMessage(msg, counter));
    } else if (role === 'tool') {
      const id = typeof msg.tool_call_id === 'string' ? msg.tool_call_id : (typeof msg.toolCallId === 'string' ? msg.toolCallId : '');
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content ?? '');
      out.push({ role: 'tool', tool_call_id: id, content });
    }
  }
  if (!out.length) throw new HttpError(400, 'Lista wiadomości nie zawiera żadnej poprawnej treści do wysłania.');
  const payload = { model, messages: out };
  const mapped = tools.map(readToolDef).filter(Boolean).map((d) => ({
    type: 'function',
    function: { name: d.name, description: d.description, parameters: sanitizeOpenAiSchema(d.parameters) },
  }));
  if (mapped.length) Object.assign(payload, { tools: mapped, tool_choice: 'auto' });
  return payload;
}

/** @param {string} apiKey */
export function openAiRequest(apiKey) {
  return { url: 'https://api.openai.com/v1/chat/completions', headers: { Authorization: `Bearer ${apiKey}` } };
}

/**
 * @param {any} data
 * @returns {{ text: string, toolCalls: any[] }}
 */
export function parseOpenAiResponse(data) {
  const message = data?.choices?.[0]?.message;
  if (!message || typeof message !== 'object') throw new HttpError(502, 'Model OpenAI zwrócił pustą odpowiedź.');
  const text = typeof message.content === 'string' ? message.content.trim() : '';
  const toolCalls = [];
  for (const tc of Array.isArray(message.tool_calls) ? message.tool_calls : []) {
    const name = typeof tc?.function?.name === 'string' ? tc.function.name.trim() : '';
    if (!name) continue;
    toolCalls.push({ id: typeof tc.id === 'string' && tc.id ? tc.id : `call_${toolCalls.length + 1}`, name,
      args: decodeToolArgs(tc.function.arguments ?? '{}') });
  }
  return { text, toolCalls };
}
