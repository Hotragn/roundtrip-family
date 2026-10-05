# Roundtrip — Claude Code playbook (cloud, auto mode, synthetic persona data)

This playbook builds Roundtrip with Claude Code running on its own, inside a free GitHub Codespace. Nothing runs on your laptop; you only need a browser. You don't record, label, review or approve anything. The main demo household is a fictional persona you wrote (Sarala and Venkat), other gaps are filled with synthetic data, and every result is labeled synthetic.

Every prompt follows the same pattern:

- **Context:** what exists and what to read first.
- **Goal:** what to build.
- **Constraints:** the rules that apply.
- **Done means:** checks Claude Code runs on itself before moving on.

Clear goals with self-verifiable checks are what read as strong prompting in a shared session.

---

## 1. One-time setup (the only things you do)

1. **Create the repo after Week 1 is live.** Create a public GitHub repo named `roundtrip-family`. Public repos get free GitHub Actions minutes.

2. **Create free accounts and keys yourself.** Sign-ups use CAPTCHAs, email and sometimes phone verification, and most services expect a real person to create the account, so don't ask Claude Code to sign up for you. The keys should also be in your name, since that's where any prize goes. It takes about 15 minutes. After that, Claude Code creates everything inside each account through official APIs: the Render service, the Hugging Face repo, the AgentMail inbox and the database collections.

   Two services need one extra click: create the free cluster in MongoDB Atlas and copy its connection string, and create a project in Sentry and copy its DSN.

   Prefer to just click? Open the Codespace first (step 4) and run the guided-setup prompt in section 4 in a normal session, not auto mode. Claude Code walks you through each service, starts the official browser logins so you only approve them, and tests every key.

   | Service | What you need | Cost |
   |---|---|---|
   | Cloudflare | Your account ID and an API token with Workers AI permission, for Gemma 4 | Free plan: 10,000 neurons a day, no card |
   | OpenRouter | An API key, for the free Gemma 4 fallback | Free models |
   | Prior Labs | A TabPFN API token from ux.priorlabs.ai | Free daily and monthly usage |
   | Tinker | An API key | Hacktoberfest credits |
   | Hugging Face | An access token with write access, for downloading models and publishing the adapter | Free |
   | SerpApi | An API key | Free plan |
   | MongoDB Atlas | A free cluster and its connection string | Free |
   | Render | An API key | Free tier |
   | Sentry | A project DSN | Free plan |
   | AgentMail | Your API key (you already have one) | Free tier: 3 inboxes, 3,000 emails a month |
   | ElevenLabs (optional) | An API key | Free plan |

3. **Add the keys as Codespaces secrets.** In the repo, go to Settings → Secrets and variables → Codespaces and add each key. They appear as environment variables inside the Codespace, so no `.env` file ever sits on disk. Also add these limits as secrets:
   ```
   MAX_TINKER_SPEND_USD=5
   SERPAPI_MAX_SEARCHES=40
   ELEVENLABS_MAX_CHARS=5000
   DEMO_ALERT_EMAIL=you@example.com
   ```
   Use these exact secret names for the keys, so the code finds them:
   ```
   CLOUDFLARE_ACCOUNT_ID
   CLOUDFLARE_API_TOKEN
   OPENROUTER_API_KEY
   TABPFN_TOKEN
   TINKER_API_KEY
   HF_TOKEN
   SERPAPI_API_KEY
   MONGODB_URI
   RENDER_API_KEY
   SENTRY_DSN
   AGENTMAIL_API_KEY
   ELEVENLABS_API_KEY        (optional)
   DIARY_ENCRYPTION_KEY      (a random value you generate)
   ```
   - `DEMO_ALERT_EMAIL` is your own address. It plays the adult child in the demo, so you receive the planning emails and alerts yourself.
   - Set the Tinker cap to your credit balance or less.
   - Keep the other two within each free plan's current limits.
   - A missing key doesn't stop the build: Claude Code uses fixtures or open models instead and logs what it skipped.

4. **Open a Codespace.** On the repo page, choose Code → Codespaces → New codespace. A 4-core machine with 16 GB of memory gives about 30 free hours a month, enough for the speech models; a 2-core machine gives about 60. If you don't add a payment method, GitHub blocks use when the free quota runs out instead of billing you.

5. **Add the three files.** In the Codespace, create `docs/plan.md` (the product plan), `CLAUDE.md` (section 2) and `.claude/settings.json` (section 3).

6. **Install and start Claude Code in the Codespace terminal.** Follow the official setup at docs.claude.com/en/docs/claude-code/overview (the npm package is `@anthropic-ai/claude-code`). Then start it:
   ```
   claude --enable-auto-mode --permission-mode auto
   ```
   - Auto mode is a research preview, and one guide says it's available on Max, Team, Enterprise and API plans.
   - Without it, `acceptEdits` mode auto-approves file edits but still asks before shell commands.
   - A Codespace is an isolated cloud machine, which makes it a reasonable place for an autonomous agent.

