// Response envelope shared by every endpoint (plan.md v2 section 4).
export const ok = (res, data) => res.json({ ok: true, data });
export const fail = (res, status, code, messageKey = `error.${code}`) => res.status(status).json({ ok: false, error: { code, messageKey } });

/** Wraps async route handlers; maps thrown errors (incl. Gemini failures) to the error envelope. */
export const handler = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
    const code = err.code || (status === 503 ? 'model_not_configured' : status === 502 ? 'model_unavailable' : 'server_error');
    if (status >= 500) console.error(`[${req.path}] ${code}: ${err.message}`);
    fail(res, status, code);
  }
};
