// Argumenty wiersza poleceń serwera dev: --port, --reset, --keep, --root, --sandbox-dir, --env-file, --quiet.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_ENV_FILE } from './env-file.js';

export const DEFAULT_PORT = 4180;
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @typedef {{ port: number, reset: boolean, keep: boolean, root: string, sandboxDir: string, envFile: string, quiet: boolean }} DevArgs
 */

/** @param {string[]} argv @param {number} i @param {string} name */
function valueAt(argv, i, name) {
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) throw new Error(`Brak wartości dla ${name}.`);
  return v;
}

/**
 * @param {string[]} argv argumenty po nazwie skryptu
 * @param {Record<string, string|undefined>} [env]
 * @returns {DevArgs}
 */
export function parseArgs(argv, env = process.env) {
  /** @type {DevArgs} */
  const out = { port: DEFAULT_PORT, reset: false, keep: false, root: REPO_ROOT,
    sandboxDir: path.join(REPO_ROOT, '.sandbox'), envFile: env.WOLBUD_ENV_FILE || DEFAULT_ENV_FILE, quiet: false };
  for (let i = 0; i < argv.length; i += 1) {
    const [flag, inline] = argv[i].split(/=(.*)/s, 2);
    const take = () => (inline !== undefined ? inline : valueAt(argv, i++, flag));
    if (flag === '--port') out.port = Number(take());
    else if (flag === '--reset') out.reset = true;
    else if (flag === '--keep') out.keep = true;
    else if (flag === '--quiet') out.quiet = true;
    else if (flag === '--root') out.root = path.resolve(take());
    else if (flag === '--sandbox-dir') out.sandboxDir = path.resolve(take());
    else if (flag === '--env-file') out.envFile = path.resolve(take());
    else throw new Error(`Nieznany argument: ${argv[i]}`);
  }
  if (!Number.isInteger(out.port) || out.port < 1024 || out.port > 65535) {
    throw new Error('Port musi być liczbą całkowitą z zakresu 1024–65535.');
  }
  if (out.reset && out.keep) throw new Error('Flag --reset i --keep nie można łączyć.');
  return out;
}
