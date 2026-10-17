# Gig Worker Companion (Gig Saathi) — PromptWars Chandigarh

Multilingual helper for delivery/ride workers: earnings log, safety tips, government schemes Q&A, document explain, grievance draft. Gemini calls stay server-side.

## Local run

```bash
cd promptwars-gig-companion
npm install
cp .env.example .env
# Edit .env and set GEMINI_API_KEY=<your key>
# Optional: GEMINI_MODEL=gemini-3.5-flash-lite  (or a model your key can call)
npm start
```

Open **http://localhost:8080/** (or the `PORT` in `.env`).

```bash
npm test   # vitest, mocked Gemini — no network
```

Do **not** commit `.env`. Never put the API key in frontend code.

## Stack

- `server/` — Express API + Gemini proxy (`gemini-3.5-flash-lite` by default)
- `web/` — vanilla HTML/JS/CSS (no build step); Express serves `web/` statically
- Earnings entries live in **localStorage** only (no login, no DB)

## GenAI usage map

| Endpoint | Model | Prompt purpose | Server file |
|---|---|---|---|
| `POST /api/summary` | `gemini-3.5-flash-lite` (env `GEMINI_MODEL`) | Explain code-computed weekly earnings stats (no invented numbers) | `server/routes/summary.js` |
| `POST /api/safety` | same | Situational safety tips from vehicle/shift/situations; phones are static | `server/routes/safety.js` |
| `POST /api/schemes/ask` | same | Eligibility Q&A grounded only in `server/data/schemes.json` | `server/routes/schemes.js` |
| `POST /api/document` | same (+ Vision) | Explain an uploaded document photo in plain language | `server/routes/document.js` |
| `POST /api/grievance` | same | Draft a formal complaint from validated facts + optional earnings evidence | `server/routes/grievance.js` |

Shared helper: `server/gemini.js`. Key: `GEMINI_API_KEY` env only. No canned AI fallbacks on error — UI shows localized error + Retry.

## Deploy / publish

Not done. Needs Hari's explicit approval before public repo, Cloud Run deploy, or any post.
