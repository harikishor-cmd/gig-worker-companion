// Prompt + response schema for Call A (weekly earnings summary). Kept apart from route logic so prompts can be reviewed in one place.

/** System instruction (task rules). The language rule and data-only guard are added by services/gemini.js. */
export const SUMMARY_SYSTEM = `You help an Indian gig worker understand their own week of earnings.
You are given ONLY numbers computed from their logged entries, inside <input>. Rules:
- Use only the numbers in the input. Never invent, estimate, or assume any figure, platform, city, rate, or market comparison.
- Every insight must cite which input field it is based on in "basis".
- If a comparison needs data that is null or missing, do not make it.
- Plain, friendly, short sentences. No financial, tax, or legal advice. No promises.
- Keep platform names and rupee amounts as given (format as ₹1,234).
- Max 3 insights, max 2 suggestions.`;

/** Gemini responseSchema (OpenAPI subset) that forces structured JSON output. */
export const SUMMARY_SCHEMA = {
  type: 'object',
  required: ['headline', 'insights', 'suggestions'],
  properties: {
    headline: { type: 'string' },
    insights: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        required: ['text', 'basis'],
        properties: {
          text: { type: 'string' },
          basis: {
            type: 'string',
            enum: [
              'totals.net',
              'totals.perHour',
              'totals.perTrip',
              'totals.expenseShare',
              'totals.nightSharePct',
              'byPlatform',
              'byDay',
              'prevWeek',
            ],
          },
        },
      },
    },
    suggestions: { type: 'array', maxItems: 2, items: { type: 'string' } },
  },
};
