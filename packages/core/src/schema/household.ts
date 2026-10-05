import { z } from "zod";
import { ClockTime, CountryCode, LanguageCode, LatLng, Provenance, TimeWindow } from "./common";

export const EmergencyNumber = z.object({
  number: z.string().regex(/^[0-9]{2,4}$/),
  /** What the number reaches, in English, e.g. "Police, fire and ambulance". */
  covers: z.string(),
  /** An official page that states this number. */
  source: z.url(),
  verifiedOn: z.iso.date(),
});
export type EmergencyNumber = z.infer<typeof EmergencyNumber>;

export const Contact = z.object({
  role: z.enum(["adult_child", "relative", "neighbor", "other"]),
  /** How the parents' app names this person, e.g. "Your child". Never a full name. */
  label: z.string(),
  phone: z.string(),
  /** True when the number is a reserved fictional number for the demo. */
  fictional: z.boolean().default(false),
});
export type Contact = z.infer<typeof Contact>;

export const WeatherRules = z.object({
  /** Hard blocks from docs/plan.md: ice, heavy snow and heat advisories. */
  blockIce: z.boolean().default(true),
  blockHeavySnow: z.boolean().default(true),
  blockHeatAdvisory: z.boolean().default(true),
  /** Walking legs in the sun get flagged above this temperature (Celsius). */
  shadeWarningAboveC: z.number().default(30),
});
export type WeatherRules = z.infer<typeof WeatherRules>;

export const SafetySettings = z.object({
  /** Minutes after the expected return before the parents get a nudge. */
  bufferMinutes: z.number().int().min(10).max(180).default(45),
  /** Minutes after the nudge before the adult child is alerted. */
  nudgeWaitMinutes: z.number().int().min(5).max(120).default(20),
  daylightOnly: z.boolean().default(true),
  weather: WeatherRules,
});
export type SafetySettings = z.infer<typeof SafetySettings>;

export const HomeArea = z.object({
  /** The nearest bus stop or intersection. Never the exact address. */
  label: z.string(),
  nearestStop: z.object({ name: z.string(), location: LatLng }),
  /** A rounded point for searches and weather (3 decimals, about 100 m). */
  areaCenter: LatLng,
  /** The town or district used in search queries, e.g. "Fremont, California". */
  searchLocation: z.string(),
});
export type HomeArea = z.infer<typeof HomeArea>;

export const Household = z.object({
  _id: z.string(),
  slug: z.string(),
  provenance: Provenance,
  hostCountry: CountryCode,
  localLanguage: LanguageCode,
  timezone: z.string(),
  metroArea: z.string(),
  homeArea: HomeArea,
  emergency: EmergencyNumber,
  contacts: z.array(Contact).min(1),
  /** Text for the "I'm lost" help card, in the local language. */
  helpCardText: z.string(),
  /**
   * Short fixed lines for the help card and the walking driver card, in the local language.
   * {name} and {area} are filled in on the phone, so no personal detail leaves it.
   */
  localPhrases: z.object({
    helpTitle: z.string(),
    myName: z.string(),
    stayingNear: z.string(),
    callFamily: z.string(),
    askWay: z.string(),
  }),
  /** Days and times the parents are on their own, e.g. Monday 08:30 to 17:30. */
  aloneWindows: z.array(
    z.object({
      day: z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]),
      start: ClockTime,
      end: ClockTime,
    }),
  ),
  safety: SafetySettings,
  /** Weekend days the adult child can ride a new route with them. */
  trialRunDays: z.array(z.enum(["sat", "sun"])).default(["sat", "sun"]),
  phonePlan: z.object({ hasLocalPlan: z.boolean(), wifiOnly: z.boolean() }),
  notes: z.string().optional(),
  preferredWindows: z.array(TimeWindow).optional(),
});
export type Household = z.infer<typeof Household>;
