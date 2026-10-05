/**
 * Every outbound network route the code uses. docs/privacy-table.md is generated from this
 * list (pnpm privacy-check --write), and the privacy check fails when code calls a host that
 * isn't listed here. Add a route here in the same change as any new outbound call.
 */

/**
 * public: search terms with only language, interest and area; public listings and places.
 * synthetic: the fictional demo households and anything generated from them.
 * anonymized: derived from family data with names, contacts, addresses, quotes and ratings removed.
 * personal: real family data. Never leaves the family's own database and hardware.
 */
export type DataClass = "public" | "synthetic" | "anonymized" | "personal";

export interface OutboundRoute {
  id: string;
  service: string;
  hosts: string[];
  purpose: string;
  sends: string;
  /** Data classes this route may carry. "personal" is never allowed for a hosted service. */
  accepts: DataClass[];
  /** "runtime" calls happen while the app runs; "build" calls happen only in scripts. */
  when: "runtime" | "build" | "browser";
  docs: string;
}

export const OUTBOUND: OutboundRoute[] = [
  {
    id: "cloudflare.chat",
    service: "Cloudflare Workers AI (Gemma 4)",
    hosts: ["api.cloudflare.com"],
    purpose: "Planning, event understanding, judging, card writing fallback",
    sends: "Planning prompts with first-name-free household summaries, public event text, synthetic cards",
    accepts: ["public", "synthetic", "anonymized"],
    when: "runtime",
    docs: "https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/",
  },
  {
    id: "cloudflare.embeddings",
    service: "Cloudflare Workers AI (EmbeddingGemma)",
    hosts: ["api.cloudflare.com"],
    purpose: "Embeddings for 'more like the ones they enjoyed'",
    sends: "Public event and place descriptions",
    accepts: ["public", "synthetic"],
    when: "runtime",
    docs: "https://developers.cloudflare.com/workers-ai/models/embeddinggemma-300m/",
  },
  {
    id: "openrouter.chat",
    service: "OpenRouter (free Gemma 4 models)",
    hosts: ["openrouter.ai"],
    purpose: "Fallback when Cloudflare's daily allowance is spent or errors",
    sends: "The same prompts as cloudflare.chat",
    accepts: ["public", "synthetic", "anonymized"],
    when: "runtime",
    docs: "https://openrouter.ai/docs/api-reference/overview",
  },
  {
    id: "serpapi.events",
    service: "SerpApi Google search, events results",
    hosts: ["serpapi.com"],
    purpose: "Live local events for the coming week",
    sends: "Language, interest and area only, e.g. 'Telugu events in Fremont, California'",
    accepts: ["public"],
    when: "runtime",
    docs: "https://serpapi.com/events-results",
  },
  {
    id: "serpapi.maps",
    service: "SerpApi google_maps",
    hosts: ["serpapi.com"],
    purpose: "Regular places: temples, libraries, parks, groceries",
    sends: "Place type and area only",
    accepts: ["public"],
    when: "runtime",
    docs: "https://serpapi.com/google-maps-api",
  },
  {
    id: "serpapi.directions",
    service: "SerpApi google_maps_directions",
    hosts: ["serpapi.com"],
    purpose: "Transit and walking routes",
    sends: "The household's nearest bus stop and the venue address, never the home address",
    accepts: ["public"],
    when: "runtime",
    docs: "https://serpapi.com/google-maps-directions-api",
  },
  {
    id: "serpapi.account",
    service: "SerpApi Account API",
    hosts: ["serpapi.com"],
    purpose: "Checking the remaining free searches",
    sends: "The API key only",
    accepts: ["public"],
    when: "build",
    docs: "https://serpapi.com/account-api",
  },
  {
    id: "priorlabs.tabpfn",
    service: "Prior Labs API (TabPFN)",
    hosts: ["api.priorlabs.ai"],
    purpose: "Ranking candidate outings from past outings",
    sends: "Outing feature rows (category, minutes, hour, weather, language match) with no names",
    accepts: ["synthetic", "anonymized"],
    when: "runtime",
    docs: "https://docs.priorlabs.ai/api-reference/metering",
  },
  {
    id: "tinker",
    service: "Tinker (Thinking Machines)",
    hosts: ["tinker.thinkingmachines.dev", "tinker.thinkingmachines.ai"],
    purpose: "Teacher drafts, LoRA training and sampling the card writer",
    sends: "Synthetic outings and card text",
    accepts: ["synthetic"],
    when: "build",
    docs: "https://tinker-docs.thinkingmachines.ai/tinker/quickstart/",
  },
  {
    id: "elevenlabs.tts",
    service: "ElevenLabs (optional)",
    hosts: ["api.elevenlabs.io"],
    purpose: "A few comparison clips of synthetic card text",
    sends: "Card and phrase text with names removed",
    accepts: ["synthetic"],
    when: "build",
    docs: "https://elevenlabs.io/docs/api-reference/text-to-speech/convert",
  },
  {
    id: "agentmail",
    service: "AgentMail",
    hosts: ["api.agentmail.to", "ws.agentmail.to"],
    purpose: "Planning email, safety alert and weekly summary to the adult child; approve by reply",
    sends: "First names and outing details only, to DEMO_ALERT_EMAIL only",
    accepts: ["synthetic", "anonymized"],
    when: "runtime",
    docs: "https://docs.agentmail.to/llms.txt",
  },
  {
    id: "sentry",
    service: "Sentry",
    hosts: ["sentry.io", "ingest.sentry.io", "ingest.us.sentry.io", "ingest.de.sentry.io"],
    purpose: "Error traces and agent spans",
    sends: "Span timings, model names, token counts and scrubbed errors; no prompt text",
    accepts: ["anonymized", "synthetic"],
    when: "runtime",
    docs: "https://docs.sentry.io/platforms/javascript/guides/nextjs/",
  },
  {
    id: "open-meteo",
    service: "Open-Meteo",
    hosts: ["api.open-meteo.com"],
    purpose: "Forecast for weather rules and ranking",
    sends: "The rounded area center (about 100 m), never the home address",
    accepts: ["public"],
    when: "runtime",
    docs: "https://open-meteo.com/en/docs",
  },
  {
    id: "nominatim",
    service: "OpenStreetMap Nominatim",
    hosts: ["nominatim.openstreetmap.org"],
    purpose: "Map coordinates for public event venues",
    sends: "A venue name and town from a public listing, never a home address",
    accepts: ["public"],
    when: "build",
    docs: "https://operations.osmfoundation.org/policies/nominatim/",
  },
  {
    id: "overpass",
    service: "OpenStreetMap Overpass API",
    hosts: ["overpass-api.de", "maps.mail.ru", "overpass.private.coffee", "overpass.kumi.systems"],
    purpose: "Bus stop sequences and landmarks near stops, for when to press stop",
    sends: "A bounding box or coordinates around public bus stops",
    accepts: ["public"],
    when: "build",
    docs: "https://wiki.openstreetmap.org/wiki/Overpass_API",
  },
  {
    id: "ranker",
    service: "Roundtrip ranker service (our own, on Render)",
    hosts: ["onrender.com"],
    purpose: "Scoring candidate outings; it forwards feature rows to the Prior Labs API",
    sends: "Outing feature rows with no names, plus past ratings in demo mode (synthetic)",
    accepts: ["synthetic", "anonymized"],
    when: "runtime",
    docs: "https://docs.priorlabs.ai/api-reference/metering",
  },
  {
    id: "mongodb",
    service: "MongoDB Atlas (the household's own database)",
    hosts: ["mongodb.net"],
    purpose: "The data layer",
    sends: "Household records; diary entries only as ciphertext",
    accepts: ["public", "synthetic", "anonymized", "personal"],
    when: "runtime",
    docs: "https://www.mongodb.com/docs/atlas/",
  },
  {
    id: "huggingface",
    service: "Hugging Face Hub",
    hosts: ["huggingface.co", "hf.co", "cdn-lfs.huggingface.co"],
    purpose: "Downloading open models; publishing the card-writer adapter",
    sends: "The adapter trained on synthetic data and its model card",
    accepts: ["synthetic"],
    when: "build",
    docs: "https://huggingface.co/docs/huggingface_hub/guides/upload",
  },
  {
    id: "openfreemap",
    service: "OpenFreeMap tiles",
    hosts: ["tiles.openfreemap.org"],
    purpose: "Map tiles for dashboard route previews, loaded by the browser",
    sends: "Tile coordinates around the route",
    accepts: ["public"],
    when: "browser",
    docs: "https://openfreemap.org/",
  },
  {
    id: "place-photos",
    service: "Google image CDN (place photos from search results)",
    hosts: ["googleusercontent.com", "gstatic.com"],
    purpose: "Place photos on tickets, loaded by the browser",
    sends: "An image request; no household data",
    accepts: ["public"],
    when: "browser",
    docs: "https://serpapi.com/google-maps-api",
  },
  {
    id: "assets",
    service: "Poly Haven and ambientCG",
    hosts: ["api.polyhaven.com", "dl.polyhaven.org", "ambientcg.com"],
    purpose: "CC0 textures and HDRIs for baked renders",
    sends: "Nothing but the asset request",
    accepts: ["public"],
    when: "build",
    docs: "https://api.polyhaven.com/",
  },
  {
    id: "fonts",
    service: "Google Fonts (build time)",
    hosts: ["fonts.googleapis.com", "fonts.gstatic.com", "raw.githubusercontent.com"],
    purpose: "Hind and Hind Guntur, downloaded at build time and self-hosted",
    sends: "Nothing but the font request",
    accepts: ["public"],
    when: "build",
    docs: "https://nextjs.org/docs/app/getting-started/fonts",
  },
];

export function route(id: string): OutboundRoute {
  const found = OUTBOUND.find((r) => r.id === id);
  if (!found) throw new Error(`Unknown outbound route "${id}". Register it in packages/core/src/privacy/outbound.ts.`);
  return found;
}
