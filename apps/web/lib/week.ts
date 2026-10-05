/**
 * The week the parents' app shows, as built by scripts/build-week.ts. One file per household,
 * cached on the phone so every screen works offline.
 */

export interface StepView {
  text: string;
  mode: "walk" | "bus" | "rail" | "wait" | "arrive";
  stops?: number;
  signWords: string[];
  audio?: string;
}

export interface PhraseView {
  id: string;
  local: string;
  pronunciation: string;
  meaning: string;
  audio?: { local?: string };
}

export interface CardView {
  parentId: string;
  role: "mother" | "father";
  title: string;
  body: string;
  writer: { kind: string; model: string; latencyMs?: number };
  rubric: { passed: boolean; failures: string[]; words: number; scriptOk: boolean };
  phrases: PhraseView[];
  driver: { lead: string; stopName: string; thanks: string };
  steps: StepView[];
  audio?: { title?: string; body?: string };
}

export interface LegView {
  mode: "walk" | "bus" | "rail" | "sky" | "sea" | "car";
  from: { name: string; location?: { lat: number; lng: number } };
  to: { name: string; location?: { lat: number; lng: number } };
  durationMinutes: number;
  line?: { name: string; headsign?: string; agency?: string };
  numStops?: number;
  departureTime?: string;
  arrivalTime?: string;
  stopsBetween?: Array<{ name: string; location?: { lat: number; lng: number } }>;
  stopBefore?: { name: string; location?: { lat: number; lng: number } };
  instructions: string[];
  path?: Array<{ lat: number; lng: number }>;
}

export interface OutingView {
  id: string;
  status: "approved" | "suggested";
  venue: string;
  title: string;
  address: string;
  location: { lat: number; lng: number } | null;
  category: string;
  indoor: boolean | null;
  ladderLevel: number;
  ladderLabel: string;
  reasonText: string;
  chips: Array<{ label: string; direction: string; feature?: string }>;
  score: { combined: number; pGo: number; enjoyment: number; rank: number };
  role: "mother" | "father" | "both";
  parentIds: string[];
  date: string;
  slot: { day: string; depart: number; back: number; withAdultChild: boolean };
  withAdultChild: boolean;
  firstRideTogether: boolean;
  bringSomeone: { personId: string; label: string; why: string } | null;
  joinCard: { kind: string; local: string; meaning: string; askWho: string } | null;
  photo: { url: string; credit: string } | null;
  landmarkPhotos: string[];
  route: { legs: LegView[]; totalMinutes: number; transfers: number; walkingMinutes: number; source: string } | null;
  cards: CardView[];
}

export interface WeekView {
  provenance: "synthetic";
  note: string;
  household: {
    id: string;
    slug: string;
    hostCountry: string;
    localLanguage: string;
    timezone: string;
    metroArea: string;
    homeArea: string;
    helpCardText: string;
    localPhrases: { helpTitle: string; myName: string; stayingNear: string; callFamily: string; askWay: string };
    contact: { role: string; label: string; phone: string; fictional: boolean };
    emergency: { number: string; covers: string; source: string };
    secondaryEmergency: { number: string; covers: string; source: string } | null;
    safety: { bufferMinutes: number; nudgeWaitMinutes: number };
  };
  parents: Array<{
    id: string;
    firstName: string;
    addressAs: string;
    role: "mother" | "father";
    language: string;
    readingSupport: string;
  }>;
  people: Array<{
    id: string;
    label: string;
    relation: string;
    language: string;
    knownParentIds: string[];
    words: Array<{ id: string; local: string; romanized: string; pronunciation: string; meaning: string }>;
  }>;
  feelingWords: Array<{ feeling: string; words: string[] }>;
  week: { key: string; monday: string; label: string };
  planNote: string;
  outings: OutingView[];
}

export const DEMO_HOUSEHOLDS = [
  { slug: "fremont-demo", label: "Fremont, California", note: "Sarala and Venkat (fictional)" },
  { slug: "munich-demo", label: "München, Deutschland", note: "Kamala and Raghu (fictional)" },
] as const;

export type HouseholdSlug = (typeof DEMO_HOUSEHOLDS)[number]["slug"];

/** The demo clock: the demo week is planned for 5 to 11 October 2026; "now" is Monday morning. */
export const DEMO_NOW = { date: "2026-10-05", minutes: 8 * 60 + 10 };

/**
 * Place photos from search results come at 1000 x 1000. Ask Google's image server for the size
 * the ticket shows (640 x 360 covers a phone at 2x), as WebP at quality 60: about a seventh of the
 * bytes, which matters on a phone's first load.
 * The same URL is used to warm the offline cache, so both must go through here.
 */
export function placePhoto(url: string, w = 640, h = 360): string {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith("googleusercontent.com")) return url;
    return url.replace(/=[\w-]+$/, `=w${w}-h${h}-c-rw-l60`);
  } catch {
    return url;
  }
}

export const fmtTime = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Ticket order for one parent: today's first, then the rest of the week. */
export function outingsFor(week: WeekView, parentId: string): OutingView[] {
  return week.outings
    .filter((o) => o.status === "approved" && o.parentIds.includes(parentId))
    .sort((a, b) => a.date.localeCompare(b.date) || a.slot.depart - b.slot.depart);
}

export function cardFor(o: OutingView, parentId: string): CardView | undefined {
  return o.cards.find((c) => c.parentId === parentId) ?? o.cards[0];
}

/**
 * What one parent's phone needs: their approved outings with only their own card, and only the
 * people they know. The ranking details (scores, reasons, chips) stay on the dashboard. Keeps
 * the page small, since the week travels inside the HTML.
 */
export function forParent(week: WeekView, parentId: string): WeekView {
  return {
    ...week,
    people: week.people.filter((p) => p.knownParentIds.includes(parentId)),
    outings: outingsFor(week, parentId).map((o) => ({
      ...o,
      reasonText: "",
      chips: [],
      score: { combined: 0, pGo: 0, enjoyment: 0, rank: 0 },
      route: o.route ? { ...o.route, legs: o.route.legs.map(({ path: _path, ...leg }) => leg) } : null,
      cards: [cardFor(o, parentId)].filter((c): c is CardView => Boolean(c)),
    })),
  };
}
