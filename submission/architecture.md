# Architecture (as built)

- **Single Node 20 + Express service** (`server/index.js` → `server/app.js`): serves `/api/*` and the static frontend from `web/` (SPA fallback to `index.html`). Intended deploy target: one Cloud Run container (`Dockerfile`, `package.json` description).
- **Five fixed Gemini proxies only** — `/api/summary`, `/api/safety`, `/api/schemes/ask`, `/api/document`, `/api/grievance`. No generic generate endpoint. Shared client: `server/gemini.js`; key from `GEMINI_API_KEY` env only (see `.env.example`), never returned to the client.
- **Zod validation** (`server/validation.js`) on every body; invalid lang/input → 400 before any model call. JSON body limit 32 KB; document route allows up to ~6 MB for base64 images.
- **Rate limit**: `express-rate-limit`, default 30 requests/minute per IP on `/api` (`app.js`). Helmet CSP restricts connect/img/font sources.
- **No login, no database**: plan lock and scaffold — earnings and language live in **on-device localStorage**; server cache and rate counters are **in-memory per instance** (no Firestore).
- **Curated schemes** loaded from `server/data/schemes.json` (ids: eshram, pmsym, pmjjby, pmsby, apy, pmjay, ss_code_2020). Grounding enforced in the schemes route.
- **Static verified data outside the model**: emergency numbers (`safety.js`), complaint channels (`grievance.js`).
- **Health**: `GET /healthz` → `{ ok: true }`.
