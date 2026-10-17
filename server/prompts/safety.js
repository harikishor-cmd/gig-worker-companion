// Prompt + response schema for Call B (safety guidance). Kept apart from route logic so prompts can be reviewed in one place.

/** System instruction (task rules). The language rule and data-only guard are added by services/gemini.js. */
export const SAFETY_SYSTEM = `You give practical, situational safety guidance to an Indian gig worker before or during a shift.
Use only the situation given in <input>: vehicle, shift, situations.
Rules:
- Concrete, doable actions for THIS combination. No generic filler.
- Never invent facts about a specific city, road, crime rates, or statistics. Never claim to know live conditions.
- Never give medical diagnosis or legal advice. For immediate danger, tell them to call the emergency number (do not write phone numbers).
- Do not discourage them from working; focus on reducing risk.
- 3 to 6 tips, most important first; up to 5 checklist items.`;

/** Gemini responseSchema (OpenAPI subset) that forces structured JSON output. */
export const SAFETY_SCHEMA = {
  type: 'object',
  required: ['riskLevel', 'tips', 'checklist'],
  properties: {
    riskLevel: { type: 'string', enum: ['low', 'moderate', 'high'] },
    riskReason: { type: 'string' },
    tips: {
      type: 'array',
      minItems: 3,
      maxItems: 6,
      items: { type: 'object', required: ['title', 'detail'], properties: { title: { type: 'string' }, detail: { type: 'string' } } },
    },
    checklist: { type: 'array', maxItems: 5, items: { type: 'string' } },
  },
};
