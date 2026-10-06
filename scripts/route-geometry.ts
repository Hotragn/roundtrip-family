/**
 * Adds map geometry to the demo weeks for the dashboard's route previews: the coordinates of
 * each boarding and alighting stop (OpenStreetMap Nominatim) and a street-following line for
 * every leg (OSRM: car roads for bus legs, footpaths for walking). Only public points are used:
 * the household's nearest stop, bus stops and venues. Everything is cached as fixtures.
 * Run after build-week.ts: pnpm --filter @roundtrip/scripts exec tsx route-geometry.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LatLng } from "@roundtrip/core";
import { loadFremontPersona, loadMunichHousehold } from "@roundtrip/core/persona";
import { loadEnv, repoRoot } from "@roundtrip/core/server-env";

await loadEnv();
const { geocodeVenue } = await import("../agent/src/tools/geocode");
const { routeLine } = await import("../agent/src/tools/routing");

interface Leg {
  mode: string;
  from: { name: string; location?: LatLng };
  to: { name: string; location?: LatLng };
  stopBefore?: { name: string; location?: LatLng };
  path?: Array<[number, number]> | LatLng[];
}
interface Week {
  outings: Array<{ venue: string; location: LatLng | null; route: { legs: Leg[] } | null }>;
}

/** Stop names come as signs print them; try the forms OpenStreetMap tends to use as well. */
async function geocodeStop(name: string, town: string, cc: string): Promise<LatLng | undefined> {
  const variants = [name, name.replace(/\s+at\s+/i, " & ").replace(/\./g, ""), name.replace(/\./g, "")];
  for (const v of [...new Set(variants)]) {
    const hit = await geocodeVenue(`${v}, ${town}`, { countryCode: cc });
    if (hit) return hit;
  }
  return undefined;
}

const ROOT = repoRoot();
const households = [
  { file: "fremont-demo", bundle: loadFremontPersona() },
  { file: "munich-demo", bundle: loadMunichHousehold() },
];

for (const { file, bundle } of households) {
  const path = join(ROOT, `data/demo/weeks/${file}.json`);
  const week = JSON.parse(readFileSync(path, "utf8")) as Week;
  const h = bundle.household;
  const town = h.homeArea.searchLocation.split(",")[0] ?? h.homeArea.searchLocation;
  const cc = h.hostCountry;
  let lines = 0;
  for (const o of week.outings) {
    const legs = o.route?.legs ?? [];
    if (legs.length === 0 || !o.location) continue;
    // Known points: the home stop, each transit leg's boarding and alighting stops, the venue.
    for (const leg of legs) {
      if (leg.mode === "walk") continue;
      leg.from.location ??= await geocodeStop(leg.from.name, town, cc);
      // Their stop: by name, else the stop just before it, which is a few hundred metres back.
      leg.to.location ??= (await geocodeStop(leg.to.name, town, cc)) ?? leg.stopBefore?.location;
    }
    let cursor: LatLng = h.homeArea.nearestStop.location;
    for (const [i, leg] of legs.entries()) {
      const next = legs[i + 1];
      const end: LatLng | undefined =
        leg.mode === "walk" ? (next?.from.location ?? (next ? undefined : o.location)) : leg.to.location;
      const start: LatLng = leg.mode === "walk" ? cursor : (leg.from.location ?? cursor);
      if (end) {
        // Trains don't follow roads: rail legs are drawn station to station.
        const line = leg.mode === "rail" ? null : await routeLine(leg.mode === "walk" ? "foot" : "car", [start, end]);
        leg.path = line ?? [
          [start.lng, start.lat],
          [end.lng, end.lat],
        ];
        if (line) lines++;
        cursor = end;
      }
      if (leg.mode === "walk") {
        leg.from.location ??= start;
        if (end) leg.to.location ??= end;
      }
    }
  }
  writeFileSync(path, `${JSON.stringify(week, null, 2)}\n`);
  console.log(`${file}: ${lines} street-following lines`);
}
