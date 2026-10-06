# Decisions

Each entry: the decision, then the reason in one line. Newest last.

## Setup

1. **The plan lives at docs/plan.md and the brand files at brand/.** CLAUDE.md, docs/brand.md and the playbook all point to those paths; the files arrived as docs/roundtrip-plan.md and "brand assets/".
2. **CLAUDE.md was created from playbook section 2.** It didn't exist yet. Changes from the playbook text: where development runs, the .env line the builder asked for, the outbound registry path, and a writing section.
3. **"pstack" means the gstack skill suite.** No skill with that name is installed; gstack is the installed engineering suite (plan reviews, code review, QA). Superpowers and Ponytail aren't installed either.
4. **TypeScript is pinned to 6.0.3.** TypeScript 7 is the new native compiler, and Next.js type checking and the test tooling still use the JavaScript compiler API.
5. **Code is written and tested in this checkout; speech models and the Temporal worker run in the Codespace.** This machine is Windows on ARM64, where the speech libraries and Temporal's native worker are unreliable or missing; the Codespace is Linux x64 with 16 GB.
6. **Shared code goes in packages/core.** The web app, the agent and the workflows all need the same schemas, country data, outbound registry and diary crypto, and plan section 14 has no shared package.
7. **Email is sent only when DEMO_ALERT_EMAIL is a valid address.** The current value doesn't pass a format check; the code checks it at runtime, sends nothing otherwise, and logs that it skipped.
8. **Commits carry no co-author trailer from here on.** The builder's goal asks for none.

## M1 Foundations

9. **Gemma's thinking is turned off with `chat_template_kwargs.enable_thinking=false`.** With thinking on, a 200-token reply came back empty because reasoning used every token; with it off the same Telugu sentence took 1.3 s and 36 tokens (live probe, 2026-10-05).
10. **Embeddings come from EmbeddingGemma-300m on Workers AI, not a model run in the Codespace.** It is an open multilingual model, and the hosted app can embed new events with it; a Codespace-only model couldn't. Measured: an English and a Telugu description of the same event score 0.845 cosine, an unrelated listing 0.281.
11. **Atlas Vector Search is used directly.** The free M0 cluster accepted the vector index; `similar()` still falls back to cosine in code while an index is building.
12. **Demo content is read from files; live state goes to MongoDB.** Seeded demo weeks, cards and audio ship in data/demo/, so CI and the offline app work without Atlas; approvals, check-ins and diary entries use Atlas.
13. **Python projects use 3.12.** numpy 2.5 needs 3.12; tabpfn-client 0.6.1 caps pandas at 2.3.3, so pandas is pinned to that range.
14. **Biome lints and formats.** Next.js 16 removed `next lint`, and one tool for both jobs keeps dependencies few. Persona, docs and brand files are excluded so they stay exactly as written.
15. **Playwright drives the installed Chrome locally and its own Chromium in CI.** This machine is Windows on ARM64.
16. **The Fremont home area is Mowry Ave & Fremont Blvd.** It is a real intersection next to the Walgreens at 2600 Mowry Ave, and the Safeway at 39100 Argonaut Way is about a 20-minute walk away, which matches the persona's "walk to Safeway, too hot, no shade" outing. OpenStreetMap data (Overpass) confirmed both stores.
17. **The Munich household lives near U-Bahn Neuperlach Zentrum,** and both demo contact numbers come from ranges reserved for fiction (NANPA 555-01xx, Bundesnetzagentur (0)89 99998 xxx).
18. **Emergency numbers were checked on official pages:** 911.gov for the US and the BBK (Federal Office of Civil Protection) for Germany's 112 and 110.
19. **Privacy is enforced in code, not only in the table.** Every outbound call declares a data class, the registry lists which classes each route may carry, and personal data never reaches a hosted route. The persona's ratings are synthetic, so they may go to the hosted TabPFN; a real family's ratings would need TabPFN run locally.
20. **OpenRouter's free Gemma endpoints returned 429 "rate-limited upstream" during setup.** The helper backs off and moves on, and replays saved outputs when every host is busy.

## M2 Intelligence

