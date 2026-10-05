import type { LatLng, Leg, Route, Stop, TravelMode } from "@roundtrip/core";

/**
 * Turns a SerpApi google_maps_directions response into a Route. Transit legs carry the line,
 * the headsign, every stop on the way (SerpApi's `stops`), and the stop just before theirs.
 * Response shape checked on a live response, 2026-10-05: directions[].trips[] with
 * travel_mode "Walking" | "Transit"; transit trips have title ("239 Milpitas Blvd. & ..."),
 * start_stop, end_stop, stops[], service_run_by; walking trips have details[] with titles,
 * gps_coordinates and Street View thumbnails (geo_photo).
 * Docs: https://serpapi.com/google-maps-directions-api
 */

interface SerpStop {
  name: string;
  stop_id?: string;
  time?: string;
}

interface SerpTrip {
  travel_mode: string;
  title?: string;
  duration?: number;
  distance?: number;
  start_stop?: SerpStop;
  end_stop?: SerpStop;
  stops?: SerpStop[];
  service_run_by?: { name?: string; link?: string } | string;
  details?: Array<{
    title?: string;
    gps_coordinates?: { latitude: number; longitude: number };
    geo_photo?: string;
    extensions?: string[];
  }>;
}

interface SerpDirection {
  travel_mode?: string;
  duration?: number;
  start_time?: string;
  end_time?: string;
  trips?: SerpTrip[];
}

const RAIL = /\b(BART|Caltrain|ACE|U\d|S\d|U-Bahn|S-Bahn|Tram|Train|Bahn)\b/i;

function lineOf(t: SerpTrip): { name: string; headsign?: string; agency?: string } {
  const title = (t.title ?? "").trim();
  const m = title.match(/^(\S+)\s+(.+)$/);
  const agency = typeof t.service_run_by === "string" ? t.service_run_by : t.service_run_by?.name;
  return m ? { name: m[1]!, headsign: m[2]!, agency } : { name: title, agency };
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

function path(t: SerpTrip): LatLng[] {
  return (t.details ?? []).flatMap((d) =>
    d.gps_coordinates ? [{ lat: d.gps_coordinates.latitude, lng: d.gps_coordinates.longitude }] : [],
  );
}

/** Picks the first route whose walking fits the parent's limit, else the one with the least walking. */
export function parseDirections(
  data: Record<string, unknown>,
  ctx: { from: Stop; to: Stop; maxWalkMinutes: number },
): Route | null {
  const options = ((data.directions as SerpDirection[] | undefined) ?? []).filter((d) => (d.trips ?? []).length > 0);
  if (options.length === 0) return null;
  const routes = options.map((d) => toRoute(d, ctx));
  return (
    routes.find((r) => r.walkingMinutes <= ctx.maxWalkMinutes) ??
    [...routes].sort((a, b) => a.walkingMinutes - b.walkingMinutes)[0]!
  );
}

function toRoute(d: SerpDirection, ctx: { from: Stop; to: Stop }): Route {
  const trips = d.trips ?? [];
  const legs: Leg[] = trips.map((t, i): Leg => {
    const minutes = Math.round((t.duration ?? 0) / 60);
    if (t.travel_mode === "Transit") {
      const line = lineOf(t);
      const between = (t.stops ?? []).map((s) => ({ name: clean(s.name) }));
      const mode: TravelMode = RAIL.test(`${t.title ?? ""} ${line.agency ?? ""}`) ? "rail" : "bus";
      return {
        mode,
        from: { name: clean(t.start_stop?.name ?? "") },
        to: { name: clean(t.end_stop?.name ?? "") },
        durationMinutes: minutes,
        line,
        numStops: between.length + 1,
        departureTime: t.start_stop?.time,
        arrivalTime: t.end_stop?.time,
        stopsBetween: between,
        stopBefore: between.at(-1),
        instructions: [
          `Take ${line.name} toward ${line.headsign ?? ""}`.trim(),
          `Get off at ${clean(t.end_stop?.name ?? "")}`,
        ],
        path: [],
      };
    }
    const prev = trips[i - 1];
    const next = trips[i + 1];
    const from = prev?.end_stop ? { name: clean(prev.end_stop.name) } : ctx.from;
    const to = next?.start_stop ? { name: clean(next.start_stop.name) } : ctx.to;
    return {
      mode: "walk",
      from,
      to,
      durationMinutes: minutes,
      instructions: (t.details ?? []).map((x) => clean(x.title ?? "")).filter(Boolean),
      path: path(t),
    };
  });
  const transit = legs.filter((l) => l.mode !== "walk");
  return {
    legs,
    totalMinutes: Math.round((d.duration ?? legs.reduce((s, l) => s + l.durationMinutes * 60, 0)) / 60),
    transfers: Math.max(0, transit.length - 1),
    walkingMinutes: legs.filter((l) => l.mode === "walk").reduce((s, l) => s + l.durationMinutes, 0),
    source: transit.length > 0 ? "transit_directions" : "walking_directions",
    startsAt: ctx.from,
  };
}

/** Street View thumbnails along the walking legs, larger, for landmark photos. */
export function walkingPhotos(data: Record<string, unknown>): string[] {
  const d = ((data.directions as SerpDirection[] | undefined) ?? [])[0];
  return (d?.trips ?? [])
    .flatMap((t) => (t.details ?? []).map((x) => x.geo_photo))
    .filter((u): u is string => typeof u === "string")
    .map((u) => u.replace(/([?&])w=\d+/, "$1w=480").replace(/([?&])h=\d+/, "$1h=240"));
}
