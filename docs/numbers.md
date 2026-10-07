# Numbers

Every number for the write-up, each with the command that produced it. The families (Sarala and Venkat in Fremont, Kamala and Raghu in Munich), their outings, ratings, diary entries, card training examples, evaluation labels and judge scores are **synthetic**. Places, events and transit routes come from **live search** (SerpApi, 5 October 2026). Card and speech evaluations are automated, not reviewed by native speakers. Collected on 6 October 2026.

Commands run from the repository root unless they say otherwise. `numbers.ts` means `pnpm --filter @roundtrip/scripts exec tsx numbers.ts`, which reads only the repo's own logs and outputs.

## Response times

### Gemma 4 (Cloudflare Workers AI, `@cf/google/gemma-4-26b-a4b-it`)

Every live answer logged in data/demo/usage/gemma-calls.jsonl. Command: `numbers.ts`.

| Purpose | Answered live | Median ms | 90th percentile ms | Median prompt tokens | Median answer tokens |
|---|---|---|---|---|---|
| Card review (tone and facts) | 587 | 737 | 1,252 | 561 | 17 |
| Card comparison (pairs) | 240 | 1,426 | 2,085 | 550 | 60 |
| Writing a card | 108 | 2,587 | 4,501 | 1,075 | 92 |
| Model check | 100 | 829 | 1,523 | 54 | 14 |
| Reading an event listing | 57 | 3,011 | 4,201 | 503 | 132 |
| Planning a week | 45 | 4,655 | 6,509 | 2,221 | 215 |

- **Retries and fallbacks:** of 1,138 live answers, 1 needed a retry (0.1%, a Cloudflare timeout) and none came from a fallback host. A further 3,611 answers came from the prompt cache.
- **OpenRouter:** its free Gemma 4 31B answered HTTP 429 to all 20 model-check requests on 5 October (4 tries each, 80 attempts). It has never been needed since, because Cloudflare's free allowance was never spent: the busiest day used 4,875 of 10,000 neurons. Command: `pnpm costs`.

### The card writer

40 held-out outings, each writer allowed one regeneration (docs/finetune-results.md). Command, from finetune/: `uv run python -m finetune.evaluate report`.

| Writer | Median ms per card |
|---|---|
| Qwen3.5-4B, untuned, with the style prompt (Tinker) | 1,590 |
| Qwen3.5-4B with the Roundtrip LoRA (Tinker) | 5,684 |
| Gemma 4 with the style prompt (Cloudflare) | 3,742 |

The demo replays saved cards, so no visitor waits for one.

### TabPFN (Prior Labs API, through the ranker service)

Each recorded ranking holds the service's own time for the request. Command: `numbers.ts`.

| Rankings | Median ms | 90th percentile ms | Prior Labs API calls |
|---|---|---|---|
| 49 | 16,293 | 89,693 | 463 |

### "Plan the coming week", live on Render

Measured on https://roundtrip-web.onrender.com on 6 October with `curl -X POST /plan/api/replan/<household>`; the times are the planner's own, from each response's `stats`.

| Run | Total | TabPFN | Gemma |
|---|---|---|---|
| Fremont, Sarala only, one live Gemma call | 2.5 s | 2 ms (recorded) | 2.1 s |
| Munich, both parents, everything live, ranker asleep | 73.4 s | 44.6 s and 24.4 s, one after the other | 3.7 s |
| Munich again, after ranking both parents at once, ranker awake | 49.4 s | 35.0 s and 40.4 s, at the same time | 6.4 s |

The slowest step was TabPFN: the free ranker service sleeps after 15 idle minutes and takes about half a minute to wake, and each Prior Labs call takes about 20 seconds. The two parents are now ranked at the same time, and the dashboard wakes the ranker when the planner panel comes into view (decision in the commit "Rank both parents at once, and wake the ranker before a re-plan").

## Lighthouse (mobile, live site)

`npx lighthouse@12 <url> --only-categories=performance` against https://roundtrip-web.onrender.com on 6 October, after deploying commit bf13416 (ten runs per parents' page) and 0451587 (five per site page). Accessibility, best practices and SEO scored 100 on every run measured.

| Page | Performance runs | Median | Runs at 90 or more |
|---|---|---|---|
| Parents' app, Sarala (Fremont) | 88, 91, 92, 94, 90, 91, 92, 95, 90, 90 | 91 | 9 of 10 |
| Parents' app, Kamala (Munich) | 93, 92, 94, 96, 81, 93, 85, 91, 92, 93 | 92.5 | 8 of 10 |
| Dashboard, Fremont | 90, 96, 98, 94, 95 | 95 | 5 of 5 |
| Landing | 92, 96, 97, 93, 97 | 96 | 5 of 5 |

