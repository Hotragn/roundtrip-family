/**
 * One structured call and one embedding call through the shared Gemma helper, against the
 * live hosts. Prints the host, latency and whether the output validated; never prints keys.
 * Run: pnpm tsx scripts/gemma-smoke.ts
 */
import { loadEnv } from "@roundtrip/core/server-env";
import { z } from "zod";

await loadEnv();
const { gemma, cosine } = await import("@roundtrip/agent/gemma");

const g = gemma();
const result = await g.chatJson({
  purpose: "smoke",
  dataClass: "public",
  schemaName: "event_fields",
  schema: z.object({
    languageMatch: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    indoor: z.boolean(),
    suitsOlderAdults: z.boolean(),
  }),
  messages: [
    {
      role: "system",
      content:
        "You extract fields from event listings for Telugu-speaking parents. languageMatch: 2 if the event is in Telugu, 1 if it is Indian or South Asian but not Telugu, 0 otherwise.",
    },
    {
      role: "user",
      content: "Listing: 'Bathukamma celebration by the Telugu association, community hall, Fremont. Free, all ages.'",
    },
  ],
});
console.log("chatJson:", { provider: result.provider, cached: result.cached, ms: result.latencyMs, data: result.data });

const [a, b, c] = await g.embed(
  ["Telugu association Bathukamma celebration", "తెలుగు సంఘం బతుకమ్మ వేడుక", "Used car dealership oil change"],
  "public",
);
console.log("embed: similar pair", cosine(a!, b!).toFixed(3), "| unrelated pair", cosine(a!, c!).toFixed(3));
