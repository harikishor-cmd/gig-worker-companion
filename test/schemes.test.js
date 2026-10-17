import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers.js';

// Test-only fixture ids; real data lives in server/data/schemes.json (curated by PW Schemes & Grounding).
const FIXTURE = [{ id: 'fixture_a', name: 'Fixture A' }, { id: 'fixture_b', name: 'Fixture B' }];

describe('POST /api/schemes/ask grounding', () => {
  it('strips cited ids not in schemes.json', async () => {
    const { app } = makeApp({ schemes: FIXTURE, geminiResult: { answer: 'Yes, via Fixture A.', cited_scheme_ids: ['fixture_a', 'invented_scheme'], found: true } });
    const res = await request(app).post('/api/schemes/ask').send({ lang: 'hi', question: 'Am I eligible?' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ answer: 'Yes, via Fixture A.', cited_scheme_ids: ['fixture_a'], found: true });
  });

  it('passes found=false through (and treats answers citing only unknown ids as not found)', async () => {
    for (const geminiResult of [
      { answer: 'Not in data', cited_scheme_ids: [], found: false },
      { answer: 'Made up', cited_scheme_ids: ['invented_scheme'], found: true },
    ]) {
      const { app } = makeApp({ schemes: FIXTURE, geminiResult });
      const res = await request(app).post('/api/schemes/ask').send({ lang: 'pa', question: 'Pension?' });
      expect(res.body.data).toEqual({ answer: null, cited_scheme_ids: [], found: false });
    }
  });

  it('returns 503 schemes_not_loaded when no curated data is present', async () => {
    const { app, gemini } = makeApp({ schemes: [] });
    const res = await request(app).post('/api/schemes/ask').send({ lang: 'en', question: 'Pension?' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('schemes_not_loaded');
    expect(gemini).not.toHaveBeenCalled();
  });
});
