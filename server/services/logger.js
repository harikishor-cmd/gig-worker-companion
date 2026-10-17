// Minimal structured logger: one JSON line per event, which Cloud Run/Cloud Logging parses natively.
// Never pass request bodies, images, API keys or personal data to it.

/**
 * @param {'INFO'|'WARNING'|'ERROR'} severity
 * @param {string} message
 * @param {Record<string, unknown>} [fields]
 */
function write(severity, message, fields = {}) {
  const line = JSON.stringify({ severity, message, ...fields, time: new Date().toISOString() });
  if (severity === 'ERROR') process.stderr.write(`${line}\n`);
  else if (process.env.NODE_ENV !== 'test') process.stdout.write(`${line}\n`);
}

export const logger = {
  /** @param {string} msg @param {Record<string, unknown>} [f] */
  info: (msg, f) => write('INFO', msg, f),
  /** @param {string} msg @param {Record<string, unknown>} [f] */
  warn: (msg, f) => write('WARNING', msg, f),
  /** @param {string} msg @param {Record<string, unknown>} [f] */
  error: (msg, f) => write('ERROR', msg, f),
};
