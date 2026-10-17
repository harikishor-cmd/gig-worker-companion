# GenAI usage map

Model default (from `server/gemini.js`): `process.env.GEMINI_MODEL || 'gemini-3.5-flash'`.  
API: `generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` with `responseMimeType: application/json` and a per-call `responseSchema`. Temperature capped at ≤ 0.4. Language instruction injected on every call (`server/lang.js`). One retry on malformed JSON; never a canned fallback.

| # | Endpoint | Route file | Model | Input (validated) | Output schema (required fields) | Guardrail |
|---|----------|------------|-------|-------------------|----------------------------------|-----------|
| A | `POST /api/summary` | `server/routes/summary.js` | same as `gemini.js` (`MODEL`) | `{ lang, weekStart, entries[] }` — earnings rows; server runs `computeWeekStats` | `{ headline, insights[{text,basis}], suggestions[] }` (`SUMMARY_SCHEMA`) | Every number is computed in `server/stats.js` before the call; Gemini only explains. Post-filter drops any text that mentions a number not in the stats. Cache key on stats+lang. No call if `daysWorked < 2`. |
| B | `POST /api/safety` | `server/routes/safety.js` | same | `{ lang, vehicle, shift, situations[] }` (enums only) | `{ riskLevel, tips[{title,detail}], checklist[] }` (`SAFETY_SCHEMA`) | `riskFloor()` in code; model may raise risk, never lower it. Phone-like digit strings stripped from tips. `emergencyNumbers` (112, 1091, 1033, 108) are static constants, never from Gemini. |
| C | `POST /api/schemes/ask` | `server/routes/schemes.js` | same | `{ lang, question, profile? }` | `{ answer, cited_scheme_ids[], found }` (`SCHEMES_SCHEMA`) | Prompt includes only curated `schemes.json`. Server drops any `cited_scheme_ids` not in the dataset; `found` requires at least one known id. Empty dataset → 503 `schemes_not_loaded`, no model call. |
| D | `POST /api/document` | `server/routes/document.js` | same (+ Vision `inline_data`) | `{ lang, mimeType, imageBase64 }` jpeg/png/webp ≤ 4 MB | `{ is_document, summary, actions, unclear, grievance_hint }` (`DOCUMENT_SCHEMA`) | Magic-byte sniff; mime mismatch → 415. Image never stored or logged. Long digit IDs masked (last 4 kept). |
| E | `POST /api/grievance` | `server/routes/grievance.js` | same | `{ lang, against, issue, incidentDate, details, evidence[] (earnings rows), … }` | `{ subject, body }` (`GRIEVANCE_SCHEMA`) | Prompt built from whitelisted `buildFacts()` only. `channels` (NCH 1915, consumerhelpline.gov.in) are static. Warns if draft invents ₹ amounts ≥ 100 not in facts. |

Shared helper: `server/gemini.js` (`createGemini`). Schemas also declared next to each router. Zod validation: `server/validation.js` (`.strict()` — unknown fields rejected before any model call).
