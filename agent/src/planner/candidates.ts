import { createHash } from "node:crypto";
import type { EventUnderstanding, LadderLevel, LatLng, OutingFeatures } from "@roundtrip/core";
import { parseOpeningHours, type WeeklyHours } from "@roundtrip/core/hours";
import { levelFor } from "../discovery/ladder";
import type { RawEvent, RawPlace } from "../tools/discovery";

/**
 * Candidate outings from discovery results, with the ranker's feature row. Features never hold
 * names or addresses; the title and venue stay on the candidate for display only.
 */

export interface Candidate {
  id: string;
  kind: "place" | "event";
  title: string;
  venueName: string;
  address: string;
  location: LatLng | null;
  ladderLevel: LadderLevel;
  languageMatch: 0 | 1 | 2;
  category: string;
  indoor: boolean | null;
  costUsd: number;
  foodAvailable: boolean;
  languageNeeded: boolean;
  groupSize: OutingFeatures["groupSize"];
  description: string;
  photo?: { url: string; credit: string };
  /** For events: when it happens. For places: null (the planner picks a slot). */
  start: string | null;
  end: string | null;
  /** For places: the listed weekly opening hours, or null when none were listed. */
  hours: WeeklyHours | null;
  suitsOlderAdults: boolean;
  provenance: "live_search" | "synthetic";
  query: string;
}

interface PlaceKind {
  category: string;
  level: LadderLevel;
  indoor: boolean;
  costUsd: number;
  food: boolean;
  languageNeeded: boolean;
  group: OutingFeatures["groupSize"];
}

/** Defaults by kind of place. A place's own description can raise its language match. */
export const PLACE_KINDS: Record<string, PlaceKind> = {
  "Hindu temple": {
    category: "temple",
    level: 2,
    indoor: true,
    costUsd: 0,
    food: true,
    languageNeeded: false,
    group: "large",
  },
  "Hindu Tempel": {
    category: "temple",
    level: 2,
    indoor: true,
    costUsd: 0,
    food: true,
    languageNeeded: false,
    group: "large",
  },
  "Indian grocery store": {
    category: "indian_grocery",
    level: 2,
    indoor: true,
    costUsd: 30,
    food: false,
    languageNeeded: false,
    group: "medium",
  },
  "Indischer Supermarkt": {
    category: "indian_grocery",
    level: 2,
    indoor: true,
    costUsd: 30,
    food: false,
    languageNeeded: false,
    group: "medium",
  },
  "park walking trail": {
    category: "park",
    level: 3,
    indoor: false,
    costUsd: 0,
    food: false,
    languageNeeded: false,
    group: "medium",
  },
  Park: { category: "park", level: 3, indoor: false, costUsd: 0, food: false, languageNeeded: false, group: "medium" },
  "farmers market": {
    category: "farmers_market",
    level: 3,
    indoor: false,
    costUsd: 15,
    food: true,
    languageNeeded: true,
    group: "large",
  },
  Wochenmarkt: {
    category: "farmers_market",
    level: 3,
    indoor: false,
    costUsd: 15,
    food: true,
    languageNeeded: true,
    group: "large",
  },
  "senior center": {
    category: "senior_center",
    level: 4,
    indoor: true,
    costUsd: 0,
    food: false,
    languageNeeded: true,
    group: "medium",
  },
  Seniorentreff: {
    category: "senior_center",
    level: 4,
    indoor: true,
    costUsd: 0,
    food: false,
    languageNeeded: true,
    group: "medium",
  },
  "public library": {
    category: "library",
    level: 4,
    indoor: true,
    costUsd: 0,
    food: false,
    languageNeeded: false,
    group: "small",
  },
  Stadtbibliothek: {
    category: "library",
    level: 4,
    indoor: true,
    costUsd: 0,
    food: false,
    languageNeeded: false,
    group: "small",
  },
};

/** The kind of venue each query should return; offices, foundations and apartments are dropped. */
const EXPECTED_TYPE: Record<string, RegExp> = {
  "Hindu temple": /hindu/i,
  "Hindu Tempel": /hindu/i,
  "Indian grocery store": /indian grocery|grocery|supermarket/i,
  "Indischer Supermarkt": /lebensmittel|supermarkt|asia|indisch|grocery/i,
  "park walking trail": /park|trail|hiking|nature preserve|lake/i,
  Park: /park|garten|grünanlage/i,
  "farmers market": /farmers'? market|produce market|market/i,
  Wochenmarkt: /markt|market/i,
  "senior center": /senior citizen center|senior center|community center/i,
  Seniorentreff: /senior|begegnungsstätte|treff/i,
  "public library": /public library/i,
  Stadtbibliothek: /bibliothek|bücherei|library/i,
};

/** A real public venue of the expected kind, with enough reviews to be sure it's open to visitors. */
export function isGoodPlace(p: RawPlace): boolean {
  const re = EXPECTED_TYPE[p.query];
  return Boolean(p.location) && (!re || re.test(p.type)) && (p.reviews ?? 0) >= 10;
}

/** Lower is better: distance, with a small pull toward well-known places. */
export function placeOrder(p: RawPlace, home: LatLng): number {
  return haversineKm(home, p.location!) - 0.8 * Math.log10((p.reviews ?? 0) + 1);
}

/** Language match for a place, from what the place itself says. */
export function placeLanguageMatch(p: RawPlace, kind: PlaceKind, languageName: string): 0 | 1 | 2 {
  const text = `${p.title} ${p.description ?? ""} ${p.types.join(" ")}`;
  if (new RegExp(languageName, "i").test(text)) return 2;
  if (kind.level === 2) return 1;
  return 0;
}

