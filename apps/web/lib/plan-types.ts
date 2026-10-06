import type { WeeklyHours } from "@roundtrip/core/hours";

/** Shapes the dashboard passes from the server loader (lib/plan-board.ts) to its client components. */

export interface BoardLeg {
  mode: "walk" | "bus" | "rail" | "sky" | "sea" | "car";
  from: { name: string; location?: { lat: number; lng: number } };
  to: { name: string; location?: { lat: number; lng: number } };
  minutes: number;
  line?: { name: string; headsign?: string; agency?: string };
  stops?: number;
  departs?: string;
  arrives?: string;
  /** [lng, lat] points along the street or path. */
  path: Array<[number, number]>;
}

export interface BoardCard {
  parentId: string;
  role: "mother" | "father";
  title: string;
  body: string;
  driver: { lead: string; stopName: string; thanks: string };
  steps: string[];
  phrases: Array<{ local: string; pronunciation: string; meaning: string }>;
}

export interface BoardItem {
  id: string;
  candidateId: string;
  title: string;
  address: string;
  location: { lat: number; lng: number } | null;
  category: string;
  indoor: boolean | null;
  ladderLevel: number;
  ladderLabel: string;
  reasonText: string;
  chips: Array<{ label: string; feature?: string; direction: string }>;
  score: { combined: number; pGo: number; enjoyment: number; rank: number };
  role: "mother" | "father" | "both";
  parentIds: string[];
  day: string;
  depart: number;
  back: number;
  withAdultChild: boolean;
  firstRideTogether: boolean;
  bringSomeone: { personId: string; label: string; why: string } | null;
  joinCard: { kind: string; local: string; meaning: string; askWho: string } | null;
  photo: { url: string; credit: string } | null;
  /** The place's listed weekly opening hours, or null when the listing has none. */
  hours: WeeklyHours | null;
  landmarkPhotos: string[];
  travelMinutes: number | null;
  transfers: number;
  legs: BoardLeg[];
  defaultStatus: "approved" | "suggested";
  /** The week builder already wrote this outing's route and cards. */
  hasTicket: boolean;
  cards: BoardCard[];
}

export interface PlanBoard {
  household: {
    slug: string;
    label: string;
    metroArea: string;
    hostCountry: string;
    localLanguage: string;
    homeArea: string;
    timezone: string;
    emergency: { number: string; covers: string; source: string; verifiedOn?: string };
    secondaryEmergency: { number: string; covers: string; source: string; verifiedOn?: string } | null;
    contact: { label: string; phone: string; fictional: boolean };
    helpCardText: string;
    localPhrases: { helpTitle: string; myName: string; stayingNear: string; callFamily: string; askWay: string };
    phonePlan: { hasLocalPlan: boolean; wifiOnly: boolean };
    safety: {
      bufferMinutes: number;
      nudgeWaitMinutes: number;
      daylightOnly: boolean;
      weather: { blockIce: boolean; blockHeavySnow: boolean; blockHeatAdvisory: boolean; shadeWarningAboveC: number };
    };
    aloneDays: string[];
    aloneTimes: Array<{ day: string; start: string; end: string }>;
  };
  parents: Array<{
    id: string;
    firstName: string;
    role: "mother" | "father";
    language: string;
    readingSupport: string;
  }>;
  week: { key: string; label: string; days: Array<{ day: string; date: string }> };
  items: BoardItem[];
  alternatives: Record<string, BoardItem[]>;
  note: string;
  sameLanguageFound: boolean;
  sourceOfCandidates: string;
}

/** What a visitor changed this session: kept server-side for a day, never on the seeded week. */
export interface BoardOverlay {
  status: Record<string, "approved" | "suggested">;
  /** suggestion id -> the alternative that replaced it */
  swaps: Record<string, string>;
  /** suggestion id -> the day it was moved to */
  moves: Record<string, string>;
}

export const EMPTY_OVERLAY: BoardOverlay = { status: {}, swaps: {}, moves: {} };
