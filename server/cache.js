// Small in-memory TTL cache (per Cloud Run instance). Keys are hashes of non-personal inputs.
import { createHash } from 'node:crypto';

export function createCache({ ttlMs = 6 * 3600e3, max = 500 } = {}) {
  const map = new Map();
  return {
    key: (obj) => createHash('sha256').update(JSON.stringify(obj)).digest('hex'),
    get(k) {
      const hit = map.get(k);
      if (!hit) return undefined;
      if (hit.exp < Date.now()) { map.delete(k); return undefined; }
      return hit.value;
    },
    set(k, value) {
      if (map.size >= max) map.delete(map.keys().next().value);
      map.set(k, { value, exp: Date.now() + ttlMs });
    },
  };
}
