import { outingTitles, seedsFor, sharedSeeds } from "@/lib/diary-seeds";
import type { SharedDiaryEntry } from "@/lib/diary-types";
import { isHousehold } from "@/lib/plan-board";
import { sharedEntries, touchedIds } from "@/lib/server/diary";

/**
 * Shared with you: the diary entries the parents chose to share, and nothing else. The demo's
 * synthetic entries come from data/persona/diary.json; entries a visitor writes or changes on a
 * demo phone come from their session, decrypted here only when shared. Private entries are
 * never decrypted for this route and never appear in its answer.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ household: string }> }) {
  const { household } = await params;
  if (!isHousehold(household)) return Response.json({ entries: [] }, { status: 404 });
  const titles = outingTitles(household);
  const fromSeeds = sharedSeeds(household, await touchedIds(household));
  const seeded = new Map(seedsFor(household).map((s) => [s.id, s]));
  const fromSession: SharedDiaryEntry[] = (await sharedEntries(household)).map((e) => ({
    entryId: e.entryId,
    parentId: e.parentId,
    kind: e.kind,
    createdAt: e.createdAt,
    text: e.text,
    feelingWords: e.feelingWords,
    outingId: e.outingId,
    outingTitle: e.outingId ? titles.get(e.outingId) : undefined,
    inMemoryBook: e.inMemoryBook,
    // A seeded entry keeps its saved clip; one recorded on the phone plays from the encrypted copy.
    audioUrl: e.hasAudio
      ? `/plan/api/diary/${household}/audio/${e.entryId}`
      : (seeded.get(e.entryId)?.audioUrl ?? undefined),
    provenance: seeded.has(e.entryId) ? "synthetic" : "visitor",
  }));
  const entries = [...fromSeeds, ...fromSession].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return Response.json({ entries }, { headers: { "Cache-Control": "no-store" } });
}