7. **Use one session per phase.** Start a fresh `claude` session for each phase so each one has its own transcript to upload. Or use the run-everything prompt in section 5.

8. **Clean up afterwards.** After you publish, download the session transcripts, delete the Codespace so it stops counting against your storage quota, and rotate your keys, since the sessions will be public.

---

## 2. CLAUDE.md

```markdown
# Roundtrip

## What this is
An open-model planner that helps visiting parents get out of the house each week, to real places with real people who speak their language, on outings they can manage on their own. It includes a private diary and a memory book. Built for the Hacktoberfest 2026 DEV Challenge. The full plan is in docs/plan.md.

## The product's core rule
Route to humans. Every suggestion must be a real place or real people. The assistant never presents itself as company, never pretends to be a person, and keeps its own replies short and practical. evals/route-to-humans.test.ts enforces this; keep it passing.

## Working autonomously
- Don't wait for approval or ask questions. When something is ambiguous, choose the option most consistent with docs/plan.md, record it in docs/decisions.md with a one-line reason, and continue.
- Never wait for human recordings, labels, corrections or reviews. Use the fictional persona described under Data, create other synthetic stand-ins as needed, and label every result as synthetic.
- If a required key is missing, use recorded or generated fixtures or an open-model alternative, note it in docs/skipped.md, and continue.
- After each phase: run all tests, run the privacy check, commit and push with a clear message, and update docs/progress.md with what was built and how it was verified.
- If a check fails three times in a row, write the problem to docs/blocked.md and move on to work that doesn't depend on it.

## Data
- The main demo household is a fictional persona: Sarala and Venkat, a Telugu-speaking couple from Guntur staying with their adult child in Fremont, California. data/persona/household.json and data/persona/outings.csv hold the persona; docs/persona.md holds its design assumptions, tone notes and rules. Read it before any phase that touches households, ranking, cards, the diary or the post.
- The persona is modeled on a real situation (my parents' visit to the US for our graduation), but every profile detail, outing and line is invented. Nothing in it comes from interviews.
- Also synthetic: the Germany household, extra outings, diary entries, voice clips, card training examples, evaluation labels and judge scores.
- What's live: events, places and transit routes from SerpApi searches for the Fremont area.
- In every report, label each result as "synthetic" or "live search". Card evaluations are automated, not reviewed by native speakers.
- Never present the persona's profiles, outings or lines as real people's, or as quotes from my parents.
- Real family data, if my parents later consent, goes only in data/family/, which is never opened.

## Where things run
- This is a GitHub Codespace. Nothing runs on the user's own computer.
- Gemma 4 runs on Cloudflare Workers AI's free plan (@cf/google/gemma-4-26b-a4b-it, through the OpenAI-compatible endpoint). It falls back to OpenRouter's free Gemma 4 models: google/gemma-4-31b-it:free, then google/gemma-4-26b-a4b-it:free.
- The card writer is a Tinker LoRA on Qwen/Qwen3.5-4B, sampled through Tinker. The adapter is published on Hugging Face.
- TabPFN runs through tabpfn-client (the Prior Labs API).
- Speech models (Meta MMS-TTS, AI4Bharat Indic Parler-TTS, AI4Bharat IndicConformer) run inside this Codespace. Their outputs are saved to data/demo/ so the hosted demo can play them.
- Data lives in a free MongoDB Atlas cluster (MONGODB_URI). No Docker needed.
- Temporal runs as a dev server inside this Codespace, saving its state to a file.
- The demo website and agent API deploy to Render's free tier.
- Email goes through an AgentMail inbox (AGENTMAIL_API_KEY): planning emails, safety alerts and the weekly summary to the adult child, plus approve-by-reply. Read docs.agentmail.to/llms.txt before using it.

## Credit budget and free-tier limits
- Tinker is the only service allowed to spend money. Never exceed MAX_TINKER_SPEND_USD in total. Estimate cost before every run, train the card writer once, and prefer cost-efficient mixture-of-experts models for teacher work. Keep long instructions as a fixed prompt prefix, so repeated calls get Tinker's cached-prefill discount.
- If there's no Tinker key: skip Phases 10a to 10c, use Gemma with docs/card-style.md as the card writer, and note it in docs/skipped.md.
- Every other service stays on its free tier. If a step would need a paid plan, skip it, note it in docs/skipped.md, and continue.
- Gemma hosts: stay within Cloudflare's 10,000 free neurons a day, and track estimated neurons per call in docs/costs.md. When the allowance is spent, fall back to OpenRouter's free models. Use retries with exponential backoff, and cache every response by a hash of the prompt.
- TabPFN: never send personal data. Watch the usage headers and stay within the free pools.
- SerpApi: never exceed SERPAPI_MAX_SEARCHES live searches. Cache every response and run tests from fixtures.
- ElevenLabs is optional. Use it only if a key is present, only for a few final demo clips, and never beyond ELEVENLABS_MAX_CHARS.
- AgentMail: stay within the free tier, using one inbox. Send email only to DEMO_ALERT_EMAIL, never to any other address.
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
- apps/web: Next.js App Router + Tailwind. /parents is installable and offline. /plan is the dashboard.
- agent: Mastra planner agent in TypeScript, on Gemma through an OpenAI-compatible provider pointed at Cloudflare Workers AI.
- ranker: a small Python service using tabpfn-client.
- finetune: Tinker scripts for the card writer, evaluation, and adapter export.
- speech: scripts that generate, transcribe and evaluate audio with open models.
- workflows: Temporal TypeScript SDK (weekPlan, outingSafety).
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
- Any new outbound network call must be added to docs/privacy-table.md in the same change.

## Conventions
- TypeScript in strict mode. Python 3.11+ with type hints. Small modules.
- Every feature ships with a test or eval script.
- Keep dependencies few, and justify each new one in docs/decisions.md.
- Before using an API (Cloudflare Workers AI, OpenRouter, Tinker, TabPFN, SerpApi, Mastra, Temporal, Sentry, ElevenLabs, Hugging Face, AgentMail), read the official docs and cite the page in a code comment.

## Commands
Keep this section updated as scripts are added.
```

