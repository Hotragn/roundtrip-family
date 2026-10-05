/**
 * Builds the parents' app week for each demo household from its plan: the approved outings,
 * their live routes (SerpApi directions, saved as fixtures), coordinates for the stop before
 * theirs (for the "your stop is next" alert), a card for each parent (Gemma card writer until
 * the Tinker LoRA is trained), practice phrases, the driver card and the steps.
 * Writes data/demo/weeks/<household>.json. The family is synthetic; places and routes are live.
 * Run: pnpm --filter @roundtrip/scripts exec tsx build-week.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { countryInfo, type Route } from "@roundtrip/core";
import {
  type HouseholdBundle,
  loadFremontPersona,
  loadMunichHousehold,
  personaFeelingWords,
} from "@roundtrip/core/persona";
import { loadEnv, repoRoot } from "@roundtrip/core/server-env";

await loadEnv();
const { SerpApi } = await import("../agent/src/tools/serpapi");
const { areaOf, getDirections, localWallClock } = await import("../agent/src/tools/discovery");
const { geocodeVenue } = await import("../agent/src/tools/geocode");
const { parseDirections, walkingPhotos } = await import("../agent/src/routes/parse");
const { stepsFor } = await import("../agent/src/cards/steps");
const { phrasesFor, DRIVER, FRIEND_WORDS } = await import("../agent/src/cards/phrases");
const { GemmaCardWriter } = await import("../agent/src/cards/writer");
const { tripMode } = await import("../agent/src/planner/candidates");
const { fmt } = await import("../agent/src/planner/slots");

const ROOT = repoRoot();
const WEEK_MONDAY = "2026-10-05";
const DAY_INDEX: Record<string, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
const TE_DAY: Record<string, string> = {
  mon: "సోమవారం",
  tue: "మంగళవారం",
  wed: "బుధవారం",
  thu: "గురువారం",
  fri: "శుక్రవారం",
  sat: "శనివారం",
  sun: "ఆదివారం",
};

/** Demo approvals, as the adult child might make them: three outings, leaving one to approve or swap on the dashboard. */
const APPROVE: Record<string, string[]> = {
  fremont: ["Karya Siddhi Hanuman Temple - Fremont", "Sri Siddhi Vinayaka Cultural Center", "Indian Market"],
  munich: ["Hariom Temple", "Desi Markt", "Balan Park"],
};

