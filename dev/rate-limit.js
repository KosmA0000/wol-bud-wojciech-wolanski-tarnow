// Limit zapytań w oknie przesuwnym (domyślnie 30 na minutę), trzymany w pamięci procesu.

/**
 * @param {{ max?: number, windowMs?: number, now?: () => number }} [opts]
 */
export function createRateLimiter({ max = 30, windowMs = 60_000, now = Date.now } = {}) {
  /** @type {Map<string, number[]>} */
  const buckets = new Map();
  return {
    max,
    /**
     * Rejestruje próbę. Gdy limit wyczerpany, nie rejestruje i zwraca allowed=false z czasem oczekiwania.
     * @param {string} key np. adres IP
     * @returns {{ allowed: boolean, remaining: number, retryAfter: number }}
     */
    hit(key) {
      const t = now();
      const recent = (buckets.get(key) || []).filter((ts) => ts > t - windowMs);
      if (recent.length >= max) {
        buckets.set(key, recent);
        const retryAfter = Math.max(1, Math.ceil((recent[0] + windowMs - t) / 1000));
        return { allowed: false, remaining: 0, retryAfter };
      }
      recent.push(t);
      buckets.set(key, recent);
      return { allowed: true, remaining: max - recent.length, retryAfter: 0 };
    },
  };
}
