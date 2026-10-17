// Express middleware that validates req.body against a zod schema before any handler or model call runs.
import { AppError } from '../http/errors.js';

/**
 * Validate req.body; on success put parsed data on req.valid, else throw 400 with field errors.
 * @param {import('zod').ZodType} schema
 * @returns {import('express').RequestHandler}
 */
export const validate = (schema) => (req, res, next) => {
  const r = schema.safeParse(req.body ?? {});
  if (!r.success) {
    const langBad = r.error.issues.some((i) => i.path[0] === 'lang');
    throw new AppError(400, langBad ? 'invalid_lang' : 'invalid_input', {
      messageKey: langBad ? 'error.invalidLang' : 'error.invalidInput',
      fields: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  req.valid = r.data;
  next();
};
