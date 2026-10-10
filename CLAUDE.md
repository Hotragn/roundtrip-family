# Roundtrip

## What this is
An open-model planner that helps visiting parents get out of the house each week, to real places with real people who speak their language, on outings they can manage on their own. It includes a private diary and a memory book. Built as a finished personal product. The full plan is in docs/plan.md, the brand and art direction in docs/brand.md, and the build plan in docs/build-plan.md.

## The product's core rule
Route to humans. Every suggestion must be a real place or real people. The assistant never presents itself as company, never pretends to be a person, and keeps its own replies short and practical. evals/route-to-humans.test.ts enforces this; keep it passing.

## Working autonomously
- Don't wait for approval or ask questions. When something is ambiguous, choose the option most consistent with docs/plan.md, record it in docs/decisions.md with a one-line reason, and continue.
- Never wait for human recordings, labels, corrections or reviews. Use the fictional persona described under Data, create other synthetic stand-ins as needed, and label every result as synthetic.
- If a required key is missing, use recorded or generated fixtures or an open-model alternative, note it in docs/skipped.md, and continue.
- After each milestone: run all tests, run the privacy check, commit and push with a clear message, and update docs/progress.md with what was built and how it was verified.
- If a check fails three times in a row, write the problem to docs/blocked.md and move on to work that doesn't depend on it.

## Data
- The main demo household is a fictional persona: Sarala and Venkat, a Telugu-speaking couple from Guntur staying with their adult child in Fremont, California. data/persona/household.json and data/persona/outings.csv hold the persona; docs/persona.md holds its design assumptions, tone notes and rules. Read it before any work that touches households, ranking, cards, the diary or the write-up.
- The persona is modeled on a real situation (the builder's parents' visit to the US for a graduation), but every profile detail, outing and line is invented. Nothing in it comes from interviews.
- Also synthetic: the Germany household, extra outings, diary entries, voice clips, card training examples, evaluation labels and judge scores.
- What's live: events, places and transit routes from SerpApi searches for the demo areas.
- In every report, label each result as "synthetic" or "live search". Card evaluations are automated, not reviewed by native speakers.
- Never present the persona's profiles, outings or lines as real people's, or as quotes from the builder's parents.
- Real family data, if the parents later consent, goes only in data/family/, which is never opened.

## Where things run
- Development happens in this checkout, either on the builder's machine or in the repo's GitHub Codespace. Speech models and the Temporal durability run happen in the Codespace (Linux x64, 16 GB).
- Keys come from .env (gitignored, never read by Claude Code) or from Codespaces secrets, and the code loads .env at startup when it exists.
- Gemma 4 runs on Cloudflare Workers AI's free plan (@cf/google/gemma-4-26b-a4b-it, through the OpenAI-compatible endpoint). It falls back to OpenRouter's free Gemma 4 models: google/gemma-4-31b-it:free, then google/gemma-4-26b-a4b-it:free.
- The card writer is a Tinker LoRA on Qwen/Qwen3.5-4B, sampled through Tinker. The adapter is published on Hugging Face.
- TabPFN runs through tabpfn-client (the Prior Labs API).
- Speech models (Meta MMS-TTS, AI4Bharat Indic Parler-TTS, AI4Bharat IndicConformer) run inside the Codespace. Their outputs are saved to data/demo/ so the hosted demo can play them.
- Data lives in a free MongoDB Atlas cluster (MONGODB_URI). No Docker needed.
- Temporal runs as a dev server inside the Codespace, saving its state to a file.
- The demo website and agent API deploy to Render's free tier.
- Email goes through an AgentMail inbox (AGENTMAIL_API_KEY): planning emails, safety alerts and the weekly summary to the adult child, plus approve-by-reply. Read docs.agentmail.to/llms.txt before using it.

