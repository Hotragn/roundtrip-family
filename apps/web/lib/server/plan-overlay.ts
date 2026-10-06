import "server-only";
import type { BoardOverlay } from "../plan-types";
import { listRecords } from "./session";

/** One suggestion's state in a visitor's session (see app/plan/api/overlay). */
export interface ItemState {
  household: string;
  id: string;
  status?: "approved" | "suggested";
  swapTo?: string | null;
  moveTo?: string | null;
}

export async function overlayFor(household: string): Promise<BoardOverlay> {
  const out: BoardOverlay = { status: {}, swaps: {}, moves: {} };
  for (const r of await listRecords("plan")) {
    const s = r.payload as unknown as ItemState;
    if (s.household !== household) continue;
    if (s.status) out.status[s.id] = s.status;
    if (s.swapTo) out.swaps[s.id] = s.swapTo;
    if (s.moveTo) out.moves[s.id] = s.moveTo;
  }
  return out;
}
