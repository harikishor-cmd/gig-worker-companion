// Call B: situational safety guidance. Emergency numbers are static and verified, never generated.
import { Router } from 'express';
import { schemas, validate } from '../validation.js';
import { ok, handler } from '../envelope.js';

// Static constants rendered by the UI (QA re-verifies before submission).
export const EMERGENCY_NUMBERS = [
  { id: 'emergency', number: '112' },
  { id: 'women_helpline', number: '1091' },
  { id: 'highway_helpline', number: '1033' },
  { id: 'ambulance', number: '108' },
];

const SYSTEM = `You give practical, situational safety guidance to an Indian gig worker before or during a shift.
Use only the situation given: vehicle, shift, situations.
Rules:
- Concrete, doable actions for THIS combination. No generic filler.
- Never invent facts about a specific city, road, crime rates, or statistics. Never claim to know live conditions.
- Never give medical diagnosis or legal advice. For immediate danger, tell them to call the emergency number (do not write phone numbers).
- Do not discourage them from working; focus on reducing risk.
- 3 to 6 tips, most important first; up to 5 checklist items.`;

export const SAFETY_SCHEMA = {
  type: 'object',
  required: ['riskLevel', 'tips', 'checklist'],
  properties: {
    riskLevel: { type: 'string', enum: ['low', 'moderate', 'high'] },
    riskReason: { type: 'string' },
    tips: { type: 'array', minItems: 3, maxItems: 6, items: { type: 'object', required: ['title', 'detail'], properties: { title: { type: 'string' }, detail: { type: 'string' } } } },
    checklist: { type: 'array', maxItems: 5, items: { type: 'string' } },
  },
};

const LEVELS = ['low', 'moderate', 'high'];
/** Risk floor computed in code; the model may raise it, never lower it. */
export function riskFloor({ vehicle, shift, situations }) {
  const s = new Set(situations);
  const twoWheels = vehicle === 'two_wheeler' || vehicle === 'bicycle';
  if (s.has('harassment')) return 'high';
  if (shift === 'night' && (s.has('late_night_drop') || s.has('unfamiliar_area'))) return 'moderate';
  if (twoWheels && s.has('rain_fog')) return 'moderate';
  return 'low';
}
const stripPhones = (t) => String(t).replace(/\+?\d[\d\s-]{2,}\d/g, '').replace(/\s{2,}/g, ' ').trim();

export default function safetyRouter({ gemini, cache }) {
  const r = Router();
  r.post('/', validate(schemas.safety), handler(async (req, res) => {
    const { lang, vehicle, shift } = req.valid;
    const situations = [...new Set(req.valid.situations)].sort();
    const input = { vehicle, shift, situations };
    const key = cache.key({ f: 'B', input, lang });
    let guidance = cache.get(key);
    if (!guidance) {
      const raw = await gemini({ lang, system: SYSTEM, prompt: JSON.stringify(input), schema: SAFETY_SCHEMA, temperature: 0.3 });
      const floor = riskFloor(input);
      const model = LEVELS.includes(raw.riskLevel) ? raw.riskLevel : floor;
      guidance = {
        riskLevel: LEVELS.indexOf(model) >= LEVELS.indexOf(floor) ? model : floor,
        riskReason: raw.riskReason ? stripPhones(raw.riskReason).slice(0, 240) : null,
        tips: (raw.tips || []).slice(0, 6).map((t) => ({ title: stripPhones(t.title).slice(0, 80), detail: stripPhones(t.detail).slice(0, 260) })),
        checklist: (raw.checklist || []).slice(0, 5).map((c) => stripPhones(c).slice(0, 100)),
      };
      cache.set(key, guidance);
    }
    ok(res, { guidance, emergencyNumbers: EMERGENCY_NUMBERS });
  }));
  return r;
}
