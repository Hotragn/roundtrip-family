import "server-only";
import { HOUSEHOLDS, type HouseholdKey, loadBoard } from "../plan-board";
import { overlayFor } from "./plan-overlay";
import { type Buffers, buildTimer, hostedTimersOn, nextOccurrence, scheduleTimer, stopTimers } from "./safety-timers";
import { listRecords, sessionId } from "./session";

/**
 * Where the hosted safety timer (lib/server/safety-timers.ts) is set and stopped for a visitor:
 * approving an outing sets it for the outing's next real day and return time; starting the trip
 * on a demo phone sets it from now, for the trip's planned length; "I'm home" and unapproving stop it.
 */

async function buffers(household: string, fallback: Buffers): Promise<Buffers> {
  const saved = (await listRecords("safety")).find((r) => r.payload.household === household);
  const s = saved?.payload.settings as Partial<Buffers> | undefined;
  return {
    bufferMinutes: s?.bufferMinutes ?? fallback.bufferMinutes,
    nudgeWaitMinutes: s?.nudgeWaitMinutes ?? fallback.nudgeWaitMinutes,
  };
}

/** The household and slot an outing id from a phone belongs to: the slot itself or one of its alternatives. */
export function findOuting(outingId: string, parentId?: string) {
  for (const household of Object.keys(HOUSEHOLDS) as HouseholdKey[]) {
    const board = loadBoard(household);
    if (parentId && !board.parents.some((p) => p.id === parentId)) continue;
    for (const slot of board.items) {
      const item = slot.id === outingId ? slot : board.alternatives[slot.id]?.find((a) => a.id === outingId);
      if (item) return { household, board, slotId: slot.id, item };
    }
  }
  return null;
}

export async function scheduleOuting(
  household: HouseholdKey,
  slotId: string,
  opts: { fromNow?: { outingId: string }; testSeconds?: number | null; now?: Date } = {},
): Promise<boolean> {
  if (!hostedTimersOn()) return false;
  const board = loadBoard(household);
  const slot = board.items.find((i) => i.id === slotId);
  if (!slot) return false;
  const overlay = await overlayFor(household);
  const swapTo = opts.fromNow ? opts.fromNow.outingId : overlay.swaps[slotId];
  const item = (swapTo && board.alternatives[slotId]?.find((a) => a.id === swapTo)) || slot;
  if (item.withAdultChild) return false;
  const now = opts.now ?? new Date();
  const expectedBack = opts.fromNow
    ? new Date(now.getTime() + Math.max(0, item.back - item.depart) * 60_000)
    : nextOccurrence(overlay.moves[slotId] ?? item.day, item.back, board.household.timezone, now);
  await scheduleTimer(
    buildTimer({
      sessionId: await sessionId(),
      board,
      slotId,
      item,
      expectedBack,
      buffers: await buffers(household, board.household.safety),
      testSeconds: opts.testSeconds,
      now,
    }),
  );
  return true;
}

export async function stopOuting(outingId: string, state: "home" | "off"): Promise<void> {
  if (!hostedTimersOn()) return;
  await stopTimers(await sessionId(), outingId, state);
}
