import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COUNTRIES } from "./countries";
import { Household } from "./schema/household";
import { Outing, type OutingFeatures } from "./schema/outing";
import { Parent } from "./schema/parent";
import { Person } from "./schema/person";
import { repoRoot } from "./server-env";

/**
 * Loads the fictional persona (data/persona/) and the synthetic Germany household
 * (data/demo/households/munich.json) into the shared schemas. Everything returned is
 * synthetic and labeled that way.
 */

export interface HouseholdBundle {
  household: Household;
  parents: Parent[];
  people: Person[];
  pastOutings: Outing[];
}

/** Minimal CSV parser for the persona file: commas, double-quoted fields, no embedded newlines. */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => l.trim().length > 0);
  const split = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = !quoted;
      } else if (ch === "," && !quoted) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const header = split(lines[0] ?? "");
  return lines.slice(1).map((line) => {
    const cells = split(line);
    return Object.fromEntries(header.map((h, i) => [h, (cells[i] ?? "").trim()]));
  });
}

const DAY: Record<string, OutingFeatures["dayOfWeek"]> = {
  Monday: "mon",
  Tuesday: "tue",
  Wednesday: "wed",
  Thursday: "thu",
  Friday: "fri",
  Saturday: "sat",
  Sunday: "sun",
};

const HOUR: Record<string, number> = { morning: 9, afternoon: 14, evening: 18 };

/** Weather words in the persona file, as a rough temperature and rain chance. */
const WEATHER: Record<string, { tempC: number; rain: number }> = {
  very_hot: { tempC: 35, rain: 0 },
  hot: { tempC: 30, rain: 0 },
  pleasant: { tempC: 22, rain: 0.05 },
  air_conditioned: { tempC: 30, rain: 0 },
  cool: { tempC: 15, rain: 0.1 },
  rainy: { tempC: 14, rain: 0.8 },
};

/** Estimated group size by kind of place, used for history and candidates alike. */
export const GROUP_SIZE: Record<string, OutingFeatures["groupSize"]> = {
  temple: "large",
  place_of_worship: "large",
  mall: "large",
  warehouse_store: "large",
  supermarket: "medium",
  indian_grocery: "medium",
  asian_grocery: "medium",
  cafe: "medium",
  park: "medium",
  walk: "solo",
  home: "solo",
  pharmacy: "small",
  friend_home: "small",
  neighbor_home: "small",
  community_event: "large",
  community_meeting: "medium",
};

const yes = (v: string | undefined) => (v === "yes" ? true : v === "no" ? false : null);
const num = (v: string | undefined) => (v === undefined || v === "" ? null : Number(v));

function foodAt(row: Record<string, string>): boolean | null {
  const notes = (row.notes ?? "").toLowerCase();
  const place = (row.place ?? "").toLowerCase();
  if (place.includes("cafeteria") || notes.includes("dinner") || place.includes("tea")) return true;
  if (row.place_type === "community_event") return true;
  if (row.place_type === "friend_home") return true;
  return false;
}

export function featuresFromPersonaRow(row: Record<string, string>): OutingFeatures {
  const w = row.weather ? WEATHER[row.weather] : undefined;
  const transport = row.transport ?? "";
  const travel = num(row.travel_minutes);
  return {
    category: row.place_type ?? "other",
    languageMatch: (Number(row.language_match) || 0) as 0 | 1 | 2,
    travelMinutes: travel,
    transfers: transport === "" ? null : 0,
    walkingMinutes: transport === "walked" ? travel : transport === "" ? null : 2,
    startHour: row.time_of_day ? (HOUR[row.time_of_day] ?? null) : null,
    dayOfWeek: row.day_of_week ? (DAY[row.day_of_week] ?? null) : null,
    weather: row.weather || null,
    temperatureC: w ? w.tempC : null,
    rainChance: w ? w.rain : null,
    indoor: row.indoor === "indoor" ? true : row.indoor === "outdoor" ? false : null,
    groupSize: GROUP_SIZE[row.place_type ?? ""] ?? null,
    costUsd: num(row.cost_usd),
    knowsSomeone: yes(row.knew_someone),
    foodAvailable: foodAt(row),
    daysSinceLastOuting: null,
    withAdultChild: yes(row.with_adult_child),
    languageNeeded: yes(row.language_needed),
  };
}

