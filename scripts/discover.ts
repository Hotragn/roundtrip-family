/**
 * Live discovery for the demo week: runs the fallback-ladder searches for the Fremont persona,
 * the Munich household and a test area with no Telugu events, and saves every response as a
 * fixture (agent/fixtures/serpapi/). Already-saved queries cost nothing. Prints the result
 * count per query for docs/progress.md.
 * Run: pnpm --filter @roundtrip/scripts exec tsx discover.ts
 */
import type { Household } from "@roundtrip/core";
import { loadFremontPersona, loadMunichHousehold } from "@roundtrip/core/persona";
import { loadEnv } from "@roundtrip/core/server-env";

await loadEnv();
const { SerpApi } = await import("../agent/src/tools/serpapi");
const { areaOf, searchEvents, searchPlaces } = await import("../agent/src/tools/discovery");
const { ladderQueries } = await import("../agent/src/discovery/ladder");

const WEEK = "2026-W41";
const MONTH = 10;
const serp = new SerpApi();

/** A test area expected to have no Telugu gatherings: a small mountain town. */
const testArea: Household["homeArea"] & { country: string; localLanguage: string; key: string } = {
  key: "bozeman",
  label: "Main St & Willson Ave",
  nearestStop: { name: "Main St & Willson Ave", location: { lat: 45.6793, lng: -111.0373 } },
  areaCenter: { lat: 45.679, lng: -111.038 },
  searchLocation: "Bozeman, Montana, United States",
  country: "US",
  localLanguage: "en",
};

const plans: Array<{ area: ReturnType<typeof areaOf>; levels: number[]; skip?: string[] }> = [
  { area: areaOf(loadFremontPersona().household), levels: [1, 2, 3, 4] },
  {
    area: areaOf(loadMunichHousehold().household),
    levels: [1, 2, 3, 4],
    skip: [
      "Telugu association",
      "Bathukamma celebration",
      "Dasara celebration",
      "Senioren Veranstaltungen",
      "Indian community events",
    ],
  },
  {
    area: {
      key: testArea.key,
      searchLocation: testArea.searchLocation,
      center: testArea.areaCenter,
      country: "US",
      localLanguage: "en",
    },
    levels: [1, 2, 3, 4],
    skip: [
      "Telugu association",
      "Bathukamma celebration",
      "Dasara celebration",
      "Hindu temple",
      "Indian grocery store",
      "farmers market",
      "senior events library programs",
    ],
  },
];

const report: string[] = [];
for (const plan of plans) {
  const ladder = ladderQueries("te", MONTH, plan.area.localLanguage);
  for (const level of plan.levels as Array<1 | 2 | 3 | 4>) {
    for (const q of ladder[level]) {
      if (plan.skip?.includes(q.interest)) continue;
      try {
        const n =
          q.engine === "google_events"
            ? (await searchEvents(serp, { interest: q.interest, area: plan.area, when: "week", weekKey: WEEK })).length
            : (await searchPlaces(serp, { interest: q.interest, area: plan.area, weekKey: WEEK })).length;
        report.push(`| ${plan.area.key} | ${level} | ${q.engine} | ${q.interest} | ${n} |`);
      } catch (e) {
        report.push(
          `| ${plan.area.key} | ${level} | ${q.engine} | ${q.interest} | error: ${e instanceof Error ? e.message.slice(0, 80) : e} |`,
        );
      }
    }
  }
}
console.log("| Area | Level | Engine | Query | Results |\n|---|---|---|---|---|");
console.log(report.join("\n"));
console.log(`\nLive searches used so far: ${await serp.used()} of ${serp.cap}`);
