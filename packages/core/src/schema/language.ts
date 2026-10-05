import { z } from "zod";
import { LanguageCode } from "./common";

export const Readiness = z.enum(["ready", "fallback", "needs_tuning", "unavailable"]);
export type Readiness = z.infer<typeof Readiness>;

/** What each language can do, shown in setup and on the dashboard's Languages screen. */
export const LanguageRecord = z.object({
  _id: z.string(),
  code: LanguageCode,
  name: z.string(),
  nativeName: z.string(),
  script: z.string(),
  direction: z.enum(["ltr", "rtl"]),
  reading: z.object({ status: Readiness, provider: z.string(), model: z.string() }),
  cardWriter: z.object({ status: Readiness, provider: z.string(), model: z.string() }),
  speaking: z.object({ status: Readiness, provider: z.string(), model: z.string() }),
  listening: z.object({ status: Readiness, provider: z.string(), model: z.string() }),
  /** Whether ElevenLabs lists this language. */
  elevenLabs: z.boolean(),
});
export type LanguageRecord = z.infer<typeof LanguageRecord>;
