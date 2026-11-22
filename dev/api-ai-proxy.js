// Emulacja ai-proxy.php: klucz tylko po stronie serwera, model jawny w odpowiedzi, licznik wywołań.
import { HttpError, sendJson, handleMethod, readBody, parseJsonObject } from './http-util.js';
import { requireCsrf } from './api-auth.js';
import { loadEnv, secretValues } from './env-file.js';
import { resolveAiConfig } from './ai-config.js';
import { buildGeminiPayload, geminiRequest, parseGeminiResponse } from './ai-gemini.js';
import { buildOpenAiPayload, openAiRequest, parseOpenAiResponse } from './ai-openai.js';
import { callUpstream } from './ai-upstream.js';
import { maskSecrets } from './log.js';

export const AI_MAX_REQUEST_BYTES = 512 * 1024;
const MAX_MESSAGES = 120;
const MAX_TOOLS = 60;

/** Liczniki do /__dev/status i logów. */
export function createAiStats() {
  return { calls: 0, ok: 0, failed: 0, /** @type {Record<string, number>} */ byModel: {} };
}

/** @param {Record<string, any>} body */
function validateBody(body) {
  const { messages, tools = [] } = body;
  if (!Array.isArray(messages) || messages.length === 0) throw new HttpError(400, 'Pole "messages" musi być niepustą listą wiadomości.');
  if (messages.length > MAX_MESSAGES) throw new HttpError(400, `Przekroczono maksymalną liczbę wiadomości w jednym zapytaniu (${MAX_MESSAGES}).`);
  if (!Array.isArray(tools)) throw new HttpError(400, 'Pole "tools" musi być listą definicji narzędzi.');
  if (tools.length > MAX_TOOLS) throw new HttpError(400, `Przekroczono maksymalną liczbę narzędzi w jednym zapytaniu (${MAX_TOOLS}).`);
  return { systemPrompt: typeof body.systemPrompt === 'string' ? body.systemPrompt.trim() : '', messages, tools };
}

/** @param {import('./ai-config.js').AiConfig & { configured: true }} cfg @param {ReturnType<typeof validateBody>} b */
function buildCall(cfg, b) {
  if (cfg.provider === 'openai') {
    return { ...openAiRequest(cfg.apiKey), payload: buildOpenAiPayload(b.systemPrompt, b.messages, b.tools, cfg.model), parse: parseOpenAiResponse };
  }
  return { ...geminiRequest(cfg.model, cfg.apiKey), payload: buildGeminiPayload(b.systemPrompt, b.messages, b.tools), parse: parseGeminiResponse };
}

/**
 * Limit liczony dopiero dla wywołań, które naprawdę pójdą do dostawcy (L-021: brak klucza nie zużywa limitu).
 * @returns {Record<string, string>} nagłówki X-RateLimit-* do odpowiedzi
 */
function checkRateLimit(req, ctx) {
  const limit = ctx.rateLimiter.hit(req.socket.remoteAddress || 'local');
  const headers = { 'X-RateLimit-Limit': String(ctx.rateLimiter.max), 'X-RateLimit-Remaining': String(limit.remaining) };
  if (!limit.allowed) {
    throw new HttpError(429, `Zbyt wiele zapytań do Asystenta AI (limit ${ctx.rateLimiter.max} na minutę). Odczekaj ${limit.retryAfter} s i spróbuj ponownie.`,
      { retryAfter: limit.retryAfter }, { ...headers, 'Retry-After': String(limit.retryAfter) });
  }
  return headers;
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {{ envFile: string, env?: Record<string, string|undefined>, session: { csrfToken: string },
 *   rateLimiter: ReturnType<typeof import('./rate-limit.js').createRateLimiter>, fetchImpl?: typeof fetch,
 *   aiStats: ReturnType<typeof createAiStats>, log: (e: string, d?: object) => void }} ctx
 */
export async function handleAiProxy(req, res, ctx) {
  if (handleMethod(req, res, ['GET', 'POST'], 'GET lub POST')) return;
  const { values } = loadEnv(ctx.envFile, ctx.env);
  if (req.method === 'GET') {
    const cfg = resolveAiConfig(values);
    sendJson(res, 200, { configured: cfg.configured, authenticated: true, provider: cfg.configured ? cfg.provider : null,
      model: cfg.model, local: true });
    return;
  }
  requireCsrf(req, ctx.session);
  const body = parseJsonObject(await readBody(req, AI_MAX_REQUEST_BYTES, 'Żądanie przekracza maksymalny limit rozmiaru (512 KB).'),
    'Oczekiwano obiektu JSON z polami systemPrompt, messages i tools.');
  const cfg = resolveAiConfig(values, body);
  if (!cfg.configured) throw new HttpError(cfg.status, cfg.reason);
  const rlHeaders = checkRateLimit(req, ctx);
  const call = buildCall(cfg, validateBody(body));
  const secrets = secretValues(values);
  ctx.aiStats.calls += 1;
  const result = await callUpstream({ url: call.url, headers: call.headers, payload: call.payload, secrets, fetchImpl: ctx.fetchImpl });
  const entry = { provider: cfg.provider, model: cfg.model, modelSource: cfg.modelSource, call: ctx.aiStats.calls };
  if (!result.ok) {
    ctx.aiStats.failed += 1;
    ctx.log('ai_call_failed', { ...entry, status: result.status, upstreamStatus: result.upstreamStatus ?? null });
    throw new HttpError(result.status, maskSecrets(result.error, secrets), { provider: cfg.provider, model: cfg.model });
  }
  let parsed;
  try { parsed = call.parse(result.data); } catch (err) {
    ctx.aiStats.failed += 1;
    ctx.log('ai_call_failed', { ...entry, status: err?.status ?? 502, reason: 'parse' });
    throw err;
  }
  ctx.aiStats.ok += 1;
  ctx.aiStats.byModel[cfg.model] = (ctx.aiStats.byModel[cfg.model] || 0) + 1;
  ctx.log('ai_call', { ...entry, toolCalls: parsed.toolCalls.length });
  sendJson(res, 200, { provider: cfg.provider, model: cfg.model, requestedModel: cfg.model, fallbackUsed: false,
    text: parsed.text, toolCalls: parsed.toolCalls }, rlHeaders);
}
