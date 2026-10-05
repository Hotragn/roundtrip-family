import { clockMinutes, type Household, type Parent } from "@roundtrip/core";

/**
 * When each parent can go. An outing is feasible when they leave inside one of their best
 * times and inside a window when they're on their own, are back before a nap starts, are home
 * in daylight, and the walking fits their limit. Weekend slots are for going with the adult
 * child (a first ride together, or a family outing).
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
  const total = req.travelMinutes * 2 + req.stayMinutes;

  const fits = (day: Day, depart: number, solo: boolean): string | null => {
    const back = depart + total;
    if (h.safety.daylightOnly && back > sunset) return `back after dark (${fmt(back)})`;
    for (const n of naps) if (depart < n.end && back > n.start) return `runs into the ${fmt(n.start)} nap`;
    if (solo) {
      const windows = aloneOn(h, day);
      if (!windows.some((w) => depart >= w.start && depart < w.end)) return "they aren't on their own then";
      if (!best.some((b) => depart >= b.start && depart <= b.end)) return "outside their best times";
    }
    return null;
  };

  if (req.fixed) {
    const depart = req.fixed.startMinutes - req.travelMinutes - 5;
    const solo = fits(req.fixed.day, depart, true);
    if (!solo)
      return { ok: true, slot: { day: req.fixed.day, depart, back: depart + total, withAdultChild: false }, why };
    why.push(solo);
    const weekend = req.fixed.day === "sat" || req.fixed.day === "sun";
    const together = fits(req.fixed.day, depart, false);
    if (!together && (weekend || req.fixed.startMinutes >= 17 * 60 + 30)) {
      return { ok: true, slot: { day: req.fixed.day, depart, back: depart + total, withAdultChild: true }, why };
    }
    if (together) why.push(together);
    return { ok: false, why };
  }

  for (const day of DAYS.filter((d) => !req.excludeDays?.includes(d))) {
    for (const b of best) {
      for (let depart = b.start; depart <= b.end; depart += 15) {
        if (!fits(day, depart, true))
          return { ok: true, slot: { day, depart, back: depart + total, withAdultChild: false }, why };
      }
    }
  }
  why.push("no solo slot this week");
  for (const day of h.trialRunDays) {
    const depart = 10 * 60;
    if (!fits(day, depart, false))
      return { ok: true, slot: { day, depart, back: depart + total, withAdultChild: true }, why };
  }
  return { ok: false, why };
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
