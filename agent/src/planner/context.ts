import type { Household, Outing, OutingFeatures, Parent, Person } from "@roundtrip/core";
import { clockMinutes } from "@roundtrip/core";
import { type Candidate, estimateTravel, featuresFor } from "./candidates";
import { anonymizedPerson } from "./people";
import { DAYS, type Day, type Feasibility, findSlot, fmt, weatherBlocks } from "./slots";

/**
 * Everything the planner knows for one week. Prompts to Gemma use roles ("mother", "father"),
 * never first names, and the people memory is described without names.
 */

export interface DayWeather {
  label: string;
  tempC: number;
  rainChance: number;
  heatAdvisory?: boolean;
  ice?: boolean;
  heavySnow?: boolean;
}

export interface WeekInfo {
  key: string;
  /** Monday of the week, YYYY-MM-DD. */
  monday: string;
  month: number;
  label: string;
}

export interface PlannerContext {
  household: Household;
  parents: Parent[];
  people: Person[];
  pastOutings: Outing[];
  week: WeekInfo;
  weather: Record<Day, DayWeather>;
  candidates: Candidate[];
  /** Routes the adult child has already ridden with them. */
  soloReadyRoutes: string[];
  languageName: string;
  log: Array<{ tool: string; ms: number; detail: string }>;
  /** Planning notes the agent chose to remember, without names. */
  notes: string[];
}

export type Role = "mother" | "father";

export function roleOf(p: Parent): Role {
  return p.addressAs.includes("నాన్న") ? "father" : "mother";
}

export function parentByRole(ctx: PlannerContext, role: Role): Parent {
  const p = ctx.parents.find((x) => roleOf(x) === role) ?? ctx.parents[0];
  if (!p) throw new Error("Household has no parents.");
  return p;
}

const STAY: Record<string, number> = {
  temple: 90,
  indian_grocery: 50,
  asian_grocery: 50,
  park: 60,
  farmers_market: 60,
  senior_center: 90,
  library: 75,
  community_event: 120,
};

