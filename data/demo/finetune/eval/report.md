## Rubric pass rate per check (final cards)

| | Qwen3.5-4B base, card-style prompt | Qwen3.5-4B + LoRA, facts only | Gemma 4 26B A4B, card-style prompt (current writer) |
|---|---|---|---|
| Cards written | 40/40 | 40/40 | 40/40 |
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

## Name preservation

| | Qwen3.5-4B base, card-style prompt | Qwen3.5-4B + LoRA, facts only | Gemma 4 26B A4B, card-style prompt (current writer) |
|---|---|---|---|
| Given names kept exactly | 100/100 (100%) | 100/100 (100%) | 100/100 (100%) |
| Cards with every given name | 40/40 (100%) | 40/40 (100%) | 40/40 (100%) |
| Cards with invented Latin-script text | 0 | 0 | 2 |
| Cards with invented numbers | 0 | 0 | 0 |

## Words, script and speed

| | Qwen3.5-4B base, card-style prompt | Qwen3.5-4B + LoRA, facts only | Gemma 4 26B A4B, card-style prompt (current writer) |
|---|---|---|---|
| Median words (min to max) | 32.5 (19 to 72) | 33.0 (18 to 55) | 37.0 (20 to 59) |
| Walk minutes stated (walks in the trips) | 34/58 (59%) | 27/58 (47%) | 31/58 (53%) |
| Over 60 words | 3 | 0 | 0 |
| Mean Telugu share of letters | 77% | 74% | 76% |
| Median ms per card (first run) | 1,590 | 5,684 | 3,742 |

## Gemma's tone and facts verdicts

| | Qwen3.5-4B base, card-style prompt | Qwen3.5-4B + LoRA, facts only | Gemma 4 26B A4B, card-style prompt (current writer) |
|---|---|---|---|
| Mean tone (1 to 5) | 3.38 | 4.85 | 4.88 |
| Tone 4 or 5 | 17/40 (42%) | 39/40 (98%) | 39/40 (98%) |
| Facts supported | 16/40 (40%) | 40/40 (100%) | 39/40 (98%) |
| **Full gate (code checks, tone 4+, facts)** | **5/40 (12%)** | **38/40 (95%)** | **32/40 (80%)** |

## Order-swapped pairwise judge

| Pair | Tuned wins | Other wins | Ties | Orders disagreed |
|---|---|---|---|---|
| tuned vs base (Gemma judge) | 36 | 1 | 3 | 3 of 40 |
| tuned vs Gemma writer (Gemma judge) | 8 | 20 | 12 | 12 of 40 |
| tuned vs Gemma writer (Kimi-K2.6 judge) | 14 | 12 | 14 | 14 of 40 |
