/**
 * Opening hours, from Google Maps listings as SerpApi returns them (operating_hours: one string
 * per weekday, in the search language): "9 AM–12 PM, 5:30–8:30 PM", "10:00–20:00",
 * "Closed", "Geschlossen", "Open 24 hours", "24 Stunden geöffnet".
 * Docs: https://serpapi.com/maps-local-results
 */

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

/** Minutes since midnight; an end past 1440 runs into the next day. */
export type OpenPeriod = [number, number];

/** A day missing from the map means its hours weren't listed. An empty list means closed. */
export type WeeklyHours = Partial<Record<Weekday, OpenPeriod[]>>;

const DAY_KEYS: Record<string, Weekday> = {
  monday: "mon",
  tuesday: "tue",
  wednesday: "wed",
  thursday: "thu",
  friday: "fri",
  saturday: "sat",
  sunday: "sun",
  montag: "mon",
  dienstag: "tue",
  mittwoch: "wed",
  donnerstag: "thu",
  freitag: "fri",
  samstag: "sat",
  sonntag: "sun",
};

const CLOSED = /^(closed|geschlossen|ruhetag)$/;
const ALL_DAY = /(open 24 hours|24 stunden geöffnet|rund um die uhr)/;
const TIME = /^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/;

interface ClockTime {
  h: number;
  m: number;
  meridiem: "am" | "pm" | null;
}

function readTime(s: string): ClockTime | null {
  const t = TIME.exec(s.trim());
  if (!t) return null;
  const meridiem = t[3] ? (t[3].startsWith("a") ? "am" : "pm") : null;
  return { h: Number(t[1]), m: Number(t[2] ?? 0), meridiem };
}

function minutes(t: ClockTime, meridiem: "am" | "pm" | null): number {
  if (!meridiem) return t.h * 60 + t.m;
  const h = (t.h % 12) + (meridiem === "pm" ? 12 : 0);
  return h * 60 + t.m;
}

/** One day's text to open periods; null when the text isn't in a form we know. */
export function parsePeriods(text: string): OpenPeriod[] | null {
  const s = text.replace(/[   ]/g, " ").trim().toLowerCase();
  if (CLOSED.test(s)) return [];
  if (ALL_DAY.test(s)) return [[0, 1440]];
  const out: OpenPeriod[] = [];
  for (const part of s.split(/,|;/)) {
    const [a, b, extra] = part.split(/\s*[–—-]\s*/);
    if (!a || !b || extra !== undefined) return null;
    const from = readTime(a);
    const to = readTime(b);
    if (!from || !to) return null;
    const end = minutes(to, to.meridiem);
    // "5:30–8:30 PM": the start takes the end's AM or PM, unless that would put it after the end.
    let start = minutes(from, from.meridiem ?? to.meridiem);
    if (!from.meridiem && to.meridiem && start > end) start = minutes(from, to.meridiem === "pm" ? "am" : "pm");
    out.push([start, end <= start ? end + 1440 : end]);
  }
  return out.length ? out : null;
}

/** The listing's weekly hours, or null when there are none or none could be read. */
export function parseOpeningHours(raw: unknown): WeeklyHours | null {
  if (!raw || typeof raw !== "object") return null;
  const hours: WeeklyHours = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const day = DAY_KEYS[k.trim().toLowerCase()];
    if (!day || typeof v !== "string") continue;
    const periods = parsePeriods(v);
    if (periods) hours[day] = periods;
  }
  return Object.keys(hours).length ? hours : null;
}

/** Leave a little before closing, so nobody is hurried out. */
export const CLOSING_MARGIN = 10;

/**
 * Whether a visit fits that day's hours: they arrive while it's open and have at least
 * `minStay` minutes before closing. The stay shrinks to fit when the place closes sooner.
 */
export function fitVisit(
  hours: WeeklyHours | null | undefined,
  day: Weekday,
  arrive: number,
  stay: number,
  minStay: number,
): { ok: true; stay: number } | { ok: false; why: string } {
  const periods = hours?.[day];
  if (!periods) return { ok: true, stay };
  if (periods.length === 0) return { ok: false, why: `closed on ${DAY_LONG[day]}s` };
  const open = periods.find(([s, e]) => arrive >= s && arrive < e);
  if (!open) {
    const next = periods.find(([s]) => s > arrive);
    return { ok: false, why: next ? `opens at ${clock(next[0])}` : `closed by ${clock(arrive)}` };
  }
  const room = open[1] - CLOSING_MARGIN - arrive;
  if (room < minStay) return { ok: false, why: `closes at ${clock(open[1])}` };
  return { ok: true, stay: Math.min(stay, room) };
}

export const DAY_LONG: Record<Weekday, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

const clock = (m: number) => {
  const d = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(d / 60)).padStart(2, "0")}:${String(d % 60).padStart(2, "0")}`;
};

/** "08:30 to 10:00 and 18:00 to 19:30", "open all day", or "closed". */
export function describePeriods(periods: OpenPeriod[] | undefined): string | null {
  if (!periods) return null;
  if (periods.length === 0) return "closed";
  if (periods.length === 1 && periods[0]![0] === 0 && periods[0]![1] >= 1440) return "open all day";
  return periods.map(([s, e]) => `${clock(s)} to ${clock(e)}`).join(" and ");
}
