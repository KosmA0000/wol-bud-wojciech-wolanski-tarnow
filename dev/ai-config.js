// Wybór dostawcy, modelu i klucza AI dla trybu lokalnego. Bez cichej zmiany modelu: brak listy zapasowej.

export const SUPPORTED_PROVIDERS = Object.freeze(['gemini', 'openai']);
export const DEFAULT_MODELS = Object.freeze({ gemini: 'gemini-3-flash-preview', openai: 'gpt-4.1-mini' });
const KEY_NAMES = { gemini: 'GEMINI_API_KEY', openai: 'OPENAI_API_KEY' };
const MODEL_RE = /^[a-zA-Z0-9._:-]{1,100}$/;

/**
 * @typedef {{ configured: true, provider: string, model: string, apiKey: string, modelSource: string }
 *   | { configured: false, provider: string|null, model: string|null, reason: string, status: number }} AiConfig
 */

/**
 * Ustala konfigurację wywołania. Dostawca: z żądania → WOLBUD_AI_PROVIDER → ten, do którego jest klucz.
 * Model: z żądania → WOLBUD_AI_MODEL → domyślny dostawcy. Odpowiedź proxy podaje model faktycznie użyty.
 * @param {Record<string, string>} env wartości z loadEnv
 * @param {{ provider?: unknown, model?: unknown }} [request]
 * @returns {AiConfig}
 */
export function resolveAiConfig(env, request = {}) {
  const fromRequest = typeof request.provider === 'string' ? request.provider.trim().toLowerCase() : '';
  const fromEnv = (env.WOLBUD_AI_PROVIDER || '').trim().toLowerCase();
  const provider = fromRequest || fromEnv || (env.OPENAI_API_KEY && !env.GEMINI_API_KEY ? 'openai' : 'gemini');
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    return { configured: false, provider: null, model: null, status: 400,
      reason: 'Nieprawidłowy dostawca AI. Dozwolone wartości: gemini lub openai.' };
  }
  const keyName = KEY_NAMES[provider];
  const apiKey = (env[keyName] || '').trim();
  if (!apiKey) {
    return { configured: false, provider, model: null, status: 503,
      reason: `Asystent AI w trybie lokalnym jest wyłączony: brak klucza ${keyName} w pliku .env.local. Poproś właściciela projektu o dopisanie klucza i spróbuj ponownie.` };
  }
  const requested = typeof request.model === 'string' ? request.model.trim() : '';
  const modelSource = requested ? 'request' : (env.WOLBUD_AI_MODEL ? 'env' : 'default');
  const model = requested || (env.WOLBUD_AI_MODEL || '').trim() || DEFAULT_MODELS[provider];
  if (!MODEL_RE.test(model)) {
    return { configured: false, provider, model: null, status: 400, reason: 'Nieprawidłowa nazwa modelu AI.' };
  }
  return { configured: true, provider, model, apiKey, modelSource };
}
