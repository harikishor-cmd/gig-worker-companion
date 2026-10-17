import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createGemini } from './services/gemini.js';
import { createCache } from './services/cache.js';
import { loadSchemes } from './services/schemes-store.js';
import { fail } from './http/envelope.js';
import { notFound, errorHandler } from './http/errors.js';
import summaryRouter from './routes/summary.js';
import safetyRouter from './routes/safety.js';
import schemesRouter from './routes/schemes.js';
import documentRouter from './routes/document.js';
import grievanceRouter from './routes/grievance.js';

/**
 * @param {object} deps  injectable for tests: gemini (mocked), cache, getSchemes, staticDir, rateLimitPerMin
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
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        'default-src': ["'self'"],
        'img-src': ["'self'", 'data:', 'blob:'],
        'style-src': ["'self'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'connect-src': ["'self'"],
      },
    },
  }));

  const api = express.Router();
  api.use(rateLimit({
    windowMs: 60_000,
    limit: deps.rateLimitPerMin ?? 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) => fail(res, 429, 'rate_limited'),
  }));
  // Body limits: 32 KB JSON everywhere; /api/document allows a 4 MB image as base64 (~5.6 MB).
  api.use('/document', express.json({ limit: '6mb' }));
  api.use(express.json({ limit: '32kb' }));
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
    app.use(express.static(staticDir, { maxAge: '1h', index: 'index.html' }));
    app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile('index.html', { root: staticDir }));
  }
  return app;
}
