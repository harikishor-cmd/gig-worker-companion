// Express app factory: security middleware, /api routes, static frontend. No listen() here so tests can import it.
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { rateLimit } from 'express-rate-limit';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createGemini } from './services/gemini.js';
import { createCache } from './services/cache.js';
import { loadSchemes } from './services/schemes-store.js';
import { fail } from './http/envelope.js';
import { notFound, errorHandler } from './http/errors.js';
import { RATE_LIMIT_PER_MIN, JSON_LIMIT, DOCUMENT_JSON_LIMIT, STATIC_MAX_AGE } from './config.js';
import summaryRouter from './routes/summary.js';
import safetyRouter from './routes/safety.js';
import schemesRouter from './routes/schemes.js';
import documentRouter from './routes/document.js';
import grievanceRouter from './routes/grievance.js';

/** Strict CSP: same-origin only, no inline scripts, no framing, no plugins. */
export const CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'"],
  'img-src': ["'self'", 'data:', 'blob:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
};

/**
 * Build the Express app.
 * @param {object} [deps] injectable for tests
 * @param {Function} [deps.gemini] mocked gemini()
 * @param {ReturnType<typeof createCache>} [deps.cache]
 * @param {() => Array<object>} [deps.getSchemes]
 * @param {string|null} [deps.staticDir] null disables static serving
 * @param {number} [deps.rateLimitPerMin]
 * @returns {import('express').Express}
 */
export function createApp(deps = {}) {
  const gemini = deps.gemini || createGemini();
  const cache = deps.cache || createCache();
  const schemesList = deps.getSchemes ? null : loadSchemes();
  const getSchemes = deps.getSchemes || (() => schemesList);
  const staticDir = deps.staticDir ?? fileURLToPath(new URL('../web', import.meta.url));

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Cloud Run sits behind one proxy hop
  app.use(helmet({ contentSecurityPolicy: { directives: CSP_DIRECTIVES }, crossOriginEmbedderPolicy: false }));
  app.use(compression()); // gzip/deflate for HTML, JS, CSS, JSON

  const api = express.Router();
  api.use((req, res, next) => {
    res.set('Cache-Control', 'no-store'); // API answers can carry personal content
    next();
  });
  api.use(
    rateLimit({
      windowMs: 60_000,
      limit: deps.rateLimitPerMin ?? RATE_LIMIT_PER_MIN,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (req, res) => fail(res, 429, 'rate_limited'),
    }),
  );
  api.use('/document', express.json({ limit: DOCUMENT_JSON_LIMIT }));
  api.use(express.json({ limit: JSON_LIMIT }));
  api.use('/summary', summaryRouter({ gemini, cache }));
  api.use('/safety', safetyRouter({ gemini, cache }));
  api.use('/schemes', schemesRouter({ gemini, getSchemes, cache }));
  api.use('/document', documentRouter({ gemini }));
  api.use('/grievance', grievanceRouter({ gemini }));
  api.use(notFound);
  api.use(errorHandler);
  app.use('/api', api);

  app.get('/healthz', (req, res) => res.json({ ok: true }));

  if (staticDir && existsSync(staticDir)) {
    const noCacheHtml = (res, path) => {
      if (path.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    };
    app.use(express.static(staticDir, { maxAge: STATIC_MAX_AGE, index: 'index.html', setHeaders: noCacheHtml }));
    app.get(/^(?!\/api\/).*/, (req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile('index.html', { root: staticDir });
    });
  }
  return app;
}
