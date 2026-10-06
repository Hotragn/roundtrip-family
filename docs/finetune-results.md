# Card writer fine-tune results

Milestone M5: a LoRA on Qwen/Qwen3.5-4B, trained once on Tinker, that writes the parents' Telugu outing cards. Every outing, card and score here is synthetic: the outings are built from public place listings and transit routes saved by live searches (Fremont, Munich, Bozeman) and a fictional family. The evaluations are automated, not reviewed by native speakers. Run on 2026-10-06.

## In short

- On 40 held-out outings at places it never saw in training, the tuned writer passed every code check on 39 cards (98%), against 34 (85%) for the current Gemma writer and 29 (72%) for the untuned Qwen3.5-4B. It passed on the first draft 38 times; Gemma needed a regeneration on 20 cards.
- Gemma, as judge, rated its tone and facts as good as Gemma's own cards (tone 4 or 5 on 39 of 40 for both) and far above the untuned base (17 of 40).
- Head to head it beat the base model 36 to 1. Against the Gemma writer it lost 8 to 20 when Gemma judged and was level, 14 to 12 with 14 ties, when Kimi-K2.6, a third model family, judged. So it doesn't beat Gemma on judged quality. The app uses it anyway, as the plan does once a language has been tuned, behind the gate its training data passed, with Gemma writing any card that fails it (see "In the app").
- Total Tinker spend for this work: $1.97 ($2.03 including the earlier model check), under MAX_TINKER_SPEND_USD. Training itself cost $0.22.
- The adapter is public: https://huggingface.co/roundtrip-family/roundtrip-card-writer-te-qwen3.5-4b-lora

## Data

| | Outings | Notes |
|---|---|---|
| Built | 400 | 183 venues (live search), 67 real transit options, synthetic people, days, times, walks, family outings and 16 invented events |
| Held out for evaluation | 40 | Stratified by area (17 Fremont, 14 Munich, 9 Bozeman), trip (11 bus, 6 transfer, 12 walk, 7 family, 4 event) and parent (21 mother, 19 father). Their venues and events never appear in training. This week's demo venues stay in training |
| Training outings | 360 | 20 of them form the teacher pilot |
| Passed the gate on the first draft | 182 | 196 passed the code checks, 14 of those failed Gemma's tone or facts check |
| Regenerated once | 178 | 160 then passed |
| Kept | 342 | 95% of the training outings |
| Dropped | 18 | Failed again after one regeneration |
| Trained on | 326 | 16 kept examples held back to watch the loss |

Each outing is the exact input `scripts/build-week.ts` sends the card writer (`finetune/finetune/dataset.py` mirrors its trip text, names, optional names and numbers), so the adapter is trained on what the app will ask. Files: `data/demo/finetune/outings.jsonl`, `drafts.jsonl`, `train.jsonl`, `gate-summary.json`.

## Choosing the teacher

Twenty pilot outings, first drafts only, docs/card-style.md as the fixed system prompt. With the style guide alone every teacher failed the code checks on most drafts:

| Teacher | Code checks passed | Main failures |
|---|---|---|
| Qwen3.6-35B-A3B | 6/20 | no మీరు form (11), English from "What's there" |
| Qwen3.5-397B-A17B | 3/20 | no మీరు form (12), the bus's direction in English |
| Kimi-K2.6 | 5/20 | no మీరు form (11), the bus's direction, one card over 60 words |
| DeepSeek-V3.1 | 6/20 | no మీరు form (12), 24-hour times rewritten as 12-hour (7) |

So the teacher's fixed prompt became the style guide plus a short list of the code checks (`TEACHER_NOTES` in `finetune/finetune/gate.py`). The student never sees either. Second round, every readable draft judged by Gemma:

| Teacher | Code checks passed | Gemma tone, mean | Tone 4 or 5 | Facts supported | Passed the gate | Cost per draft | Median ms |
|---|---|---|---|---|---|---|---|
| Qwen3.6-35B-A3B | 12/20 | 4.70 | 19/20 | 17/20 | 12/20 | $0.0004 | 5,155 |
| Qwen3.5-397B-A17B | 11/20 | 5.00 | 20/20 | 20/20 | 11/20 | $0.0023 | 2,390 |
| Kimi-K2.6 | 12/20 | 4.75 | 19/20 | 18/20 | 12/20 | $0.0020 | 3,226 |
| DeepSeek-V3.1 | 9/20 | 4.55 | 17/20 | 18/20 | 7/20 | $0.0014 | 3,273 |

