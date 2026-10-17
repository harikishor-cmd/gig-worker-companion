// zod schemas for all 5 endpoints. Unknown fields are rejected (.strict()), so nothing
// outside the whitelist can reach a prompt.
import { z } from 'zod';
import { SUPPORTED_LANGS } from '../services/lang.js';
import { cleanUserText } from '../services/sanitize.js';

/**
 * Free text that may reach a prompt: control chars stripped and delimiters neutralised (see services/sanitize.js),
 * then length-checked on the cleaned value.
 * @param {number} min
 * @param {number} max
 */
const userText = (min, max) =>
  z
    .string()
    .max(max * 2)
    .transform(cleanUserText)
    .pipe(z.string().min(min).max(max));

export const lang = z.enum(SUPPORTED_LANGS);
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), 'invalid date');
const notFuture = (d) => d <= new Date(Date.now() + 14 * 3600e3).toISOString().slice(0, 10); // allow IST ahead of UTC
const money = z.number().finite().nonnegative().max(100000);

export const PLATFORMS = ['zomato', 'swiggy', 'uber', 'ola', 'rapido', 'blinkit', 'zepto', 'urban_company', 'porter', 'other'];
export const SHIFTS = ['day', 'evening', 'night'];

/** One earnings entry as stored on the device (localStorage). Notes are never accepted by the server. */
export const entry = z
  .object({
    date: isoDate.refine(notFuture, 'date is in the future'),
    platform: z.enum(PLATFORMS),
    gross: money,
    tips: money.default(0),
    expenses: money.default(0),
    hours: z.number().finite().positive().max(24),
    trips: z.number().int().min(0).max(200).default(0),
    shift: z.enum(SHIFTS),
  })
  .strict();

/** Max hours that can be logged on one calendar date (sum across entries). */
export const MAX_HOURS_PER_DAY = 24;

/**
 * Add an issue for every entry on a date whose summed hours exceed 24.
 * @param {Array<{date:string,hours:number}>} list
 * @param {import('zod').RefinementCtx} ctx
 * @param {string} key array field name for the issue path
 */
export function checkDailyHours(list, ctx, key) {
  const sum = new Map();
  for (const e of list) sum.set(e.date, (sum.get(e.date) || 0) + e.hours);
  list.forEach((e, i) => {
    if (sum.get(e.date) > MAX_HOURS_PER_DAY + 1e-9)
      ctx.addIssue({ code: 'custom', path: [key, i, 'hours'], message: `more than ${MAX_HOURS_PER_DAY} hours on ${e.date}` });
  });
}

export const schemas = {
  summary: z
    .object({
      lang,
      weekStart: isoDate, // Monday, local
      entries: z.array(entry).max(200), // this week + previous week only
    })
    .strict()
    .superRefine((v, ctx) => checkDailyHours(v.entries, ctx, 'entries')),

  safety: z
    .object({
      lang,
      vehicle: z.enum(['two_wheeler', 'bicycle', 'car_auto', 'on_foot']),
      shift: z.enum(SHIFTS),
      situations: z
        .array(z.enum(['rain_fog', 'late_night_drop', 'unfamiliar_area', 'long_hours', 'harassment']))
        .max(5)
        .default([]),
    })
    .strict(),

  schemesAsk: z
    .object({
      lang,
      question: userText(3, 500),
      profile: z
        .object({
          vehicle: z.enum(['two_wheeler', 'bicycle', 'car_auto', 'on_foot']).optional(),
          shift: z.enum(SHIFTS).optional(),
          ageBand: z.enum(['18-24', '25-34', '35-44', '45-59', '60+']).optional(),
          platforms: z.array(z.string().trim().min(1).max(40)).max(3).optional(),
        })
        .strict()
        .default({}),
    })
    .strict(),

  document: z
    .object({
      lang,
      mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
      imageBase64: z
        .string()
        .min(16)
        .regex(/^[A-Za-z0-9+/=\r\n]+$/, 'not base64'),
    })
    .strict(),

  grievance: z
    .object({
      lang,
      against: z
        .string()
        .trim()
        .min(2)
        .max(60)
        .regex(/^[\p{L}\p{M}\p{N} .&-]+$/u, 'letters, numbers and spaces only'),
      issue: z.enum([
        'payment_not_received',
        'wrong_deduction',
        'account_deactivated',
        'incentive_not_paid',
        'accident_insurance',
        'harassment_safety',
        'other',
      ]),
      issueOther: userText(3, 100).optional(),
      incidentDate: isoDate.refine(notFuture, 'date is in the future'),
      endDate: isoDate.refine(notFuture, 'date is in the future').optional(),
      details: userText(20, 2000),
      desiredOutcome: userText(0, 300).optional(),
      workerName: userText(0, 80).optional(),
      workerId: z
        .string()
        .trim()
        .max(40)
        .regex(/^[A-Za-z0-9-]*$/)
        .optional(),
      amount: z.number().finite().nonnegative().max(1000000).optional(),
      evidence: z.array(entry).max(31).default([]),
    })
    .strict()
    .refine((g) => g.issue !== 'other' || g.issueOther, { path: ['issueOther'], message: 'required when issue is other' })
    .refine((g) => !g.endDate || g.endDate >= g.incidentDate, { path: ['endDate'], message: 'must be on or after incidentDate' })
    .superRefine((g, ctx) => checkDailyHours(g.evidence, ctx, 'evidence')),
};
