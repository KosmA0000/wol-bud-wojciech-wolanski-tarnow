// Logger serwera dev: jedna linia JSON na zdarzenie, z maskowaniem kluczy API (scrubSecret z PHP).

export const MASK = '[UKRYTO]';

/**
 * Usuwa z tekstu wartości sekretów (dosłownie i zakodowane w URL) oraz parametry key= w adresach.
 * @param {string} text
 * @param {string[]} secrets
 */
export function maskSecrets(text, secrets) {
  let out = String(text);
  for (const s of secrets) {
    if (!s) continue;
    out = out.split(s).join(MASK);
    const enc = encodeURIComponent(s);
    if (enc !== s) out = out.split(enc).join(MASK);
  }
  out = out.replace(/([?&]key=)[^&\s"']+/gi, `$1${MASK}`);
  out = out.replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/g, `$1${MASK}`);
  return out.replace(/\bAIza[0-9A-Za-z_-]{20,}/g, MASK).replace(/\bsk-[A-Za-z0-9_-]{16,}/g, MASK);
}

/**
 * Tworzy logger. getSecrets wołane przy każdym wpisie, więc nowe klucze też są maskowane.
 * @param {{ write?: (line: string) => void, getSecrets?: () => string[], quiet?: boolean }} [opts]
 * @returns {(event: string, data?: Record<string, unknown>) => void}
 */
export function createLogger({ write = (l) => process.stdout.write(`${l}\n`), getSecrets = () => [], quiet = false } = {}) {
  return (event, data = {}) => {
    if (quiet) return;
    let line;
    try {
      line = JSON.stringify({ t: new Date().toISOString(), event, ...data });
    } catch {
      line = JSON.stringify({ t: new Date().toISOString(), event, note: 'nie udało się zserializować danych' });
    }
    write(maskSecrets(line, getSecrets()));
  };
}
