import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers.js';
import { computeWeekStats } from '../server/services/stats.js';

const e = (o) => ({ platform: 'swiggy', gross: 1000, tips: 0, expenses: 200, hours: 5, trips: 10, shift: 'evening', ...o });

describe('POST /api/summary validation', () => {
  it('rejects negative hours, non-numeric rupees and bad lang with 400 before any model call', async () => {
    const { app, gemini } = makeApp();
    const bad = [
      { lang: 'en', weekStart: '2026-10-12', entries: [e({ date: '2026-10-12', hours: -2 })] },
      { lang: 'en', weekStart: '2026-10-12', entries: [e({ date: '2026-10-12', gross: '1000' })] },
      { lang: 'fr', weekStart: '2026-10-12', entries: [] },
    ];
    for (const body of bad) {
      const res = await request(app).post('/api/summary').send(body);
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    }
    const langRes = await request(app).post('/api/summary').send(bad[2]);
    expect(langRes.body.error.code).toBe('invalid_lang');
    expect(gemini).not.toHaveBeenCalled();
  });
});

describe('computeWeekStats', () => {
  it('computes totals, ₹/hr, night share and week-over-week deterministically', () => {
    const entries = [
      e({ date: '2026-10-05', gross: 800, expenses: 0, hours: 4 }), // previous week
      e({ date: '2026-10-12', gross: 1000, tips: 50, expenses: 150, hours: 5, trips: 9 }),
      e({ date: '2026-10-13', gross: 1200, expenses: 200, hours: 6, trips: 11, shift: 'night' }),
      e({ date: '2026-10-20', gross: 9999, hours: 9 }), // next week, ignored
    ];
    const s = computeWeekStats(entries, '2026-10-12');
    expect(s.week).toEqual({ start: '2026-10-12', end: '2026-10-18' });
    expect(s.totals).toMatchObject({ net: 1900, gross: 2200, tips: 50, expenses: 350, hours: 11, trips: 20, daysWorked: 2, perHour: 172.73, perTrip: 95, nightSharePct: 53 });
    expect(s.bestDay).toBe('2026-10-13');
    expect(s.prevWeek).toEqual({ net: 800, perHour: 200 });
    expect(s.deltaNetPct).toBe(138);
  });

  it('drops model insights that mention numbers not in the stats', async () => {
    const { app } = makeApp({ geminiResult: { headline: 'You earned ₹1,900 this week', insights: [{ text: 'Your net was ₹1,900', basis: 'totals.net' }, { text: 'Riders in your city make ₹25,000', basis: 'totals.net' }], suggestions: [] } });
    const res = await request(app).post('/api/summary').send({ lang: 'en', weekStart: '2026-10-12', entries: [
      e({ date: '2026-10-12', gross: 1000, tips: 50, expenses: 150 }), e({ date: '2026-10-13', gross: 1200, expenses: 200, shift: 'night' }),
    ] });
    expect(res.status).toBe(200);
    expect(res.body.data.ai.headline).toContain('1,900');
    expect(res.body.data.ai.insights).toHaveLength(1);
  });
});
