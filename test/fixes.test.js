import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers.js';
import { errorCodeFor } from '../server/validation/validate.js';
import { stripWorkerPlaceholders, joinGrievanceBody } from '../server/routes/grievance.js';
import { RATE_LIMIT_PER_MIN } from '../server/config.js';

const day = (date, hours) => ({ date, platform: 'zomato', gross: 500, hours, shift: 'day' });

describe('24h per-day cap', () => {
  it('rejects summed hours over 24 on one date and points at the hours field', async () => {
    const { app, gemini } = makeApp();
    const res = await request(app)
      .post('/api/summary')
      .send({ lang: 'en', weekStart: '2026-10-12', entries: [day('2026-10-13', 14), day('2026-10-13', 12)] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_input');
    expect(res.body.error.fields[0].path).toBe('entries.0.hours');
    expect(gemini).not.toHaveBeenCalled();
  });
  it('accepts exactly 24 hours split across entries', async () => {
    const { app } = makeApp({ geminiResult: { headline: 'h', insights: [], suggestions: [] } });
    const res = await request(app)
      .post('/api/summary')
      .send({ lang: 'en', weekStart: '2026-10-12', entries: [day('2026-10-13', 12), day('2026-10-13', 12)] });
    expect(res.status).toBe(200);
  });
});

describe('validation error-code ordering', () => {
  it('valid lang + bad field gives invalid_input with the failing field first', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/summary').send({ lang: 'hi', weekStart: 'nope', entries: [] });
    expect(res.body.error.code).toBe('invalid_input');
    expect(res.body.error.fields[0].path).toBe('weekStart');
  });
  it('bad lang gives invalid_lang', () => {
    expect(errorCodeFor([{ path: ['lang'] }, { path: ['x'] }])).toBe('invalid_lang');
    expect(errorCodeFor([{ path: ['entries', 0, 'hours'] }])).toBe('invalid_input');
  });
  it('rate limit is loose enough for a shared venue IP', () => {
    expect(RATE_LIMIT_PER_MIN).toBeGreaterThanOrEqual(60);
  });
});

describe('worker placeholder stripping', () => {
  it('drops name/ID placeholder lines but keeps order-ID placeholders', () => {
    const out = stripWorkerPlaceholders(
      'Dear Sir,\nName: [Worker Name]\nPartner ID: [Worker ID]\nOrder [Order ID] unpaid.\nSincerely,\n[Your name]\n[Phone]',
    );
    expect(out).not.toMatch(/Worker Name|Worker ID|Your name/);
    expect(out).toContain('[Order ID]');
    expect(out).toContain('[Phone]');
  });
  it('handles Hindi/Punjabi placeholders and keeps the real name', () => {
    expect(stripWorkerPlaceholders('नमस्ते\n[आपका नाम]\n[ਵਰਕਰ ਆਈਡੀ]\nਧੰਨਵਾਦ')).toBe('नमस्ते\nਧੰਨਵਾਦ');
    expect(joinGrievanceBody(['Sincerely,\n[Your name]'], 'Ravi')).toBe('Sincerely,\nRavi');
  });
});

describe('browser entry validation (web/entries.js)', async () => {
  await import('../web/entries.js');
  const { validateEntry, sanitizeEntries } = globalThis.GigEntries;
  const today = '2026-10-17';
  it('blocks an empty Save: date, paid and hours all flagged', () => {
    const v = validateEntry({ date: '', platform: 'zomato', shift: 'day', gross: '', tips: '', expenses: '', hours: '', trips: '' }, today);
    expect(v.ok).toBe(false);
    expect(Object.keys(v.errors).sort()).toEqual(['date', 'gross', 'hours']);
  });
  it('blocks ₹0 / 0h', () => {
    expect(validateEntry({ date: today, platform: 'zomato', shift: 'day', gross: 0, hours: 0 }, today).ok).toBe(false);
  });
  it('sanitizes stored entries: drops the hidden ₹0/0h entry, junk and >24h days, keeps valid ones', () => {
    const good = { date: '2026-10-16', platform: 'swiggy', shift: 'night', gross: 900, tips: 0, expenses: 100, hours: 6, trips: 12 };
    const clean = sanitizeEntries(
      [
        good,
        { date: '2026-10-16', platform: 'zomato', shift: 'day', gross: 0, tips: 0, expenses: 0, hours: 0, trips: 0 },
        null,
        'x',
        { ...good, hours: 20 },
        { ...good, date: '2027-01-01' },
      ],
      today,
    );
    expect(clean).toEqual([good]);
    expect(sanitizeEntries('not-an-array', today)).toEqual([]);
  });
});