---

## 3. .claude/settings.json

```json
{
  "permissions": {
    "deny": [
      "Read(./.env)",
      "Read(./.env.*)",
      "Read(./data/family/**)"
    ]
  }
}
```

Your keys live as Codespaces secrets rather than in a file. This deny list also blocks Claude Code from opening a `.env` file if one is ever created.

---

## 4. The prompts, phase by phase

### Guided setup (optional, run first in a normal session)

Run this before Phase 0 if you'd rather click through the sign-ups than set them up yourself. It needs you at each sign-up, so start Claude Code without auto mode.

```
Before we build, help me set up the accounts with as little work for me as possible. I'll do the sign-ups and verifications myself; you do everything else.

For each service, one at a time: Google AI Studio, Prior Labs, Tinker, Hugging Face, SerpApi, MongoDB Atlas, Render, Sentry and AgentMail.
1. Tell me the exact sign-up page and which key or value I need, in two or three short lines.
2. Where the service has an official CLI with a browser login (for example Hugging Face, Render, MongoDB Atlas or Sentry), check its docs for the current command, install it, and start the login so I only have to click Approve. If the CLI can create the free Atlas cluster or the Sentry project for me, do that too.
3. Tell me the exact Codespaces secret name to add for each value. After I've added it and reloaded the Codespace, run a tiny smoke test that confirms the key works, without ever printing it.
4. Record each service's status (ready, skipped, or failed and why) in docs/setup-status.md.

Never try to get past a CAPTCHA, email check or phone check. When a step needs me, say so in one line and wait.
```

When every service shows ready, or skipped on purpose, start a new session in auto mode for Phase 0.

Paste each prompt into a fresh auto-mode session in the Codespace. Each phase checks itself, commits and pushes before it ends.

### Foundations

#### Phase 0: Build plan

```
I'm building Roundtrip for the Hacktoberfest 2026 DEV Challenge. Read docs/plan.md and CLAUDE.md fully before anything else. You're working autonomously in a GitHub Codespace, so don't wait for my input.

Write docs/build-plan.md with:
1. The product in five sentences.
2. The top risks, ranked. Include Gemma's Telugu quality and free-tier errors, how many relevant events SerpApi returns, Codespace memory and storage for the speech models, and training the Tinker fine-tune, plus any others you see.
3. The build order, riskiest first, and for each phase the test, eval or demo step that proves it works.
4. Every place the plan expects a person to provide something (recordings, labels, corrections, reviews), and whether the persona in data/persona/ covers it or another synthetic stand-in is needed.

Keep it to about a page, then commit and push.
```

#### Phase 1: Scaffold

```
Scaffold the repo using the structure in docs/plan.md section 14.

- A .devcontainer configuration with Node.js, pnpm, Python 3.11 with uv, the Temporal CLI and Playwright's browser dependencies, so the Codespace can be rebuilt the same way.
- pnpm workspaces for apps/web, agent and workflows. Separate Python projects (uv) for ranker/, speech/ and finetune/.
- .env.example listing every variable the project needs, with no values. Check each service's docs for the exact variable names, and note that values come from Codespaces secrets.
- .gitignore covering .env, data/family/, model files and caches.
- Root scripts for dev, test, eval and lint.
- A GitHub Actions workflow that runs lint and tests.
- docs/decisions.md, docs/progress.md, docs/skipped.md and docs/costs.md.
- A shared Gemma helper with exponential backoff, a fallback from Cloudflare Workers AI to OpenRouter's free Gemma 4 models, a request-rate limit, a daily neuron budget, and a response cache.
- A project skill at .claude/skills/privacy-check/SKILL.md. It audits outbound network calls in the current diff against the privacy rules in CLAUDE.md, and reports each call as OK or a violation with file, line and a proposed fix. Use it before every commit from now on.

Done means: a fresh clone passes `pnpm install && pnpm test`, `uv run pytest` passes in ranker/, and the README explains setup in under 15 lines. Record the repo tree in docs/progress.md, then commit and push.
```

