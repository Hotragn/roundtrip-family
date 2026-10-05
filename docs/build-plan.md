# Build plan

Roundtrip plans two or three outings a week for visiting parents, to real places and real people, and makes each trip one they can manage alone in their own language. The parents carry an installable web app that works offline: a ticket for the day, directions that say when to press stop, a card to show the driver, phrases to practice, an "I'm lost" card, a private diary and a memory book. The adult child approves the week on a dashboard or by replying to an email, and gets a safety alert if "I'm home" doesn't arrive in time. Gemma 4 plans, TabPFN ranks from what the parents enjoyed, a Tinker-tuned Qwen writes the Telugu cards, open speech models give every card a voice, and Temporal keeps the safety timers durable. The demo household is fictional and every result built on it is labeled synthetic.

## Milestones and the check that proves each

| Milestone | What gets built | Proof it works |
|---|---|---|
| **M1 Foundations** | pnpm workspace (apps/web, packages/core, agent, workflows, evals) and uv projects (ranker, speech, finetune); CI; design tokens as CSS variables; Hind and Hind Guntur; refined logo and icon set; the five page themes; base components; /design; Zod schemas; seed of both households; embeddings and similarity search; the shared Gemma helper; the outbound registry and privacy check | `pnpm install && pnpm test` and `uv run pytest` pass on a fresh clone and in CI; `pnpm seed` loads both households and a test finds similar events; the Gemma helper's retry, fallback, cache and budget tests pass offline; /design screenshots reviewed against docs/brand.md |
| **M2 Intelligence** | Model check (Telugu translation, back-translation, cross-family judge, event JSON, script integrity); SerpApi discovery with cache, search budget and the fallback ladder; event understanding; the TabPFN ranker service with reasons; leave-one-out evaluation; the Mastra planner with every tool | docs/model-check.md; discovery tests pass offline from fixtures and the no-Telugu-events area still gets 2 or 3 suggestions per week; event-understanding accuracy at least 85% on language match; the leave-one-out table beats distance-only and random; evals/route-to-humans.test.ts passes on 10 replayed weeks |
| **M3 Parents' app, offline** | /parents: Today ticket with the stub tear, directions with the stop countdown and GPS alert, driver card, practice phrases with Telugu-script pronunciation, How was it?, I'm lost with the official emergency number, diary screens, help joining, three words for a new friend; per-parent views; the Germany household; manifest and a service worker scoped to /parents | A Playwright test loads the week, goes offline and opens every screen; axe finds no violations; a bundle test proves no three.js, GSAP or MapLibre in /parents; Lighthouse mobile at least 90 for performance and accessibility; screenshots reviewed |
| **M4 Dashboard and landing** | Baked renders (aircraft, train front, ferry, rail and waterline strips, rail band, sea banner, sky still); landing with the live sky scene and its static fallback; /plan with the week board, suggestion cards, reason chips, ladder levels, MapLibre route previews, approve and swap, their week, shared diary, people and places, privacy, safety, languages and setup; themed scroll indicators; then a redesign pass on the key screens | Screenshots of every page in both themes reviewed and fixed; WebGL-off and reduced-motion tests show the still frames; Lighthouse at least 90 on the landing page; axe clean on every page |
| **M5 Fine-tune, voice, speech, diary** | Card style, a 400-outing synthetic dataset with teacher drafts and a quality gate, one LoRA training run, base vs tuned evaluation, the adapter on Hugging Face; speech generation and transcription in the Codespace with character error rates; the voice router; diary encryption, sync, sharing and the memory book | docs/finetune-results.md with the rubric, name-preservation and order-swapped judge tables; spend under MAX_TINKER_SPEND_USD in docs/costs.md; router tests (Telugu open voice, ElevenLabs only with a key, a language ElevenLabs lacks still gets audio); diary tests: encrypted at rest, private entries never on the dashboard, no diary text in any outbound request |
| **M6 Temporal, email, safety, trial run** | weekPlan, outingSafety and trialRun with the worker; the AgentMail inbox; planning email, alert and weekly summary; approve by reply (WebSocket in the Codespace, signed webhook on Render); weather rules | evals/durability.test.ts kills the worker mid-wait and the alert still fires on time, saved to docs/durability-run.txt; an approve reply reaches weekPlan; weather rules block ice, heavy snow and heat advisories in tests |
| **M7 Ship** | Render deploy of the web app and ranker; the rate-limited "Plan a new week" button; Sentry tracing with scrubbing; full CI; privacy, accessibility and performance audits; README, docs/numbers.md, docs/privacy-table.md, docs/final-report.md | A live URL that loads; green GitHub Actions run with a results table in the job summary; privacy table regenerated from the outbound registry; Lighthouse and axe results saved; every number in docs/numbers.md traced to its command |

After each milestone: run the tests, take screenshots and compare them with docs/brand.md, fix what doesn't match, run the privacy check, update docs/progress.md, then commit and push.

## Top risks, ranked

1. **Gemma's Telugu and the free tiers.** Weak Telugu or daily limits would hurt planning and judging. Mitigation: the model check runs first, every call is cached, Cloudflare falls back to OpenRouter, and the demo replays saved outputs.
2. **The fine-tune budget and quality.** A 4B model may write weak Telugu. Mitigation: cost estimates before every Tinker call, a hard stop at MAX_TINKER_SPEND_USD, a cheap mixture-of-experts teacher, a quality gate, and Qwen3.5-9B as the fallback.
3. **Thin event results.** Fremont may have few Telugu events in a given week. Mitigation: the five-level fallback ladder and regular places.
4. **SerpApi's 40-search cap.** Mitigation: a persisted search counter, a cache keyed by query and week, and fixtures for every test.
5. **Speech models on CPU.** Indic Parler-TTS and IndicConformer need memory and time. Mitigation: they run only in the Codespace, outputs are saved once, and peak memory is recorded.
6. **Temporal's native worker.** It may not run on this Windows ARM64 machine. Mitigation: the worker runs in the Codespace and in CI on Linux.
7. **Render's free tier.** 512 MB, sleeping services and slow builds. Mitigation: standalone Next output, replayed outputs, a loading state for cold starts.
8. **Realistic 3D within the performance budget.** Mitigation: baked renders for everything except the landing sky and route maps, lazy loading, still-frame fallbacks and Lighthouse checks.
9. **An invalid DEMO_ALERT_EMAIL.** Email can't be sent until it's fixed. Mitigation: the code validates the address and sends nothing otherwise; tests use a mocked client.

## Where a person would normally provide something

| The plan expects | Stand-in |
|---|---|
| A household profile and past outings | The fictional persona in data/persona/ |
| A second household outside the US | A synthetic Germany household with 10 outings |
| Ground-truth labels for event listings | 40 synthetic listings built from known attributes |
| Native-speaker review of cards | An automated gate: code checks plus Gemma as judge, labeled automated |
| Voice recordings for diary entries and replies | Synthetic Telugu text voiced by open TTS models in the Codespace |
| Listening tests for speech quality | Text to speech to text, scored by character error rate |
| An approve reply to the planning email | A simulated inbound event in tests; the demo sends the signal directly |
| Photos of landmarks from a first ride | Place photos from the live search results |
| A real alert inbox | DEMO_ALERT_EMAIL, the builder's own address |
