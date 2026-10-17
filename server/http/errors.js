// One error-handling pattern for the whole API: routes and services `throw new AppError(...)`,
// Express 5 forwards async rejections here, and errorHandler turns them into the envelope.
// Stack traces and internal messages are logged server-side only and never sent to the client.
import { fail } from './envelope.js';
import { logger } from '../services/logger.js';

/** An expected, client-safe error with an HTTP status and a machine-readable code. */
export class AppError extends Error {
  /**
   * @param {number} status HTTP status (4xx/5xx)
   * @param {string} code machine-readable code, mapped to i18n on the client
   * @param {{ message?: string, messageKey?: string, fields?: Array<{path:string,message:string}> }} [opts]
   */
  constructor(status, code, opts = {}) {
    super(opts.message || code);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.messageKey = opts.messageKey;
    this.fields = opts.fields;
  }
}

/** 404 for unknown /api routes. */
export const notFound = () => {
  throw new AppError(404, 'not_found');
};

/**
 * Final Express error middleware.
 * @type {import('express').ErrorRequestHandler}
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err?.type === 'entity.too.large') {
    return fail(res, 413, req.path.startsWith('/document') ? 'image_too_large' : 'payload_too_large');
  }
  if (err?.type === 'entity.parse.failed') return fail(res, 400, 'invalid_json');

  if (err instanceof AppError) {
    if (err.status >= 500) logger.error('request_failed', { path: req.path, code: err.code, detail: err.message });
    return fail(res, err.status, err.code, err.messageKey, err.fields);
  }
  // Anything unexpected: log the detail, return a generic 500 (no stack, no internal message).
  logger.error('unhandled_error', { path: req.path, detail: String(err?.stack || err) });
  return fail(res, 500, 'server_error');
}
