# Progress

The running log of the build. Read this first when resuming. The plan is docs/build-plan.md; decisions are in docs/decisions.md.

## Status

| Milestone | State |
|---|---|
| M1 Foundations | Done |
| M2 Intelligence | Done |
| M3 Parents' app, offline | Done (Lighthouse performance 87 to 90 locally; re-measured on Render in M7) |
| M4 Dashboard and landing | Not started |
| M5 Fine-tune, voice, speech, diary | Not started |
| M6 Temporal, email, safety, trial run | Not started |
| M7 Ship | Not started |

## Environment notes

- Keys: all set in .env and in Codespaces secrets except that DEMO_ALERT_EMAIL fails a format check (see docs/blocked.md).
- Codespace: urban-broccoli-xjqpp666g62vvq7 (4 cores, 16 GB), recreated with the sshd feature so jobs can run over `gh codespace ssh`.
- The gh CLI's GH_TOKEN has no codespace scope; run Codespaces commands with GH_TOKEN unset so the keyring login is used.

## Log

### 2026-10-05

- Read docs/plan.md, docs/brand.md, docs/persona.md, data/persona/, brand/ and docs/playbook.md section 4.
- Moved the plan to docs/plan.md and the brand files to brand/, created CLAUDE.md, wrote docs/build-plan.md and docs/decisions.md.
- Confirmed the free Gemma hosts serve the expected models: Cloudflare has `@cf/google/gemma-4-26b-a4b-it` and `@cf/google/embeddinggemma-300m`; OpenRouter has `google/gemma-4-31b-it:free` and `google/gemma-4-26b-a4b-it:free`.
- Confirmed Tinker lists `Qwen/Qwen3.5-4B` (train $0.737 per million tokens).
- Built the M1 foundations:
  - pnpm workspace (apps/web, packages/core, agent, scripts) with Biome, Vitest and TypeScript 6; uv projects for ranker, speech and finetune (Python 3.12).
  - packages/core: Zod schemas for all nine collections plus routes, country data with official emergency sources, the outbound registry and privacy guard, diary encryption, the persona loader and the language registry.
  - agent/src/gemma: the shared Gemma helper (Cloudflare, then OpenRouter; backoff, request spacing, neuron budget, cache, replay mode, privacy guard, Zod-validated JSON) and EmbeddingGemma embeddings. Live smoke test: structured output in 1.4 s; embeddings 0.5 s.
  - agent/src/db: Atlas connection, indexes, TTLs for demo-visitor data, vector index, `similar()` with an in-code fallback, and `pnpm seed`. Seeded both households: 2 households, 4 parents, 2 people, 34 past outings, 4 languages.
  - The refined logo set and icons (scripts/brand/build-logo.ts), design tokens with a contrast test, Hind and Hind Guntur, the five page themes, Panel, Button, Chip, Logo, Mark and the travel lines, and /design.
  - The privacy-check skill and script; docs/privacy-table.md is generated from the registry.
  - CI: lint, types, tests in replay mode, privacy check, web build, and the Python tests.
- Verified: 94 TypeScript tests pass (1 opt-in Atlas test skipped in CI, passing live), 13 Python tests pass, type checks pass, the production build passes, the privacy check reports 0 violations, and /design screenshots in both color schemes are in docs/screenshots/.

### M2 Intelligence (2026-10-05)

- **Model check** (`scripts/model-check/run.ts`, docs/model-check.md; synthetic, automated): Gemma 4 26B on Cloudflare kept Telugu script intact 20/20, judge fluency 3.65 and correctness 4.20, median 891 ms. Base Qwen3.5-4B scored 2.90 / 2.80, the case for fine-tuning. Teacher candidates Qwen3.6-35B-A3B (4.00 / 4.47) and Qwen3.5-397B-A17B (4.00 / 4.35). OpenRouter's free Gemma 31B answered 0 of 80 attempts (HTTP 429 upstream). 5 of 5 event listings returned valid JSON. Tinker spend for the check: logged in data/demo/usage/tinker-ledger.jsonl.
- **Discovery** (`scripts/discover.ts`, live search, saved to agent/fixtures/serpapi/): the dedicated `google_events` engine answered "Unsupported" for this account, so events come from `engine=google` (events_results). Results per query, week of 5 October 2026:

  | Area | Level | Query | Results |
  |---|---|---|---|
  | Fremont | 1 | Telugu events | 5 (general local events, none Telugu) |
  | Fremont | 1 | Telugu association / Dasara celebration | 0 / 0 |
  | Fremont | 2 | Indian community events | 7 (Durga Puja, Diwali expo, Bollywood class, a nightclub night) |
  | Fremont | 2-4 | Hindu temple, Indian grocery, park, farmers market, senior center, public library | 20 each |
  | Munich | 1 | Telugu events | 0 |
  | Munich | 2-4 | Hindu Tempel, Indischer Supermarkt, Park, Wochenmarkt, Seniorentreff, Stadtbibliothek | 20 each |
  | Bozeman (test) | 1-2 | Telugu events / Indian community events | 6 (none Telugu) / 0 |
  | Bozeman (test) | 3-4 | park, senior center | 20 each |

  SerpApi usage: 22 billed searches of the 40 allowed (the account API agrees). Places are filtered to the expected venue type with at least 10 reviews, which drops offices and foundations; event venues are geocoded with OpenStreetMap Nominatim.
