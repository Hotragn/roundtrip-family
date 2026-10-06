import "server-only";
import { anonymizedPerson } from "@roundtrip/agent/people";
import { languageNameIn } from "@roundtrip/core";
import { HOUSEHOLDS, type HouseholdKey } from "./plan-board";

/**
 * What Roundtrip remembers about a household, for the dashboard: the people the parents know,
 * the places they've been and how each went. All of it is the fictional persona's synthetic
 * history (data/persona/), kept on the family's side; the planner sees it only as the anonymized
 * sentence and the numbers shown here.
 */

export interface PersonView {
  id: string;
  label: string;
  relation: string;
  whereMet: string;
  languageName: string;
  sharedWords: string[];
  notes: string;
  knows: string[];
  /** Exactly what the planner is told about this person. */
  plannerSees: string;
}

export interface Visit {
  id: string;
  title: string;
  kind: string;
  category: string;
  who: string[];
  withYou: boolean;
  day: string | null;
  went: boolean;
  enjoyment: number | null;
  wouldRepeat: "yes" | "no" | "maybe" | null;
  notes: string;
}

export interface PlaceView {
  id: string;
  name: string;
  kind: string;
  category: string;
  visits: number;
  average: number | null;
  wouldRepeat: "yes" | "no" | "maybe" | null;
  withYou: number;
  onTheirOwn: number;
  who: string[];
  notes: string[];
}

export const KIND_WORDS: Record<string, string> = {
  temple: "Temple",
  place_of_worship: "Place of worship",
  indian_grocery: "Indian grocery",
  asian_grocery: "Asian grocery",
  supermarket: "Supermarket",
  warehouse_store: "Warehouse store",
  pharmacy: "Pharmacy",
  mall: "Shopping center",
  cafe: "Café",
  park: "Park",
  walk: "A walk",
  farmers_market: "Market",
  museum: "Museum",
  library: "Library",
  senior_center: "Senior center",
  friend_home: "At friends'",
  neighbor_home: "At a neighbor's",
  home: "At home",
  community_event: "Community event",
  community_meeting: "Community group",
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");

export function loadMemory(key: HouseholdKey): { people: PersonView[]; visits: Visit[]; places: PlaceView[] } {
  const b = HOUSEHOLDS[key].bundle();
  const name = (id: string) => b.parents.find((p) => p._id === id)?.firstName ?? id;
  const people: PersonView[] = b.people.map((p) => ({
    id: p._id,
    label: p.label,
    relation: p.relation,
    whereMet: p.whereMet ?? "",
    languageName: p.language === "zh" ? "Mandarin" : languageNameIn(p.language, "en"),
    sharedWords: p.sharedWords,
    notes: p.notes ?? "",
    knows: p.knownParentIds.map(name),
    plannerSees: anonymizedPerson(p, b.parents),
  }));

  const visits: Visit[] = b.pastOutings.map((o) => ({
    id: o._id,
    title: o.title,
    kind: KIND_WORDS[o.features.category] ?? o.features.category.replace(/_/g, " "),
    category: o.features.category,
    who: o.parentIds.map(name),
    withYou: Boolean(o.features.withAdultChild),
    day: o.features.dayOfWeek ?? null,
    went: Boolean(o.result?.went),
    enjoyment: o.result?.enjoyment ?? null,
    wouldRepeat: (o.result?.wouldRepeat as Visit["wouldRepeat"]) ?? null,
    notes: o.result?.notes ?? "",
  }));

  // One row per place they went to, the same place's visits together.
  const byPlace = new Map<string, Visit[]>();
  for (const v of visits.filter((x) => x.went)) {
    const k = slug(v.title.replace(/\s+with .*$/i, ""));
    byPlace.set(k, [...(byPlace.get(k) ?? []), v]);
  }
  const places: PlaceView[] = [...byPlace.entries()].map(([id, vs]) => {
    const rated = vs.filter((v) => v.enjoyment !== null);
    const first = vs[0]!;
    return {
      id,
      name: first.title.replace(/\s+with .*$/i, ""),
      kind: first.kind,
      category: first.category,
      visits: vs.length,
      average: rated.length ? rated.reduce((s, v) => s + (v.enjoyment ?? 0), 0) / rated.length : null,
      wouldRepeat: vs.at(-1)?.wouldRepeat ?? null,
      withYou: vs.filter((v) => v.withYou).length,
      onTheirOwn: vs.filter((v) => !v.withYou).length,
      who: [...new Set(vs.flatMap((v) => v.who))],
      notes: [...new Set(vs.map((v) => v.notes).filter(Boolean))],
    };
  });
  places.sort((a, b) => (b.average ?? 0) - (a.average ?? 0) || b.visits - a.visits);
  return { people, visits, places };
}
