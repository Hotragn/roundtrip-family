import { z } from "zod";

/** Where a record came from. Every report labels results by this. */
export const Provenance = z.enum(["synthetic", "live_search", "visitor"]);
export type Provenance = z.infer<typeof Provenance>;

export const LatLng = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LatLng = z.infer<typeof LatLng>;

/** A clock time like "06:30". */
export const ClockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const TimeWindow = z.object({ start: ClockTime, end: ClockTime });
export type TimeWindow = z.infer<typeof TimeWindow>;

/** BCP 47 language code, e.g. "te", "en", "de", "zh". */
export const LanguageCode = z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/);
export type LanguageCode = z.infer<typeof LanguageCode>;

/** ISO 3166-1 alpha-2 country code, e.g. "US", "DE". */
export const CountryCode = z.string().regex(/^[A-Z]{2}$/);
export type CountryCode = z.infer<typeof CountryCode>;

export const IsoDateTime = z.iso.datetime({ offset: true });

/** ISO week like "2026-W41". */
export const IsoWeek = z.string().regex(/^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/);
export type IsoWeek = z.infer<typeof IsoWeek>;

/** Language match between a place or event and the parents: 0 none, 1 shared culture, 2 same language. */
export const LanguageMatch = z.union([z.literal(0), z.literal(1), z.literal(2)]);
export type LanguageMatch = z.infer<typeof LanguageMatch>;

/**
 * The fallback ladder from docs/plan.md section 8.
 * 1 same language, 2 shared culture, 3 language barely matters,
 * 4 programs for newcomers and older adults, 5 a regular routine.
 */
export const LadderLevel = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);
export type LadderLevel = z.infer<typeof LadderLevel>;

export const LADDER_LABELS: Record<LadderLevel, string> = {
  1: "Same language",
  2: "Shared culture",
  3: "Language barely matters",
  4: "Programs for newcomers and older adults",
  5: "A regular routine",
};

/** Travel modes, each drawn with its own travel line. */
export const TravelMode = z.enum(["sky", "rail", "sea", "bus", "walk", "car"]);
export type TravelMode = z.infer<typeof TravelMode>;