- **Event understanding** (`evals/event-understanding.ts`, 40 synthetic listings with known labels): language match 100%, suits older adults 97.5%, indoor 100%, free and price 100%, category 85%, start and end 100%, on the first round of the v2 prompt. The model-check prompt (v1) had misread "community hall" as outdoor and "all ages" as unsuitable; v2 spells out the rules.
- **Ranker** (ranker/, FastAPI + tabpfn-client, reasons by grouped leave-one-feature-out): leave-one-out on the persona's 24 outings (synthetic), each ranked against the week's 20 live-search candidates:

  | Outings | n | TabPFN in top 3 | Travel time only | Random |
  |---|---|---|---|---|
  | Liked (4-5 stars), higher is better | 14 | 71% | 36% | 14% |
  | Disliked (1-2 stars), lower is better | 5 | 0% | 60% | 14% |
  | Wanted but didn't go | 2 | 0% | 0% | 14% |

  Without the with_adult_child feature the rates are the same; 6 of 24 outings change rank but none crosses the top-3 line, because the liked outings also differ in language match, knowing someone and kind of place. Candidates are scored as solo outings so weekend family slots aren't inflated. 96 TabPFN calls for the eval, all recorded under ranker/fixtures/ for replay. With 24 synthetic outings the numbers are rough.
- **Planner** (agent/src/planner, Mastra on Gemma 4): code discovers candidates down the ladder, finds each parent's feasible slots (best times, naps, days alone, walking, weather, daylight) and scores them with TabPFN; the agent picks four to six and writes why; code validates and fills. Fremont, week of 5 October (live search candidates, synthetic family): a Hindu temple, two Indian groceries, Central Park and the Age Well Center, Monday to Friday mornings, each back before the 13:00 nap, plus a Saturday farmers market with the adult child. One Gemma call per plan; about 8 s when the ranker's responses are recorded, up to about 100 s on a fresh week (mostly TabPFN round trips).
- **Route to humans** (evals/route-to-humans.test.ts): 26 checks over ten demo weeks (Fremont, Munich and Bozeman live searches plus seven synthetic variants), replaying recorded calls: every suggestion is a real place or event with an address and map location, no text offers the app as company, weeks without Telugu options say so, the injected Telugu group is chosen, heat and rain rules hold, naps hold, first rides only on new routes. Passing.
- Test totals: 137 TypeScript tests pass in replay mode (1 opt-in Atlas test skipped), plus ranker 7, speech 4, finetune 6 Python tests; privacy check 0 violations.

### M3 Parents' app, offline (2026-10-05)

- **The app.** Each parent has a page, /parents/<household>/<parent>, prerendered with their week, so today's ticket is in the HTML. /parents is the start screen ("whose phone is this?") and remembers the answer; a setup link (/parents?as=fremont-demo.p_sarala) answers it once. Views change on the phone with the history API (?v=directions), so moving around never asks the network. Screens: Today (ticket with travel lines, leave and back times, place photo, first-ride badge, stub with Listen and Directions, the card in Telugu, this week's list), Directions (stop countdown from the live route, "show where I am" with the GPS stop alert, steps, sign words for Venkat, Street View landmarks), Driver card (one per bus or train on a trip with a transfer), Practice phrases (local language, Telugu-script pronunciation, meaning), How was it? (talk, three faces, send or keep for later), I'm lost (help card in the local language, call the family, the official emergency number), Diary and Memory book (home theme, private by default), Help joining, Three words for a new friend. Bottom bar: I'm home, My diary, I'm lost.
- **Offline.** Serwist service worker scoped to /parents: one copy of each page stored without its query, the page warms the cache with everything it loaded before the worker took over, photos and audio cache first, no reload on reconnect. "I'm home" and replies wait in an IndexedDB outbox and send when the phone is back on Wi-Fi.
- **Bugs found in review and fixed:** the precache listed files without a leading slash, so the worker never installed; the route parser called AC Transit bus 211 a train because its headsign is "Union City BART" (the vehicle now comes from Google's transit icon, and the cards were rebuilt: "211 బస్సు ఎక్కండి"); in dark mode the text turned near-white on the white road theme; the diary briefly showed the start screen while the week loaded; screens branched on `localLanguage === "de"` (language names, speech tags and the help card's lines now come from data); the dev server's worker served stale chunks (the worker is off in development).
- **Verified** (production build, Playwright on Chrome, Pixel 7 profile):
  - e2e/offline.spec.ts: after one visit, with the server stopped and the network off, all 10 screens open from fresh tabs, taps between screens work, /parents opens the saved parent's page, and an "I'm home" tapped offline reaches the family once back online. Passed 3 runs in a row.
  - Bundle: 12 scripts, 691 KB uncompressed, none containing three.js, GSAP or MapLibre.
  - axe (WCAG 2.2 AA): 0 violations on 30 parent screens plus the start screen, in light and dark mode.
  - Lighthouse mobile (simulated slow 4G, 4x CPU, local build over HTTP/1.1): accessibility 100, best practices 100, SEO 100, performance 87 to 90 over five runs (LCP 3.7 to 4.0 s simulated, TBT 30 to 70 ms, CLS 0). A real trace with the same throttling, served from the phone's cache: LCP 352 ms. The gap is Lighthouse counting the app's scripts toward the first paint; re-measured on Render over HTTP/2 in M7.
  - Screenshots for Sarala, Venkat and Kamala on every screen, plus the start screen: docs/screenshots/parents-*.png, reviewed against docs/brand.md.
- Test totals: 182 TypeScript unit tests and evals pass in replay mode (1 opt-in Atlas test skipped); 6 Playwright suites (offline, bundle, 8 accessibility); privacy check 0 violations.
