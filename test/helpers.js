import { vi } from 'vitest';
import { createApp } from '../server/app.js';
import { createCache } from '../server/cache.js';

/** App with a mocked gemini(); nothing reaches the network. */
export function makeApp({ geminiResult = {}, schemes = [] } = {}) {
  const gemini = vi.fn(async () => geminiResult);
  const app = createApp({ gemini, cache: createCache(), getSchemes: () => schemes, staticDir: null, rateLimitPerMin: 1000 });
  return { app, gemini };
}
