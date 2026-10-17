# Backend tests

```bash
npx vitest run      # 6 files, 24 tests, Gemini mocked (no network)
npm run lint        # ESLint flat config + Prettier check
```

## Files and coverage

| File | What it covers |
|------|----------------|
| `test/summary.test.js` | `POST /api/summary` rejects negative hours, non-numeric rupees and invalid `lang` with 400 and no Gemini call; `computeWeekStats` totals / ₹/hr / night share / week-over-week; post-filter drops model insights that invent numbers. |
| `test/schemes.test.js` | Grounding: strips `cited_scheme_ids` not in the curated list; `found=false` (or only unknown ids) clears the answer; empty schemes list → 503 with no Gemini call. |
| `test/document.test.js` | Disguised PDF / MIME mismatch → 415 and oversized images → 413 before Gemini; valid PNG goes to Vision in the chosen `lang`. |
| `test/gemini.test.js` | Central helper: language rule, JSON schema, model, temperature cap, key only in header; one retry on bad JSON then `model_bad_output`; wrong-script retry; grievance facts whitelist; paragraph joining and name signing. |
| `test/security.test.js` | Helmet headers and strict CSP (no `unsafe-inline`), no `x-powered-by`; rate limiting with `RateLimit` headers and a 429 envelope; 413 on oversized JSON; generic 500 with no stack/internal message; magic-byte detection (JPEG/PNG/WebP vs PDF/SVG/truncated); zod rejects unknown fields, future dates, bad enums; control-char and delimiter stripping; prompts wrapped in tags with the data-only guard; static gzip + Cache-Control and CSP-safe markup. |
| `test/efficiency.test.js` | LRU eviction and TTL expiry; repeated (normalised) scheme question served from cache, not shared across languages; per-route token cap and single MAX_TOKENS escalation to 8192. |

Helpers: `test/helpers.js` (mocked Gemini, app factory). Framework: Vitest + Supertest.
