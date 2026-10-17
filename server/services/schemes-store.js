// Loads curated schemes.json (owned by PW Schemes & Grounding). Missing/invalid file => empty list => 503 schemes_not_loaded.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEFAULT_PATH = fileURLToPath(new URL('../data/schemes.json', import.meta.url));

export function loadSchemes(path = process.env.SCHEMES_PATH || DEFAULT_PATH) {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    const list = Array.isArray(parsed) ? parsed : parsed.schemes;
    return Array.isArray(list) ? list.filter((s) => s && typeof s.id === 'string') : [];
  } catch {
    return [];
  }
}
