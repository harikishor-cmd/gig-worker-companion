# Demo script (60–90 seconds)

**Persona (demo only):** Gurpreet, delivery rider on a two-wheeler in Mohali. Every number typed live or clearly labelled sample. Self-made penalty notice labelled **SAMPLE** on camera.

| Time | Scene | What you do (live) | What it proves |
|------|--------|--------------------|----------------|
| 0:00–0:08 | Language | Open app. Pick Punjabi (Gurmukhi), or Hindi / English. Reload; language sticks. | Persistent picker; UI and later Gemini answers follow `lang`. |
| 0:08–0:25 | Log trip | Add one real entry (platform, trips, gross, tips, expenses, hours, shift). Totals update on device. Optionally add a clearly badged sample week if the UI has it. | Earnings log + totals in **code**, not AI. |
| 0:25–0:38 | Weekly summary | Tap weekly summary. Show headline/insights in the chosen language. Optionally switch to Punjabi mid-journey and regenerate so the next answer is in Gurmukhi. | `POST /api/summary` — Gemini explains server-computed stats only. |
| 0:38–0:50 | Safety | Set vehicle = two-wheeler, shift = night, tick rain/fog (and/or late night). Show tips + checklist; point to the static emergency block (112, etc.). | `POST /api/safety` — guidance from situation enums; phone numbers not invented by the model. |
| 0:50–1:05 | Schemes Q&A | Ask a short question (e.g. about PM-SYM). Show answer + cited scheme ids; open an **official source link** from the curated dataset. | `POST /api/schemes/ask` grounded only in `schemes.json`. |
| 1:05–1:20 | Document | Photograph a **self-made** penalty/deactivation notice with **SAMPLE** printed on it. Read the plain-language summary and any extracted dates/amounts. | `POST /api/document` Vision; image not stored. |
| 1:20–1:30 | Grievance | Use draft complaint (pre-filled from document + logged earnings as evidence). Generate, then **Copy** and/or **Download .txt**. Mention static NCH channel if shown. | `POST /api/grievance` from validated facts only. |

**Close (5 s):** One journey — earnings → summary → safety → schemes with sources → photo → complaint — Hindi / Punjabi / English, Gemini key server-side, no login.
