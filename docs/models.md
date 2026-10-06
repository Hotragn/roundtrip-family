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
| Reading cards, phrases and the help card aloud | Meta MMS-TTS (`facebook/mms-tts-tel`, `-eng`, `-deu`) | The family's own hardware (the Codespace); clips saved | CC-BY-NC 4.0 |
| Transcribing speech, and checking every clip | Meta MMS (`facebook/mms-1b-all`) | The family's own hardware (the Codespace) | CC-BY-NC 4.0 |

Meta's MMS models are licensed for non-commercial use only. That fits a family project and this demo; anyone building on Roundtrip commercially needs other voices, such as AI4Bharat's below for Indian languages.

## Chosen but not reachable yet

| Job | Model | Why not yet | License |
|---|---|---|---|
| Telugu voice (the plan's first choice) | AI4Bharat Indic Parler-TTS (`ai4bharat/indic-parler-tts`) | Gated; the builder's account isn't on the access list (docs/blocked.md) | Apache 2.0 |
| Telugu listening (the plan's first choice) | AI4Bharat IndicConformer (`ai4bharat/indic-conformer-600m-multilingual`) | Gated, as above | MIT |
| A few final demo clips (optional) | ElevenLabs Eleven v3 | Optional in the plan; the demo uses the open voices | ElevenLabs' terms (a hosted service) |

The voice router (agent/src/voice/router.ts) already picks the AI4Bharat models for Indian languages; the speech pipeline falls back to MMS while they can't be downloaded and switches by itself once they can.

## Used only to build the card writer

| Job | Model | Where it ran | License |
|---|---|---|---|
| Teacher: drafting the training cards | Qwen3.5-397B-A17B (`Qwen/Qwen3.5-397B-A17B`) | Tinker | Apache 2.0 |
| Second judge, a third model family | Kimi-K2.6 (`moonshotai/Kimi-K2.6`) | Tinker | Modified MIT |
| Teachers tried in the pilot | DeepSeek-V3.1 (`deepseek-ai/DeepSeek-V3.1`), Qwen3.6-35B-A3B (`Qwen/Qwen3.6-35B-A3B`) | Tinker | MIT; Apache 2.0 |

The card writer's training data is synthetic (docs/finetune-results.md). Its adapter is public under Apache 2.0, so anyone can run it on their own hardware.