interface PersonaFile {
  household: Record<string, unknown>;
  parents: Array<
    Record<string, unknown> & {
      label: string;
      address_as: string;
      english_words_known: string[];
      interests: string[];
      not_interested: string[];
    }
  >;
  people_met: Array<{ label: string; relation: string; language: string; connection: string }>;
  feeling_words: Array<{ feeling: string; words: string[] }>;
}

export function loadPersonaFile(root = repoRoot()): PersonaFile {
  return JSON.parse(readFileSync(join(root, "data/persona/household.json"), "utf8")) as PersonaFile;
}

/** The feeling words from the persona, exactly as written (Telugu with transliteration). */
export function personaFeelingWords(root = repoRoot()): Array<{ feeling: string; words: string[] }> {
  return loadPersonaFile(root).feeling_words;
}

const CREATED = "2026-10-05T09:00:00-07:00";

export function loadFremontPersona(root = repoRoot()): HouseholdBundle {
  const persona = loadPersonaFile(root);
  const us = COUNTRIES.US!;
  const householdId = "hh_fremont";

  const household = Household.parse({
    _id: householdId,
    slug: "fremont-demo",
    provenance: "synthetic",
    hostCountry: "US",
    localLanguage: "en",
    timezone: "America/Los_Angeles",
    metroArea: "Fremont, California (San Francisco Bay Area)",
    homeArea: {
      label: "Mowry Ave & Fremont Blvd",
      nearestStop: { name: "Mowry Ave & Fremont Blvd", location: { lat: 37.5547, lng: -121.9848 } },
      areaCenter: { lat: 37.555, lng: -121.982 },
      searchLocation: "Fremont, California, United States",
    },
    emergency: us.emergency,
    contacts: [{ role: "adult_child", label: "Your child", phone: "+1 510 555 0142", fictional: true }],
    helpCardText:
      "Hello. I am visiting my family and I speak very little English. Please call my family at this number. Thank you.",
    aloneWindows: ["mon", "wed", "fri"].map((day) => ({ day, start: "08:30", end: "17:30" })),
    safety: {
      bufferMinutes: 45,
      nudgeWaitMinutes: 20,
      daylightOnly: true,
      weather: {
        blockIce: true,
        blockHeavySnow: true,
        blockHeatAdvisory: true,
        shadeWarningAboveC: 30,
      },
    },
    trialRunDays: ["sat", "sun"],
    phonePlan: { hasLocalPlan: false, wifiOnly: true },
    notes: "Apartment complex, two bedrooms, balcony. Not walkable in practice; patchy sidewalks, no shade.",
  });

  const [sarala, venkat] = persona.parents;
  if (!sarala || !venkat) throw new Error("Persona file must list two parents.");

  const parents = [
    Parent.parse({
      _id: "p_sarala",
      householdId,
      provenance: "synthetic",
      firstName: "Sarala",
      addressAs: sarala.address_as,
      language: "te",
      dialectNotes: "Coastal Andhra, Guntur dialect. Never Telangana forms.",
      otherLanguages: [{ code: "hi", level: "understands" }],
      readingSupport: "audio_first",
      localWordsKnown: sarala.english_words_known,
      interests: sarala.interests,
      notInterested: sarala.not_interested,
      dislikes: ["big, loud stores", "walking in heat with no shade", "speaking English to shop staff alone"],
      mobility: {
        maxWalkMinutes: 45,
        maxTransfers: 1,
        transitComfort: "with_company",
        notes: "Knees hurt after 45 to 60 minutes. Stairs up are fine; she dislikes going down.",
      },
      weather: { avoid: ["cold", "wind"], minComfortC: 16, maxComfortC: 38 },
      bestTimes: [
        { start: "06:30", end: "10:00" },
        { start: "17:00", end: "19:00" },
      ],
      naps: [{ start: "13:00", end: "15:00" }],
      diet: "Vegetarian; eats onion and garlic. Needs rice and pickle.",
      settings: { useDiaryForPlanning: false },
    }),
    Parent.parse({
      _id: "p_venkat",
      householdId,
      provenance: "synthetic",
      firstName: "Venkat",
      addressAs: venkat.address_as,
      language: "te",
      dialectNotes: "Coastal Andhra; West Godavari roots, 30+ years in Guntur.",
      otherLanguages: [{ code: "hi", level: "speaks" }],
      readingSupport: "text_with_sign_words",
      localWordsKnown: venkat.english_words_known,
      interests: venkat.interests,
      notInterested: venkat.not_interested,
      dislikes: ["big, loud stores", "paying for coffee he doesn't like", "supermarkets with too many brands"],
      mobility: {
        maxWalkMinutes: 60,
        maxTransfers: 1,
        transitComfort: "with_company",
        notes: "An hour easily. An old right-knee injury makes long walks on hard surfaces uncomfortable.",
      },
      weather: { avoid: ["rain"], minComfortC: 10, maxComfortC: 40 },
      bestTimes: [
        { start: "06:00", end: "09:00" },
        { start: "16:30", end: "18:30" },
      ],
      naps: [{ start: "13:00", end: "15:00" }],
      diet: "Vegetarian; eats onion and garlic. Rice daily and filter coffee every morning.",
      settings: { useDiaryForPlanning: false },
    }),
  ];

  const chen = persona.people_met[0];
  const people = chen
    ? [
        Person.parse({
          _id: "pp_chen",
          householdId,
          provenance: "synthetic",
          label: chen.label,
          relation: chen.relation,
          whereMet: "At the mailboxes",
          language: "zh",
          sharedWords: ["hello", "good", "thank you", "very good", "eat?"],
          notes: "Shares food and photos of grandchildren about twice a week. Suggested 99 Ranch Market.",
          metAtOutingIds: [],
          knownParentIds: ["p_sarala"],
        }),
      ]
    : [];

  const rows = parseCsv(readFileSync(join(root, "data/persona/outings.csv"), "utf8"));
  const pastOutings = rows.map((row) =>
    Outing.parse({
      _id: `o_fremont_${row.id}`,
      householdId,
      provenance: "synthetic",
      week: null,
      title: row.place,
      venueName: row.place,
      parentIds: row.who === "both" ? ["p_sarala", "p_venkat"] : row.who === "Venkat" ? ["p_venkat"] : ["p_sarala"],
      plannedStart: null,
      expectedReturn: null,
      status: "past",
      ladderLevel: null,
      features: featuresFromPersonaRow(row),
      reasons: [],
      needsTrialRun: false,
      result: {
        went: row.went === "1",
        enjoyment: row.enjoyment ? Number(row.enjoyment) : null,
        face: null,
        peopleMet: [],
        wouldRepeat: (row.would_repeat || null) as "yes" | "no" | "maybe" | null,
        notes: row.notes || undefined,
      },
      createdAt: CREATED,
    }),
  );

  return { household, parents, people, pastOutings };
}

/** The synthetic Germany household, written in the shared schemas already. */
export function loadMunichHousehold(root = repoRoot()): HouseholdBundle {
  const raw = JSON.parse(readFileSync(join(root, "data/demo/households/munich.json"), "utf8")) as {
    household: unknown;
    parents: unknown[];
    people: unknown[];
    pastOutings: unknown[];
  };
  return {
    household: Household.parse(raw.household),
    parents: raw.parents.map((p) => Parent.parse(p)),
    people: raw.people.map((p) => Person.parse(p)),
    pastOutings: raw.pastOutings.map((o) => Outing.parse(o)),
  };
}

export function loadDemoHouseholds(root = repoRoot()): HouseholdBundle[] {
  return [loadFremontPersona(root), loadMunichHousehold(root)];
}
