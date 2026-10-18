# Models and their licenses

Every model Roundtrip uses, where it runs and under what license. Licenses were read from each model's Hugging Face page (the `license` field of `https://huggingface.co/api/models/<id>`) on 6 October 2026.

## In the product

| Job | Model | Where it runs | License |
|---|---|---|---|
| Planning, reasons, event reading, card review | Gemma 4 26B A4B (`google/gemma-4-26B-A4B-it`, on Workers AI as `@cf/google/gemma-4-26b-a4b-it`) | Cloudflare Workers AI, free plan | Apache 2.0 |
| The same, when Cloudflare's daily allowance is spent | Gemma 4 31B and 26B A4B (`google/gemma-4-31b-it:free`, `google/gemma-4-26b-a4b-it:free`) | OpenRouter, free models | Apache 2.0 |
| "More like the ones they enjoyed" | EmbeddingGemma 300M (`google/embeddinggemma-300m`) | Cloudflare Workers AI | Gemma Terms of Use |
| Telugu outing cards | Roundtrip card writer, a LoRA on Qwen3.5-4B (`roundtrip-family/roundtrip-card-writer-te-qwen3.5-4b-lora`) | Tinker's sampling API | Apache 2.0, the base model's license |
| Scoring outings for each parent | TabPFN v2 (`Prior-Labs/TabPFN-v2-clf`) | The Prior Labs API, through tabpfn-client | Prior Labs License 1.1 for the weights; the API under Prior Labs' terms |
| Reading Telugu cards and diary entries aloud | AI4Bharat Indic Parler-TTS (`ai4bharat/indic-parler-tts`) | The GitHub Actions speech job; clips saved | [Apache 2.0](https://huggingface.co/ai4bharat/indic-parler-tts) |
| Reading English and German phrases and help cards aloud | Parler-TTS Mini Multilingual v1.1 (`parler-tts/parler-tts-mini-multilingual-v1.1`) | The GitHub Actions speech job; clips saved | [Apache 2.0](https://huggingface.co/parler-tts/parler-tts-mini-multilingual-v1.1) |

Every clip the app plays is made by a model whose license allows commercial use. Since 18 October no clip comes from Meta MMS-TTS.

## Used only offline, to score the clips

These listeners transcribe the saved clips in the speech job so they can be scored (docs/speech-results.md). Nothing they produce ships in the app.

| Job | Model | License |
|---|---|---|
| Checking Telugu clips | AI4Bharat IndicConformer (`ai4bharat/indic-conformer-600m-multilingual`) | [MIT](https://huggingface.co/ai4bharat/indic-conformer-600m-multilingual) |
| Checking English and German clips | OpenAI Whisper large-v3-turbo (`openai/whisper-large-v3-turbo`) | [MIT](https://huggingface.co/openai/whisper-large-v3-turbo) |
| Fallback Telugu listener, only if IndicConformer can't load | Meta MMS (`facebook/mms-1b-all`) | [CC-BY-NC 4.0](https://huggingface.co/facebook/mms-1b-all), non-commercial |

Still non-commercial: only `facebook/mms-1b-all`, kept as an offline fallback for scoring Telugu. It never voices anything and its transcripts are not shown to anyone. The MMS-TTS voices (`facebook/mms-tts-tel`, `-eng`, `-deu`, CC-BY-NC 4.0) are no longer chosen for any language; the code that loads them stays only so old clips can be compared.

## Chosen but not reachable yet

| Job | Model | Why not yet | License |
|---|---|---|---|
| A few final demo clips (optional) | ElevenLabs Eleven v3 | Optional in the plan; the demo uses the open voices | ElevenLabs' terms (a hosted service) |

The voice router (agent/src/voice/router.ts) picks Indic Parler-TTS for Indian languages, Parler-TTS Mini Multilingual for the eight languages it speaks (English, French, Spanish, Portuguese, Polish, German, Dutch, Italian), and the phone's own voice for the rest. The speech pipeline has no non-commercial fallback voice: if a voice can't load, its clips are left unvoiced and the phone reads the text.

## Used only to build the card writer

| Job | Model | Where it ran | License |
|---|---|---|---|
| Teacher: drafting the training cards | Qwen3.5-397B-A17B (`Qwen/Qwen3.5-397B-A17B`) | Tinker | Apache 2.0 |
| Second judge, a third model family | Kimi-K2.6 (`moonshotai/Kimi-K2.6`) | Tinker | Modified MIT |
| Teachers tried in the pilot | DeepSeek-V3.1 (`deepseek-ai/DeepSeek-V3.1`), Qwen3.6-35B-A3B (`Qwen/Qwen3.6-35B-A3B`) | Tinker | MIT; Apache 2.0 |

The card writer's training data is synthetic (docs/finetune-results.md). Its adapter is public under Apache 2.0, so anyone can run it on their own hardware.
