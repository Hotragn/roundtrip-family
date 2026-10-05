import { z } from "zod";
import { IsoDateTime, IsoWeek, LadderLevel, LanguageMatch, Provenance } from "./common";
import { Route } from "./route";

/** The ranker's input row. Never holds names, addresses or other personal data. */
export const OutingFeatures = z.object({
  /** Kind of outing as text (TabPFN takes text categories as they are), e.g. "temple". */
  category: z.string(),
  languageMatch: LanguageMatch,
  travelMinutes: z.number().min(0).nullable(),
  transfers: z.number().int().min(0).nullable(),
  walkingMinutes: z.number().min(0).nullable(),
  startHour: z.number().int().min(0).max(23).nullable(),
  dayOfWeek: z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]).nullable(),
  /** Weather word: very_hot, hot, pleasant, cool, rainy, air_conditioned. */
  weather: z.string().nullable(),
  temperatureC: z.number().nullable(),
  rainChance: z.number().min(0).max(1).nullable(),
  indoor: z.boolean().nullable(),
  groupSize: z.enum(["solo", "small", "medium", "large"]).nullable(),
  costUsd: z.number().min(0).nullable(),
  knowsSomeone: z.boolean().nullable(),
  foodAvailable: z.boolean().nullable(),
  daysSinceLastOuting: z.number().min(0).nullable(),
  withAdultChild: z.boolean().nullable(),
  languageNeeded: z.boolean().nullable(),
});
export type OutingFeatures = z.infer<typeof OutingFeatures>;

export const ReasonChip = z.object({
  /** Short words shown on the dashboard, e.g. "Speaks their language". */
  label: z.string(),
  /** Which feature produced it, for audits. */
  feature: z.string(),
  direction: z.enum(["for", "against"]),
});
export type ReasonChip = z.infer<typeof ReasonChip>;

export const OutingStatus = z.enum([
  "suggested",
  "approved",
  "swapped_out",
  "under_way",
  "home",
  "missed",
  "cancelled",
  "past",
]);
export type OutingStatus = z.infer<typeof OutingStatus>;

export const Outing = z.object({
  _id: z.string(),
  householdId: z.string(),
  provenance: Provenance,
  week: IsoWeek.nullable(),
  /** Exactly one of these is set for a suggestion: an event or a regular place. */
  eventId: z.string().optional(),
  placeId: z.string().optional(),
  title: z.string(),
  venueName: z.string(),
  /** Parent ids this outing is for. */
  parentIds: z.array(z.string()).min(1),
  plannedStart: IsoDateTime.nullable(),
  expectedReturn: IsoDateTime.nullable(),
  status: OutingStatus,
  ladderLevel: LadderLevel.nullable(),
  features: OutingFeatures,
  /** Ranker outputs. */
  score: z
    .object({
      pGo: z.number(),
      enjoyment: z.number(),
      combined: z.number(),
      rank: z.number().int(),
    })
    .optional(),
  reasons: z.array(ReasonChip).default([]),
  /** One sentence for the dashboard, which says the ladder level and the honest situation. */
  reasonText: z.string().optional(),
  route: Route.optional(),
  /** First ride together: true until the adult child has ridden this route with them. */
  needsTrialRun: z.boolean().default(false),
  /** Ratings and results, filled after the outing. Never sent to external services. */
  result: z
    .object({
      went: z.boolean(),
      enjoyment: z.number().int().min(1).max(5).nullable(),
      face: z.enum(["good", "okay", "not_good"]).nullable(),
      peopleMet: z.array(z.string()).default([]),
      wouldRepeat: z.enum(["yes", "no", "maybe"]).nullable(),
      notes: z.string().optional(),
    })
    .optional(),
  weather: z
    .object({
      tempC: z.number().nullable(),
      rainChance: z.number().nullable(),
      summary: z.string(),
    })
    .optional(),
  createdAt: IsoDateTime,
});
export type Outing = z.infer<typeof Outing>;
