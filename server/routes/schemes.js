// Call C: eligibility Q&A grounded ONLY in curated schemes.json (owned by PW Schemes & Grounding).
import { Router } from 'express';
import { schemas } from '../validation/schemas.js';
import { validate } from '../validation/validate.js';
import { ok } from '../http/envelope.js';
import { AppError } from '../http/errors.js';
import { normalizeQuestion, wrap } from '../services/sanitize.js';
import { TOKEN_LIMITS } from '../config.js';
import { SCHEMES_SYSTEM, SCHEMES_SCHEMA } from '../prompts/schemes.js';

/** Fields the model never needs (QA metadata); dropped to keep the grounding prompt lean. */
const PROMPT_OMIT = new Set(['verification', 'last_verified']);

/**
 * Serialise the curated list once per list instance, minus QA-only metadata.
 * @param {Array<Record<string, unknown>>} list
 * @returns {string}
 */
export function schemesForPrompt(list) {
  return JSON.stringify(list.map((s) => Object.fromEntries(Object.entries(s).filter(([k]) => !PROMPT_OMIT.has(k)))));
}

/**
 * @param {{ gemini: Function, getSchemes: () => Array<Record<string, unknown>>, cache: ReturnType<import('../services/cache.js').createCache> }} deps
 */
export default function schemesRouter({ gemini, getSchemes, cache }) {
  const r = Router();
  let memo = { list: null, json: '' };

  r.post('/ask', validate(schemas.schemesAsk), async (req, res) => {
    const schemesList = getSchemes();
    if (!schemesList.length) throw new AppError(503, 'schemes_not_loaded');
    if (memo.list !== schemesList) memo = { list: schemesList, json: schemesForPrompt(schemesList) };
    const { lang, question, profile } = req.valid;

    // Same question (normalised) + language + profile => cached grounded answer, no model call.
    const key = cache.key({ f: 'C', lang, q: normalizeQuestion(question), profile, data: memo.json.length });
    const hit = cache.get(key);
    if (hit) return ok(res, hit);

    const prompt = `<schemes>${memo.json}</schemes>\n${wrap('profile', profile)}\n${wrap('question', question)}`;
    const raw = await gemini({
      lang,
      system: SCHEMES_SYSTEM,
      prompt,
      schema: SCHEMES_SCHEMA,
      temperature: 0.2,
      maxOutputTokens: TOKEN_LIMITS.schemes,
    });
    const known = new Set(schemesList.map((s) => s.id));
    // Server drops any cited id that is not in schemes.json.
    const cited = [...new Set((raw.cited_scheme_ids || []).filter((id) => known.has(id)))];
    const found = raw.found === true && cited.length > 0;
    const data = { answer: found ? String(raw.answer || '').slice(0, 1500) : null, cited_scheme_ids: found ? cited : [], found };
    cache.set(key, data);
    ok(res, data);
  });
  return r;
}