## Credit budget and free-tier limits
- Tinker is the only service allowed to spend money. Never exceed MAX_TINKER_SPEND_USD in total. Estimate cost before every run, train the card writer once, and prefer cost-efficient mixture-of-experts models for teacher work. Keep long instructions as a fixed prompt prefix, so repeated calls get Tinker's cached-prefill discount.
- If there's no Tinker key: skip the fine-tune, use Gemma with docs/card-style.md as the card writer, and note it in docs/skipped.md.
- Every other service stays on its free tier. If a step would need a paid plan, skip it, note it in docs/skipped.md, and continue.
- Gemma hosts: stay within Cloudflare's 10,000 free neurons a day, and track estimated neurons per call in docs/costs.md. When the allowance is spent, fall back to OpenRouter's free models. Use retries with exponential backoff, and cache every response by a hash of the prompt.
- TabPFN: never send personal data. Watch the usage headers and stay within the free pools.
- SerpApi: never exceed SERPAPI_MAX_SEARCHES live searches. Cache every response and run tests from fixtures.
- ElevenLabs is optional. Use it only if a key is present, only for a few final demo clips, and never beyond ELEVENLABS_MAX_CHARS.
- AgentMail: stay within the free tier, using one inbox. Send email only to DEMO_ALERT_EMAIL, never to any other address. If DEMO_ALERT_EMAIL is not a valid address, send nothing and log it.
- CI and tests never call paid or rate-limited APIs.
- Download only the models you need, and clear caches you no longer need, to stay within the Codespace storage quota.
- Log every paid or rate-limited call (service, units, estimated cost) in docs/costs.md, and check the running total before each new one.

## Users
- Parents: limited ability in the local language, usually not driving, often no local phone plan (home Wi-Fi only). Their app must work offline during outings.
- Any country: each household sets its host country and local language. Wherever the plan says English, use the household's local language. Emergency numbers come from an official source, never from memory.
- The main demo household is the fictional persona Sarala and Venkat, visiting Fremont, California from Guntur. Each parent has their own profile: Sarala listens first and reads Telugu; Venkat also reads English signs. Each has their own times, walking limit and weather limits.
- Language: chosen per parent. Sarala and Venkat speak coastal Andhra (Guntur) Telugu (code te). Never hardcode a language. Parent-facing text uses the parent's script, with bus, street and venue names kept exactly in English.
- Adult child: approves the weekly plan, reads the weekly summary and shared diary entries.

## Architecture
- apps/web: Next.js App Router + Tailwind. /parents is installable and offline. /plan is the dashboard. / is the landing page. /design is the living style guide, for development only (`pnpm dev`, or a production build with STYLE_GUIDE=1; a 404 on the hosted site).
- packages/core: shared Zod schemas, household and country data, the outbound-call registry, diary crypto.
- agent: Mastra planner agent in TypeScript, on Gemma through an OpenAI-compatible provider pointed at Cloudflare Workers AI.
- ranker: a small Python service using tabpfn-client.
- finetune: Tinker scripts for the card writer, evaluation, and adapter export.
- speech: scripts that generate, transcribe and evaluate audio with open models.
- workflows: Temporal TypeScript SDK (weekPlan, outingSafety, trialRun).
- Voice: all speech goes through agent/voice/router.ts. Speaking uses free open models by default (Indic Parler-TTS for Indian languages, MMS-TTS otherwise), with ElevenLabs Eleven v3 as an optional upgrade. Listening uses IndicConformer for Indian languages and MMS speech recognition otherwise.
- Diary: entries encrypted before storage, per parent, private by default.
- Discovery: SerpApi google_events, google_maps, google_maps_directions.

## Privacy rules (non-negotiable)
- Only anonymized data goes to hosted services: no names, addresses, contact details, quotes, diary content or the people memory. Free tiers come with their own data terms, and Prior Labs asks users not to upload personal data.
- The persona is fictional, so it may be committed and sent to hosted services. Never describe parents as helpless or pitiable.
- Never send names, home address, phone numbers, voice recordings or ratings to any external service.
- External search queries contain only language, interest and area.
- Directions start from the nearest bus stop, never the home address.
- ElevenLabs receives card text only, with names removed.
- Never read, print or commit secrets or environment values.
- Emails contain only first names and outing details, never addresses, diary content or voice recordings.
- Never open data/family/.
- Diary entries are encrypted at rest. Never analyze, summarize or score them unless the parent asks in the app, and never use them for planning unless the parent has turned that setting on.
- Any new outbound network call must be added to the outbound registry (packages/core/src/privacy/outbound.ts) and docs/privacy-table.md in the same change. Run the privacy-check skill before every commit.

## Conventions
- TypeScript in strict mode. Python 3.11+ with type hints. Small modules.
- Every feature ships with a test or eval script.
- Keep dependencies few, and justify each new one in docs/decisions.md.
- Before using an API (Cloudflare Workers AI, OpenRouter, Tinker, TabPFN, SerpApi, Mastra, Temporal, Sentry, ElevenLabs, Hugging Face, AgentMail), read the official docs and cite the page in a code comment. Notes from the docs live in docs/research/.

## Writing
- Plain language and sentence case. No buzzwords, no filler, no em dashes.
- No co-author trailers or "generated with" lines in commits, PRs or docs.
- Interface copy follows docs/brand.md: words a parent would say, errors that give direction and never apologize.

