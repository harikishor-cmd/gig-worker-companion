// Call D: Gemini Vision explains a document photo. The image is never stored or logged.
import { Router } from 'express';
import { schemas, validate } from '../validation.js';
import { ok, fail, handler } from '../envelope.js';

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** Detects the real image type from magic bytes. */
export function sniffImage(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

const SYSTEM = `You help Indian gig and platform workers (delivery riders, cab drivers) understand documents.
Explain the attached photo of a document in simple words a person with basic schooling can follow.
Keep numbers, dates, amounts, IDs and URLs exactly as printed.
Only use what is visible in the image. If text is unclear or cut off, say so in "unclear"; never guess amounts, dates or names.
If the image is not a document, set is_document=false and leave other fields empty.
Do not give legal advice; suggest contacting the issuing office or helpline when action is needed.
Never repeat full Aadhaar/bank numbers: mask all but the last 4 digits.
Set grievance_hint.suggested=true only for penalty, deactivation, deduction or payment notices.`;

export const DOCUMENT_SCHEMA = {
  type: 'object',
  required: ['is_document', 'summary', 'actions', 'unclear', 'grievance_hint'],
  properties: {
    is_document: { type: 'boolean' },
    doc_type: { type: 'string' },
    issuer: { type: 'string' },
    summary: { type: 'string' },
    key_dates: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, date: { type: 'string' } } } },
    amounts: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'string' } } } },
    actions: { type: 'array', maxItems: 5, items: { type: 'string' } },
    unclear: { type: 'array', items: { type: 'string' } },
    grievance_hint: { type: 'object', properties: { suggested: { type: 'boolean' }, issue: { type: 'string' }, platform: { type: 'string' }, details: { type: 'string' } } },
  },
};

const maskIds = (t) => String(t ?? '').replace(/\b(?:\d[ -]?){8,}(\d{4})\b/g, 'XXXX $1');
const deepMask = (v) => (typeof v === 'string' ? maskIds(v) : Array.isArray(v) ? v.map(deepMask) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepMask(x)])) : v);

export default function documentRouter({ gemini }) {
  const r = Router();
  r.post('/', validate(schemas.document), handler(async (req, res) => {
    const { lang, mimeType } = req.valid;
    const b64 = req.valid.imageBase64.replace(/[\r\n]/g, '');
    if (Math.floor((b64.length * 3) / 4) > MAX_IMAGE_BYTES + 3) return fail(res, 413, 'image_too_large');
    const buf = Buffer.from(b64, 'base64');
    if (buf.length > MAX_IMAGE_BYTES) return fail(res, 413, 'image_too_large');
    const real = sniffImage(buf);
    if (!real || real !== mimeType) return fail(res, 415, 'unsupported_image');
    const raw = await gemini({ lang, system: SYSTEM, prompt: 'Explain this document.', image: { mimeType: real, data: b64 }, schema: DOCUMENT_SCHEMA, temperature: 0.2, maxOutputTokens: 1500 });
    ok(res, deepMask(raw));
  }));
  return r;
}