The low runs on the parents' app come from the free instance and the network, not the page: the same build scores 95 to 97 on other runs. Its first screen now loads 184 KB of JavaScript and 32 KB of CSS (this morning: about 250 KB and the whole site's 96 KB stylesheet, three times over).

**Re-run after the polish pass** (commit 5c7305b, three runs each, all four categories): accessibility, best practices and SEO 100 on every run. Performance: landing 92, 94, 92; dashboard 94, 95, 95; parents' app (Sarala) 88, 94, 94. Before the fix in 5c7305b the dashboard scored 67: its first-visit guide appeared after load and pushed the board down (layout shift 0.6, now 0).

**Why performance stops short of 100:** the real first paint, with the main content in it, comes 0.2 to 0.4 s after the response on all three pages. Lighthouse's simulated slow phone counts every request that starts before that paint, and about 250 KB of Next.js and React scripts start then. With scripts blocked, the parents' page scores 99. Making font display optional made no difference.

## Speech

44 clips voiced and scored in the Codespace (Linux x86_64, 4 CPUs, 16 GB), synthetic text: every card title and body, practice phrase, help card and synthetic diary voice entry. Score: character error rate (CER) of a transcription back to text. Command, in the Codespace: `bash -l speech/codespace.sh`; report in docs/speech-results.md.

| Language | Voice | Listener | Clips | Mean CER | Median CER | Audio |
|---|---|---|---|---|---|---|
| Telugu | facebook/mms-tts-tel | facebook/mms-1b-all (tel) | 29 | 0.194 | 0.140 | 455.8 s |
| English | facebook/mms-tts-eng | facebook/mms-1b-all (eng) | 7 | 0.017 | 0.000 | 24.5 s |
| German | facebook/mms-tts-deu | facebook/mms-1b-all (deu) | 8 | 0.034 | 0.026 | 32.0 s |

By kind, Telugu card titles score worst (0.369, mostly place names spelled out for the voice), card bodies 0.138 and diary entries 0.092.

| Model | Job | Peak memory | Model seconds per audio second |
|---|---|---|---|
| facebook/mms-tts-tel | text to speech | 1,526 MB | 0.34 |
| facebook/mms-tts-eng | text to speech | 609 MB | 0.31 |
| facebook/mms-tts-deu | text to speech | 666 MB | 0.40 |
| facebook/mms-1b-all | speech to text | 5,862 MB | 0.77 to 0.86 |

All 44 clips are 2.95 MB of MP3 (mono, 24 kHz, -16 LUFS).

## Tinker: the card writer fine-tune

Command, from finetune/: `uv run python -m finetune.train` (it refuses to train twice; the numbers are in data/demo/finetune/train-metrics.jsonl and the ledger).

- **Training:** one LoRA run on Qwen3.5-4B, rank 32, 3 epochs, 326 examples (16 more held back for validation loss), 282,198 training tokens plus 17,364 validation tokens. Estimated at $0.2208 before the run; the ledger came out the same. Validation loss went from 1.166 to 0.111.
- **Data:** 400 synthetic outings: 360 for training and 40 held out at places that never appear in training. Teacher drafts from Qwen3.5-397B-A17B passed a Gemma gate: 182 on the first try, 160 more after one regeneration; 342 kept and 18 dropped.
- **Total Tinker spend:** $2.0359 across 1,098 calls, all of it under MAX_TINKER_SPEND_USD. Command: `pnpm costs` (the ledger is data/demo/usage/tinker-ledger.jsonl).

| Step | Cost |
|---|---|
| Teacher pilots | $0.24 |
| Teacher drafts | $1.13 |
| Training and validation | $0.22 |
| Evaluation cards | $0.04 |
| Kimi-K2.6 as second judge | $0.26 |
| Checkpoint storage, first month (estimate) | $0.09 |
| Earlier model check | $0.06 |
| This week's ten demo cards | $0.0018 |

## Base against tuned

40 held-out outings, each writer allowed one regeneration (synthetic outings, automated checks). Command, from finetune/: `uv run python -m finetune.evaluate report`.

