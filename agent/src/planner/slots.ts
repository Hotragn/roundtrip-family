import { clockMinutes, type Household, type Parent } from "@roundtrip/core";
import { fitVisit, type WeeklyHours } from "@roundtrip/core/hours";

/**
 * When each parent can go. An outing is feasible when they leave inside one of their best
 * times and inside a window when they're on their own, arrive while the place is open with time
 * to spare before it closes, are back before a nap starts, are home in daylight, and the walking
 * fits their limit. Weekend slots are for going with the adult child (a first ride together, or
 * a family outing).
 */

export type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export const DAYS: Day[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export interface Slot {
  day: Day;
  /** Minutes since midnight, local time. */
  depart: number;
  back: number;
  withAdultChild: boolean;
}

export interface SlotRequest {
  travelMinutes: number;
  walkingMinutes: number;
  /** Time at the place. */
  stayMinutes: number;
  /** The shortest visit worth the trip, when the place closes sooner than the full stay. */
  minStayMinutes?: number;
  /** The place's weekly opening hours, when listed. Events use their own times instead. */
  hours?: WeeklyHours | null;
  /** For events with a fixed start: arrive by this time on this day. */
  fixed?: { day: Day; startMinutes: number; endMinutes: number | null };
  outdoor: boolean;
  /** Days already used by this parent, so outings spread across the week. */
  excludeDays?: Day[];
}

/** Approximate sunset by month for the demo areas (minutes since midnight, local time). */
const SUNSET: Record<string, number[]> = {
  "America/Los_Angeles": [1020, 1050, 1150, 1180, 1200, 1225, 1225, 1200, 1155, 1110, 1015, 1000],
  "Europe/Berlin": [990, 1040, 1110, 1215, 1260, 1295, 1290, 1240, 1170, 1095, 990, 965],
  "America/Denver": [1010, 1060, 1150, 1200, 1235, 1265, 1265, 1230, 1170, 1110, 1010, 990],
};

export function sunsetMinutes(tz: string, month: number): number {
  return SUNSET[tz]?.[month - 1] ?? 1080;
}

export const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

function aloneOn(h: Household, day: Day) {
  return h.aloneWindows
    .filter((w) => w.day === day)
    .map((w) => ({ start: clockMinutes(w.start), end: clockMinutes(w.end) }));
}

export interface Feasibility {
  ok: boolean;
  slot?: Slot;
  why: string[];
}

/** The first feasible solo slot this week, or a weekend slot with the adult child. */
export function findSlot(h: Household, p: Parent, req: SlotRequest, month: number): Feasibility {
  const why: string[] = [];
  if (req.walkingMinutes > p.mobility.maxWalkMinutes) {
    return { ok: false, why: [`${req.walkingMinutes} minutes of walking is more than ${p.mobility.maxWalkMinutes}`] };
  }
  const sunset = sunsetMinutes(h.timezone, month);
  const naps = p.naps.map((n) => ({ start: clockMinutes(n.start), end: clockMinutes(n.end) }));
  const best = p.bestTimes.map((b) => ({ start: clockMinutes(b.start), end: clockMinutes(b.end) }));
  const minStay = Math.min(req.stayMinutes, req.minStayMinutes ?? req.stayMinutes);

  const tryAt = (day: Day, depart: number, solo: boolean): { slot: Slot } | { why: string } => {
    let stay = req.stayMinutes;
    if (!req.fixed) {
      const visit = fitVisit(req.hours, day, depart + req.travelMinutes, req.stayMinutes, minStay);
      if (!visit.ok) return { why: visit.why };
      stay = visit.stay;
    }
    const back = depart + req.travelMinutes * 2 + stay;
    if (h.safety.daylightOnly && back > sunset) return { why: `back after dark (${fmt(back)})` };
    for (const n of naps) if (depart < n.end && back > n.start) return { why: `runs into the ${fmt(n.start)} nap` };
    if (solo) {
      const windows = aloneOn(h, day);
      if (!windows.some((w) => depart >= w.start && depart < w.end)) return { why: "they aren't on their own then" };
      if (!best.some((b) => depart >= b.start && depart <= b.end)) return { why: "outside their best times" };
    }
    return { slot: { day, depart, back, withAdultChild: !solo } };
  };

  if (req.fixed) {
    const depart = req.fixed.startMinutes - req.travelMinutes - 5;
    const solo = tryAt(req.fixed.day, depart, true);
    if ("slot" in solo) return { ok: true, slot: solo.slot, why };
    why.push(solo.why);
    const weekend = req.fixed.day === "sat" || req.fixed.day === "sun";
    const together = tryAt(req.fixed.day, depart, false);
    if ("slot" in together && (weekend || req.fixed.startMinutes >= 17 * 60 + 30)) {
      return { ok: true, slot: together.slot, why };
    }
    if ("why" in together) why.push(together.why);
    return { ok: false, why };
  }

  // On their own: the first day that works, leaving as early in their best times as the place allows.
  const seen = new Set<string>();
  for (const day of DAYS.filter((d) => !req.excludeDays?.includes(d))) {
    for (const b of best) {
      for (let depart = b.start; depart <= b.end; depart += 15) {
        const r = tryAt(day, depart, true);
        if ("slot" in r) return { ok: true, slot: r.slot, why };
        if (r.why.startsWith("closed on") && !seen.has(r.why)) {
          seen.add(r.why);
          why.push(r.why);
        }
      }
    }
  }
  why.push("no solo slot this week");
  // Together: a weekend day with the adult child, from mid-morning, or earlier if that's when it's open.
  const times = [...range(10 * 60, 16 * 60), ...range(9 * 60, 10 * 60 - 15)];
  for (const day of h.trialRunDays.filter((d) => !req.excludeDays?.includes(d))) {
    for (const depart of times) {
      const r = tryAt(day, depart, false);
      if ("slot" in r) return { ok: true, slot: r.slot, why };
    }
  }
  return { ok: false, why };
}

function range(from: number, to: number, step = 15): number[] {
  const out: number[] = [];
  for (let m = from; m <= to; m += step) out.push(m);
  return out;
}

/** Weather rules: hard blocks from the household, and each parent's own limits. */
export function weatherBlocks(
  h: Household,
  p: Parent,
  w: { tempC: number; label: string; rainChance: number; heatAdvisory?: boolean; ice?: boolean; heavySnow?: boolean },
  outdoor: boolean,
): string | null {
  if (h.safety.weather.blockIce && w.ice) return "ice on the roads";
  if (h.safety.weather.blockHeavySnow && w.heavySnow) return "heavy snow";
  if (h.safety.weather.blockHeatAdvisory && w.heatAdvisory) return "a heat advisory";
  if (!outdoor) return null;
  if (p.weather.maxComfortC !== undefined && w.tempC > p.weather.maxComfortC) return "too hot outdoors";
  if (p.weather.minComfortC !== undefined && w.tempC < p.weather.minComfortC && p.weather.avoid.includes("cold"))
    return "too cold";
  if (p.weather.avoid.includes("rain") && w.rainChance >= 0.5) return "rain likely";
  return null;
}
