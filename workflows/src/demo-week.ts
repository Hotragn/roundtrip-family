import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WORKFLOW } from "@roundtrip/agent/email";
import { type Household, isoWeek } from "@roundtrip/core";
import { loadFremontPersona, loadMunichHousehold } from "@roundtrip/core/persona";
import { repoRoot } from "@roundtrip/core/server-env";
import type { Proposal } from "./contract";

/**
 * The saved plan for the demo households: the week the parents' app shows
 * (data/demo/weeks/, from scripts/build-week.ts) and the planner's swap options
 * (data/demo/plans/). weekPlan replays it onto the week being planned, keeping each outing's
 * day and times, so the demo works in any week. Families synthetic; places and routes from
 * live searches.
 */

interface SavedOuting {
  id: string;
  venue: string;
  date: string;
  slot: { day: string; depart: number; back: number; withAdultChild: boolean };
  parentIds: string[];
  withAdultChild: boolean;
  firstRideTogether: boolean;
  reasonText: string;
  ladderLabel: string;
  route: { legs: Array<{ mode: string; line?: { name: string } }> } | null;
}

export interface SavedWeek {
  provenance: "synthetic";
  household: {
    slug: string;
    timezone: string;
    emergency: { number: string; covers: string };
    secondaryEmergency: { number: string; covers: string } | null;
    safety: { bufferMinutes: number; nudgeWaitMinutes: number };
  };
  parents: Array<{ id: string; firstName: string; role: "mother" | "father" }>;
  week: { key: string; monday: string; label: string };
  planNote: string;
  outings: SavedOuting[];
}

interface PlanSuggestion {
  id: string;
  candidate: { title: string; venueName: string };
  parentIds: string[];
  slot: { day: string; depart: number; back: number; withAdultChild: boolean };
  reasonText: string;
  ladderLabel: string;
  firstRideTogether: boolean;
}

interface SavedPlan {
  alternatives?: Record<string, PlanSuggestion[]>;
}

export interface Saved {
  slug: string;
  week: SavedWeek;
  plan: SavedPlan;
  household: Household;
}

const HOUSEHOLDS: Record<string, { plan: string; bundle: (root: string) => { household: Household } }> = {
  "fremont-demo": { plan: "fremont", bundle: loadFremontPersona },
  "munich-demo": { plan: "munich", bundle: loadMunichHousehold },
};

