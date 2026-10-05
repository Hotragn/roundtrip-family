import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LatLng } from "@roundtrip/core";
import { outboundFetch } from "@roundtrip/core/privacy";
import { repoRoot } from "@roundtrip/core/server-env";
import { hashKey } from "../gemma/store";

/**
 * Geocodes public venue names ("Newark Pavilion, Newark, CA") with OpenStreetMap Nominatim.
 * Usage policy: at most one request a second, an identifying user agent, and caching
 * (https://operations.osmfoundation.org/policies/nominatim/). Results are saved as fixtures.
 * Never called with a home address.
 */

const DIR = () => join(repoRoot(), "agent/fixtures/geocode");
let last = 0;

export async function geocodeVenue(
  query: string,
  opts: { countryCode: string; mode?: "live" | "replay" },
): Promise<LatLng | null> {
  const key = hashKey({ q: query, cc: opts.countryCode });
  const file = join(DIR(), `${key}.json`);
  try {
    return (JSON.parse(await readFile(file, "utf8")) as { location: LatLng | null }).location;
  } catch {}
  const mode = opts.mode ?? (process.env.CI ? "replay" : "live");
  if (mode === "replay") return null;
  const wait = last + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=${opts.countryCode.toLowerCase()}&q=${encodeURIComponent(query)}`;
  const res = await outboundFetch("nominatim", "public", url, {
    headers: { "User-Agent": "roundtrip-family/0.1 (+https://github.com/Hotragn/roundtrip-family)" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  const location = rows[0] ? { lat: Number(rows[0].lat), lng: Number(rows[0].lon) } : null;
  await mkdir(DIR(), { recursive: true });
  await writeFile(
    file,
    `${JSON.stringify({ query, location, displayName: rows[0]?.display_name ?? null, source: "OpenStreetMap Nominatim (ODbL)" }, null, 1)}\n`,
  );
  return location;
}