#### Phase 2: Data layer and the households

```
Set up the data layer on the free MongoDB Atlas cluster in MONGODB_URI. No Docker.

1. Zod schemas for households, parents, places, events, outings, people, cards, diary_entries and languages. The fields are in docs/plan.md section 7.
2. A seed script that loads two households. Read docs/persona.md first.
   - The fictional persona household from data/persona/household.json and data/persona/outings.csv: Sarala and Venkat, visiting Fremont, California. Map all 24 outings, including the two the persona wanted but didn't go to (went = 0), each parent's profile, and Mrs. Chen in the people memory. Label everything synthetic.
   - A synthetic second household: Telugu-speaking parents visiting their child in a German city (local language German), with 10 past outings.
3. Embeddings for event and place descriptions from a small open multilingual embedding model, computed in this Codespace and stored with each record. Record which model you chose and why.
4. Check whether Atlas Vector Search works on the free cluster. If it does, create a vector index. If not, compute similarity in code over the stored embeddings, and record the decision.

Done means: `pnpm seed` loads both households, and a test inserts an event and finds similar ones. Never touch data/family/. Commit and push.
```

#### Phase 3: Model check

```
Before we build on these models, prove they work in Telugu, using only synthetic inputs. Write the scripts in scripts/model-check/ and the report in docs/model-check.md.

- Text: write 20 everyday English sentences and translate them into Telugu with Gemma 4 26B A4B on Cloudflare Workers AI and Gemma 4 31B through OpenRouter and with base Qwen3.5-4B sampled through Tinker. Score each translation two ways: back-translate it to English and measure similarity to the original, and have a cost-efficient Tinker model from a different family than Gemma and Qwen rate Telugu fluency and correctness from 1 to 5. If there's no Tinker key, use back-translation only.
- Event listings: convert 5 synthetic event listings into our event schema with Gemma, and check the JSON validates.
- Speech, run in this Codespace: generate 10 short Telugu sentences as audio with Meta's MMS-TTS Telugu checkpoint (confirm the model ID on Hugging Face) and AI4Bharat's Indic Parler-TTS, plus ElevenLabs Eleven v3 for 3 of them if a key is available. Transcribe every clip with AI4Bharat's IndicConformer, and report the character error rate for each combination. Use CPU-only builds of any machine-learning libraries, and record peak memory use.
- Check that Telugu script survives every step intact, with no broken conjuncts or vowel signs.
- Record response time per call and the Gemma error, retry and fallback rates.

Label the report as synthetic and automated, not native-speaker reviewed. Then choose the planner model, the card-writer base model and the speech models from the results, and record each choice with its reason in docs/decisions.md. Commit and push.
```

#### Phase 4: Discovery tools

```
Build the discovery tools in agent/tools/discovery.ts. Read serpapi.com/google-events-api and the Google Maps and Maps Directions API pages first.

- searchEvents({ language, interests, area, week }) using google_events with its date filter for this week or next week.
- searchPlaces({ type, area }) using google_maps.
- getDirections({ fromStop, to, departAt }) using google_maps_directions in transit mode.

The persona household's area is Fremont, California. Searches to support: Telugu association events, Dasara and Bathukamma celebrations, Telugu film screenings, senior-center and library programs, temples, and Indian grocery stores.

Every search takes the household's country, language and location. Where transit directions aren't available, return walking directions or plain step-by-step instructions instead.

Build the fallback ladder from docs/plan.md section 8: same language, then shared culture, then places where language barely matters, then programs for newcomers and older adults, then a regular routine. Tag every result with its level. Add a test using a demo area with no Telugu events, and check that every week still gets 2 or 3 suggestions.

The privacy rules in CLAUDE.md apply: queries contain only language, interest and area, and directions start from the nearest bus stop. Cache every response in MongoDB, keyed by query and week.

If a SerpApi key is available, run one live search per query type for the demo area and save the responses as fixtures. Otherwise, generate realistic fixtures in SerpApi's documented response format.

Done means: tests pass offline from the fixtures, and docs/progress.md records how many results each query type returned. If results are thin, add the place-based fallbacks described in the plan. Commit and push.
```

### Core product

#### Phase 5: Understanding events

```
Turn raw search results into clean events.

1. Generate 40 synthetic event listings in the style of the Phase 4 fixtures. Build each one from known attributes: language_match (0, 1 or 2), suits_older_adults, indoor, cost, category, start and end. Save those attributes as ground truth in evals/events-labeled.json.
2. Use Gemma through the shared Gemma helper, with structured JSON output, to extract the same fields from each listing's text.
3. Build evals/event-understanding.ts to report per-field accuracy against the ground truth. Cache responses so reruns don't spend the free quota.

If language_match accuracy is below 85%, improve the prompt and rerun, for up to three rounds. Record the before and after numbers in docs/progress.md, then commit and push.
```

