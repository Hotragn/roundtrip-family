import "server-only";
import manifest from "@data/demo/audio/manifest.json";
import diary from "@data/persona/diary.json";
import { type ClipManifest, clipUrl } from "@roundtrip/agent/voice";
import { DEMO_WEEKS } from "./demo-weeks";
import type { DiarySeed, SharedDiaryEntry } from "./diary-types";
import { loadMemory } from "./family";
import type { HouseholdKey } from "./plan-board";

/**
 * The demo's synthetic diary entries (data/persona/diary.json): fictional words in the style of
 * docs/persona.md, voiced by the open speech models when a clip exists. A parent's phone starts
 * with their own entries; the dashboard sees only the ones marked shared.
 */

const SLUG: Record<string, string> = { hh_fremont: "fremont-demo", hh_munich: "munich-demo" };

interface Raw {
  id: string;
  householdId: string;
  parentId: string;
  kind: DiarySeed["kind"];
  createdAt: string;
  text: string;
  feelingWords: string[];
  outingId?: string;
  shared: boolean;
  inMemoryBook: boolean;
}

/** The outing an entry is about, by its title, from the visit so far or this week. */
export function outingTitles(household: HouseholdKey): Map<string, string> {
  const titles = new Map<string, string>();
  for (const v of loadMemory(household).visits) titles.set(v.id, v.title);
  for (const o of DEMO_WEEKS[household]?.outings ?? []) titles.set(o.id, o.venue);
  return titles;
}

/** The demo entries marked shared, as the dashboard shows them (minus any ids in `except`). */
export function sharedSeeds(household: HouseholdKey, except: Set<string> = new Set()): SharedDiaryEntry[] {
  const titles = outingTitles(household);
  return seedsFor(household)
    .filter((s) => s.shared && !except.has(s.id))
    .map((s) => ({
      entryId: s.id,
      parentId: s.parentId,
      kind: s.kind,
      createdAt: s.createdAt,
      text: s.text,
      feelingWords: s.feelingWords,
      outingId: s.outingId,
      outingTitle: s.outingId ? titles.get(s.outingId) : undefined,
      inMemoryBook: s.inMemoryBook,
      audioUrl: s.audioUrl,
      provenance: "synthetic" as const,
    }));
}

export function seedsFor(household: string, parentId?: string): DiarySeed[] {
  return (diary.entries as Raw[])
    .filter((e) => SLUG[e.householdId] === household && (!parentId || e.parentId === parentId))
    .map((e) => ({
      id: e.id,
      parentId: e.parentId,
      kind: e.kind,
      createdAt: e.createdAt,
      text: e.text,
      feelingWords: e.feelingWords,
      outingId: e.outingId,
      shared: e.shared,
      inMemoryBook: e.inMemoryBook,
      audioUrl: e.kind === "voice" ? clipUrl(manifest as ClipManifest, "te", e.text) : undefined,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
