import { z } from "zod";
import { IsoDateTime, IsoWeek, LadderLevel, LanguageCode, LanguageMatch, LatLng, Provenance } from "./common";

export const Photo = z.object({
  url: z.url(),
  /** Shown under the photo, e.g. "Photo: Google Maps contributor". */
  credit: z.string(),
});
export type Photo = z.infer<typeof Photo>;

export const PlaceType = z.enum([
  "temple",
  "place_of_worship",
  "community_center",
  "senior_center",
  "library",
  "indian_grocery",
  "asian_grocery",
  "grocery",
  "park",
  "walking_trail",
  "garden",
  "farmers_market",
  "museum",
  "cultural_association",
  "class",
  "volunteering",
  "neighbor_home",
  "friend_home",
  "cafe",
  "restaurant",
  "mall",
  "warehouse_store",
  "supermarket",
  "pharmacy",
  "transit_stop",
  "other",
]);
export type PlaceType = z.infer<typeof PlaceType>;

export const Place = z.object({
  _id: z.string(),
  provenance: Provenance,
  name: z.string(),
  type: PlaceType,
  address: z.string(),
  location: LatLng,
  languageTags: z.array(LanguageCode),
  languageMatch: LanguageMatch,
  ladderLevel: LadderLevel,
  description: z.string(),
  photo: Photo.optional(),
  hours: z.string().optional(),
  rating: z.number().optional(),
  /** SerpApi place_id or data_id, kept to dedupe across searches. */
  sourceId: z.string().optional(),
  source: z.string(),
  /** Area this place was found for, e.g. "fremont-ca". */
  areaKey: z.string(),
  embedding: z.array(z.number()).optional(),
  fetchedAt: IsoDateTime,
});
export type Place = z.infer<typeof Place>;

export const EventCategory = z.enum([
  "festival",
  "association_meeting",
  "film_screening",
  "religious",
  "senior_program",
  "library_program",
  "conversation_circle",
  "walking_group",
  "market",
  "class",
  "volunteering",
  "music_dance",
  "talk",
  "other",
]);
export type EventCategory = z.infer<typeof EventCategory>;

export const Cost = z.object({
  free: z.boolean(),
  amount: z.number().min(0).nullable(),
  currency: z.string().length(3),
});
export type Cost = z.infer<typeof Cost>;

/** The fields event understanding extracts from a raw listing. */
export const EventUnderstanding = z.object({
  languageMatch: LanguageMatch,
  suitsOlderAdults: z.boolean(),
  indoor: z.boolean().nullable(),
  cost: Cost,
  category: EventCategory,
  start: IsoDateTime.nullable(),
  end: IsoDateTime.nullable(),
});
export type EventUnderstanding = z.infer<typeof EventUnderstanding>;

export const EventRecord = z.object({
  _id: z.string(),
  provenance: Provenance,
  source: z.string(),
  sourceId: z.string().optional(),
  title: z.string(),
  description: z.string(),
  link: z.url().optional(),
  week: IsoWeek,
  areaKey: z.string(),
  venue: z.object({ name: z.string(), address: z.string(), location: LatLng.optional() }),
  understanding: EventUnderstanding,
  ladderLevel: LadderLevel,
  photo: Photo.optional(),
  embedding: z.array(z.number()).optional(),
  /** The raw search result, kept for audits. */
  raw: z.unknown().optional(),
  fetchedAt: IsoDateTime,
});
export type EventRecord = z.infer<typeof EventRecord>;