## Commands
Keep this section updated as scripts are added.
- `pnpm dev`: the web app at localhost:3000 (the parents' service worker is off in development).
- `pnpm build` then `pnpm start`: the production build and its standalone server (what Render runs).
- `pnpm test`: unit tests and evals in replay mode, with no paid or rate-limited calls. `pnpm lint`, `pnpm typecheck`.
- `pnpm privacy-check` (add `--write` to regenerate docs/privacy-table.md): run before every commit.
- `pnpm costs`: regenerates the running totals in docs/costs.md from data/demo/usage/. Check before any paid call.
- `pnpm --filter @roundtrip/web exec playwright test e2e/offline.spec.ts e2e/a11y.spec.ts e2e/parents-text.spec.ts --project=mobile`: offline, bundle and accessibility checks, and Telugu text that never clips at 200% with 56 px targets (needs `pnpm build`). Playwright starts `pnpm dev` unless `CI=1` is set (then `pnpm start`, the production build, as in CI); slow first compiles in dev make timing tests fail, so set `CI=1` when a result matters. `e2e/parents-screens.spec.ts` saves screenshots to docs/screenshots/.
- `pnpm --filter @roundtrip/web exec playwright test e2e/dashboard.spec.ts e2e/scroll-track.spec.ts`: the dashboard's accessibility checks, the week board flow (approve, swap, move) reaching the parents' phones, and the scroll indicators. `e2e/plan-screens.spec.ts` saves dashboard screenshots (`PLAN_SECTIONS=week,privacy,...`).
- `pnpm seed`: loads both demo households into MongoDB Atlas.
- `pnpm eval`: the event-understanding eval (live Gemma unless LLM_MODE=replay).
- Data pipeline (scripts/, live calls cached as fixtures): `discover.ts` (SerpApi), `plan-weeks.ts` (planner; needs the ranker running), `build-week.ts` (the parents' weeks in data/demo/weeks/), `route-geometry.ts` (map lines and stop coordinates for the dashboard). Run with `pnpm --filter @roundtrip/scripts exec tsx <file>`.
- `pnpm dev` and `pnpm build` first copy MapLibre's worker into apps/web/public/maplibre/ (apps/web/scripts/vendor-maplibre.mjs).
- Ranker: `cd ranker && uv run python serve.py`; leave-one-out: `uv run python eval_loo.py --area fremont --mode replay`.
- Speech, in the Codespace: `bash -l speech/codespace.sh` voices new or changed texts and scores them (`--dry-run` lists them, `--force` re-voices all). Clips go to apps/web/public/audio/ with data/demo/audio/manifest.json; results in docs/speech-results.md. Tests: `cd speech && uv run pytest`.
- Card writer fine-tune, from finetune/ (`uv sync --group tinker`): `uv run python -m finetune.dataset`, `-m finetune.gate full --teacher Qwen/Qwen3.5-397B-A17B`, `-m finetune.train` (refuses to train twice), `-m finetune.evaluate write|judge|report`, `-m finetune.publish`, `-m finetune.expire` (a time to live for the checkpoints the app doesn't sample). Every Tinker and Gemma answer is cached, so re-running costs nothing. Tests: `uv run pytest`. Results in docs/finetune-results.md.
- Temporal, in the Codespace: `temporal server start-dev --db-filename temporal-dev.db --http-port 7243`, then `pnpm --filter @roundtrip/workflows worker` and `pnpm --filter @roundtrip/workflows week start fremont-demo`. Email replies over AgentMail's WebSocket: `TEMPORAL_ADDRESS=localhost:7233 pnpm --filter @roundtrip/agent exec tsx src/email/listen.ts`. The durability eval: `DURABILITY=1 pnpm eval:durability` (Linux; output in docs/durability-run.txt).
- `pnpm check-env`: SET or MISSING for each key, never a value. `numbers.ts` (in scripts/) prints the log-derived tables in docs/numbers.md.
- `render-deploy.ts` (in scripts/): creates or updates the Render services and deploys; `--status` shows the latest deploys, `--logs <service>` recent logs, `--with-db` keeps MONGODB_URI on the web service.
- Lighthouse on the live site: `gh workflow run lighthouse.yml` (five runs per page after a warm-up, scores in the run summary; `-f pages="/plan/fremont-demo"` narrows it, with `MSYS_NO_PATHCONV=1` in Git Bash). Don't trust Lighthouse runs on this laptop: OneDrive and Defender load the CPU after every build.