#### Phase 6: TabPFN ranker

```
Build ranker/ as a small FastAPI service using tabpfn-client. Read docs.priorlabs.ai, including the API metering page, before writing code.

- POST /rank takes candidate outings plus the household's past outings. For each candidate it returns the probability of going, expected enjoyment, a combined score, and the top three reasons.
- Use TabPFNClassifier and TabPFNRegressor from tabpfn-client on raw pandas DataFrames. The docs say text categories and missing values are handled natively, so don't hand-encode features. Never include names or other personal data.
- Turn feature attributions into plain-language reasons like "speaks their language" or "one bus, under 30 minutes". Use an attribution method the docs support with the client, or a simple leave-one-feature-out comparison if they don't.
- ranker/eval_loo.py runs leave-one-out over the persona's 24 outings in data/persona/outings.csv and reports the top-3 hit rate, compared with sorting by distance and with random order. In the persona data, every 5-star outing happened with the adult child, so report results with and without the with_adult_child feature, and explain what that means for planning solo outings. Label the results synthetic, and if the sample is too small to conclude much, say so in the output.

Done means: tests pass using recorded API responses, the eval prints a small table, and docs/progress.md records API usage and response time per /rank call. Commit and push.
```

#### Phase 7: The planner agent

```
Wire up the planner agent with Mastra. Read mastra.ai/docs on agents, tools and memory first.

- Model: Gemma 4 through an OpenAI-compatible provider, using the shared helper's retry, fallback and cache behavior.
- Tools: searchEvents, searchPlaces, getDirections, rankOutings, writeCard (a stub for now), speak (a stub), remember and recall.
- Also: suggestTrialRun (the first time a route appears, suggest riding it together on a weekend), howToJoin (an English card for joining a group or volunteering, such as "I would like to volunteer. I speak Telugu and Hindi.", plus who to ask), and companion suggestions from the people memory for outings where no shared language is needed.
- Respect each parent's profile: best times, naps, walking limit, weather limits, and dislikes such as big, loud stores.
- Flow: household profile, then discover (working down the fallback ladder until there are enough good options), understand, rank, and propose 4 to 6 outings. Each reason says which ladder level the outing came from, and says honestly when nothing was found in the parents' language.

Add evals/route-to-humans.test.ts. It runs the planner on 10 demo weeks and asserts that every suggestion is a real event or place with an address, and that the agent never offers itself as company. Record the model calls so the test can replay them in CI. This is the product's core rule, so it must pass. Commit and push.
```

#### Phase 8: The parents' app

```
Build /parents as an installable web app. Follow docs/brand.md exactly: its colors and accessible variants, travel lines, Hind for Latin text and Hind Guntur for Telugu at a line height of about 1.6, and 22 px body text. It must feel like a top-tier native app: clean, calm and precise.

Screens: Today ticket, Directions, Driver card, Practice phrases, How was it?, I'm lost, and Diary (built in Phase 11b; add a placeholder now).

Rules:
- One main action per screen, plus a fixed bottom bar with I'm home, Diary and I'm lost.
- Every screen has a Listen button, and nothing requires typing.
- Bus, street and venue names stay in English exactly as they appear on signs.
- The driver card, practice phrases and "I'm lost" card use the household's local language. Practice phrases show the local-language phrase with its pronunciation in Telugu script underneath.
- The "I'm lost" card shows the local emergency number from an official source, and the Germany household must show Germany's number.
- Per-parent views: Sarala's tickets are audio-first; Venkat's also show the English words he'll see on signs.
- When to press stop: each ticket counts the stops and names the landmark just before theirs ("press the strip after the big Safeway"). Where the phone can get a GPS fix without data, show a "your stop is next" alert.
- Default practice phrases come from docs/persona.md: Where is the bathroom? I need help. Please call this number. How much? I don't understand.

Offline: a service worker caches the week's cards, directions, photos and audio.

Build the Today ticket first. Take a Playwright screenshot, review it yourself against the design tokens and the rules above, and fix anything that doesn't match. Then build the remaining screens and save a screenshot of each to docs/screenshots/.

Done means: a Playwright test loads the week, switches the browser offline, and confirms every screen still works. Commit and push.
```

#### Phase 9: The dashboard

```
Build /plan, the adult child's dashboard, reusing the design tokens at 16 to 17 px.

- This week: suggestions with reason chips and scores, plus approve and swap.
- Their week: outings they went to, highlights from their replies, people they met.
- Shared with you: diary entries the parents chose to share, and the memory book.
- People and places.
- Privacy: renders docs/privacy-table.md.
- Safety: timer buffer, contacts and weather rules.
- Setup: each parent's language, and what's ready for it.

Dense but calm. Save a screenshot of This week with the demo family's data to docs/screenshots/, review it against the tokens, fix what doesn't match, then commit and push.
```