21. **Events come from SerpApi's `engine=google` events block.** The dedicated `google_events` engine answered "Unsupported" for this account on 2026-10-05; SerpApi documents the events block of Google search as the alternative.
22. **Only billed searches count against SERPAPI_MAX_SEARCHES.** SerpApi doesn't bill failed requests; the account API confirmed 14 billed searches when the first counter said 23.
23. **Event understanding uses a v2 prompt that spells out each field.** The model-check prompt misread "community hall" as outdoor and "all ages" as unsuitable; v2 scored 100% on language match over 40 synthetic listings in its first round.
24. **Places must be the expected venue type and have at least 10 reviews.** Sorting by distance alone picked a library foundation, a county administration office and social-services offices.
25. **Event venues are geocoded with OpenStreetMap Nominatim.** Listings give a venue and town but no coordinates; Nominatim is free and its policy allows light, cached use.
26. **Reason chips come from grouped leave-one-feature-out on expected enjoyment.** tabpfn-client has no attribution method. Grouping the trip, timing and weather features and refitting only the regressor, in parallel, cut a ranking from about 150 s to under 40 s. Chips are dropped when they can't be true: weather for an indoor place, or "like the outings they enjoyed" for a kind of outing they've never done.
27. **Every candidate is scored as a solo outing.** In the persona's history every 5-star outing had the adult child along, so scoring weekend family slots with that flag ranked a Saturday market first for that reason alone.
28. **Code finds, schedules and scores; the Mastra agent chooses and explains.** With Mastra's structured-output option Gemma skipped the tools and invented candidate ids. The agent now gets the real candidates with each parent's slot and TabPFN score, answers in JSON that code parses, and every choice is validated against the candidate list. Fallbacks fill any week to two or three options down the ladder.
29. **suggestTrialRun is not one of the agent's tools.** Gemma's arguments for it repeatedly failed to parse; first rides are decided by code from the routes already ridden.
30. **Model choices.** Planner: Gemma 4 26B A4B on Cloudflare (script intact 20/20, names kept in English, under a second, free). Card-writer base: Qwen3.5-4B, the weakest Telugu writer in the check, so the fine-tune has the most to show; Qwen3.5-9B is the fallback. Model-check judge: Kimi-K2.6, a different family from Gemma and Qwen. The teacher is chosen by a small card pilot in M5.
31. **The stop countdown comes from SerpApi directions.** Transit legs list every intermediate stop, so the stop just before theirs needs no extra data source. SerpApi reads `depart_at` as UTC wall-clock time, so local times are encoded that way.
32. **Every external call is recorded.** SerpApi responses, Gemma answers, TabPFN predictions, ranker responses, forecasts and geocodes are saved as fixtures, so CI and the hosted demo replay them without calling anything.

## M3 Parents' app

