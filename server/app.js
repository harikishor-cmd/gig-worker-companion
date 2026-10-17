import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createGemini } from './gemini.js';
import { createCache } from './cache.js';
import { loadSchemes } from './schemes.js';
import { fail } from './envelope.js';
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
  api.use('/schemes', schemesRouter({ gemini, getSchemes }));
  api.use('/document', documentRouter({ gemini }));
  api.use('/grievance', grievanceRouter({ gemini }));
  api.use((req, res) => fail(res, 404, 'not_found'));
  // Body-parser errors (too large / bad JSON) -> envelope
  // eslint-disable-next-line no-unused-vars
  api.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') return fail(res, 413, req.path.startsWith('/document') ? 'image_too_large' : 'payload_too_large');
    if (err.type === 'entity.parse.failed') return fail(res, 400, 'invalid_json');
    console.error(err);
    return fail(res, 500, 'server_error');
  });
  app.use('/api', api);

  app.get('/healthz', (req, res) => res.json({ ok: true }));

  if (staticDir && existsSync(staticDir)) {
    app.use(express.static(staticDir, { maxAge: '1h', index: 'index.html' }));
    app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile('index.html', { root: staticDir }));
  }
  return app;
}
