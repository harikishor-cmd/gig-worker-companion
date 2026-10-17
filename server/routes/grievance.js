// Call E: formal complaint draft from validated facts + the worker's own logged earnings as evidence.
import { Router } from 'express';
import { schemas } from '../validation/schemas.js';
import { validate } from '../validation/validate.js';
import { numbersIn } from '../services/stats.js';
import { ok } from '../http/envelope.js';
import { AppError } from '../http/errors.js';
import { logger } from '../services/logger.js';
import { wrap } from '../services/sanitize.js';
import { TOKEN_LIMITS } from '../config.js';
import { GRIEVANCE_SYSTEM, GRIEVANCE_SCHEMA } from '../prompts/grievance.js';

// Static verified complaint channels (never generated). QA re-verifies before submission.
export const COMPLAINT_CHANNELS = [
  { id: 'nch_phone', label: 'National Consumer Helpline', value: '1915' },
  { id: 'nch_web', label: 'National Consumer Helpline (online)', value: 'https://consumerhelpline.gov.in' },
];

const NAME_PH = /\[[^\]\n]*(?:name|नाम|ਨਾਮ|ਨਾਂ)[^\]\n]*\]/iu;
const ID_PH = /\[[^\]\n]*(?:\bid\b|आईडी|ਆਈਡੀ)[^\]\n]*\]/iu;
const PHONE_PH = /\[[^\]\n]*(?:phone|mobile|contact|address|email|फ़ोन|फोन|मोबाइल|पता|ਫ਼ੋਨ|ਫੋਨ|ਮੋਬਾਈਲ|ਪਤਾ)[^\]\n]*\]/iu;
const NOT_WORKER_ID = /order|ride|trip|transaction|ऑर्डर|ਆਰਡਰ/iu;

/**
 * Drop whole lines that still carry a worker-name or worker-ID placeholder (the worker left those blank),
 * so the letter never shows "[Worker Name]" / "[Worker ID]". Order/ride ID placeholders are kept.
 * @param {string} body
 */
export function stripWorkerPlaceholders(body) {
  return String(body)
    .split('\n')
    .filter((line) => {
      if (NAME_PH.test(line) || PHONE_PH.test(line)) return false;
      const m = line.match(ID_PH);
      return !(m && !NOT_WORKER_ID.test(m[0]));
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Remove stray commas the model sometimes emits (e.g. "To:,Officer,,Zomato"): no comma right after a colon,
 * no doubled commas, no comma at the start of a line. Indian-format amounts (₹1,23,456) are untouched.
 * @param {string} text
 */
export function tidyPunctuation(text) {
  return String(text)
    .replace(/([:：])[ \t]*(?:,[ \t]*)+/g, '$1 ')
    .replace(/,(?:[ \t]*,)+/g, ',')
    .replace(/^[ \t]*,[ \t]*/gm, '')
    .replace(/,(?=\S)(?!\d)/g, ', ');
}

/** Join the model's paragraph array into one plain-text letter (blank line between paragraphs) and sign with the worker's name. */
export function joinGrievanceBody(rawBody, workerName) {
  const paras = (Array.isArray(rawBody) ? rawBody : [rawBody]).map((p) => String(p ?? '').trim()).filter(Boolean);
  let body = paras.join('\n\n');
  const name = String(workerName || '').trim();
  if (name)
    body = body.replace(
      /\[\s*(?:(?:your\s+)?(?:full\s+)?name|(?:आपका\s+)?(?:पूरा\s+)?नाम|(?:ਤੁਹਾਡਾ\s+)?(?:ਪੂਰਾ\s+)?(?:ਨਾਮ|ਨਾਂ))\s*\]/giu,
      name,
    );
  return tidyPunctuation(stripWorkerPlaceholders(body)).slice(0, 6000);
}

export function buildFacts(v, today) {
  const evidence = v.evidence.map((e) => ({
    date: e.date,
    platform: e.platform,
    gross: e.gross,
    tips: e.tips,
    expenses: e.expenses,
    hours: e.hours,
    trips: e.trips,
  }));
  const facts = {
    today,
    against: v.against,
    issue: v.issue,
    issueOther: v.issueOther,
    incidentDate: v.incidentDate,
    endDate: v.endDate,
    details: v.details,
    desiredOutcome: v.desiredOutcome,
    workerName: v.workerName,
    workerId: v.workerId,
    amount: v.amount,
    evidence,
  };
  return Object.fromEntries(Object.entries(facts).filter(([, x]) => x !== undefined && x !== ''));
}

export default function grievanceRouter({ gemini }) {
  const r = Router();
  r.post('/', validate(schemas.grievance), async (req, res) => {
    const v = req.valid;
    const facts = buildFacts(v, new Date().toISOString().slice(0, 10));
    const raw = await gemini({
      lang: v.lang,
      system: GRIEVANCE_SYSTEM,
      prompt: wrap('facts', facts),
      schema: GRIEVANCE_SCHEMA,
      temperature: 0.3,
      maxOutputTokens: TOKEN_LIMITS.grievance,
    });
    const subject = String(raw.subject || '')
      .trim()
      .slice(0, 200);
    const body = joinGrievanceBody(raw.body, v.workerName);
    if (!subject || !body) throw new AppError(502, 'model_bad_output', { message: 'empty draft' });
    // Log (not block) rupee amounts in the draft that don't appear in the submitted facts.
    const known = new Set(numbersIn(JSON.stringify(facts)));
    const unknown = numbersIn(body).filter((n) => Number(n) >= 100 && !known.has(n));
    if (unknown.length) logger.warn('grievance_unknown_numbers', { count: unknown.length });
    ok(res, { subject, body, channels: COMPLAINT_CHANNELS });
  });
  return r;
}
