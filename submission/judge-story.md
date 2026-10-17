# Gig Saathi: judge-facing story
State checked 11:05 IST, 2026-10-17. Scope is frozen.

- **Problem:** Delivery and ride-hailing workers in Chandigarh/Mohali earn by the order, work late nights on two-wheelers, and are entitled to central schemes (e-Shram, PM-SYM, PMJJBY, PMSBY, APY) they rarely know how to claim. When a platform cuts a payout, they have no easy way to write a complaint. Most tools for them are English-only.
- **Who it's for:** One gig worker on a phone, in Punjabi, Hindi or English, with no login. Profile, language and earnings stay on the device.
- **Wow 1, the live language flip:** switch to ਪੰਜਾਬੀ mid-journey and the whole UI changes instantly; the next Gemini answer comes back in Gurmukhi. Every Gemini call takes the chosen language.
- **Wow 2, from a notice photo to a complaint:** photograph a penalty notice (our demo notice is self-made and stamped SAMPLE). Gemini Vision explains it in plain words, and one tap opens a complaint pre-filled with the notice's dates and the worker's own logged earnings for those dates as evidence, ready to copy or download.
- **Why it's trustworthy:** No canned output: if Gemini fails, the user sees a real error and a Retry button. All money figures (net, ₹/hour after fuel, night share) are computed in code, and Gemini only explains them. Scheme answers use only curated official data with source links, invented scheme ids are dropped on the server, and off-data questions get an honest "not in our verified list". Emergency numbers and complaint channels are static, verified data. The Gemini key stays on the server.

## Cut or label "unavailable" if not finished at submission
Build state at 11:05 IST: the server routes, Gemini client, validation and 4 test files exist locally, but **there are no commits, no remote and no REPO.md**, and `web/` has only `index.html`, `styles.css` and the i18n files, with **no feature JavaScript**. Treat as follows:
1. **Must exist or there's no submission:** a commit plus a GitHub repo (public only with Hari's yes). Without a deployed URL, submit the repo and say "deployment pending approval". Don't fake a URL.
2. **Any of F2-F6 without a working UI wired to its real endpoint:** hide its tab, or show a labeled "Coming soon (unavailable in this build)" card. Never show mock responses, seeded entries or static text that looks like a Gemini answer.
3. **Wow 2 handoff (document to grievance with evidence):** if it's not wired, the grievance drafter works on its own. Drop the claim from the description and video.
4. **Language flip:** if the Gemini output isn't verified in pa/hi, claim "UI in 3 languages" only.
5. **Tests:** list only the tests that actually pass under `npm test`. Don't claim 5 if fewer run.
6. **NITI Aayog figures:** leave them out unless Schemes & Grounding has verified them with a source.
7. **Demo video:** if one isn't recorded from a real working build, submit without it instead of staging a demo-only flow.
8. **Known drift to fix or not claim:** plan.md mentions Firestore, a `POST /api/earnings/sample` seeding endpoint and the model `gemini-3.8-flash`. The sample-seeding endpoint must not ship (fake data is a disqualifier). Confirm the model id the code actually uses before naming it in the README.