33. **next-intl runs without its build plugin.** The plugin loads @swc/core's native binding, which isn't built for Windows on ARM64. The parents' app gets its Telugu messages from a client provider, which also keeps its pages static and offline.
34. **Each parent has their own prerendered page, and views change with the history API.** /parents/fremont-demo/p_sarala carries that parent's week in its HTML, so the ticket shows before any script runs, and ?v= view changes never need the server. A single client-rendered /parents page scored 72 on Lighthouse with a 5.3 s LCP; this one scores 87 to 90.
35. **The parents' app keeps its light palette in dark mode.** Parents read it outdoors in daylight and every line sits on a white panel. axe runs in both schemes.
36. **The ticket's place photo is a 96 px thumbnail beside the times.** A full-width photo pushed Listen and Directions below a phone's first screen and was the slowest thing on the page. Photos are requested at the size shown, as WebP at quality 60 (18 KB instead of 317 KB), retried once at the original size and hidden if both fail.
37. **Fonts are self-hosted with next/font/local.** The seven files are Google Fonts' latin and telugu subsets of Hind and Hind Guntur, each face declares only its own characters, and Hind comes first in every stack. With next/font/google, digits and names inside Telugu text pulled in Hind Guntur's three Latin files.
38. **Styles are inlined into the HTML** (Next.js `inlineCss`): no render-blocking request, and the page cached for offline carries its own styles.
39. **The service worker stores one copy of each page without its query, warms itself from what the page loaded, never reloads on reconnect, and is off in development.** Reloading when the phone reconnects would cut off a recording; the outbox sends instead. In development it served stale chunks.
40. **A transit leg's vehicle comes from Google's transit icon** (bus2.svg, de-sbahn.svg, de-metro.svg), then the line name and operator, never the headsign.
41. **No screen branches on a language code.** Language names come from the language table (what a Telugu speaker calls English or German), speech tags from the table or the household's country, and the help card's and walking driver card's lines from the household's local phrases.
42. **esbuild is a dependency of apps/web.** Serwist's Turbopack route bundles the service worker with it (an optional peer dependency), at build time and in development.
43. **The visitor session cookie is Secure whenever the request came over HTTPS** (Render's proxy sets x-forwarded-proto), and outbox sends run one at a time so a phone never starts two sessions at once.

## M4 Dashboard

44. **Every slot fits the place's listed opening hours.** They arrive while it's open and leave ten minutes before it closes; a visit shortens to about 60% of its usual length when the place closes sooner, or the slot moves. The first plan sent a parent to a temple that opens only on Sundays and to two shops before they opened. Hours come from the Google Maps listings already saved, so this cost no searches.
45. **The week builder re-checks the hours with the real route** and stops with an error if a real trip arrives before opening or too close to closing. The planner schedules with a straight-line estimate, and one estimate was half the real trip.
46. **Two parents never go to two places of the same kind on the same day.** The second one moves to another free day. The re-plan had sent one parent by bus to an Indian grocery while the other walked to a different one at the same hour.
47. **Each parent gets at least one outing on their own when one is feasible.** Getting out on weekdays is the point; one Gemma answer gave the father only a weekend outing with the adult child.
48. **A reason that only repeats a chip, or names another kind of place, is replaced with a line from their own ratings** ("She gave her last 5 temple visits 5 of 5."). Gemma echoed "Like the temple outings they enjoyed" and once called a farmers market a walk in the park.
49. **Reason chips name the kind of place properly and say the household's local language** ("Indian grocery", "No German needed"). The ranker labels chips without knowing the household.
50. **Walks with no saved directions use an OpenStreetMap walking route (OSRM foot profile) at 4.5 km/h.** Walking doesn't depend on timetables, and it kept SerpApi at 39 of 40 searches.
51. **The week board has a column for each weekday and one for the weekend.** Seven equal columns made every card too narrow to read at 1440 px. Drag and drop is dnd-kit (pointer and keyboard sensors); a move is checked on the client and again on the server against the days they're on their own and the place's hours.
52. **A visitor's approvals, swaps and moves live in their session for a day, and their parents' phones in the same browser pick them up** (/parents/api/changes). The approve toast promises the ticket is on the phone; now it is. A moved ticket's Telugu day name is rewritten to the new day.
53. **MapLibre GL 6 with OpenFreeMap's positron style, restyled in brand tones.** No key and no billing. Its worker is copied to public/maplibre/<version>/ before dev and build, because MapLibre looks for its worker next to its own script and a bundled chunk has none there.
54. **New libraries, one job each:** TanStack Query (the board's changes, with optimistic updates), TanStack Table v9 (the privacy table's sorting), React Hook Form with the Zod resolver (safety settings and setup), Sonner (toasts), dnd-kit (drag and drop), MapLibre GL (route maps). vaul and @dnd-kit/sortable were installed and then removed, unused.
55. **The themed scroll track replaces the scrollbar only on precise pointers.** Rail: the baked track down the right edge with the train's nose as the handle. Sea: a slim waterline dock along the bottom with the ferry, so the ferry never sits over text. Touch screens keep native scrolling with a thin progress line. All of it is aria-hidden; native scrolling stays the accessible way.
56. **A place photo shows only once it has loaded.** Google's image service intermittently refuses headless browsers; the tile underneath shows a sign for the kind of place, and a failed sized copy retries the original once.
57. **People and places shows the exact sentence the planner is told about each person**, from the same function the planner uses. Forgetting someone stops them being described to the planner (per session in the demo).
58. **Their week shows only what the phones report:** "I'm home", and the face picked for "How was it?". Voice notes stay on the phone in the demo; diary entries stay private unless shared.
59. **The Languages screen reads its status from the build's own outputs:** which writer made this week's cards and how many pass the rubric, and whether any audio clips exist. A language record says what a model supports; the screen says what this demo actually does.
60. **Setup asks only for first names, the nearest stop and one contact number,** and lists only countries whose emergency number has been checked against an official page.
61. **A persona note was reworded.** "Said he felt stupid" became "couldn't ask for what he needed", because the product never describes the parents as helpless or pitiable.
62. **TabPFN's free daily pool ran out while re-planning ten weeks after these changes**; the last three were planned after its 00:00 UTC reset. Only changed feature rows are sent, so later re-plans cost little.
