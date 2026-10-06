import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LatLng } from "@roundtrip/core";
import { outboundFetch } from "@roundtrip/core/privacy";
import { repoRoot } from "@roundtrip/core/server-env";
import { hashKey } from "../gemma/store";

/**
 * Street-following lines for the dashboard's route maps, from the FOSSGIS OSRM servers at
 * routing.openstreetmap.de (car profile for bus legs, which run on the same roads; foot profile
 * for walking legs). Their policy asks for light use, an identifying user agent and caching
 * (https://routing.openstreetmap.de/about.html); OSRM's route API is documented at
 * https://project-osrm.org/docs/v5.24.0/api/#route-service. Only public points are sent: bus
 * stops and venues, never a home address. Results are saved as fixtures.
 */

export type Profile = "car" | "foot";

/**
 * A walking route on OpenStreetMap between two public points, with its length: for a short walk
 * that has no saved directions. Cached like the lines; the minutes are worked out by the caller.
 */
export async function walkRoute(
  from: LatLng,
  to: LatLng,
  opts: { mode?: "live" | "replay" } = {},
): Promise<{ line: Array<[number, number]>; meters: number } | null> {
  const coords = [from, to].map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
  const key = hashKey({ profile: "foot", coords, with: "distance" });
  const file = join(DIR(), `${key}.json`);
  try {
    const saved = JSON.parse(await readFile(file, "utf8")) as { line: Array<[number, number]>; meters: number } | null;
    if (saved?.line) return { line: saved.line, meters: saved.meters };
  } catch {}
  const mode = opts.mode ?? (process.env.CI ? "replay" : "live");
  if (mode === "replay") return null;
  const wait = last + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coords}?overview=full&geometries=geojson`;
  const res = await outboundFetch("routing", "public", url, {
    headers: { "User-Agent": "roundtrip-family/0.1 (+https://github.com/Hotragn/roundtrip-family)" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    routes?: Array<{ distance: number; geometry: { coordinates: Array<[number, number]> } }>;
  };
  const r = body.routes?.[0];
  if (!r) return null;
  const line = r.geometry.coordinates.map(
    ([lng, lat]) => [Number(lng.toFixed(5)), Number(lat.toFixed(5))] as [number, number],
  );
  const out = { line, meters: Math.round(r.distance) };
  await mkdir(DIR(), { recursive: true });
  await writeFile(
    file,
    `${JSON.stringify({ profile: "foot", from, to, ...out, source: "OSRM on OpenStreetMap data (ODbL)" })}\n`,
  );
  return out;
}
const DIR = () => join(repoRoot(), "agent/fixtures/routing");
let last = 0;

export async function routeLine(
  profile: Profile,
  points: LatLng[],
  opts: { mode?: "live" | "replay" } = {},
): Promise<Array<[number, number]> | null> {
  if (points.length < 2) return null;
  const coords = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
  const key = hashKey({ profile, coords });
  const file = join(DIR(), `${key}.json`);
  try {
    return (JSON.parse(await readFile(file, "utf8")) as { line: Array<[number, number]> | null }).line;
  } catch {}
  const mode = opts.mode ?? (process.env.CI ? "replay" : "live");
  if (mode === "replay") return null;
  const wait = last + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const url = `https://routing.openstreetmap.de/routed-${profile}/route/v1/${profile === "car" ? "driving" : "foot"}/${coords}?overview=full&geometries=geojson`;
  const res = await outboundFetch("routing", "public", url, {
    headers: { "User-Agent": "roundtrip-family/0.1 (+https://github.com/Hotragn/roundtrip-family)" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { routes?: Array<{ geometry: { coordinates: Array<[number, number]> } }> };
  const line = body.routes?.[0]?.geometry.coordinates.map(
    ([lng, lat]) => [Number(lng.toFixed(5)), Number(lat.toFixed(5))] as [number, number],
  );
  await mkdir(DIR(), { recursive: true });
  await writeFile(
    file,
    `${JSON.stringify({ profile, points, line: line ?? null, source: "OSRM on OpenStreetMap data (ODbL)" })}\n`,
  );
  return line ?? null;
}
