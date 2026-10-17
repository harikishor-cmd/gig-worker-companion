// Call D: Gemini Vision explains a document photo. The image is never stored or logged.
import { Router } from 'express';
import { schemas } from '../validation/schemas.js';
import { validate } from '../validation/validate.js';
import { ok } from '../http/envelope.js';
import { AppError } from '../http/errors.js';
import { sniffImage } from '../validation/image.js';
import { MAX_IMAGE_BYTES, TOKEN_LIMITS } from '../config.js';

export { sniffImage, MAX_IMAGE_BYTES };
import { DOCUMENT_SYSTEM, DOCUMENT_SCHEMA } from '../prompts/document.js';

const maskIds = (t) => String(t ?? '').replace(/\b(?:\d[ -]?){8,}(\d{4})\b/g, 'XXXX $1');
const deepMask = (v) =>
  typeof v === 'string'
    ? maskIds(v)
    : Array.isArray(v)
      ? v.map(deepMask)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepMask(x)]))
        : v;

export default function documentRouter({ gemini }) {
  const r = Router();
  r.post('/', validate(schemas.document), async (req, res) => {
    const { lang, mimeType } = req.valid;
    const b64 = req.valid.imageBase64.replace(/[\r\n]/g, '');
    if (Math.floor((b64.length * 3) / 4) > MAX_IMAGE_BYTES + 3) throw new AppError(413, 'image_too_large');
    const buf = Buffer.from(b64, 'base64');
    if (buf.length > MAX_IMAGE_BYTES) throw new AppError(413, 'image_too_large');
    const real = sniffImage(buf);
    if (!real || real !== mimeType) throw new AppError(415, 'unsupported_image');
    const raw = await gemini({
      lang,
      system: DOCUMENT_SYSTEM,
      prompt: 'Explain the attached document image.',
      image: { mimeType: real, data: b64 },
      schema: DOCUMENT_SCHEMA,
      temperature: 0.2,
      maxOutputTokens: TOKEN_LIMITS.document,
    });
    ok(res, deepMask(raw));
  });
  return r;
}
