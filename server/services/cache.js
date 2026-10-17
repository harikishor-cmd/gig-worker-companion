// In-memory LRU cache with TTL (per Cloud Run instance). Used to skip repeat Gemini calls for
// identical, non-personal inputs (summary stats, safety situations, scheme questions).
import { createHash } from 'node:crypto';
import { CACHE_TTL_MS, CACHE_MAX_ENTRIES } from '../config.js';

/**
 * @param {{ ttlMs?: number, max?: number, now?: () => number }} [opts]
 * @returns {{ key: (obj: unknown) => string, get: (k: string) => any, set: (k: string, v: any) => void, readonly size: number }}
 */
export function createCache({ ttlMs = CACHE_TTL_MS, max = CACHE_MAX_ENTRIES, now = Date.now } = {}) {
  const map = new Map(); // insertion order == recency order (oldest first)
  return {
    /** Stable sha256 key for any JSON-serialisable input. */
    key: (obj) => createHash('sha256').update(JSON.stringify(obj)).digest('hex'),
    get(k) {
      const hit = map.get(k);
      if (!hit) return undefined;
      map.delete(k);
      if (hit.exp <= now()) return undefined;
      map.set(k, hit); // mark as most recently used
      return hit.value;
    },
    set(k, value) {
      map.delete(k);
      if (map.size >= max) map.delete(map.keys().next().value); // evict least recently used
      map.set(k, { value, exp: now() + ttlMs });
    },
    get size() {
      return map.size;
    },
  };
}
