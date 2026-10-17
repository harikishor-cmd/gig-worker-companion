// Response envelope shared by every endpoint: { ok: true, data } or { ok: false, error: { code, messageKey } }.

/**
 * Send a success envelope.
 * @param {import('express').Response} res
 * @param {unknown} data
 */
export const ok = (res, data) => res.json({ ok: true, data });

/**
 * Send an error envelope. The frontend maps `code` to a localized message.
 * @param {import('express').Response} res
 * @param {number} status HTTP status
 * @param {string} code machine-readable error code
 * @param {string} [messageKey] i18n key (defaults to `error.<code>`)
 * @param {Array<{path:string,message:string}>} [fields] field-level validation errors
 */
export const fail = (res, status, code, messageKey = `error.${code}`, fields) =>
  res.status(status).json({ ok: false, error: { code, messageKey, ...(fields ? { fields } : {}) } });
