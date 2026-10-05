import { countryInfo, type Household, type LatLng } from "@roundtrip/core";
import type { SerpApi } from "./serpapi";

/**
 * Discovery tools over SerpApi. Every search takes the household's country, language and
 * location; queries carry only language, interest and area; directions start from the
 * household's nearest stop, never the home address.
 */

export interface Area {
  key: string;
  searchLocation: string;
  center: LatLng;
  country: string;
  localLanguage: string;
}

export function areaOf(h: Household): Area {
  return {
    key: h.slug.replace(/-demo$/, ""),
    searchLocation: h.homeArea.searchLocation,
    center: h.homeArea.areaCenter,
    country: h.hostCountry,
    localLanguage: h.localLanguage,
  };
}

export interface RawEvent {
  sourceId: string;
  title: string;
  when: string;
  startDate: string;
  venueName: string;
  address: string;
  link?: string;
  description: string;
  thumbnail?: string;
  ticketSources: string[];
  query: string;
}

export interface RawPlace {
  sourceId: string;
  title: string;
  type: string;
  types: string[];
  address: string;
  location: LatLng | null;
  rating?: number;
  reviews?: number;
  hours?: string;
  description?: string;
  thumbnail?: string;
  query: string;
}

const town = (a: Area) => a.searchLocation.split(",").slice(0, 2).join(",").trim();

export async function searchEvents(
  serp: SerpApi,
  args: { interest: string; area: Area; when: "week" | "next_week"; weekKey: string },
): Promise<RawEvent[]> {
  const c = countryInfo(args.area.country);
  const q = `${args.interest} in ${town(args.area)}`;
  const { data } = await serp.search<{ events_results?: Array<Record<string, unknown>> }>(
    "google",
    {
      q: `${q} ${args.when === "week" ? "this week" : "next week"}`,
      location: args.area.searchLocation,
      gl: c.serpapi.gl,
      hl: c.serpapi.hl,
      google_domain: c.serpapi.googleDomain,
    },
    { week: args.weekKey, note: `events: ${args.interest}` },
  );
  return (data.events_results ?? []).map((e, i) => {
    // The google engine gives date and time as strings; google_events gives a date object.
    const rawDate = e.date as string | { start_date?: string; when?: string } | undefined;
    const time = typeof e.time === "string" ? e.time : "";
    const startDate = typeof rawDate === "string" ? rawDate : (rawDate?.start_date ?? "");
    const when = typeof rawDate === "string" ? [rawDate, time].filter(Boolean).join(", ") : (rawDate?.when ?? "");
    const venue = (e.venue ?? {}) as { name?: string };
    const address = Array.isArray(e.address) ? (e.address as string[]) : [];
    const tickets = Array.isArray(e.ticket_info) ? (e.ticket_info as Array<{ source?: string }>) : [];
    return {
      sourceId: String(e.link ?? `${q}#${e.title ?? i}`),
      title: String(e.title ?? ""),
      when,
      startDate,
      venueName: venue.name ?? (typeof e.type === "string" ? e.type : undefined) ?? address[0] ?? "",
      address: address.join(", "),
      link: typeof e.link === "string" ? e.link : undefined,
      description: String(e.description ?? ""),
      thumbnail: typeof e.thumbnail === "string" ? e.thumbnail : typeof e.image === "string" ? e.image : undefined,
      ticketSources: tickets.map((t) => t.source ?? "").filter(Boolean),
      query: q,
    };
  });
}

export async function searchPlaces(
  serp: SerpApi,
  args: { interest: string; area: Area; weekKey: string },
): Promise<RawPlace[]> {
  const c = countryInfo(args.area.country);
  const { lat, lng } = args.area.center;
  const { data } = await serp.search<{ local_results?: Array<Record<string, unknown>> }>(
    "google_maps",
    { type: "search", q: args.interest, ll: `@${lat},${lng},13z`, gl: c.serpapi.gl, hl: c.serpapi.hl },
    { week: args.weekKey, note: `places: ${args.interest}` },
  );
  return (data.local_results ?? []).map((p) => {
    const gps = p.gps_coordinates as { latitude?: number; longitude?: number } | undefined;
    return {
      sourceId: String(p.place_id ?? p.data_id ?? p.title),
      title: String(p.title ?? ""),
      type: String(p.type ?? ""),
      types: Array.isArray(p.types) ? (p.types as string[]) : [],
      address: String(p.address ?? ""),
      location:
        gps?.latitude !== undefined && gps.longitude !== undefined ? { lat: gps.latitude, lng: gps.longitude } : null,
      rating: typeof p.rating === "number" ? p.rating : undefined,
      reviews: typeof p.reviews === "number" ? p.reviews : undefined,
      hours: typeof p.hours === "string" ? p.hours : undefined,
      description: typeof p.description === "string" ? p.description : undefined,
      thumbnail: typeof p.thumbnail === "string" ? p.thumbnail : undefined,
      query: args.interest,
    };
  });
}

export interface DirectionsArgs {
  fromStop: { name: string; location: LatLng };
  to: { name: string; address: string; location?: LatLng | null };
  /** Unix seconds for the departure. */
  departAt: number;
  area: Area;
  weekKey: string;
  mode?: "transit" | "walking";
}

/** Raw google_maps_directions response for a trip, kept as returned; parsed by routes.ts. */
export async function getDirections(serp: SerpApi, args: DirectionsArgs): Promise<Record<string, unknown>> {
  const c = countryInfo(args.area.country);
  const params: Record<string, string> = {
    start_coords: `${args.fromStop.location.lat},${args.fromStop.location.lng}`,
    travel_mode: args.mode === "walking" ? "2" : "3",
    hl: c.serpapi.hl,
    gl: c.serpapi.gl,
    distance_unit: c.distanceUnit === "mi" ? "1" : "0",
  };
  if (args.to.location) params.end_coords = `${args.to.location.lat},${args.to.location.lng}`;
  else params.end_addr = args.to.address;
  if (args.mode !== "walking") {
    params.time = `depart_at:${args.departAt}`;
    params.route = "2";
  }
  const { data } = await serp.search("google_maps_directions", params, {
    week: args.weekKey,
    note: `directions: ${args.fromStop.name} to ${args.to.name} (${args.mode ?? "transit"})`,
  });
  return data;
}
