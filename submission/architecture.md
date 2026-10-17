# Architecture (as built)

See the mermaid diagram and folder map in the [README](../README.md#architecture).

- **Single Node 20 + Express service** (`server/index.js` → `server/app.js`): serves `/api/*` and the static frontend from `web/` (SPA fallback to `index.html`). Deployed as one Cloud Run container (`Dockerfile`).
- **Layers:** `routes/` (thin handlers) → `prompts/` (system text + response schemas) → `services/` (`gemini.js` the only Gemini client, `stats.js`, `cache.js`, `lang.js`, `sanitize.js`, `logger.js`) with `validation/` (zod schemas, validate middleware, magic-byte check) and `http/` (response envelope, `AppError`, central error handler). All limits live in `server/config.js`.
- **Five fixed Gemini proxies only** — `/api/summary`, `/api/safety`, `/api/schemes/ask`, `/api/document`, `/api/grievance`. No generic generate endpoint. Key from `GEMINI_API_KEY` env only, sent only in the request header, never returned to the client.
- **Validation:** zod `.strict()` on every body; invalid lang/input → 400 before any model call. Free text is cleaned (control/bidi chars stripped, `<`/`>` neutralised). JSON body limit 32 KB; 6 MB only on `/api/document`, where images are re-checked by size and magic bytes.
- **Security middleware:** helmet with strict CSP (no inline scripts/styles, `frame-ancestors 'none'`), `express-rate-limit` 30 req/min per IP on `/api`, `Cache-Control: no-store` on API responses, one error handler that never returns stack traces.
- **Efficiency:** per-route token caps with a single MAX_TOKENS escalation, in-memory LRU/TTL cache (summary, safety, scheme answers), gzip compression, 1 h static caching with `no-cache` HTML, client-side image downscaling, single-flight submit buttons, lazy-loaded schemes list.
- **No login, no database**: earnings and language live in on-device localStorage; cache and rate counters are in-memory per instance.
- **Curated schemes** loaded from `server/data/schemes.json`; grounding enforced in the schemes route (unknown cited ids dropped).
- **Static verified data outside the model**: emergency numbers (`routes/safety.js`), complaint channels (`routes/grievance.js`).
- **Health**: `GET /healthz` → `{ ok: true }`.
