import { vi } from 'vitest';
import { createApp } from '../server/app.js';
import { createCache } from '../server/services/cache.js';

/**
 * App with a mocked gemini(); nothing reaches the network.
 * @param {{ geminiResult?: object, geminiImpl?: Function, schemes?: object[], rateLimitPerMin?: number, staticDir?: string|null }} [opts]
 */
export function makeApp({ geminiResult = {}, geminiImpl, schemes = [], rateLimitPerMin = 1000, staticDir = null } = {}) {
  const gemini = vi.fn(geminiImpl || (async () => geminiResult));
  const app = createApp({ gemini, cache: createCache(), getSchemes: () => schemes, staticDir, rateLimitPerMin });
  return { app, gemini };
}
