import type { LadderLevel } from "@roundtrip/core";

/**
 * The fallback ladder (docs/plan.md section 8). The planner works down the levels until it has
 * two or three good suggestions. Queries carry only language, interest and area.
 */

export interface CultureProfile {
  /** The parents' language as it is searched, e.g. "Telugu". */
  languageName: string;
  /** Wider culture groups for level 2, e.g. "Indian", "South Asian". */
  cultures: string[];
  /** Festivals by month (1-12), for event searches in season. */
  festivals: Record<number, string[]>;
  /** Kinds of shared-culture places. */
  culturePlaces: string[];
}

export const CULTURES: Record<string, CultureProfile> = {
  te: {
    languageName: "Telugu",
    cultures: ["Indian", "South Asian", "Hindi"],
    festivals: {
      1: ["Sankranti", "Pongal"],
      3: ["Ugadi"],
      4: ["Ugadi", "Sri Rama Navami"],
      8: ["Varalakshmi Vratham", "Vinayaka Chavithi"],
      9: ["Vinayaka Chavithi", "Bathukamma"],
      10: ["Bathukamma", "Dasara", "Navratri"],
      11: ["Diwali", "Karthika Deepam"],
    },
    culturePlaces: ["Hindu temple", "Indian grocery store"],
  },
};

export interface LadderQuery {
  level: LadderLevel;
  engine: "google_events" | "google_maps";
  /** The interest part of the query; the area is added by the caller. */
  interest: string;
  /** Kind of place, for google_maps searches. */
  placeType?: string;
}

/** Queries for one level, given the language, the month and the local language. */
export function ladderQueries(
  language: string,
  month: number,
  localLanguage: string,
): Record<LadderLevel, LadderQuery[]> {
  const c = CULTURES[language];
  if (!c) throw new Error(`No culture profile for ${language}. Add one to agent/src/discovery/ladder.ts.`);
  const de = localLanguage === "de";
  const festivals = c.festivals[month] ?? [];
  return {
    1: [
      { level: 1, engine: "google_events", interest: `${c.languageName} events` },
      { level: 1, engine: "google_events", interest: `${c.languageName} association` },
      ...festivals
        .slice(0, 2)
        .map((f) => ({ level: 1 as const, engine: "google_events" as const, interest: `${f} celebration` })),
    ],
    2: [
      { level: 2, engine: "google_events", interest: `${c.cultures[0]} community events` },
      ...c.culturePlaces.map((p) => ({
        level: 2 as const,
        engine: "google_maps" as const,
        interest: de ? germanPlace(p) : p,
        placeType: p,
      })),
    ],
    3: [
      { level: 3, engine: "google_maps", interest: de ? "Park" : "park walking trail", placeType: "park" },
      { level: 3, engine: "google_maps", interest: de ? "Wochenmarkt" : "farmers market", placeType: "farmers_market" },
    ],
    4: [
      { level: 4, engine: "google_maps", interest: de ? "Seniorentreff" : "senior center", placeType: "senior_center" },
      { level: 4, engine: "google_maps", interest: de ? "Stadtbibliothek" : "public library", placeType: "library" },
      {
        level: 4,
        engine: "google_events",
        interest: de ? "Senioren Veranstaltungen" : "senior events library programs",
      },
    ],
    // Level 5 reuses places already found (a park or market at the same time each week).
    5: [],
  };
}

function germanPlace(p: string): string {
  if (p === "Hindu temple") return "Hindu Tempel";
  if (p === "Indian grocery store") return "Indischer Supermarkt";
  return p;
}

/** Level for an understood listing: language first, then the kind of thing it is. */
export function levelFor(languageMatch: 0 | 1 | 2, category: string): LadderLevel {
  if (languageMatch === 2) return 1;
  if (languageMatch === 1) return 2;
  if (/(senior|library|conversation|class|volunteer|newcomer|yoga|garden)/i.test(category)) return 4;
  return 3;
}

/** The honest sentence the reason starts with, by level. */
export function ladderReason(level: LadderLevel, languageName: string, foundSameLanguage: boolean): string {
  switch (level) {
    case 1:
      return `${languageName}-speaking group.`;
    case 2:
      return foundSameLanguage
        ? "Shared culture, with Hindi and other Indian languages around."
        : `No ${languageName} events nearby this week. Shared culture, with Hindi and other Indian languages around.`;
    case 3:
      return foundSameLanguage
        ? "No language needed here."
        : `No ${languageName} events nearby this week. No language needed here.`;
    case 4:
      return "A program for newcomers and older adults, with staff to help.";
    case 5:
      return "A regular routine: the same place at the same time each week, so faces become familiar.";
  }
}
