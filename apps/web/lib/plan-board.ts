import "server-only";
import fremontPlan from "@data/demo/plans/fremont.json";
import munichPlan from "@data/demo/plans/munich.json";
import type { WeeklyHours } from "@roundtrip/core/hours";
import { loadFremontPersona, loadMunichHousehold } from "@roundtrip/core/persona";
import { DEMO_WEEKS } from "./demo-weeks";
import type { BoardItem, BoardLeg, PlanBoard } from "./plan-types";
import type { OutingView, WeekView } from "./week";

/**
 * The dashboard's week: the planner's suggestions and swap options (data/demo/plans/), joined
 * with the tickets the week builder wrote for them (data/demo/weeks/: routes, cards, photos).
 * Places, events and routes are live search results; the families are synthetic.
 */

interface PlanSuggestion {
  id: string;
  candidate: {
    id: string;
    title: string;
    venueName: string;
    address: string;
    location: { lat: number; lng: number } | null;
    category: string;
    indoor: boolean | null;
    photo?: { url: string; credit: string } | null;
    hours?: WeeklyHours | null;
  };
  role: "mother" | "father" | "both";
  parentIds: string[];
  slot: { day: string; depart: number; back: number; withAdultChild: boolean };
  ladderLevel: number;
  ladderLabel: string;
  score: { pGo: number; enjoyment: number; combined: number; rank: number };
  chips: Array<{ label: string; feature?: string; direction: string }>;
  reasonText: string;
  firstRideTogether: boolean;
  bringSomeone: { personId: string; label: string; why: string } | null;
  joinCard: { kind: string; local: string; meaning: string; askWho: string } | null;
  features?: { travelMinutes?: number | null };
}
interface PlanFile {
  label: string;
  note: string;
  sameLanguageFound: boolean;
  sourceOfCandidates: string;
  suggestions: PlanSuggestion[];
  alternatives?: Record<string, PlanSuggestion[]>;
}

export const HOUSEHOLDS = {
  "fremont-demo": {
    plan: fremontPlan as unknown as PlanFile,
    bundle: () => loadFremontPersona(),
    label: "Fremont, California",
  },
  "munich-demo": {
    plan: munichPlan as unknown as PlanFile,
    bundle: () => loadMunichHousehold(),
    label: "München, Deutschland",
  },
} as const;
export type HouseholdKey = keyof typeof HOUSEHOLDS;
export const isHousehold = (s: string): s is HouseholdKey => s in HOUSEHOLDS;

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const display = (title: string) => title.replace(/\s+[-|]\s+.*$/, "").trim();

function legsOf(o: OutingView): BoardLeg[] {
  return (o.route?.legs ?? []).map((l) => ({
    mode: l.mode,
    from: { name: l.from.name, location: l.from.location },
    to: { name: l.to.name, location: l.to.location },
    minutes: l.durationMinutes,
    line: l.line,
    stops: l.numStops,
    departs: l.departureTime,
    arrives: l.arrivalTime,
    path: (Array.isArray(l.path) ? l.path : []) as unknown as Array<[number, number]>,
  }));
}

function fromOuting(o: OutingView, s: PlanSuggestion | undefined): BoardItem {
  return {
    id: o.id,
    candidateId: s?.candidate.id ?? o.id,
    title: o.venue,
    address: o.address,
    location: o.location,
    category: o.category,
    indoor: o.indoor,
    ladderLevel: o.ladderLevel,
    ladderLabel: o.ladderLabel,
    reasonText: o.reasonText,
    chips: o.chips,
    score: o.score,
    role: o.role,
    parentIds: o.parentIds,
    day: o.slot.day,
    depart: o.slot.depart,
    back: o.slot.back,
    withAdultChild: o.withAdultChild,
    firstRideTogether: o.firstRideTogether,
    bringSomeone: o.bringSomeone,
    joinCard: o.joinCard,
    photo: o.photo,
    hours: s?.candidate.hours ?? null,
    landmarkPhotos: o.landmarkPhotos,
    travelMinutes: o.route?.totalMinutes ?? s?.features?.travelMinutes ?? null,
    transfers: o.route?.transfers ?? 0,
    legs: legsOf(o),
    defaultStatus: o.status,
    hasTicket: o.cards.length > 0,
    cards: o.cards.map((c) => ({
      parentId: c.parentId,
      role: c.role,
      title: c.title,
      body: c.body,
      driver: c.driver,
      steps: c.steps.map((st) => st.text),
      phrases: c.phrases.map((p) => ({ local: p.local, pronunciation: p.pronunciation, meaning: p.meaning })),
    })),
  };
}

function fromAlternative(s: PlanSuggestion): BoardItem {
  return {
    id: s.id,
    candidateId: s.candidate.id,
    title: display(s.candidate.title),
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
    day: s.slot.day,
    depart: s.slot.depart,
    back: s.slot.back,
    withAdultChild: s.slot.withAdultChild,
    firstRideTogether: s.firstRideTogether,
    bringSomeone: s.bringSomeone,
    joinCard: s.joinCard,
    photo: s.candidate.photo ?? null,
    hours: s.candidate.hours ?? null,
    landmarkPhotos: [],
    travelMinutes: s.features?.travelMinutes ?? null,
    transfers: 0,
    legs: [],
    defaultStatus: "suggested",
    hasTicket: false,
    cards: [],
  };
}

export function loadBoard(key: HouseholdKey): PlanBoard {
  const { plan, bundle } = HOUSEHOLDS[key];
  const week = DEMO_WEEKS[key] as WeekView;
  const b = bundle();
  const monday = new Date(`${week.week.monday}T12:00:00Z`);
  const items = week.outings.map((o) =>
    fromOuting(
      o,
      plan.suggestions.find((s) => s.id === o.id),
    ),
  );
  const alternatives: Record<string, BoardItem[]> = {};
  for (const [id, list] of Object.entries(plan.alternatives ?? {})) alternatives[id] = list.map(fromAlternative);
  return {
    household: {
      slug: key,
      label: HOUSEHOLDS[key].label,
      metroArea: week.household.metroArea,
      hostCountry: week.household.hostCountry,
      localLanguage: week.household.localLanguage,
      homeArea: week.household.homeArea,
      timezone: week.household.timezone,
      emergency: week.household.emergency,
      secondaryEmergency: week.household.secondaryEmergency ?? null,
      helpCardText: week.household.helpCardText,
      localPhrases: week.household.localPhrases,
      phonePlan: b.household.phonePlan,
      contact: {
        label: week.household.contact.label,
        phone: week.household.contact.phone,
        fictional: week.household.contact.fictional,
      },
      safety: b.household.safety,
      aloneDays: [...new Set(b.household.aloneWindows.map((w) => w.day))],
      aloneTimes: b.household.aloneWindows.map((w) => ({ day: w.day, start: w.start, end: w.end })),
    },
    parents: week.parents.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      role: p.role,
      language: p.language,
      readingSupport: p.readingSupport,
    })),
    week: {
      key: week.week.key,
      label: week.week.label,
      days: DAYS.map((day, i) => {
        const d = new Date(monday);
        d.setUTCDate(d.getUTCDate() + i);
        return { day, date: d.toISOString().slice(0, 10) };
      }),
    },
    items,
    alternatives,
    note: plan.note,
    sameLanguageFound: plan.sameLanguageFound,
    sourceOfCandidates: plan.sourceOfCandidates,
  };
}
