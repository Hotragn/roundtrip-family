import type { HouseholdBundle } from "@roundtrip/core/persona";
import { CULTURES } from "../discovery/ladder";
import { SerpApi } from "../tools/serpapi";
import { forecast } from "../tools/weather";
import type { DayWeather, PlannerContext, Role } from "./context";
import { discoverCandidates } from "./discover";
import { DAYS, type Day } from "./slots";

/**
 * The coming week, planned live: next Monday to Sunday in the household's time zone, with the
 * live forecast (Open-Meteo), the places from the saved searches (no new searches: the search
 * budget is spent), each parent's profile and history, TabPFN and Gemma. Events were listed for
 * one week only, so they don't carry over; places do. Used by the dashboard's "Plan the coming
 * week" button.
 */

/** The searches every plan draws on: the week of 5 October 2026. */
const SAVED = { weekKey: "2026-W41", weekLabel: "Monday 2026-10-05 to Sunday 2026-10-11", month: 10 };

function localDate(d: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** ISO week key, e.g. 2026-W42, for a Monday. */
function isoWeek(monday: string): string {
  const d = new Date(`${monday}T12:00:00Z`);
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() + 3);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const dayOfYear = Math.floor((thursday.getTime() - yearStart.getTime()) / 86_400_000);
  const week = Math.floor(dayOfYear / 7) + 1;
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export interface ComingWeek {
  key: string;
  monday: string;
  sunday: string;
  month: number;
  label: string;
}

/** Next Monday to Sunday, in the household's time zone. */
export function comingWeek(today: Date, timezone: string): ComingWeek {
  const local = localDate(today, timezone);
  const dow = new Date(`${local}T12:00:00Z`).getUTCDay(); // 0 Sunday
  const monday = addDays(local, (8 - dow) % 7 || 7);
  const sunday = addDays(monday, 6);
  return {
    key: isoWeek(monday),
    monday,
    sunday,
    month: Number(monday.slice(5, 7)),
    label: `Monday ${monday} to Sunday ${sunday}`,
  };
}

export async function liveWeekContext(
  bundle: HouseholdBundle,
  opts: { today?: Date; only?: Role } = {},
): Promise<{
  ctx: PlannerContext;
  forecast: Array<{ day: Day; date: string; label: string; maxC: number; rainChance: number }>;
}> {
  const h = bundle.household;
  const week = comingWeek(opts.today ?? new Date(), h.timezone);
  const serp = new SerpApi({ mode: "replay" });
  const { candidates } = await discoverCandidates(h, { serp, ...SAVED });
  const days = await forecast(h.homeArea.areaCenter, week.monday, week.sunday, h.timezone, "live");
  const weather = Object.fromEntries(
    DAYS.map((d, i) => {
      const f = days[i];
      const w: DayWeather = f
        ? {
            label: f.label,
            tempC: f.tempC,
            rainChance: f.rainChance,
            heatAdvisory: f.heatAdvisory,
            ice: f.ice,
            heavySnow: f.heavySnow,
          }
        : { label: "pleasant", tempC: 20, rainChance: 0.1 };
      return [d, w];
    }),
  ) as Record<Day, DayWeather>;
  const role = (p: (typeof bundle.parents)[number]) => (p.addressAs.includes("నాన్న") ? "father" : "mother");
  const parents = opts.only ? bundle.parents.filter((p) => role(p) === opts.only) : bundle.parents;
  const ctx: PlannerContext = {
    household: h,
    parents,
    people: bundle.people.filter((p) => p.knownParentIds.some((id) => parents.some((x) => x._id === id))),
    pastOutings: bundle.pastOutings,
    week,
    weather,
    candidates: candidates.filter((c) => c.kind === "place"),
    soloReadyRoutes: [],
    languageName: CULTURES.te!.languageName,
    log: [],
    notes: [],
  };
  return {
    ctx,
    forecast: DAYS.map((day, i) => ({
      day,
      date: days[i]?.date ?? addDays(week.monday, i),
      label: days[i]?.label ?? "pleasant",
      maxC: Math.round(days[i]?.maxC ?? 20),
      rainChance: days[i]?.rainChance ?? 0,
    })),
  };
}