### Fine-tuning the card writer

#### Phase 10a: Card style and dataset

```
Next is the Tinker fine-tune for the card writer. First read the Tinker docs: the quickstart, the supervised learning guide, the prompt distillation recipe, the sampling and OpenAI-compatible API pages, and the export pages for PEFT LoRA adapters. Write a five-bullet summary of what you learned to docs/decisions.md.

Then:
1. Write docs/card-style.md, the rules for a good card. Cards follow the tone notes in docs/persona.md: coastal Andhra (Guntur) Telugu, warm like a neighbor's daughter, respectful మీరు but never stiff, అమ్మా for a mother and నాన్నగారు for a father, never formal like a bank officer. They run 60 words or fewer. They use facts only from the input and keep bus, street and venue names exactly in English. Each card has three phrases in the household's local language, with their pronunciation in Telugu script.
2. Build finetune/build_dataset.py. Generate about 400 synthetic outings across categories: mostly in the US, plus about 50 in Germany, so the card writer learns to write German phrases too. Get a teacher draft for each from a capable, cost-efficient model on Tinker. Send card-style.md as a fixed instruction prefix so repeated calls get the cached-prefill discount, and write the drafts as chat-format JSONL. Estimate the cost first and keep it within the budget in CLAUDE.md.
3. Add an automated quality gate:
   - Code checks: word count, exact names preserved, and no facts missing from the input.
   - Gemma, through the shared Gemma helper, scores tone and register from 1 to 5.
   - Keep only drafts that pass every check and score at least 4. Regenerate failures once, then drop them.
4. Hold out 50 examples for evaluation.
5. Make the language a parameter (default te), so the same pipeline can tune the card writer for another language later.

Record the gate's pass rate and the cost so far in docs/progress.md, then commit and push.
```

#### Phase 10b: Training

```
Train a LoRA on Qwen/Qwen3.5-4B with the filtered dataset. Start from the cookbook's defaults, log the loss, and save a checkpoint we can sample from.

Before training, estimate the training tokens and cost from Tinker's pricing page. Proceed only if the estimate keeps total spend under MAX_TINKER_SPEND_USD. If it doesn't, reduce the dataset or the number of epochs until it fits, and record what you changed in docs/decisions.md. Record the actual cost in docs/costs.md, then commit and push.
```

#### Phase 10c: Evaluation

```
Build finetune/eval.py to compare the base model with the tuned model on the 50 held-out outings, both sampled through Tinker:

- Code checks: 60 words or fewer, names preserved exactly, and no facts that aren't in the input.
- Blind pairwise preference from Gemma through the shared Gemma helper. Show each pair in both orders to cancel position bias.

Write docs/finetune-results.md with a results table and three example pairs, all labeled as automated and synthetic. If the tuned model doesn't win on something, say so plainly. Commit and push.
```

#### Phase 10d: Publish and connect the card writer

```
Export the LoRA as a PEFT adapter and publish it to Hugging Face under my account, with a model card that explains the task, the base model, that the training data was synthetic, and the evaluation results.

Replace the writeCard stub so the agent calls the tuned checkpoint through Tinker's sampling API. Generate and save cards for the demo family's weeks to data/demo/cards/, so the hosted demo replays them without new calls. Measure response time per card, rerun the route-to-humans test, and commit and push.
```

### Voice, diary and workflows

#### Phase 11a: The voice router

```
Families should be able to pick any language, not just Telugu. Read the ElevenLabs supported-languages page and the Hugging Face pages for the speech models first. Write a design for agent/voice/router.ts to docs/design/voice-router.md, check it against CLAUDE.md, then implement it.

For each household language the router decides:
- Speaking: free open models by default. For Telugu, use whichever won the Phase 3 comparison; for other Indian languages, AI4Bharat's Indic Parler-TTS; for everything else, Meta's MMS-TTS checkpoints. If an ElevenLabs key is present and the language is on ElevenLabs' published list (Telugu is), use Eleven v3 for a few final demo clips only.
- Listening: IndicConformer for Indian languages, and Meta's MMS speech recognition (facebook/mms-1b-all) for everything else.
- Writing: the tuned card writer if one exists for that language, otherwise Gemma with a "needs tuning" flag on the dashboard.

Speech models run in this Codespace through the scripts in speech/. Generate the demo family's card and phrase audio there and save it to data/demo/audio/, so the hosted demo plays saved files.

Rules:
- Remove names before anything goes to ElevenLabs.
- Cache all audio for offline use on the parents' phones.
- Add every route to docs/privacy-table.md.
- Record each model's license in docs/models.md. Meta's MMS models are non-commercial.
- Three words for a new friend: for someone in the people memory who speaks another language (the persona's fictional neighbor, Mrs. Chen, speaks Mandarin), generate three short words or phrases in that language, such as hello, thank you and delicious, with Telugu-script pronunciation and audio.

Done means: a test where Telugu uses the chosen open voice and switches to ElevenLabs only when a key is present. Plus a second test where a language that's on MMS's list but not on ElevenLabs' list still produces audio through an open model. Choose that second language and record how you checked it against both lists in docs/decisions.md. Commit and push.
```