const display = (title: string) => title.replace(/\s+[-|]\s+.*$/, "").trim();
const dateOf = (day: string) => {
  const d = new Date(`${WEEK_MONDAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (DAY_INDEX[day] ?? 0));
  return d.toISOString().slice(0, 10);
};

interface PlanFile {
  suggestions: Array<{
    id: string;
    candidate: {
      id: string;
      title: string;
      venueName: string;
      address: string;
      location: { lat: number; lng: number } | null;
      category: string;
      indoor: boolean | null;
      description: string;
      photo?: { url: string; credit: string };
      ladderLevel: number;
    };
    role: "mother" | "father" | "both";
    parentIds: string[];
    slot: { day: string; depart: number; back: number; withAdultChild: boolean };
    ladderLevel: number;
    ladderLabel: string;
    reasonText: string;
    chips: Array<{ label: string; direction: string }>;
    score: { combined: number; pGo: number; enjoyment: number; rank: number };
    firstRideTogether: boolean;
    bringSomeone: { personId: string; label: string; why: string } | null;
    joinCard: { kind: string; local: string; meaning: string; askWho: string } | null;
    features?: { travelMinutes: number | null };
  }>;
  note: string;
}

const serp = new SerpApi();
const writer = new GemmaCardWriter();

async function build(key: string, bundle: HouseholdBundle) {
  const h = bundle.household;
  const country = countryInfo(h.hostCountry);
  const area = areaOf(h);
  const plan = JSON.parse(readFileSync(join(ROOT, `data/demo/plans/${key}.json`), "utf8")) as PlanFile;
  const approvedTitles = APPROVE[key] ?? [];
  let firstCard = true;
  const outings = [];
  for (const s of plan.suggestions) {
    const approved = approvedTitles.includes(s.candidate.title);
    const venue = display(s.candidate.title);
    const date = dateOf(s.slot.day);
    const parents = bundle.parents.filter((p) => s.parentIds.includes(p._id));
    let route: Route | null = null;
    let photos: string[] = [];
    if (approved && !s.slot.withAdultChild && s.candidate.location) {
      const mode = tripMode(h.homeArea.nearestStop.location, s.candidate.location);
      const data = await getDirections(serp, {
        fromStop: h.homeArea.nearestStop,
        to: { name: venue, address: s.candidate.address, location: s.candidate.location },
        departAt: localWallClock(date, s.slot.depart),
        area,
        weekKey: "2026-W41",
        mode: mode === "walk" ? "walking" : "transit",
      });
      const maxWalk = Math.min(...parents.map((p) => p.mobility.maxWalkMinutes));
      route = parseDirections(data, {
        from: h.homeArea.nearestStop,
        to: { name: venue, location: s.candidate.location },
        maxWalkMinutes: maxWalk,
      });
      photos = walkingPhotos(data).slice(0, 6);
      // Coordinates for the stop before theirs and their stop, for the offline "your stop is next" alert.
      for (const leg of route?.legs ?? []) {
        if (leg.mode === "walk") continue;
        const town = h.homeArea.searchLocation.split(",")[0];
        if (leg.stopBefore)
          leg.stopBefore.location =
            (await geocodeVenue(`${leg.stopBefore.name}, ${town}`, { countryCode: h.hostCountry })) ?? undefined;
        leg.to.location = (await geocodeVenue(`${leg.to.name}, ${town}`, { countryCode: h.hostCountry })) ?? undefined;
      }
    }
    const transit = route?.legs.filter((l) => l.mode !== "walk") ?? [];
    const lastTransit = transit.at(-1);
    // Back-by time from the real route: the time at the place stays as planned, the trip uses live minutes.
    const estimated = s.features?.travelMinutes ?? 0;
    const stay = s.slot.back - s.slot.depart - 2 * estimated;
    const back = route ? s.slot.depart + 2 * route.totalMinutes + stay : s.slot.back;
    const tripText = route
      ? route.legs
          .map((l) =>
            l.mode === "walk"
              ? `walk ${l.durationMinutes} minutes to ${l.to.name}`
              : `take Bus ${l.line?.name} toward ${l.line?.headsign} for ${l.numStops} stops, get off at ${l.to.name}`,
          )
          .join("; ")
      : s.slot.withAdultChild
        ? "you go together by car"
        : "a short trip";
    const cards = [];
    for (const p of approved ? parents : []) {
      const role = p.addressAs.includes("నాన్న") ? "father" : "mother";
      const first = transit[0];
      const names = first ? [venue, `Bus ${first.line?.name}`, first.from.name, lastTransit!.to.name] : [venue];
      const optionalNames = transit
        .slice(1)
        .flatMap((l) => [`Bus ${l.line?.name}`, l.from.name, l.to.name])
        .concat(first ? [first.to.name] : []);
      const numbers = [
        fmt(s.slot.depart),
        fmt(back),
        ...transit.map((l) => String(l.numStops)),
        ...(route?.legs.filter((l) => l.mode === "walk").map((l) => String(l.durationMinutes)) ?? []),
      ];
      const written = await writer.write({
        addressee: role,
        addressAs: p.addressAs,
        venue,
        day: TE_DAY[s.slot.day] ?? s.slot.day,
        departTime: fmt(s.slot.depart),
        backTime: fmt(back),
        trip: tripText,
        whatsThere: s.candidate.description || s.ladderLabel,
        names: [...new Set(names)],
        optionalNames: [...new Set(optionalNames)].filter((n) => !names.includes(n)),
        numbers,
        firstCard: firstCard && role === "mother",
      });
      cards.push({
        parentId: p._id,
        role,
        title: written.title,
        body: written.body,
        writer: written.writer,
        rubric: written.rubric,
        phrases: phrasesFor(s.candidate.category, h.localLanguage, transit.length > 0),
        driver: {
          lead: DRIVER[h.localLanguage]?.lead ?? DRIVER.en!.lead,
          stopName: lastTransit?.to.name ?? venue,
          thanks: DRIVER[h.localLanguage]?.thanks ?? DRIVER.en!.thanks,
        },
        steps: route ? stepsFor(route, venue, h.localLanguage) : [],
      });
    }
    if (cards.some((c) => c.role === "mother")) firstCard = false;
    outings.push({
      id: s.id,
      status: approved ? "approved" : "suggested",
      venue,
      title: s.candidate.title,
      address: s.candidate.address,
      location: s.candidate.location,
      category: s.candidate.category,
      indoor: s.candidate.indoor,
      ladderLevel: s.ladderLevel,
      ladderLabel: s.ladderLabel,
      reasonText: s.reasonText,
      chips: s.chips,
      score: s.score,
      role: s.role,
      parentIds: s.parentIds,
      date,
      slot: { ...s.slot, back },
      withAdultChild: s.slot.withAdultChild,
      firstRideTogether: s.firstRideTogether,
      bringSomeone: s.bringSomeone,
      joinCard: s.joinCard,
      photo: s.candidate.photo ?? null,
      landmarkPhotos: photos,
      route,
      cards,
    });
    console.log(
      `${key}: ${approved ? "approved" : "suggested"} ${venue} ${s.slot.day} ${fmt(s.slot.depart)}${route ? ` (${route.source}, ${route.totalMinutes} min, ${route.transfers} transfers)` : ""}${cards.map((c) => ` | card ${c.role} ${c.rubric.passed ? "passes" : `fails: ${c.rubric.failures.join(", ")}`}`).join("")}`,
    );
  }
  const week = {
    provenance: "synthetic",
    note: "Fictional household. Places, events and routes come from live searches; cards are written by the card writer.",
    household: {
      id: h._id,
      slug: h.slug,
      hostCountry: h.hostCountry,
      localLanguage: h.localLanguage,
      timezone: h.timezone,
      metroArea: h.metroArea,
      homeArea: h.homeArea.label,
      helpCardText: h.helpCardText,
      localPhrases: h.localPhrases,
      contact: h.contacts[0],
      emergency: country.emergency,
      secondaryEmergency: country.secondaryEmergency ?? null,
      safety: h.safety,
    },
    parents: bundle.parents.map((p) => ({
      id: p._id,
      firstName: p.firstName,
      addressAs: p.addressAs,
      role: p.addressAs.includes("నాన్న") ? "father" : "mother",
      language: p.language,
      readingSupport: p.readingSupport,
    })),
    people: bundle.people.map((p) => ({
      id: p._id,
      label: p.label,
      relation: p.relation,
      language: p.language,
      knownParentIds: p.knownParentIds,
      words: FRIEND_WORDS[p.language] ?? [],
    })),
    feelingWords: personaFeelingWords(),
    week: { key: "2026-W41", monday: WEEK_MONDAY, label: "5 to 11 October 2026" },
    planNote: plan.note,
    outings,
  };
  mkdirSync(join(ROOT, "data/demo/weeks"), { recursive: true });
  writeFileSync(join(ROOT, `data/demo/weeks/${h.slug}.json`), `${JSON.stringify(week, null, 1)}\n`, "utf8");
  console.log(
    `Wrote data/demo/weeks/${h.slug}.json (${outings.filter((o) => o.status === "approved").length} approved). Searches used: ${await serp.used()} of ${serp.cap}`,
  );
}

await build("fremont", loadFremontPersona());
await build("munich", loadMunichHousehold());
