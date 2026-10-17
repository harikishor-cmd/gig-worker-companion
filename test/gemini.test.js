import { describe, it, expect, vi } from 'vitest';
import { createGemini } from '../server/gemini.js';
import { buildFacts } from '../server/routes/grievance.js';
import { schemas } from '../server/validation.js';

const okResponse = (obj) => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }) });

describe('central gemini() helper', () => {
  it('injects the requested language, JSON schema, model and temperature cap; key only in header', async () => {
    const fetchImpl = vi.fn(async () => okResponse({ subject: 's', body: 'b' }));
    const gemini = createGemini({ apiKey: 'test-key', fetchImpl });
    const out = await gemini({ lang: 'pa', system: 'SYS', prompt: 'P', schema: { type: 'object' }, temperature: 0.9 });
    expect(out).toEqual({ subject: 's', body: 'b' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain('/models/gemini-3.5-flash:generateContent');
    expect(url).not.toContain('test-key');
    expect(init.headers['x-goog-api-key']).toBe('test-key');
    const body = JSON.parse(init.body);
    expect(body.systemInstruction.parts[0].text).toMatch(/Punjabi \(Gurmukhi script\)/);
    expect(body.generationConfig).toMatchObject({ temperature: 0.4, responseMimeType: 'application/json', responseSchema: { type: 'object' } });
    await expect(gemini({ lang: 'fr', system: '', prompt: '', schema: {} })).rejects.toMatchObject({ status: 400 });
  });

  it('retries once on malformed JSON then fails with model_bad_output (never a canned answer)', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }) }));
    const gemini = createGemini({ apiKey: 'k', fetchImpl });
    await expect(gemini({ lang: 'en', system: '', prompt: '', schema: {} })).rejects.toMatchObject({ status: 502, code: 'model_bad_output' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('grievance prompt only carries whitelisted fields', () => {
    const parsed = schemas.grievance.safeParse({ lang: 'hi', against: 'Swiggy', issue: 'wrong_deduction', incidentDate: '2026-10-10', details: 'Payout cut by 300 without any reason given.', evidence: [{ date: '2026-10-10', platform: 'swiggy', gross: 900, hours: 6, shift: 'night' }] });
    expect(parsed.success).toBe(true);
    const facts = buildFacts(parsed.data, '2026-10-17');
    expect(Object.keys(facts).sort()).toEqual(['against', 'details', 'evidence', 'incidentDate', 'issue', 'today']);
    expect(Object.keys(facts.evidence[0]).sort()).toEqual(['date', 'expenses', 'gross', 'hours', 'platform', 'tips', 'trips']);
    expect(schemas.grievance.safeParse({ ...parsed.data, phone: '999' }).success).toBe(false);
  });
});
