import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers.js';
import { createCache } from '../server/services/cache.js';
import { createGemini } from '../server/services/gemini.js';
import { TOKEN_LIMITS, MAX_TOKENS_CEILING } from '../server/config.js';

describe('LRU/TTL cache', () => {
  it('expires entries after the TTL and evicts the least recently used entry', () => {
    let t = 0;
    const cache = createCache({ ttlMs: 1000, max: 2, now: () => t });
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(1); // 'a' becomes most recent
    cache.set('c', 3); // evicts 'b'
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    t = 1001;
    expect(cache.get('a')).toBeUndefined();
    expect(cache.key({ x: 1 })).toBe(cache.key({ x: 1 }));
  });
});

describe('/api/schemes/ask cache', () => {
  it('answers a repeated (normalised) question from cache, but not across languages', async () => {
    const schemes = [{ id: 'fixture_a', name: 'Fixture A', verification: 'qa-only' }];
    const { app, gemini } = makeApp({ schemes, geminiResult: { answer: 'Yes', cited_scheme_ids: ['fixture_a'], found: true } });
    const a = await request(app).post('/api/schemes/ask').send({ lang: 'hi', question: 'Can I get a pension?' });
    const b = await request(app).post('/api/schemes/ask').send({ lang: 'hi', question: '  can I   get a PENSION ' });
    expect(b.body).toEqual(a.body);
    expect(gemini).toHaveBeenCalledTimes(1);
    await request(app).post('/api/schemes/ask').send({ lang: 'pa', question: 'Can I get a pension?' });
    expect(gemini).toHaveBeenCalledTimes(2);
    const call = gemini.mock.calls[0][0];
    expect(call.maxOutputTokens).toBe(TOKEN_LIMITS.schemes);
    expect(call.prompt).not.toContain('qa-only'); // QA metadata trimmed from the prompt
  });
});

describe('token caps', () => {
  it('uses the per-route cap and retries once at the ceiling only when Gemini hits MAX_TOKENS', async () => {
    const replies = [
      { finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"subject":"cut' }] } },
      { finishReason: 'STOP', content: { parts: [{ text: '{"subject":"ok"}' }] } },
    ];
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ candidates: [replies.shift()] }) }));
    const warn = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const out = await createGemini({ apiKey: 'k', fetchImpl })({
      lang: 'en',
      system: '',
      prompt: '',
      schema: {},
      maxOutputTokens: TOKEN_LIMITS.grievance,
    });
    warn.mockRestore();
    expect(out).toEqual({ subject: 'ok' });
    const caps = fetchImpl.mock.calls.map(([, init]) => JSON.parse(init.body).generationConfig.maxOutputTokens);
    expect(caps).toEqual([TOKEN_LIMITS.grievance, MAX_TOKENS_CEILING]);
  });
});
