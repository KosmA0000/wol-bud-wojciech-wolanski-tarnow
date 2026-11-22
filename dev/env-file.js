// Odczyt kluczy z .env.local (ścieżka z WOLBUD_ENV_FILE) i zmiennych środowiskowych. Wartości nigdy nie trafiają do logów.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Domyślna ścieżka pliku kluczy: ~/OpenBot/Shared/wolbud/.env.local */
export const DEFAULT_ENV_FILE = path.join(os.homedir(), 'OpenBot', 'Shared', 'wolbud', '.env.local');

/** Nazwy zmiennych czytanych przez serwer dev. */
export const ENV_KEYS = Object.freeze(['GEMINI_API_KEY', 'OPENAI_API_KEY', 'WOLBUD_AI_PROVIDER', 'WOLBUD_AI_MODEL']);

/**
 * Parsuje plik w formacie KEY=VALUE (# komentarze, opcjonalne cudzysłowy, opcjonalne "export ").
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseEnv(text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^export\s+/, '');
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) out[key] = value;
  }
  return out;
}

/**
 * Wczytuje konfigurację: plik (jeśli istnieje), potem zmienne środowiskowe nadpisują wartości.
 * Czytane przy każdym wywołaniu, więc klucz dopisany po starcie serwera działa bez restartu.
 * @param {string} file
 * @param {Record<string, string|undefined>} [env]
 * @returns {{ values: Record<string, string>, fileFound: boolean }}
 */
export function loadEnv(file, env = process.env) {
  let values = {};
  let fileFound = false;
  try {
    values = parseEnv(fs.readFileSync(file, 'utf8'));
    fileFound = true;
  } catch { /* brak pliku: tylko zmienne środowiskowe */ }
  for (const key of ENV_KEYS) {
    if (typeof env[key] === 'string' && env[key] !== '') values[key] = /** @type {string} */ (env[key]);
  }
  return { values, fileFound };
}

/**
 * Wartości sekretów do maskowania w logach i komunikatach.
 * @param {Record<string, string>} values
 * @returns {string[]}
 */
export function secretValues(values) {
  return Object.entries(values)
    .filter(([k, v]) => /(_KEY|_TOKEN|_SECRET|PASSWORD)$/i.test(k) && typeof v === 'string' && v.length >= 4)
    .map(([, v]) => v);
}
