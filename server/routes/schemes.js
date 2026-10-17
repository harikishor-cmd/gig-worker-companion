// Call C: eligibility Q&A grounded ONLY in curated schemes.json (owned by PW Schemes & Grounding).
import { Router } from 'express';
import { schemas, validate } from '../validation/schemas.js';
import { ok, fail, handler } from '../http/envelope.js';
import { SCHEMES_SYSTEM, SCHEMES_SCHEMA } from '../prompts/schemes.js';

export default function schemesRouter({ gemini, getSchemes }) {
  const r = Router();
  r.post('/ask', validate(schemas.schemesAsk), handler(async (req, res) => {
    const schemesList = getSchemes();
    if (!schemesList.length) return fail(res, 503, 'schemes_not_loaded');
    const { lang, question, profile } = req.valid;
    const prompt = `<schemes>${JSON.stringify(schemesList)}</schemes>\n<profile>${JSON.stringify(profile)}</profile>\n<question>${question}</question>`;
    const raw = await gemini({ lang, system: SCHEMES_SYSTEM, prompt, schema: SCHEMES_SCHEMA, temperature: 0.2 });
    const known = new Set(schemesList.map((s) => s.id));
    // Server drops any cited id that is not in schemes.json.
    const cited = [...new Set((raw.cited_scheme_ids || []).filter((id) => known.has(id)))];
    const found = raw.found === true && cited.length > 0;
    ok(res, { answer: found ? String(raw.answer || '').slice(0, 1500) : null, cited_scheme_ids: found ? cited : [], found });
  }));
  return r;
}
