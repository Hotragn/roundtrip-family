# Where data goes

Generated from `packages/core/src/privacy/outbound.ts` by `pnpm privacy-check --write`. The privacy check fails when code calls a host that isn't listed here.

Data classes: **public** (search terms with only language, interest and area; public listings), **synthetic** (the fictional demo households), **anonymized** (family data with names, contacts, addresses, quotes and ratings removed), **personal** (real family data, which never leaves the family's own database and hardware).

| Service | What it receives | Why | Data classes allowed | When | Source |
|---|---|---|---|---|---|
| Cloudflare Workers AI (Gemma 4) | Planning prompts with first-name-free household summaries, public event text, synthetic cards | Planning, event understanding, judging, card writing fallback | public, synthetic, anonymized | runtime | [docs](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/) |
| Cloudflare Workers AI (EmbeddingGemma) | Public event and place descriptions | Embeddings for 'more like the ones they enjoyed' | public, synthetic | runtime | [docs](https://developers.cloudflare.com/workers-ai/models/embeddinggemma-300m/) |
| OpenRouter (free Gemma 4 models) | The same prompts as cloudflare.chat | Fallback when Cloudflare's daily allowance is spent or errors | public, synthetic, anonymized | runtime | [docs](https://openrouter.ai/docs/api-reference/overview) |
| SerpApi google_events | Language, interest and area only, e.g. 'Telugu events in Fremont, California' | Live local events for the coming week | public | runtime | [docs](https://serpapi.com/google-events-api) |
| SerpApi google_maps | Place type and area only | Regular places: temples, libraries, parks, groceries | public | runtime | [docs](https://serpapi.com/google-maps-api) |
| SerpApi google_maps_directions | The household's nearest bus stop and the venue address, never the home address | Transit and walking routes | public | runtime | [docs](https://serpapi.com/google-maps-directions-api) |
| SerpApi Account API | The API key only | Checking the remaining free searches | public | build | [docs](https://serpapi.com/account-api) |
| Prior Labs API (TabPFN) | Outing feature rows (category, minutes, hour, weather, language match) with no names | Ranking candidate outings from past outings | synthetic, anonymized | runtime | [docs](https://docs.priorlabs.ai/api-reference/metering) |
| Tinker (Thinking Machines) | Synthetic outings and card text | Teacher drafts, LoRA training and sampling the card writer | synthetic | build | [docs](https://tinker-docs.thinkingmachines.ai/tinker/quickstart/) |
| ElevenLabs (optional) | Card and phrase text with names removed | A few comparison clips of synthetic card text | synthetic | build | [docs](https://elevenlabs.io/docs/api-reference/text-to-speech/convert) |
| AgentMail | First names and outing details only, to DEMO_ALERT_EMAIL only | Planning email, safety alert and weekly summary to the adult child; approve by reply | synthetic, anonymized | runtime | [docs](https://docs.agentmail.to/llms.txt) |
| Sentry | Span timings, model names, token counts and scrubbed errors; no prompt text | Error traces and agent spans | anonymized, synthetic | runtime | [docs](https://docs.sentry.io/platforms/javascript/guides/nextjs/) |
| Open-Meteo | The rounded area center (about 100 m), never the home address | Forecast for weather rules and ranking | public | runtime | [docs](https://open-meteo.com/en/docs) |
| MongoDB Atlas (the household's own database) | Household records; diary entries only as ciphertext | The data layer | public, synthetic, anonymized, personal | runtime | [docs](https://www.mongodb.com/docs/atlas/) |
| Hugging Face Hub | The adapter trained on synthetic data and its model card | Downloading open models; publishing the card-writer adapter | synthetic | build | [docs](https://huggingface.co/docs/huggingface_hub/guides/upload) |
| OpenFreeMap tiles | Tile coordinates around the route | Map tiles for dashboard route previews, loaded by the browser | public | browser | [docs](https://openfreemap.org/) |
| Google image CDN (place photos from search results) | An image request; no household data | Place photos on tickets, loaded by the browser | public | browser | [docs](https://serpapi.com/google-maps-api) |
| Poly Haven and ambientCG | Nothing but the asset request | CC0 textures and HDRIs for baked renders | public | build | [docs](https://api.polyhaven.com/) |
| Google Fonts (build time) | Nothing but the font request | Hind and Hind Guntur, downloaded at build time and self-hosted | public | build | [docs](https://nextjs.org/docs/app/getting-started/fonts) |

In demo mode everything is synthetic. Diary entries are encrypted before storage in every mode, and no route carries diary content.