export function loadSaved(slug: string, root = repoRoot()): Saved {
  const known = HOUSEHOLDS[slug];
  if (!known) throw new Error(`No saved plan for household "${slug}".`);
  const read = <T>(path: string) => JSON.parse(readFileSync(join(root, path), "utf8")) as T;
  return {
    slug,
    week: read<SavedWeek>(`data/demo/weeks/${slug}.json`),
    plan: read<SavedPlan>(`data/demo/plans/${known.plan}.json`),
    household: known.bundle(root).household,
  };
}

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function addDays(date: string, days: number): string {
  const t = new Date(`${date}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

/** The local date and minutes since midnight of an instant, in a time zone. */
export function localParts(at: Date, timeZone: string): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

/** The instant of a local date and time in a time zone (correct across daylight saving changes). */
export function zonedInstant(date: string, minutes: number, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const wall = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  let guess = wall;
  for (let i = 0; i < 3; i++) {
    const seen = localParts(new Date(guess), timeZone);
    const [sy, sm, sd] = seen.date.split("-").map(Number) as [number, number, number];
    const seenWall = Date.UTC(sy, sm - 1, sd, Math.floor(seen.minutes / 60), seen.minutes % 60);
    if (seenWall === wall) break;
    guess += wall - seenWall;
  }
  return new Date(guess);
}

/** The Monday after `now` in the household's time zone: the week a Sunday-evening plan is for. */
export function nextMonday(now: Date, timeZone: string): string {
  const today = localParts(now, timeZone).date;
  const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday 0
  return addDays(today, 7 - dow);
}

/** "Monday 12 October" */
export function dayLabel(date: string): string {
  const t = new Date(`${date}T12:00:00Z`);
  return `${DAY_NAMES[(t.getUTCDay() + 6) % 7]} ${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]}`;
}

/** "12 to 18 October 2026", "28 September to 4 October 2026" */
export function weekLabel(monday: string): string {
  const a = new Date(`${monday}T12:00:00Z`);
  const b = new Date(`${addDays(monday, 6)}T12:00:00Z`);
  const left =
    a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCDate()}` : `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]}`;
  return `${left} to ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
}

export const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** An outing from the saved week or one of the planner's swap options, by id. */
export interface SavedChoice {
  outingId: string;
  place: string;
  parentIds: string[];
  day: string;
  depart: number;
  back: number;
  withAdultChild: boolean;
  firstRideTogether: boolean;
  reasonText: string;
  ladderLabel: string;
  routeLines: string[];
}

export function findChoice(saved: Saved, outingId: string): SavedChoice | null {
  const o = saved.week.outings.find((x) => x.id === outingId);
  if (o) {
    return {
      outingId: o.id,
      place: o.venue,
      parentIds: o.parentIds,
      day: o.slot.day,
      depart: o.slot.depart,
      back: o.slot.back,
      withAdultChild: o.withAdultChild,
      firstRideTogether: o.firstRideTogether,
      reasonText: o.reasonText,
      ladderLabel: o.ladderLabel,
      routeLines: (o.route?.legs ?? []).filter((l) => l.line?.name).map((l) => l.line!.name),
    };
  }
  for (const list of Object.values(saved.plan.alternatives ?? {})) {
    const s = list.find((x) => x.id === outingId);
    if (s) return fromSuggestion(s);
  }
  return null;
}

function fromSuggestion(s: PlanSuggestion): SavedChoice {
  return {
    outingId: s.id,
    place: s.candidate.venueName || s.candidate.title.replace(/\s+[-|]\s+.*$/, ""),
    parentIds: s.parentIds,
    day: s.slot.day,
    depart: s.slot.depart,
    back: s.slot.back,
    withAdultChild: s.slot.withAdultChild,
    firstRideTogether: s.firstRideTogether,
    reasonText: s.reasonText,
    ladderLabel: s.ladderLabel,
    routeLines: [],
  };
}

/** The planner's next option for an outing that wasn't used yet, or null. */
export function nextAlternative(saved: Saved, outingId: string, exclude: string[]): SavedChoice | null {
  // A swapped outing's options are listed under the outing it first replaced.
  const list = saved.plan.alternatives?.[outingId] ?? [];
  const next = list.find((s) => !exclude.includes(s.id));
  return next ? fromSuggestion(next) : null;
}

/** The outing placed on the week being planned. */
export function proposalFor(c: SavedChoice, weekStart: string, timeZone: string): Proposal {
  const date = addDays(weekStart, Math.max(0, DAYS.indexOf(c.day as (typeof DAYS)[number])));
  return {
    outingId: c.outingId,
    parentIds: c.parentIds,
    day: c.day,
    date,
    departAt: zonedInstant(date, c.depart, timeZone).toISOString(),
    backAt: zonedInstant(date, c.back, timeZone).toISOString(),
    withAdultChild: c.withAdultChild,
    firstRideTogether: c.firstRideTogether,
    safetyWorkflowId: WORKFLOW.outingSafety(c.outingId),
    trialRunWorkflowId: WORKFLOW.trialRun(c.outingId),
  };
}

const LEADS = new Set([
  "In their language.",
  "Shared culture.",
  "No language needed.",
  "A program for newcomers and older adults.",
  "A regular routine.",
]);
const TRIP = /^(By |An? \d+-minute walk|With you on )/;

/** The planner's one line on why they'd like it, without the ladder lead or the trip. */
export function oneLineReason(c: SavedChoice): string {
  const sentences = c.reasonText.split(/(?<=\.)\s+/).map((s) => s.trim());
  const line = sentences.find((s) => s && !LEADS.has(s) && !TRIP.test(s) && !/nearby this week\.$/.test(s));
  return line ?? `${c.ladderLabel}.`;
}

/** How they get there: "By Bus 211, about 20 minutes each way", "A 14-minute walk". */
export function travelLine(c: SavedChoice): string {
  const trip = c.reasonText
    .split(/(?<=\.)\s+/)
    .map((s) => s.trim())
    .find((s) => TRIP.test(s));
  if (trip) return trip.replace(/,\s*back by \d{1,2}:\d{2}\.?$/, "").replace(/\.$/, "");
  if (c.routeLines.length) return `By ${c.routeLines.join(", then ")}`;
  return c.withAdultChild ? "With you" : "";
}

export function weekKeyOf(weekStart: string): string {
  return isoWeek(weekStart);
}
