# Progress

The running log of the build. Read this first when resuming. The plan is docs/build-plan.md; decisions are in docs/decisions.md.

## Status

| Milestone | State |
|---|---|
| M1 Foundations | Done |
| M2 Intelligence | Done |
| M3 Parents' app, offline | Done (Lighthouse performance 87 to 90 locally; re-measured on Render in M7) |
| M4 Dashboard and landing | Done, deployed to Render |
| M5 Fine-tune, voice, speech, diary | Done (card writer trained and serving; clips re-voiced for the new cards) |
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

### M4 Dashboard (2026-10-05)

- **This week** (/plan/<household>): a column for each weekday and one for the weekend; each card shows the time, who, the place photo, the travel lines, the fallback-ladder level and the strongest reason. Open one for the route on a MapLibre map (street-following lines from OSRM, stops from Nominatim, the bus in marigold with an ink casing, rail with sleepers, walks dotted), why it was picked with TabPFN's numbers, the real trip leg by leg, the day's opening hours, the card on their phone in Telugu, help joining, who could come along, and the other options for that day. Approve, swap, and drag to another day; moves are refused on days they aren't on their own and on days the place is shut. Changes stay in the visitor's session, and their parents' phones in the same browser show approved and moved tickets.
- **Their week:** the approved outings with what the phones reported ("I'm home", the face for "How was it?"), what they wanted to go to and couldn't, and the visit so far.
- **People and places:** the people memory with the exact sentence the planner is told (no names), shared words and notes, and the places they've been with how each went; anything can be forgotten.
- **Privacy** (sea theme): what stays with the family, the "where data goes" table generated from the outbound registry (sortable, filtered by when a call happens, cards on a phone), and how it's enforced.
- **Safety** (sea theme): the timer on a real outing from this week (leaves, home by, the phone checks, the email to you), settings in a validated form (buffer, wait, home before dark, ice, snow, heat advisory, the sun warning in °C with °F shown in the US), the official emergency numbers with their source, the help card as a stranger sees it, and advice on phone plans.
- **Languages:** what's ready in each parent's language (reading and planning, cards, reading aloud, listening), read from the build's outputs, plus what the local language is used for, and every language set up so far.
- **Setup:** a five-step wizard prefilled with the demo household: where they're staying (countries with a checked emergency number), each parent with their language and what's ready for it, the days on their own and weekend first rides, the help contact and phone plan, then a summary to save.
- **The planner, after reviewing the first board:** slots now fit each place's listed opening hours (decisions 44 and 45). The first plan had sent Kamala to Hariom Temple on a Monday, and it opens only on Sundays (now Sunday with the adult child), and sent Venkat and Raghu to shops before they opened. Two parents no longer go to two places of the same kind on the same day, each parent gets an outing on their own, reasons that echo a chip are replaced with a line from their ratings, and chips say "Indian grocery" and "No German needed".
- **The new weeks** (places and routes from live search, family synthetic). Fremont: Karya Siddhi Hanuman Temple (Sarala, Mon 08:30, Bus 211), Indian Market (Venkat, Mon 09:00, a 14-minute walk), Central Park (Sarala, Wed 08:30, Bus 210, left to decide), Irvington Farmers' Market (both, Sunday with the adult child; it runs Sundays 9:00 to 14:00). Munich: Stadtbibliothek Ramersdorf (Kamala, Tue 09:45, U5; closed Mondays), Stadtbibliothek Neuperlach (Raghu, Wed 10:00, a 4-minute walk), Hariom Temple (Kamala, Sunday with the adult child), Indian-Grocery-Store München (Kamala, Mon 09:45, left to decide), Wochenmarkt Perlach (Raghu, Saturday with the adult child; it runs Saturdays 7:30 to 13:00).
- **Art** (scripts/assets/, Blender 5.2 Cycles from the CC0 sources in docs/assets.md): the rail band and sea banner, the rail track and train front for the scroll track, the waterline and ferry, and the aircraft.
- **Verified:**
  - e2e/dashboard.spec.ts (Chrome, 1280 x 900): axe WCAG 2.2 AA, 0 violations on all 7 sections for both households in light and dark (28 pages); the board flow (approve shows "The ticket is on Sarala's phone now", take off, swap and swap back, a drag to Tuesday refused, a drag to Friday kept after a reload); the approved Central Park appears on Sarala's phone and the moved market on Venkat's with Friday in Telugu; a drag of the Ramersdorf library to Monday is refused because it's closed.
  - e2e/scroll-track.spec.ts: the rail track follows the page, dragging the train scrolls it, a click on the track jumps, the scrollbar is hidden while the track shows; on a Pixel 7 profile the track is hidden and the progress line fills.
  - agent/test/hours.test.ts: English and German hours, closed days, all-day, split hours, a shop that opens at 9, a Sunday-only temple moved to the weekend with the adult child.
  - The route-to-humans eval now checks each parent's own rest time (it had assumed 13:00 everywhere) and that every outing fits the place's opening hours.
  - Screenshots in docs/screenshots/plan-*.jpg for every section, both households, light and dark, reviewed against docs/brand.md.