| | Qwen3.5-4B base, style prompt | Qwen3.5-4B + LoRA, facts only | Gemma 4 writer |
|---|---|---|---|
| Passed every code check | 72% | 98% | 85% |
| Passed on the first draft | 72% | 95% | 50% |
| Every given name kept exactly | 100% | 100% | 100% |
| Cards with invented Latin text | 0 | 0 | 2 |
| Telugu script intact | 100% | 100% | 100% |
| Median words (cards over 60) | 32.5 (3) | 33 (0) | 37 (0) |
| Gemma's tone 4 or 5 | 17 of 40 | 39 of 40 | 39 of 40 |
| Facts supported (Gemma) | 16 of 40 | 40 of 40 | 39 of 40 |

Order-swapped pairs: the tuned writer beat the base 36 to 1 (3 ties). Against the Gemma writer, Gemma judging preferred Gemma's cards 20 to 8 (12 ties); Kimi-K2.6, a third model family, preferred the tuned ones 14 to 12 (14 ties).

In the app, every card also has to pass Gemma's review and, for a walk of five minutes or more, say the walk from the stop. For the week of 5 October the tuned writer wrote 7 of the 10 cards and Gemma the other 3. Command: `numbers.ts`.

## The ranker: leave-one-out

Each of the persona's 24 synthetic outings is held out and ranked against 20 live-search candidates; the table counts how often it lands in the top 3 of 21. Command, from ranker/: `uv run python eval_loo.py --area fremont --mode replay` (replays recorded TabPFN responses).

| Features | Outings | n | TabPFN top 3 | Travel time only | Random |
|---|---|---|---|---|---|
| all features | Liked (4 or 5 stars), higher is better | 14 | 71% | 36% | 14% |
| all features | Disliked (1 or 2 stars), lower is better | 5 | 0% | 60% | 14% |
| all features | Wanted to go, didn't | 2 | 0% | 0% | 14% |
| without with_adult_child | Liked, higher is better | 14 | 71% | 36% | 14% |
| without with_adult_child | Disliked, lower is better | 5 | 0% | 60% | 14% |
| without with_adult_child | Wanted to go, didn't | 2 | 0% | 0% | 14% |

Dropping the with_adult_child feature changes nothing on these 24 outings. With so few, one outing moves a rate by 5 to 10 points.

## Event understanding

Gemma reads 40 synthetic event listings and fills in what the planner needs. Command: `LLM_MODE=replay pnpm eval`.

| Field | Accuracy |
|---|---|
| Language match | 100.0% |
| Suits older adults | 97.5% |
| Indoor | 100.0% |
| Free | 100.0% |
| Price | 100.0% |
| Category | 85.0% |
| Start time | 100.0% |
| End time | 100.0% |

## Tests

From GitHub Actions on commit 7459565 (6 October), which never calls a paid or rate-limited API.

| Suite | Result |
|---|---|
| Unit tests and evals (`pnpm test`), including the route-to-humans eval (27 tests) and the diary privacy tests | 224 passed, 1 skipped (the opt-in Atlas test) |
| Parents' app offline, accessibility, dashboard and scroll indicators (Playwright) | 20 passed |
| Python: speech (37), fine-tune (25), ranker (7) | 69 passed |
| Privacy check (`pnpm privacy-check`) | 0 violations |

