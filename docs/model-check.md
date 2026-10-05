# Model check

Synthetic inputs, automated scores. Nothing here was reviewed by a native speaker. Run on 2026-10-05 with `pnpm --filter @roundtrip/scripts exec tsx model-check/run.ts`; raw results are in `data/demo/model-check/results.json`.

## Telugu translation, 20 everyday sentences

Back-translation: Gemma 4 on Cloudflare translates each Telugu output back to English, and EmbeddingGemma scores its cosine similarity to the original (1.0 is identical meaning). Judge: Kimi-K2.6 on Tinker, a different family from Gemma and Qwen, rates fluency and correctness from 1 to 5.

| System | Answered | Back-translation similarity | Judge fluency | Judge correctness | Script intact | Median ms |
|---|---|---|---|---|---|---|
| Gemma 4 26B A4B (Cloudflare Workers AI) | 20/20 | 0.899 | 3.65 | 4.20 | 20/20 | 891 |
| Gemma 4 31B (OpenRouter free) | 0/20 | n/a | n/a | n/a | n/a | n/a |
| Qwen3.5-4B base (Tinker) | 20/20 | 0.834 | 2.90 | 2.80 | 19/20 | 584 |
| Qwen3.6-35B-A3B (Tinker, teacher candidate) | 20/20 | 0.918 | 4.00 | 4.47 | 19/20 | 659 |
| Qwen3.5-397B-A17B (Tinker, teacher candidate) | 20/20 | 0.904 | 4.00 | 4.35 | 20/20 | 590 |

**Press the red strip after the big Safeway.**

| System | Telugu | Fluency / correctness |
|---|---|---|
| gemma-cf | పెద్ద Safeway దాటాక, ఆ ఎర్రటి స్ట్రిప్ నొక్కండి. | 4 / 4 |
| gemma-or | (GemmaUnavailable: Every Gemma host failed: openrouter-31b: HTTP 429 after 4 tries) | n/a / n/a |
| qwen-4b | బిగ్ సేఫ్‌వేయ్‌ తర్వాత ఉన్న ఎరుపు స్ట్రిప్‌ను నొక్కండి. | 3 / 4 |
| qwen-35b | బిగ్ సేవేజ్ తర్వాత ఎరుపు పట్టీని నొక్కండి. | 3 / 4 |
| qwen-397b | పెద్ద Safeway దాటిన తర్వాత ఆ ఎర్ర స్ట్రిప్ నొక్కండి. | 4 / 4 |

**Come home before one o'clock for lunch and rest.**

| System | Telugu | Fluency / correctness |
|---|---|---|
| gemma-cf | మధ్యాహ్నం భోజనం చేసి కాసేపు విశ్రాంతి తీసుకోవడానికి ఒక గంట లోపు ఇంటికి వచ్చేయండి. | 4 / 3 |
| gemma-or | (GemmaUnavailable: Every Gemma host failed: openrouter-31b: HTTP 429 after 4 tries) | n/a / n/a |
| qwen-4b | లంచు తినడానికి ఒక గంటకు ముందు ఇంటికి రావాలి, తర్వాత విశ్రాంతి తీసుకోవాలి. | 3 / 2 |
| qwen-35b | ఒంటిగంటకు ముందు ఇంటికి వచ్చి భోజనం చేసి విశ్రాంతి తీసుకోండి. | 4 / 5 |
| qwen-397b | మీరు ఒంటి గంటలోపు ఇంటికి వచ్చేయండి, మధ్యాహ్నం భోజనం చేసి కాసేపు విశ్రాంతి తీసుకోండి. | 4 / 4 |

**Mrs. Chen suggested the Asian market on Mowry Avenue.**

| System | Telugu | Fluency / correctness |
|---|---|---|
| gemma-cf | Mrs. Chen గారు Mowry Avenue లో ఉన్న Asian market కి వెళ్ళమని చెప్పారు. | 4 / 4 |
| gemma-or | (GemmaUnavailable: Every Gemma host failed: openrouter-31b: HTTP 429 after 4 tries) | n/a / n/a |
| qwen-4b | మీరెమ్మ చెన్ అమ్మాయి మార్వీ అవెన్యూలోని ఆసియన్ మార్కెట్‌ను సూచించారు. | 2 / 2 |
| qwen-35b | మిస్సెస్ చెన్, మౌరీ యవనిూలో ఉన్న ఏషియన్ మార్కెట్‌ను సూచించారు. | 3 / 4 |
| qwen-397b | చెన్ గారు మోరీ అవెన్యూలో ఉన్న ఏషియన్ మార్కెట్ సూచించారు. | 4 / 5 |

Median latency is for the first, uncached run. Gemma 4 31B on OpenRouter's free tier answered none of 80 attempts (20 sentences, 4 tries each with backoff): every request returned HTTP 429, "temporarily rate-limited upstream", on 2026-10-05. The planner's fallback stays wired in, and the demo replays saved outputs when both hosts are busy.

## What the numbers say

- **Planner: Gemma 4 26B A4B on Cloudflare.** Script intact 20/20, names always kept in English letters, correctness 4.2 and fluency 3.65, under a second per call, on the free allowance. It made one meaning error worth noting: "before one o'clock" became "within one hour".
- **Card writer base: Qwen3.5-4B.** It is the weakest Telugu writer here (fluency 2.9, correctness 2.8; it addressed a mother as మామ, an uncle, in a probe), which is the case for fine-tuning it. If the tuned model stays weak, the plan's fallback is Qwen3.5-9B.
- **Teacher candidates.** Qwen3.6-35B-A3B scored highest on correctness (4.47) but transliterated names, once turning Safeway into సేవేజ్ ("savage"). Qwen3.5-397B-A17B kept names in English more often with similar scores. A small card-style pilot decides between them before drafting the dataset.

## Event listings to JSON (Gemma 4 on Cloudflare)

5 of 5 listings returned JSON that validates against the schema.

| Listing | Valid | Extracted |
|---|---|---|
| Bathukamma celebration by the Telugu association of the Bay ... | yes | `{"languageMatch":2,"suitsOlderAdults":true,"indoor":true,"free":true,"costAmount":null,"category":"Festival"}` |
| Senior center chair yoga. Tuesdays 10:00 to 11:00 am. Free f... | yes | `{"languageMatch":0,"suitsOlderAdults":true,"indoor":true,"free":false,"costAmount":null,"category":"Fitness"}` |
| Telugu movie screening with English subtitles, Saturday 7 pm... | yes | `{"languageMatch":2,"suitsOlderAdults":true,"indoor":true,"free":false,"costAmount":14,"category":"movie"}` |
| English conversation circle for newcomers at the Fremont Mai... | yes | `{"languageMatch":0,"suitsOlderAdults":true,"indoor":true,"free":true,"costAmount":null,"category":"education"}` |
| Farmers market at the Irvington district, Sundays 9 am to 1 ... | yes | `{"languageMatch":0,"suitsOlderAdults":true,"indoor":false,"free":true,"costAmount":0,"category":"market"}` |

## Cost

Tinker spend for this run: $0.0000. Gemma calls ran on Cloudflare's free allowance and OpenRouter's free models.

## Speech

The speech part of the model check (MMS-TTS and Indic Parler-TTS voices, IndicConformer transcription, character error rate) runs in the Codespace with milestone M5 and is reported below when it has run.