- SerpApi: 39 of 40 searches used (three for the new bus routes). TabPFN's free daily pool ran out during the ten-week re-plan; the last three weeks ran after its reset.
- Test totals: 188 TypeScript unit tests and evals pass in replay mode (1 opt-in Atlas test skipped); privacy check 0 violations, 19 registered call sites.

### M4 Landing, style guide and deploy (2026-10-05)

- **Landing** (/): a live morning sky behind the story (three.js Sky at a low sun, raymarched cumulus, a procedural coast and town) in a Web Worker on an OffscreenCanvas. The server HTML carries a still frame, which is all that shows with reduced motion, Save-Data, a low-power device or no WebGL. The story panels preview the real demo week. Lighthouse mobile 91 to 92; accessibility, best practices and SEO 100; axe clean.
- **Style guide** (/design): every parents' app and dashboard component with the demo week, the scroll indicators and the baked art.
- **Deploy:** scripts/render-deploy.ts creates or updates two free Render services from the public repo (the web app's standalone server and the ranker), copies each key from .env by name without printing a value, and deploys at milestones rather than on every push. Live at https://roundtrip-web.onrender.com; /api/health answers in about 0.2 s when the service is awake.
- **Plan the coming week:** the This week page runs the planner live for next Monday to Sunday (Open-Meteo forecast, saved places, TabPFN through the ranker, Gemma 4), shows what it chose and what it called, and changes nothing on the board. Three runs an hour per visitor, forty a day in all.
- **Atlas:** Atlas refuses connections from Render's addresses, so the hosted demo keeps sessions in memory until Render's addresses are on the Atlas Network Access list (docs/blocked.md).

### M5 Diary, voice, speech and the card writer (2026-10-06)

- **Diary:** entries sync from the phone on home Wi-Fi and are encrypted on the server with each parent's own key (AES-256-GCM, HKDF per parent); only shared entries are ever decrypted, for Shared with you on the dashboard. 15 synthetic diary entries in Telugu start on the demo phones.
- **Voice router** (agent/src/voice/router.ts): the open voice per language, ElevenLabs only with a key and within its budget, saved clips found by language and exact text.
- **Speech** (speech/, run in the Codespace): every card, phrase, help card and synthetic voice entry voiced with MMS-TTS (Telugu, English, German; the AI4Bharat models are gated, docs/skipped.md) and scored by transcribing it back. The first run voiced nothing: torchaudio's PyPI wheel declares no torch version, so uv paired 2.11 with torch 2.14 and it failed to load; torchaudio was dropped, since ffmpeg decodes and resamples.
- **Card writer** (synthetic outings from live-search places, automated evaluation): a LoRA on Qwen3.5-4B trained once on Tinker by prompt distillation from Qwen3.5-397B-A17B drafts that passed a Gemma gate. On 40 held-out outings it passed every code check on 98% of cards (Gemma 85%, the untuned base 72%) and beat the base 36 to 1; against Gemma the judges split (Gemma judging 8 to 20, Kimi-K2.6 judging 14 to 12). Published at https://huggingface.co/roundtrip-family/roundtrip-card-writer-te-qwen3.5-4b-lora. Tinker spend $2.04 in all. docs/finetune-results.md.
- **The demo weeks' cards** now come from the tuned writer behind the same gate (code checks, Gemma's tone and facts review, and the walk from the stop when it's five minutes or more); it wrote 7 of 10, and Gemma the 3 it failed. Trains keep their own names ("U5", not "Bus U5"), and a line's direction may appear on a card.
- **Verified:** agent/test/gated-writer.test.ts (the gate keeps a passing tuned card, counts the walk only as its own number, sends a doubtful card on); agent/test/tinker-writer.test.ts (replays a saved tuned card, one corrective retry, no live calls in replay); 25 finetune tests; apps/web/test/diary.test.ts (entries encrypted at rest, private entries never returned, no network calls).
