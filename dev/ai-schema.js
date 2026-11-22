// Pomocnicze funkcje proxy AI: argumenty narzędzi i czyszczenie schematów JSON pod Gemini i OpenAI (port z ai-proxy.php).

/** @param {unknown} v */
const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/**
 * Zamienia wartość na obiekt JSON (lista → {value: lista}, inne → {}).
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
export function toJsonObject(value) {
  if (Array.isArray(value)) return value.length ? { value } : {};
  return isPlainObject(value) ? /** @type {Record<string, unknown>} */ (value) : {};
}

/**
 * Argumenty wywołania narzędzia: tekst JSON albo obiekt.
 * @param {unknown} raw
 */
export function decodeToolArgs(raw) {
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (t === '' || t === '{}') return {};
    try { return toJsonObject(JSON.parse(t)); } catch { return {}; }
  }
  return toJsonObject(raw);
}

/**
 * Schemat parametrów w podzbiorze akceptowanym przez Gemini. Zwraca null dla pustego.
 * @param {unknown} schema
 * @returns {Record<string, any>|null}
 */
export function sanitizeGeminiSchema(schema) {
  if (!isPlainObject(schema) || Object.keys(/** @type {object} */ (schema)).length === 0) return null;
  const s = /** @type {Record<string, any>} */ (schema);
  /** @type {Record<string, any>} */
  const out = {};
  if (typeof s.type === 'string') out.type = s.type.trim().toLowerCase();
  if (typeof s.description === 'string' && s.description !== '') out.description = s.description;
  if (Array.isArray(s.enum)) {
    const vals = s.enum.filter((x) => ['string', 'number', 'boolean'].includes(typeof x)).map(String).filter((x) => x !== '');
    if (vals.length) out.enum = vals;
  }
  if (typeof s.nullable === 'boolean') out.nullable = s.nullable;
  if (out.type === 'array') out.items = sanitizeGeminiSchema(s.items) ?? { type: 'string' };
  if (out.type === 'object' || s.properties !== undefined) {
    out.type = 'object';
    const props = {};
    if (isPlainObject(s.properties)) {
      for (const [name, sub] of Object.entries(s.properties)) {
        const clean = name ? sanitizeGeminiSchema(sub) : null;
        if (clean) props[name] = clean;
      }
    }
    if (Object.keys(props).length) {
      out.properties = props;
      const req = Array.isArray(s.required) ? [...new Set(s.required.filter((r) => typeof r === 'string' && r in props))] : [];
      if (req.length) out.required = req;
    }
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Schemat parametrów dla OpenAI: zawsze obiekt z properties.
 * @param {unknown} schema
 * @returns {Record<string, any>}
 */
export function sanitizeOpenAiSchema(schema) {
  if (!isPlainObject(schema) || Object.keys(/** @type {object} */ (schema)).length === 0) {
    return { type: 'object', properties: {} };
  }
  const clean = { .../** @type {Record<string, any>} */ (schema) };
  if (typeof clean.type !== 'string') clean.type = 'object';
  if (clean.type === 'object') {
    if (!isPlainObject(clean.properties) || Object.keys(clean.properties).length === 0) {
      clean.properties = {};
    } else {
      clean.properties = Object.fromEntries(Object.entries(clean.properties)
        .map(([k, v]) => [k, isPlainObject(v) && v.type === 'object' ? sanitizeOpenAiSchema(v) : v]));
    }
  }
  return clean;
}

/**
 * Wspólny odczyt wywołania narzędzia z wiadomości (format OpenAI function.{name,arguments} albo płaski).
 * @param {any} tc
 * @returns {{ id: string, name: string, rawArgs: unknown, thoughtSignature?: string }|null}
 */
export function readToolCall(tc) {
  if (!isPlainObject(tc)) return null;
  const fn = isPlainObject(tc.function) ? tc.function : tc;
  const name = typeof fn.name === 'string' ? fn.name.trim() : '';
  if (!name) return null;
  const rawArgs = fn.args ?? fn.arguments ?? tc.args ?? tc.arguments ?? {};
  const out = { id: typeof tc.id === 'string' ? tc.id : '', name, rawArgs };
  if (typeof tc.thoughtSignature === 'string' && tc.thoughtSignature) out.thoughtSignature = tc.thoughtSignature;
  return out;
}

/** @param {any} tool @returns {{ name: string, description: string, parameters: unknown }|null} */
export function readToolDef(tool) {
  if (!isPlainObject(tool)) return null;
  const fn = isPlainObject(tool.function) ? tool.function : tool;
  const name = typeof fn.name === 'string' ? fn.name.trim() : '';
  if (!name) return null;
  return { name, description: typeof fn.description === 'string' ? fn.description : '', parameters: fn.parameters };
}
