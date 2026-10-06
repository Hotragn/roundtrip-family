import type { Household, Parent } from "@roundtrip/core";
import { type HouseholdBundle, loadFremontPersona, loadMunichHousehold } from "@roundtrip/core/persona";
import { CULTURES } from "../discovery/ladder";
import { SerpApi } from "../tools/serpapi";
import { forecast } from "../tools/weather";
import type { Candidate } from "./candidates";
import type { DayWeather, PlannerContext } from "./context";
import { discoverCandidates } from "./discover";
import { DAYS, type Day } from "./slots";

/**
 * The ten demo weeks the route-to-humans test plans. The base weeks use live search results
 * and live forecasts for the week of 5 October 2026; the variants change one thing each
 * (synthetic weather, a parent away, an injected Telugu group, known routes) and say so.
 */

export interface DemoWeek {
  id: string;
  label: string;
  provenance: "live_search" | "synthetic variant";
  build: (mode: "live" | "replay") => Promise<PlannerContext>;
}

const WEEK = {
  key: "2026-W41",
  monday: "2026-10-05",
  sunday: "2026-10-11",
  month: 10,
  label: "Monday 2026-10-05 to Sunday 2026-10-11",
};

/** A synthetic test household in an area with no Telugu events. */
export function bozemanHousehold(): HouseholdBundle {
  const base = loadFremontPersona();
  const household: Household = {
    ...base.household,
    _id: "hh_bozeman",
    slug: "bozeman-demo",
    timezone: "America/Denver",
    metroArea: "Bozeman, Montana",
    homeArea: {
      label: "Main St & Willson Ave",
      nearestStop: { name: "Main St & Willson Ave", location: { lat: 45.6793, lng: -111.0373 } },
      areaCenter: { lat: 45.679, lng: -111.038 },
      searchLocation: "Bozeman, Montana, United States",
    },
    notes: "Synthetic test household for the fallback ladder: no Telugu events nearby.",
  };
  const parents: Parent[] = base.parents.map((p) => ({ ...p, _id: `${p._id}_bz`, householdId: household._id }));
  return {
    household,
    parents,
    people: [],
    pastOutings: base.pastOutings.map((o) => ({
      ...o,
      _id: `${o._id}_bz`,
      householdId: household._id,
      parentIds: o.parentIds.map((x) => `${x}_bz`),
    })),
  };
}

async function weatherFor(h: Household, mode: "live" | "replay"): Promise<Record<Day, DayWeather>> {
  const days = await forecast(h.homeArea.areaCenter, WEEK.monday, WEEK.sunday, h.timezone, mode);
  return Object.fromEntries(
    DAYS.map((d, i) => [d, days[i] ?? { label: "pleasant", tempC: 20, rainChance: 0.1 }]),
  ) as Record<Day, DayWeather>;
}

async function context(
  bundle: HouseholdBundle,
  mode: "live" | "replay",
  tweak?: (ctx: PlannerContext) => void,
): Promise<PlannerContext> {
  const serp = new SerpApi({ mode: "replay" });
  const { candidates } = await discoverCandidates(bundle.household, {
    serp,
    weekKey: WEEK.key,
    weekLabel: WEEK.label,
    month: WEEK.month,
  });
  const ctx: PlannerContext = {
    household: bundle.household,
    parents: bundle.parents,
    people: bundle.people,
    pastOutings: bundle.pastOutings,
    week: WEEK,
    weather: await weatherFor(bundle.household, mode),
    candidates,
    soloReadyRoutes: [],
    languageName: CULTURES.te!.languageName,
    log: [],
    notes: [],
  };
  tweak?.(ctx);
  return ctx;
}

function setAll(ctx: PlannerContext, w: DayWeather): void {
  for (const d of DAYS) ctx.weather[d] = w;
}

const hot: DayWeather = { label: "very_hot", tempC: 39, rainChance: 0, heatAdvisory: true };
const rain: DayWeather = { label: "rainy", tempC: 13, rainChance: 0.85 };
const cold: DayWeather = { label: "cold", tempC: 3, rainChance: 0.5 };

/** A synthetic Telugu group meeting, injected to check that level 1 wins when it exists. */
function teluguGroup(ctx: PlannerContext): Candidate {
  const library = ctx.candidates.find((c) => /Fremont Main Library/.test(c.title));
  return {
    id: "synthetic:telugu-coffee-morning",
    kind: "event",
    title: "Telugu coffee morning for visiting parents",
    venueName: "Fremont Main Library, meeting room",
    address: "2400 Stevenson Blvd, Fremont, CA",
    location: library?.location ?? { lat: 37.5485, lng: -121.9886 },
    ladderLevel: 1,
    languageMatch: 2,
    category: "community_meeting",
    indoor: true,
    costUsd: 0,
    foodAvailable: true,
    languageNeeded: false,
    groupSize: "small",
    description: "Synthetic test event: Telugu-speaking parents meet over coffee.",
    start: "2026-10-07T10:00:00-07:00",
    end: "2026-10-07T11:30:00-07:00",
    hours: null,
    suitsOlderAdults: true,
    provenance: "synthetic",
    query: "synthetic",
  };
}

export const DEMO_WEEKS: DemoWeek[] = [
  {
    id: "fremont",
    label: "Fremont, live search",
    provenance: "live_search",
    build: (m) => context(loadFremontPersona(), m),
  },
  {
    id: "fremont-heat",
    label: "Fremont, heat advisory midweek",
    provenance: "synthetic variant",
    build: (m) => context(loadFremontPersona(), m, (c) => Object.assign(c.weather, { tue: hot, wed: hot, thu: hot })),
  },
  {
    id: "fremont-rain",
    label: "Fremont, a rainy week",
    provenance: "synthetic variant",
    build: (m) => context(loadFremontPersona(), m, (c) => setAll(c, rain)),
  },
  {
    id: "fremont-mother-only",
    label: "Fremont, the father away this week",
    provenance: "synthetic variant",
    build: (m) =>
      context(loadFremontPersona(), m, (c) => (c.parents = c.parents.filter((p) => p.firstName === "Sarala"))),
  },
  {
    id: "fremont-telugu-group",
    label: "Fremont, with a Telugu group meeting",
    provenance: "synthetic variant",
    build: (m) => context(loadFremontPersona(), m, (c) => c.candidates.unshift(teluguGroup(c))),
  },
  {
    id: "fremont-known-routes",
    label: "Fremont, every route already ridden together",
    provenance: "synthetic variant",
    build: (m) => context(loadFremontPersona(), m, (c) => (c.soloReadyRoutes = c.candidates.map((x) => x.id))),
  },
  {
    id: "munich",
    label: "Munich, live search",
    provenance: "live_search",
    build: (m) => context(loadMunichHousehold(), m),
  },
  {
    id: "munich-cold",
    label: "Munich, a cold, wet week",
    provenance: "synthetic variant",
    build: (m) => context(loadMunichHousehold(), m, (c) => setAll(c, cold)),
  },
  {
    id: "bozeman",
    label: "Bozeman, no Telugu events (live search)",
    provenance: "live_search",
    build: (m) => context(bozemanHousehold(), m),
  },
  {
    id: "bozeman-rain",
    label: "Bozeman, no Telugu events, rainy",
    provenance: "synthetic variant",
    build: (m) => context(bozemanHousehold(), m, (c) => setAll(c, rain)),
  },
];