Order-swapped pairs on the same 20 outings, Gemma judging: Qwen3.5-397B-A17B beat Qwen3.6-35B-A3B 12 to 3 (5 ties) and tied Kimi-K2.6 7 to 7 (6 ties). The teacher is **Qwen3.5-397B-A17B**: the best tone and facts, a clear win over the cheaper Qwen, the same tokenizer as the student, and it leaves Kimi free to judge (docs/decisions.md, M5 Card writer). About 84% of each pilot prompt was a prefix-cache hit.

## Training

One run, `finetune/finetune/train.py`, by prompt distillation: each example is the facts prompt alone answered with the kept card's JSON, so the style guide went into the weights and the app sends about 190 prompt tokens instead of about 1,100.

| | |
|---|---|
| Base model | Qwen/Qwen3.5-4B, thinking off (cookbook renderer `qwen3_5_disable_thinking`) |
| LoRA | rank 32, all layers |
| Schedule | 3 epochs, batch 16, 63 steps, learning rate 4.9e-4 (the cookbook's `get_lr`) with linear decay |
| Tokens | 282,198 training plus 17,364 validation, estimated before the run and logged with it |
| Cost | $0.2208 (the estimate and the ledger agree) |
| Validation loss | 1.166 before, 0.156, 0.126 and 0.111 after epochs 1, 2 and 3 |
| Chosen checkpoint | epoch 3, `tinker://a40f341a-0b84-5186-a3b1-63e93b17398b:train:0/sampler_weights/card-writer-te-epoch3` (data/demo/finetune/adapter.json) |

## Evaluation

40 held-out outings. Each writer ran through the app's own code (`finetune/ts/write.ts`): the untuned base with docs/card-style.md as its prompt, the adapter with the facts alone, and GemmaCardWriter as it runs today. Each gets one corrective regeneration, as in the app. Full tables: `data/demo/finetune/eval/report.md`; every card and verdict: `data/demo/finetune/eval/` and `data/demo/finetune/judge/`.

### Rubric pass rate per check (final cards)

| | Qwen3.5-4B base, card-style prompt | Qwen3.5-4B + LoRA, facts only | Gemma 4 26B A4B, card-style prompt (current writer) |
|---|---|---|---|
| 60 words or fewer | 37/40 (92%) | 40/40 (100%) | 40/40 (100%) |
| Every given name, exactly | 40/40 (100%) | 40/40 (100%) | 40/40 (100%) |
| No number outside the input | 40/40 (100%) | 40/40 (100%) | 40/40 (100%) |
| No other Latin-script text | 40/40 (100%) | 40/40 (100%) | 38/40 (95%) |
| Right address form | 40/40 (100%) | 40/40 (100%) | 40/40 (100%) |
| A respectful మీరు form | 32/40 (80%) | 39/40 (98%) | 36/40 (90%) |
| Telugu script intact | 40/40 (100%) | 40/40 (100%) | 40/40 (100%) |
| **All code checks** | **29/40 (72%)** | **39/40 (98%)** | **34/40 (85%)** |
| 95% interval | 57% to 84% | 87% to 100% | 71% to 93% |
| First draft passed | 29/40 (72%) | 38/40 (95%) | 20/40 (50%) |
| Regenerated once | 11 | 2 | 20 |

### Name preservation

| | Qwen3.5-4B base | Qwen3.5-4B + LoRA | Gemma writer |
|---|---|---|---|
| Given names kept exactly | 100/100 | 100/100 | 100/100 |
| Cards with every given name | 40/40 | 40/40 | 40/40 |
| Cards with invented Latin-script text | 0 | 0 | 2 |
| Cards with invented numbers | 0 | 0 | 0 |

A name counts when it appears at least once exactly as given. Invented text means a Latin-script word or number that isn't one of the input's names or numbers.

### Words, script and speed

| | Qwen3.5-4B base | Qwen3.5-4B + LoRA | Gemma writer |
|---|---|---|---|
| Median words (min to max) | 32.5 (19 to 72) | 33 (18 to 55) | 37 (20 to 59) |
| Over 60 words | 3 | 0 | 0 |
| Walk minutes stated (of 58 walks in the trips) | 34 | 27 | 31 |
| Mean Telugu share of letters | 77% | 74% | 76% |
| Median ms per card, first run | 1,590 | 5,684 | 3,742 |

### Gemma's tone and facts verdicts

| | Qwen3.5-4B base | Qwen3.5-4B + LoRA | Gemma writer |
|---|---|---|---|
| Mean tone, 1 to 5 | 3.38 | 4.85 | 4.88 |
| Tone 4 or 5 | 17/40 | 39/40 | 39/40 |
| Facts supported | 16/40 | 40/40 | 39/40 |
| **Full gate (code checks, tone 4 or 5, facts)** | **5/40 (12%)** | **38/40 (95%)** | **32/40 (80%)** |

### Order-swapped pairwise judge

Each pair is judged twice with the cards swapped; a card wins only when both orders pick it, and any disagreement counts as a tie.

| Pair | Tuned wins | Other wins | Ties | Orders disagreed |
|---|---|---|---|---|
| Tuned vs base, Gemma judging | 36 | 1 | 3 | 3 of 40 |
| Tuned vs Gemma writer, Gemma judging | 8 | 20 | 12 | 12 of 40 |
| Tuned vs Gemma writer, Kimi-K2.6 judging | 14 | 12 | 14 | 14 of 40 |

Gemma judging its own writer's cards may favor them, which is why the same pairs were judged again by Kimi-K2.6, a family that wrote none of the cards. The judge for the gate and the tone scores is Gemma 4 26B A4B on Cloudflare (`agent/src/cards/judge.ts`), a different family from the Qwen student and its Qwen teacher.

### One held-out card from each writer (e000, Fremont, bus, mother, first card of the visit)

Trip: walk 9 minutes to Fremont Blvd & Mowry Ave; Bus 211 for 6 stops to Fremont Blvd & Central Av; walk 8 minutes to Jamal farm and produce.

- Tuned: అమ్మా, బుధవారం 13:00కి బయలుదేరి Jamal farm and produce కి వెళ్దాం. Fremont Blvd & Mowry Ave నుండి Bus 211 ఎక్కండి, 6 స్టాపుల తర్వాత Fremont Blvd & Central Av దిగండి. అక్కడ సరసరసగా పండ్లు, కూరగాయలు దొరుకుతాయి. 15:47కి ఇంటికి వచ్చేయొచ్చు. బ్యాంకు వివరాలు ఎవరికీ ఇవ్వకండి, అపరిచితులకు డబ్బు చెల్లించకండి.
- Gemma writer: అమ్మా, బుధవారం 13:00కి Jamal farm and produce కి వెళ్దాం. Fremont Blvd & Mowry Ave కి 9 నిమిషాలు నడిచి, అక్కడ Bus 211 ఎక్కండి. 6 స్టాపుల తర్వాత Fremont Blvd & Central Av దగ్గర దిగి, 8 నిమిషాలు నడిస్తే చేరుకుంటారు. అక్కడ తాజా కూరగాయలు దొరుకుతాయి. 15:47కి ఇంటికి వచ్చేయొచ్చు. ఎవరికీ మీ బ్యాంక్ వివరాలు చెప్పకండి, ఎవరికీ డబ్బులు కట్టకండి.
- Base: అమ్మా, బుధవారం 13:00కి Fremont Blvd & Mowry Ave దగ్గర Bus 211 ఎకెండి, 6 సెట్స్ తరవాత Fremont Blvd & Central Av దిగి, 8 నిమిషాలు వచి Jamal farm and produce కి వెళ్దాం. అక్కడ ఫ్రెష్ ప్రిజుడ్స్ కొనవచ్చు. 15:47కి ఇంటికి వచ్చేయొచ్చు. బ్యాంక్ వివరాలు ఎవరికీ ఇవ్వకండి.

Both judges preferred Gemma's card here: it says both walks. The tuned card skips them and has an odd word (సరసరసగా). The base card misspells its verbs. More pairs: `data/demo/finetune/eval/samples.md`.

## Cost

From data/demo/usage/tinker-ledger.jsonl (docs/costs.md is regenerated from the same file by `pnpm costs`). Sampling costs use Tinker's reported prefix-cache hits for the Python calls; the TypeScript client charges every prompt token at the full price, so its rows overstate a little.

| Step | Calls | Prompt tokens | Output tokens | Cost |
|---|---|---|---|---|
| Probe | 2 | 2,198 | 337 | $0.0012 |
| Teacher pilot, two rounds, four teachers | 160 | 189,158 | 25,297 | $0.2398 |
| Teacher drafts and regenerations, Qwen3.5-397B-A17B | 518 | 698,263 | 69,862 | $1.1291 |
| Training and validation passes | 67 | 299,562 | 0 | $0.2208 |
| Evaluation cards, base and tuned | 93 | 66,377 | 13,424 | $0.0354 |
| Pairwise judge, Kimi-K2.6 | 111 | 78,394 | 15,209 | $0.2564 |
| Checkpoint storage, 3 x 0.29 GB, first month (estimate) | | | | $0.0875 |
| **This milestone** | | | | **$1.9702** |
| Earlier: model check and setup | 136 | 18,892 | 6,427 | $0.0640 |
| **All Tinker spend so far** | | | | **$2.0342** |

Gemma calls (the gate's judge, the evaluation's judge and the Gemma writer) ran on Cloudflare's free allowance: 4,763 of 10,000 neurons on 2026-10-06, the busiest day, with no OpenRouter fallbacks. A tuned card costs about $0.0002 to sample, against $0.0005 for the base model with the style prompt; the app replays saved cards, so the hosted demo costs nothing per visitor.

## What didn't work

- The style guide alone didn't get any teacher through the code checks: 14 to 17 of 20 first drafts failed, mostly for having no మీరు form. DeepSeek-V3.1 also rewrote 24-hour times as 12-hour times. A short list of the checks in the teacher's prompt roughly doubled the pass rate.
- Even with that list, 46% of the teacher's first drafts failed a code check. The gate regenerated 178 drafts and dropped 18 outings.
- The tuned writer doesn't beat the Gemma writer on judged quality. Gemma preferred its own writer's cards 20 to 8; the outside judge was level.
- It states walk minutes less often than the others (27 of 58 walks). It copied the teacher, which follows the style guide's example card, and that example leaves the walk out.
- Some tuned cards have an odd or made-up word, and Gemma's tone scores rarely separate the two strong writers (4.85 and 4.88). Model judges are no substitute for a native speaker's review.
- It is the slowest writer on Tinker's OpenAI-compatible endpoint: a median 5.7 s a card, against 1.6 s for the base model. The demo replays saved cards, so no visitor waits.
- Kimi-K2.6's first pass failed on 37 of 80 verdicts because its reasons ran past the 150-token budget. A 400-token retry fixed every one, at extra cost.
- The rubric counted the bus's direction ("toward Union City BART") as unlisted English, because build-week.ts didn't pass the headsign among the names, so no writer could tell a parent which direction's bus to take. Fixed after this evaluation, which ran without it.
- Converting the adapter for Hugging Face downloaded the base model's full weights (8.8 GB) into the local cache, although the cookbook says it reads only the config.

## In the app

The demo weeks (`scripts/build-week.ts`) use the tuned writer through `agent/src/cards/gated-writer.ts`: the code checks, then Gemma's review (tone 4 or 5 and facts that hold), and, when the walk from the last stop is five minutes or more, its minutes in the card, since a parent who listens first hears only the card. A card that fails goes to the Gemma writer; when both fail, the one with fewer problems is kept. For the week of 5 October the tuned writer wrote 7 of the 10 cards. The gate sent three to Gemma: the temple and Central Park cards left out the walk from the stop (8 and 21 minutes, and the Central Park card also said they could walk in the water at a lakeside park), and the Munich market card used a word that isn't Telugu. On that market card Gemma's draft failed the review too, and it was kept for having fewer problems. The ten cards cost $0.0018 on Tinker.

## Reproduce

From `finetune/` (`uv sync --group tinker` first). Every Tinker and Gemma answer is saved, so re-running costs nothing, and training refuses to run twice.

```text
uv run python -m finetune.dataset
uv run python -m finetune.gate pilot
uv run python -m finetune.gate full --teacher Qwen/Qwen3.5-397B-A17B
uv run python -m finetune.train
uv run python -m finetune.evaluate write
uv run python -m finetune.evaluate judge
uv run python -m finetune.evaluate report
uv run python -m finetune.publish
```

The app's writer is `agent/src/cards/tinker-writer.ts` (`TinkerCardWriter.tuned()`), tested in replay mode by `agent/test/tinker-writer.test.ts`.
