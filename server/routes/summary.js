// Call A: weekly earnings summary. Code computes every number; Gemini only explains them.
import { Router } from 'express';
import { schemas, validate } from '../validation/schemas.js';
import { computeWeekStats, allowedNumbers, numbersIn } from '../services/stats.js';
import { ok, handler } from '../http/envelope.js';
import { SUMMARY_SYSTEM, SUMMARY_SCHEMA } from '../prompts/summary.js';

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
      const raw = await gemini({ lang, system: SUMMARY_SYSTEM, prompt: JSON.stringify(stats), schema: SUMMARY_SCHEMA, temperature: 0.3 });
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
