/**
 * Builds the demo week's candidate catalog for each household from the saved SerpApi fixtures
 * (no new searches) and Gemma's event understanding (cached), and exports the ranker inputs:
 * data/demo/ranker/past-<area>.json and data/demo/ranker/catalog-<area>.json.
 * Past outings are synthetic (the persona); candidates are live search results.
 * Run: pnpm --filter @roundtrip/scripts exec tsx build-candidates.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { countryInfo } from "@roundtrip/core";
import { type HouseholdBundle, loadFremontPersona, loadMunichHousehold } from "@roundtrip/core/persona";
import { loadEnv, repoRoot } from "@roundtrip/core/server-env";

await loadEnv();
const { SerpApi } = await import("../agent/src/tools/serpapi");
const { areaOf, searchEvents, searchPlaces } = await import("../agent/src/tools/discovery");
const { ladderQueries, CULTURES } = await import("../agent/src/discovery/ladder");
const { understandListing, listingText } = await import("../agent/src/discovery/understand");
const { candidateFromEvent, candidateFromPlace, featuresFor, isGoodPlace, mergeCandidates, placeOrder } = await import(
  "../agent/src/planner/candidates"
);
const { geocodeVenue } = await import("../agent/src/tools/geocode");

const serp = new SerpApi({ mode: "replay" });
const WEEK = "2026-W41";
const OUT = join(repoRoot(), "data/demo/ranker");
mkdirSync(OUT, { recursive: true });

const offsets: Record<string, string> = { US: "-07:00", DE: "+02:00" };

async function build(bundle: HouseholdBundle, perKind: number) {
  const h = bundle.household;
  const area = areaOf(h);
  const languageName = CULTURES.te!.languageName;
  const ladder = ladderQueries("te", 10, h.localLanguage);
  const home = h.homeArea.nearestStop.location;
  const cands = [];
  for (const level of [1, 2, 3, 4] as const) {
    for (const q of ladder[level]) {
      try {
        if (q.engine === "google_maps") {
          const places = (await searchPlaces(serp, { interest: q.interest, area, weekKey: WEEK }))
            .filter(isGoodPlace)
            .sort((a, b) => placeOrder(a, home) - placeOrder(b, home))
            .slice(0, perKind);
          for (const p of places) {
            const c = candidateFromPlace(p, languageName);
            if (c) cands.push(c);
          }
        } else {
          const events = await searchEvents(serp, { interest: q.interest, area, when: "week", weekKey: WEEK });
          for (const e of events) {
            const u = await understandListing(
              listingText(e),
              {
                week: "Monday 2026-10-05 to Sunday 2026-10-11",
                offset: offsets[h.hostCountry]!,
                currency: countryInfo(h.hostCountry).currency,
              },
              { dataClass: "public" },
            );
            if (!u.suitsOlderAdults) continue;
            const where = e.address || e.venueName;
            const location = where ? await geocodeVenue(where, { countryCode: h.hostCountry }) : null;
            cands.push(candidateFromEvent(e, u, location));
          }
        }
      } catch (err) {
        if (!(err instanceof Error && err.name === "FixtureMissing")) throw err;
      }
    }
  }
  // The same farmers market can come back as an event and as a place.
  const unique = mergeCandidates(cands);
  const key = area.key;
  const catalog = unique.map((c) => ({
    id: c.id,
    title: c.title,
    kind: c.kind,
    ladderLevel: c.ladderLevel,
    start: c.start,
    provenance: c.provenance,
    features: featuresFor(c, {
      home,
      day: "wed",
      startHour: 10,
      weather: { label: "pleasant", tempC: 22, rainChance: 0.05 },
      knowsSomeone: false,
      withAdultChild: false,
      daysSinceLastOuting: 3,
    }),
  }));
  const past = bundle.pastOutings.map((o) => ({
    id: o._id,
    title: o.title,
    provenance: o.provenance,
    features: o.features,
    went: o.result?.went ? 1 : 0,
    enjoyment: o.result?.enjoyment ?? null,
  }));
  writeFileSync(
    join(OUT, `catalog-${key}.json`),
    `${JSON.stringify({ provenance: "live_search", note: "Candidates for a Wednesday 10:00 solo outing; features estimated from straight-line distance until directions are fetched.", candidates: catalog }, null, 1)}\n`,
  );
  writeFileSync(
    join(OUT, `past-${key}.json`),
    `${JSON.stringify({ provenance: "synthetic", outings: past }, null, 1)}\n`,
  );
  const byLevel: Record<number, number> = {};
  for (const c of catalog) byLevel[c.ladderLevel] = (byLevel[c.ladderLevel] ?? 0) + 1;
  console.log(`${key}: ${catalog.length} candidates by ladder level`, byLevel, `| ${past.length} past outings`);
}

await build(loadFremontPersona(), 2);
await build(loadMunichHousehold(), 2);