#### Phase 11b: Diary and memory book

```
Build the diary, each parent's private space. Read the diary section in docs/plan.md first.

- In /parents, a Diary screen labeled నా డైరీ. It has one large record button, an optional photo, the feeling words from data/persona/household.json to tap, and past entries, each clearly marked private or shared.
- Entries are encrypted before they're stored, with the original audio, using the key in the DIARY_ENCRYPTION_KEY secret, which never appears in the repo or the session. Entries recorded away from home Wi-Fi wait on the phone and sync once they're back.
- Private by default. A parent can share an entry with the adult child, unshare it, or delete it at any time.
- No analysis, scoring or summarizing of entries unless the parent asks in the app. A "use my diary to help plan outings" setting exists and is off by default.
- A button on the Diary screen calls the adult child.
- The memory book: parents choose entries, photos and outing tickets, and the app builds a printable page in their language, using their words exactly. Gemma suggests chapter titles only when asked.

For the main household, generate 15 synthetic Telugu diary entries in the style of the examples in docs/persona.md, in this Codespace: write the text, voice it with an open TTS model, and transcribe it with the speech scripts. Make some private and some shared.

Done means: tests confirm entries are encrypted at rest, private entries never appear on the dashboard, and no diary content appears in any outbound request. Run the privacy check, then commit and push.
```

#### Phase 12: Temporal workflows

```
Read docs.temporal.io on durable timers, signals and schedules. Run the Temporal dev server in this Codespace with its state saved to a file. Write the design to docs/design/workflows.md, check it against docs/plan.md, then implement it with the TypeScript SDK.

- weekPlan, scheduled for Sundays at 6 pm. It runs the planner and waits for the approval signal. For each outing it sends a reminder the day before, starts outingSafety at departure, prompts "How was it?" afterwards, and records the result. It sends the weekly summary on Sunday. In the demo, send the approval signal automatically.
- outingSafety(outingId, expectedReturn, bufferMinutes) waits for the "home" signal until expectedReturn + buffer. If nothing arrives, it nudges, waits 20 more minutes, then alerts the adult child.
- trialRun: the first time a route appears, email the adult child a suggestion to ride it together that weekend. Once the ride is confirmed, mark the route solo-ready.

Email through AgentMail (read docs.agentmail.to/llms.txt first):
- Create one inbox for Roundtrip through the API.
- weekPlan emails the suggested outings to DEMO_ALERT_EMAIL, and an "approve" reply sends the approval signal. In this Codespace, receive replies over AgentMail's WebSocket events, so no public URL is needed. On Render, use a webhook endpoint and verify webhook signatures.
- The safety alert and the Sunday summary also go to DEMO_ALERT_EMAIL.
- In the automated demo, send the approval signal directly instead of waiting for a reply.

Done means: evals/durability.test.ts starts outingSafety with a short timeout, kills the worker mid-wait, restarts it, and asserts the alert email is still sent on time. A second test sends an "approve" reply and checks that weekPlan receives the signal. Make the output easy to read on video, since it's our demo for the Temporal category. Save a log of a passing run to docs/durability-run.txt, so the hosted demo and the post can show it. Commit and push.
```

### Ship

#### Phase 13: Deploy

```
Deploy demo mode to Render's free tier with a render.yaml blueprint: the web app and agent API, with the fictional demo family on the free Atlas cluster.

- By default the demo replays saved outputs: plans, cards, audio, diary entries and the durability log.
- Add one "Plan a new week" button that calls Gemma and TabPFN live, rate-limited so visitors can't exhaust the free quotas.
- Free Render services sleep when idle. Show a friendly loading state on the first visit.

Use the Render API key from the environment. Secrets go in Render's environment settings, never in the repo. Never create anything that needs a paid plan. If a step needs a dashboard action, write exact instructions to docs/deploy.md and continue. Add the live URL to the README, then commit and push.
```

#### Phase 14: Sentry tracing

```
Add Sentry agent tracing to the agent, following docs.sentry.io/product/agents/getting-started/. Create a span for each planner run and each tool call, with latency, token counts, retries and errors. Scrub personal data before anything is sent. Stay on Sentry's free plan.

Run three demo plans and record the slowest step, and why it's slow, in docs/progress.md. If there's no Sentry DSN, keep the instrumentation, log to the console, and note it in docs/skipped.md. Commit and push.
```

#### Phase 15: Evaluations in GitHub Actions

```
Extend the GitHub Actions workflow to run on every push:
- unit tests
- the route-to-humans test, replaying recorded model calls
- the ranker's leave-one-out eval, on recorded responses
- the card rubric checks, on saved outputs
- the offline Playwright test
- the diary privacy tests
- the email tests, against a mocked AgentMail client

CI must never call a paid or rate-limited API or send real email. Write a results table to the job summary, push, and confirm the run passes. Commit.
```