- **Durability** (docs/durability-run.txt, `DURABILITY=1 pnpm eval:durability` in the Codespace): outingSafety on a Temporal dev server with timers in seconds. Worker 1 was killed with SIGKILL 26.0 s before the alert was due; worker 2 was ready 7.2 s later. The alert was sent 160 ms after it was due (tolerance 2 s; three earlier runs: 152, 153 and 157 ms), the nudge 118 ms after, and neither repeated. The same run sent an approve reply through the web app's path and weekPlan approved outings 1 and 3.
- **Temporal workflow tests:** 14, on Linux (they need Temporal's native core); in the Codespace `pnpm test` passed 364 with 1 skipped.
- **Diary privacy** (apps/web/test/diary.test.ts, 6 tests): entries and recordings are encrypted at rest with each parent's key, a private entry is never returned to the dashboard, and the diary store makes no network calls.
- **Offline** (apps/web/e2e/offline.spec.ts): with the network cut, the parents' app opens, shows the ticket, directions, driver card, phrases and "I'm lost", and queues check-ins until it's back.

## Searches per weekly plan

Command: `numbers.ts` (from data/demo/usage/serpapi.json). 39 live searches in all, against SERPAPI_MAX_SEARCHES:

| Kind | Requests |
|---|---|
| Places (google_maps) | 15: 6 kinds of place for Fremont, 6 for Munich, 2 for Bozeman, 1 more library search |
| Events (google_events) | 9 |
| Transit and walking directions (google_maps_directions) | 15, one per approved outing route, each from the nearest stop |

A new household's first week costs about 6 place searches, a few event searches and one directions search per outing it approves. A re-plan, including "Plan the coming week", reuses the saved results and makes no new searches.

## The voice router's languages

Command: `pnpm test -- agent/test/voice-router.test.ts`; models from docs/models.md.

| Language | Speaking | Listening |
|---|---|---|
| Telugu | AI4Bharat Indic Parler-TTS first; Meta MMS-TTS (tel) while it's gated | AI4Bharat IndicConformer first; Meta MMS (mms-1b-all) while it's gated |
| English, German | Meta MMS-TTS | Meta MMS (mms-1b-all) |
| Mandarin Chinese (a new friend's words) | The phone's own voice: MMS has no Mandarin voice (no facebook/mms-tts-cmn on Hugging Face) | Meta MMS (mms-1b-all) |
| Any language on ElevenLabs' list, Telugu included | Eleven v3 only with a key, within ELEVENLABS_MAX_CHARS, for a few demo clips: not used, 0 characters | - |

## The fallback ladder

Which rungs each saved plan used: 1 same language, 2 shared culture, 3 language barely matters, 4 programs for newcomers and older adults, 5 a regular routine. Command: `numbers.ts` (from data/demo/plans/).

| Plan | Outings | Same-language option found | Ladder levels used | First rides together |
|---|---|---|---|---|
| Fremont | 4 | no | 2 at 2, 2 at 3 | 3 |
| Fremont, a Telugu group added | 5 | yes | 1 at 1, 2 at 2, 2 at 3 | 4 |
| Fremont, heat | 4 | no | 2 at 2, 1 at 3, 1 at 4 | 3 |
| Fremont, rain | 4 | no | 2 at 2, 2 at 4 | 4 |
| Fremont, known routes | 4 | no | 2 at 2, 2 at 3 | 0 |
| Fremont, mother only | 5 | no | 3 at 2, 1 at 3, 1 at 4 | 3 |
| Munich | 5 | no | 2 at 2, 1 at 3, 2 at 4 | 3 |
| Munich, cold | 4 | no | 2 at 2, 1 at 3, 1 at 4 | 2 |
| Bozeman | 4 | no | 2 at 3, 2 at 4 | 4 |
| Bozeman, rain | 2 | no | 2 at 4 | 2 |

All 10 weeks needed the ladder: live search found no Telugu event in any of the three areas that week, so only the week with a Telugu group added (a test of rung 1) starts at the top. No week reached rung 5.

## The Germany household

Kamala and Raghu, a synthetic Telugu-speaking couple staying in München-Neuperlach, prove the same code serves any country: German local language, 112 from the official source, German phrases with Telugu-script pronunciation, and routes from Neuperlach Zentrum. Commands: `build-week.ts` and `numbers.ts`.

- Their week: 5 outings, 3 approved: Stadtbibliothek Ramersdorf (Kamala, Tuesday 09:45, the U5 from Neuperlach Zentrum; the library is closed on Mondays), Stadtbibliothek Neuperlach (Raghu, Wednesday 10:00, a 4-minute walk) and Hariom Temple (Kamala, Sunday with the adult child, the day it's open).
- No Telugu events were found in Munich, so the plan starts at rung 2 (shared culture) and uses rungs 2 to 4.
- Cards: 5, all passing the rubric: 4 by the tuned writer, 1 by Gemma.
- 8 German clips (phrases and the help card), mean CER 0.034.

## Total cost by service

Command: `pnpm costs` (docs/costs.md, from data/demo/usage/ and ranker/fixtures/).

| Service | Used | Cost |
|---|---|---|
| Tinker | 1,486,187 tokens in 1,098 calls | $2.04 |
| SerpApi | 39 live searches | $0.00, free plan |
| Cloudflare Workers AI | 1,139 calls, 6,956 neurons; busiest day 4,875 of 10,000 | $0.00, free plan |
| OpenRouter | 80 requests, 0 answered | $0.00, free models |
| TabPFN | 561 recorded predictions | $0.00, free pools |
| ElevenLabs | 0 characters | $0.00 |
| Render, MongoDB Atlas, Sentry, AgentMail, GitHub Actions and Codespaces | free tiers | $0.00 |

Everything ran on free tiers except Tinker, which spent $2.04.
