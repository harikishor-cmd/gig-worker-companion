# Backend tests

Command (repo root `/workspace/promptwars/promptwars-gig-companion`):

```bash
npx vitest run
```

## Result (run 2026-10-17, Asia/Calcutta box time ~11:04+)

```
Test Files  4 passed (4)
     Tests  11 passed (11)
```

## Files and coverage

| File | What it covers |
|------|----------------|
| `test/summary.test.js` | `POST /api/summary` rejects negative hours, non-numeric rupees, and invalid `lang` with 400 and **no** Gemini call; `computeWeekStats` totals / ₹/hr / night share / WoW; post-filter drops model insights that invent numbers not in the stats. |
| `test/schemes.test.js` | Grounding: strips `cited_scheme_ids` not in the curated list; `found=false` (or only unknown ids) clears the answer; empty schemes list → 503 `schemes_not_loaded` with no Gemini call. |
| `test/document.test.js` | Rejects disguised PDF / mime mismatch (415) and oversized images (413) before Gemini; valid PNG is sent to Vision with the chosen `lang`. |
| `test/gemini.test.js` | Central helper injects Punjabi language rule, JSON schema, model `gemini-3.5-flash`, temperature cap 0.4, API key only in header; retries once on bad JSON then `model_bad_output` (no canned answer); grievance `buildFacts` whitelist only. |

Helpers: `test/helpers.js` (mocked Gemini / app factory). Framework: Vitest + Supertest (`package.json` scripts: `"test": "vitest run"`).