/** Short, stable ids: "pl_" or "ev_" and eight hex characters of the source id. */
export function shortId(kind: "place" | "event", sourceId: string): string {
  return `${kind === "place" ? "pl" : "ev"}_${createHash("sha256").update(sourceId).digest("hex").slice(0, 8)}`;
}

export function candidateFromPlace(p: RawPlace, languageName: string): Candidate | null {
  const kind = PLACE_KINDS[p.query];
  if (!kind || !p.location) return null;
  const languageMatch = placeLanguageMatch(p, kind, languageName);
  return {
    id: shortId("place", p.sourceId),
    kind: "place",
    title: p.title,
    venueName: p.title,
    address: p.address,
    location: p.location,
    ladderLevel: languageMatch === 2 ? 1 : kind.level,
    languageMatch,
    category: kind.category,
    indoor: kind.indoor,
    costUsd: kind.costUsd,
    foodAvailable: kind.food,
    languageNeeded: kind.languageNeeded,
    groupSize: kind.group,
    description: p.description ?? p.type,
    photo: p.thumbnail ? { url: p.thumbnail, credit: "Photo: Google Maps contributor" } : undefined,
    start: null,
    end: null,
    hours: parseOpeningHours(p.openingHours),
    suitsOlderAdults: true,
    provenance: "live_search",
    query: p.query,
  };
}

export function candidateFromEvent(e: RawEvent, u: EventUnderstanding, location: LatLng | null): Candidate {
  return {
    id: shortId("event", e.sourceId),
    kind: "event",
    title: e.title,
    venueName: e.venueName,
    address: e.address,
    location,
    ladderLevel: levelFor(u.languageMatch, u.category),
    languageMatch: u.languageMatch,
    category: u.category === "festival" || u.category === "religious" ? "community_event" : u.category,
    indoor: u.indoor,
    costUsd: u.cost.free ? 0 : (u.cost.amount ?? 0),
    foodAvailable: u.category === "festival" || u.category === "religious",
    languageNeeded: false,
    groupSize: u.category === "festival" ? "large" : "medium",
    description: e.description,
    photo: e.thumbnail ? { url: e.thumbnail, credit: "Image: event listing" } : undefined,
    start: u.start,
    end: u.end,
    hours: null,
    suitsOlderAdults: u.suitsOlderAdults,
    provenance: "live_search",
    query: e.query,
  };
}

const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * Merges candidates that are the same venue (an event at a place found separately): the event
 * keeps its date, and gains the place's location when it has none.
 */
export function mergeCandidates(list: Candidate[]): Candidate[] {
  const out: Candidate[] = [];
  for (const c of list) {
    const twin = out.find(
      (o) => norm(o.title) === norm(c.title) || (o.kind !== c.kind && norm(o.venueName) === norm(c.venueName)),
    );
    if (!twin) {
      out.push(c);
      continue;
    }
    const event = twin.kind === "event" ? twin : c.kind === "event" ? c : twin;
    const place = event === twin ? c : twin;
    const merged = { ...event, location: event.location ?? place.location, photo: event.photo ?? place.photo };
    out[out.indexOf(twin)] = merged;
  }
  return out;
}

/** Straight-line distance in km. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Travel estimate before real directions exist: walking under 1 km, otherwise a bus at about
 * 19 km/h including stops, plus walking at each end. Replaced by the route once fetched.
 */
export function estimateTravel(
  from: LatLng,
  to: LatLng | null,
): { minutes: number | null; transfers: number | null; walking: number | null } {
  if (!to) return { minutes: null, transfers: null, walking: null };
  const km = haversineKm(from, to) * 1.3;
  if (km < 1) return { minutes: Math.round((km / 4.5) * 60), transfers: 0, walking: Math.round((km / 4.5) * 60) };
  return { minutes: Math.round(8 + (km / 19) * 60), transfers: km > 7 ? 1 : 0, walking: 8 };
}

/** Walk when the trip is under about a kilometer on foot, otherwise bus. */
export function tripMode(from: LatLng, to: LatLng | null): "walk" | "bus" | null {
  if (!to) return null;
  return haversineKm(from, to) * 1.3 < 1 ? "walk" : "bus";
}

export interface SlotContext {
  home: LatLng;
  day: OutingFeatures["dayOfWeek"];
  startHour: number;
  weather: { label: string; tempC: number; rainChance: number };
  knowsSomeone: boolean;
  withAdultChild: boolean;
  daysSinceLastOuting: number;
  travelOverride?: { minutes: number; transfers: number; walking: number };
}

export function featuresFor(c: Candidate, ctx: SlotContext): OutingFeatures {
  const t = ctx.travelOverride ?? estimateTravel(ctx.home, c.location);
  return {
    category: c.category,
    languageMatch: c.languageMatch,
    travelMinutes: t.minutes,
    transfers: t.transfers,
    walkingMinutes: t.walking,
    startHour: ctx.startHour,
    dayOfWeek: ctx.day,
    weather: c.indoor
      ? ctx.weather.label === "hot" || ctx.weather.label === "very_hot"
        ? "air_conditioned"
        : ctx.weather.label
      : ctx.weather.label,
    temperatureC: ctx.weather.tempC,
    rainChance: ctx.weather.rainChance,
    indoor: c.indoor,
    groupSize: c.groupSize,
    costUsd: c.costUsd,
    knowsSomeone: ctx.knowsSomeone,
    foodAvailable: c.foodAvailable,
    daysSinceLastOuting: ctx.daysSinceLastOuting,
    withAdultChild: ctx.withAdultChild,
    languageNeeded: c.languageNeeded,
  };
}
