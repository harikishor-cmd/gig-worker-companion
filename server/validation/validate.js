// Express middleware that validates req.body against a zod schema before any handler or model call runs.
import { AppError } from '../http/errors.js';

/**
 * Validate req.body; on success put parsed data on req.valid, else throw 400 with field errors.
 * @param {import('zod').ZodType} schema
 * @returns {import('express').RequestHandler}
 */
/**
 * Pick the error code from the FIRST failing issue, so a valid lang never yields invalid_lang.
 * @param {Array<{path: PropertyKey[]}>} issues
 */
export function errorCodeFor(issues) {
  const onlyLang = issues.length > 0 && issues.every((i) => i.path[0] === 'lang');
  return onlyLang || issues[0]?.path[0] === 'lang' ? 'invalid_lang' : 'invalid_input';
}

export const validate = (schema) => (req, res, next) => {
  const r = schema.safeParse(req.body ?? {});
  if (!r.success) {
    const issues = r.error.issues;
    const code = errorCodeFor(issues);
    throw new AppError(400, code, {
      messageKey: code === 'invalid_lang' ? 'error.invalidLang' : 'error.invalidInput',
      fields: issues.map((i) => ({
        path: i.path.length ? i.path.join('.') : (i.keys || []).join(',') || '(body)',
        message: i.message,
      })),
    });
  }
  req.valid = r.data;
  next();
};
