// Call A: weekly earnings summary. Code computes every number; Gemini only explains them.
import { Router } from 'express';
import { schemas, validate } from '../validation/schemas.js';
import { computeWeekStats, allowedNumbers, numbersIn } from '../services/stats.js';
import { ok, handler } from '../http/envelope.js';

const SYSTEM = `You help an Indian gig worker understand their own week of earnings.
You are given ONLY numbers computed from their logged entries. Rules:
- Use only the numbers in the input. Never invent, estimate, or assume any figure, platform, city, rate, or market comparison.
- Every insight must cite which input field it is based on in "basis".
- If a comparison needs data that is null or missing, do not make it.
- Plain, friendly, short sentences. No financial, tax, or legal advice. No promises.
- Keep platform names and rupee amounts as given (format as ₹1,234).
- Max 3 insights, max 2 suggestions.`;

export const SUMMARY_SCHEMA = {
  type: 'object',
  required: ['headline', 'insights', 'suggestions'],
  properties: {
    headline: { type: 'string' },
    insights: {
      type: 'array', maxItems: 3,
      items: {
        type: 'object', required: ['text', 'basis'],
        properties: {
          text: { type: 'string' },
          basis: { type: 'string', enum: ['totals.net', 'totals.perHour', 'totals.perTrip', 'totals.expenseShare', 'totals.nightSharePct', 'byPlatform', 'byDay', 'prevWeek'] },
        },
      },
    },
    suggestions: { type: 'array', maxItems: 2, items: { type: 'string' } },
  },
};

const onlyKnownNumbers = (text, allowed) => numbersIn(text).every((n) => allowed.has(n));

export default function summaryRouter({ gemini, cache }) {
  const r = Router();
  r.post('/', validate(schemas.summary), handler(async (req, res) => {
    const { lang, weekStart, entries } = req.valid;
    const stats = computeWeekStats(entries, weekStart);
    // Low-data gate: no model call when there is nothing real to say.
    if (stats.totals.daysWorked < 2) return ok(res, { stats, ai: null, reason: stats.totals.daysWorked === 0 ? 'no_entries' : 'not_enough_days' });

    const key = cache.key({ f: 'A', stats, lang });
    let ai = cache.get(key);
    if (!ai) {
      const raw = await gemini({ lang, system: SYSTEM, prompt: JSON.stringify(stats), schema: SUMMARY_SCHEMA, temperature: 0.3 });
      const allowed = allowedNumbers(stats);
      ai = {
        // Anti-hallucination post-check: drop any text that mentions a number not in the stats.
        headline: typeof raw.headline === 'string' && onlyKnownNumbers(raw.headline, allowed) ? raw.headline.slice(0, 200) : null,
        insights: (raw.insights || []).filter((i) => typeof i?.text === 'string' && onlyKnownNumbers(i.text, allowed)).slice(0, 3)
          .map((i) => ({ text: i.text.slice(0, 260), basis: i.basis })),
        suggestions: (raw.suggestions || []).filter((s) => typeof s === 'string' && onlyKnownNumbers(s, allowed)).slice(0, 2).map((s) => s.slice(0, 220)),
      };
      cache.set(key, ai);
    }
    ok(res, { stats, ai });
  }));
  return r;
}