function eventDay(c: Candidate, monday: string): { day: Day; start: number; end: number | null } | null {
  if (!c.start) return null;
  const date = c.start.slice(0, 10);
  const idx = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${monday}T00:00:00Z`)) / 86_400_000);
  if (idx < 0 || idx > 6) return null;
  const end = c.end ? clockMinutes(c.end.slice(11, 16)) : null;
  return { day: DAYS[idx]!, start: clockMinutes(c.start.slice(11, 16)), end };
}

export interface CandidateView {
  id: string;
  name: string;
  kind: "place" | "event";
  level: number;
  category: string;
  languageMatch: number;
  indoor: boolean | null;
  costUsd: number;
  travelMinutes: number | null;
  when: string | null;
  mother: string;
  father: string;
}

export interface Planned {
  candidate: Candidate;
  role: Role;
  feasibility: Feasibility;
  features: OutingFeatures;
}

/** Feasibility and the ranker's feature row for one candidate and one parent. */
export function plan(ctx: PlannerContext, c: Candidate, role: Role, opts: { excludeDays?: Day[] } = {}): Planned {
  const p = parentByRole(ctx, role);
  const home = ctx.household.homeArea.nearestStop.location;
  const t = estimateTravel(home, c.location);
  const ev = eventDay(c, ctx.week.monday);
  const travel = t.minutes ?? 999;
  const stay = ev?.end ? Math.max(30, ev.end - ev.start) : (STAY[c.category] ?? 75);
  const feasibility: Feasibility =
    c.location === null
      ? { ok: false, why: ["no map location for the venue"] }
      : !c.suitsOlderAdults
        ? { ok: false, why: ["not suited to older adults"] }
        : findSlot(
            ctx.household,
            p,
            {
              travelMinutes: travel,
              walkingMinutes: t.walking ?? 0,
              stayMinutes: stay,
              // A shorter visit is still worth it when the place closes sooner: about 60% of the usual stay.
              minStayMinutes: Math.max(30, Math.round(stay * 0.6)),
              hours: ev ? null : c.hours,
              fixed: ev ? { day: ev.day, startMinutes: ev.start, endMinutes: ev.end } : undefined,
              outdoor: c.indoor === false,
              excludeDays: opts.excludeDays,
            },
            ctx.week.month,
          );
  if (feasibility.ok && feasibility.slot) {
    const w = ctx.weather[feasibility.slot.day];
    const blocked = w ? weatherBlocks(ctx.household, p, w, c.indoor === false) : null;
    if (blocked) {
      feasibility.ok = false;
      feasibility.why.push(blocked);
    }
  }
  if (travel > 60) {
    feasibility.ok = false;
    feasibility.why.push(`${travel} minutes each way is too far`);
  }
  const slot = feasibility.slot;
  const w = (slot && ctx.weather[slot.day]) || { label: "pleasant", tempC: 22, rainChance: 0.05 };
  const knows = ctx.people.some((person) => person.knownParentIds.includes(p._id) && c.category === "asian_grocery");
  const features = featuresFor(c, {
    home,
    day: slot?.day ?? "wed",
    startHour: slot ? Math.floor(slot.depart / 60) : 10,
    weather: { label: w.label, tempC: w.tempC, rainChance: w.rainChance },
    knowsSomeone: knows,
    // Every candidate is scored as a solo outing. In the persona's history every 5-star outing had
    // the adult child along, so scoring weekend family slots with that flag would inflate them.
    withAdultChild: false,
    daysSinceLastOuting: 3,
  });
  return { candidate: c, role, feasibility, features };
}

const DAY_NAME: Record<Day, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

export function describeFeasibility(f: Feasibility): string {
  if (!f.ok || !f.slot) return `not this week: ${f.why.join("; ")}`;
  const s = f.slot;
  return `${s.withAdultChild ? "with you, " : "on their own, "}${DAY_NAME[s.day]} leave ${fmt(s.depart)}, back ${fmt(s.back)}`;
}

export function viewOf(ctx: PlannerContext, c: Candidate): CandidateView {
  const home = ctx.household.homeArea.nearestStop.location;
  const ev = eventDay(c, ctx.week.monday);
  return {
    id: c.id,
    name: c.title,
    kind: c.kind,
    level: c.ladderLevel,
    category: c.category,
    languageMatch: c.languageMatch,
    indoor: c.indoor,
    costUsd: c.costUsd,
    travelMinutes: estimateTravel(home, c.location).minutes,
    when: ev ? `${DAY_NAME[ev.day]} ${fmt(ev.start)}` : null,
    mother: describeFeasibility(plan(ctx, c, "mother").feasibility),
    father: describeFeasibility(plan(ctx, c, "father").feasibility),
  };
}

/** The people memory, described without names, for prompts to hosted models. */
export function anonymizedPeople(ctx: PlannerContext): string[] {
  return ctx.people.map((p) => anonymizedPerson(p, ctx.parents));
}

/** What the past outings say, in kinds of places and ratings only. */
export function pastSummary(ctx: PlannerContext): string {
  const went = ctx.pastOutings.filter((o) => o.result?.went && o.result.enjoyment !== null);
  const by = new Map<string, number[]>();
  for (const o of went) by.set(o.features.category, [...(by.get(o.features.category) ?? []), o.result!.enjoyment!]);
  const rows = [...by.entries()]
    .map(([k, v]) => ({ k, avg: v.reduce((a, b) => a + b, 0) / v.length, n: v.length }))
    .sort((a, b) => b.avg - a.avg);
  const missed = ctx.pastOutings.filter((o) => o.result && !o.result.went).map((o) => o.features.category);
  return [
    `Loved: ${
      rows
        .filter((r) => r.avg >= 4.5)
        .map((r) => `${r.k} (${r.n})`)
        .join(", ") || "none yet"
    }.`,
    `Liked: ${
      rows
        .filter((r) => r.avg >= 3.5 && r.avg < 4.5)
        .map((r) => r.k)
        .join(", ") || "none"
    }.`,
    `Disliked: ${
      rows
        .filter((r) => r.avg < 2.5)
        .map((r) => r.k)
        .join(", ") || "none"
    }.`,
    missed.length ? `Wanted to go but couldn't get there alone: ${missed.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
