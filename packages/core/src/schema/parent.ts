import { z } from "zod";
import { LanguageCode, Provenance, TimeWindow } from "./common";

export const ReadingSupport = z.enum([
  /** Listens first, then reads text in their own script. Tickets are audio-first. */
  "audio_first",
  /** Reads their own script and also matches local-language words on signs. */
  "text_with_sign_words",
  /** Reads their own script comfortably. */
  "text",
]);
export type ReadingSupport = z.infer<typeof ReadingSupport>;

export const Parent = z.object({
  _id: z.string(),
  householdId: z.string(),
  provenance: Provenance,
  /** First name only. */
  firstName: z.string(),
  /** How cards address this parent, e.g. "అమ్మా". */
  addressAs: z.string(),
  language: LanguageCode,
  dialectNotes: z.string(),
  otherLanguages: z.array(z.object({ code: LanguageCode, level: z.enum(["understands", "speaks"]) })),
  readingSupport: ReadingSupport,
  /** Local-language words this parent already knows, used to build phrases. */
  localWordsKnown: z.array(z.string()),
  interests: z.array(z.string()),
  notInterested: z.array(z.string()),
  dislikes: z.array(z.string()),
  mobility: z.object({
    maxWalkMinutes: z.number().int().min(0),
    maxTransfers: z.number().int().min(0).max(3),
    transitComfort: z.enum(["none", "with_company", "solo_known_routes", "solo"]),
    notes: z.string(),
  }),
  weather: z.object({
    avoid: z.array(z.enum(["cold", "wind", "rain", "heat", "ice", "snow"])),
    /** Below this, outdoor legs count against the outing (Celsius). */
    minComfortC: z.number().optional(),
    /** Above this, outdoor legs count against the outing (Celsius). */
    maxComfortC: z.number().optional(),
  }),
  bestTimes: z.array(TimeWindow),
  naps: z.array(TimeWindow),
  diet: z.string(),
  settings: z.object({
    /** Off by default. Only the parent can turn it on, in the app. */
    useDiaryForPlanning: z.boolean().default(false),
  }),
});
export type Parent = z.infer<typeof Parent>;
