import { countryInfo, type Household } from "@roundtrip/core";
import { CULTURES, ladderQueries } from "../discovery/ladder";
import { listingText, understandListing } from "../discovery/understand";
import { areaOf, searchEvents, searchPlaces } from "../tools/discovery";
import { geocodeVenue } from "../tools/geocode";
import type { SerpApi } from "../tools/serpapi";
import {
  type Candidate,
  candidateFromEvent,
  candidateFromPlace,
  isGoodPlace,
  mergeCandidates,
  placeOrder,
} from "./candidates";

/**
 * Discovery down the fallback ladder: searches each level (from the cache when the week has
 * been searched before), understands event listings with Gemma, keeps venues of the expected
 * kind, and merges duplicates. Queries carry only language, interest and area.
 */

/** UTC offset for the demo weeks (daylight time in early October). */
const OFFSETS: Record<string, string> = {
  "America/Los_Angeles": "-07:00",
  "America/Denver": "-06:00",
  "Europe/Berlin": "+02:00",
};

export async function discoverCandidates(
  h: Household,
  opts: { serp: SerpApi; weekKey: string; weekLabel: string; month: number; language?: string; perKind?: number },
): Promise<{ candidates: Candidate[]; searched: number; missing: number }> {
  const language = opts.language ?? "te";
  const culture = CULTURES[language];
  if (!culture) throw new Error(`No culture profile for ${language}.`);
  const area = areaOf(h);
  const home = h.homeArea.nearestStop.location;
  const ladder = ladderQueries(language, opts.month, h.localLanguage);
  const out: Candidate[] = [];
  let searched = 0;
  let missing = 0;
  for (const level of [1, 2, 3, 4] as const) {
    for (const q of ladder[level]) {
      try {
        if (q.engine === "google_maps") {
          const places = (await searchPlaces(opts.serp, { interest: q.interest, area, weekKey: opts.weekKey }))
            .filter(isGoodPlace)
            .sort((a, b) => placeOrder(a, home) - placeOrder(b, home))
            .slice(0, opts.perKind ?? 2);
          for (const p of places) {
            const c = candidateFromPlace(p, culture.languageName);
            if (c) out.push(c);
          }
        } else {
          const events = await searchEvents(opts.serp, {
            interest: q.interest,
            area,
            when: "week",
            weekKey: opts.weekKey,
          });
          for (const e of events) {
            const u = await understandListing(
              listingText(e),
              {
                week: opts.weekLabel,
                offset: OFFSETS[h.timezone] ?? "+00:00",
                currency: countryInfo(h.hostCountry).currency,
              },
              { dataClass: "public" },
            );
            if (!u.suitsOlderAdults) continue;
            const where = e.address || e.venueName;
            const location = where ? await geocodeVenue(where, { countryCode: h.hostCountry }) : null;
            out.push(candidateFromEvent(e, u, location));
          }
        }
        searched++;
      } catch (err) {
        if (err instanceof Error && (err.name === "FixtureMissing" || err.name === "SearchBudgetReached")) {
          missing++;
          continue;
        }
        throw err;
      }
    }
  }
  return { candidates: mergeCandidates(out), searched, missing };
}