#### Phase 16: Privacy audit

```
Audit every outbound network call in the codebase. For each one, list what data it sends, where it goes, and whether that matches the privacy rules in CLAUDE.md. Pay special attention to diary data, email content and the free-tier services.

Regenerate docs/privacy-table.md from what the code actually does, not from the plan. Fix any violations, rerun the tests, record each fix in docs/decisions.md, and commit and push.
```

#### Phase 17: Accessibility

```
Review /parents for accessibility: WCAG AA contrast, tap target size, text scaling, screen-reader labels, and Telugu rendering. Conjuncts and vowel signs must never clip at any text size.

Fix what you find, save before and after screenshots to docs/screenshots/, and commit and push.
```

### Write-up

#### Phase 18: Numbers, README and draft post

```
Collect every number for the post into docs/numbers.md, each with the command that produced it:
- response time per call for Gemma, the card writer and TabPFN, and the Gemma retry and fallback rates
- speech character error rates and peak memory use
- Tinker training tokens and cost
- base vs tuned results
- the ranker's leave-one-out table on the persona outings, with and without the with_adult_child feature
- event-understanding accuracy
- the offline, durability and diary privacy test results
- searches per weekly plan
- which languages the voice router covers, and through which provider
- how many weeks needed the fallback ladder, and which levels they used
- the Germany household's results
- total cost by service, from docs/costs.md

Update the README: what the project is, the story in two sentences, the live demo link, the Hugging Face adapter link, setup in a Codespace, the Mermaid architecture diagram, and a note on any commits made after the deadline.

Then draft the DEV post in docs/post.md, following the outline in docs/plan.md section 15:
- Use the story from section 1 as written.
- Use only numbers from docs/numbers.md.
- Say plainly that the households, outings, evaluations and diary entries are synthetic, that Sarala and Venkat are a fictional persona modeled on visits like my parents', and that it was built entirely on free tiers apart from Tinker credits.
- Never present persona lines as quotes from real people.
- Never invent or alter a quote.

Commit and push.
```

#### Phase 19: Publish and upload (you)

See section 6.

---

## 5. Run everything in one session (alternative)

Use this if you'd rather paste one prompt than start a session per phase. First save this playbook as `docs/playbook.md` in the repo.

```
Work through every phase in docs/playbook.md section 4, Phase 0 through Phase 18, in order. Treat each phase's prompt as your instructions, and follow CLAUDE.md throughout, especially the rules for working autonomously and the credit budget.

After each phase, run its checks and the privacy check, commit, push, and update docs/progress.md. Don't stop between phases. If a check fails three times in a row, write the problem to docs/blocked.md and continue with the next phase that doesn't depend on it.

When you finish, write a summary to docs/progress.md: what was built, what was skipped and why, and and which results are synthetic or from live searches.
```

One long session is harder to slice into clear embeds for the post, and uses more of your Claude Code usage. One session per phase gives you cleaner transcripts.

---

## 6. Publishing and uploading the sessions

1. **Publish the post.** Review docs/post.md, edit the story so every line is true, and publish it on DEV with the submission template.
2. **Download the transcripts.** Inside the Codespace, Claude Code saves them as `.jsonl` files under `~/.claude/projects/`, in a folder named after the project path. Download them from the Codespace's file explorer before you delete it.
3. **Upload.** Go to dev.to/agent_sessions/new and drag in a transcript.
4. **Curate.** Turn off anything you don't want shown, and check for keys or personal details. DEV redacts common secrets automatically but says it won't catch every case.
5. **Slice.** Create named slices for the moments to embed in the post, then save and upload.
6. **Embed.** Use `{% agent_session ID %}` for the whole curated session, or `{% agent_session ID slice-name %}` for a slice.
7. **Visibility.** Uploads are private (unlisted) by default. Use "Make Public" if you want them shareable outside the post.
8. **Disclose AI assistance.** Use DEV's AI disclosure feature to note you built with Claude Code.

Slices worth making, and where they go in the post:

| Slice | From phase | Post section |
|---|---|---|
| `build-plan` | 0 | How I Built It, opening paragraph |
| `model-check` | 3 | Why open innovation matters: models in Telugu |
| `ranker` | 6 | The TabPFN section |
| `tinker` | 10b and 10c | The Tinker section, next to the results table |
| `language-router` | 11a | Why open innovation matters: adding a language ElevenLabs doesn't cover |
| `diary` | 11b | The diary section |
| `persona` | 2 and 6 | About the demo household: loading the persona and what the ranker learned |
| `durability` | 12 | The Temporal section |
| `approve-by-email` | 12 | How I Built It: approving the week by replying to an email |
| `privacy` | 16 | Why open innovation matters: keeping data private |
| A failure Claude Code recovered from, such as a free-tier error | Any phase | What didn't work |
