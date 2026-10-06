import { z } from "zod";
import { isHousehold, loadBoard } from "@/lib/plan-board";
import { moveProblem } from "@/lib/plan-format";
import { EMPTY_OVERLAY } from "@/lib/plan-types";
import { type ItemState, overlayFor } from "@/lib/server/plan-overlay";
import { saveRecord } from "@/lib/server/session";

/**
 * A visitor's changes to the demo week: approvals, swaps and moves. They live in that
 * visitor's session for a day (MongoDB with a TTL, or memory without it); the seeded week is
 * never changed. Every change is checked against the real plan: a swap must be one of the
 * planner's alternatives, a move must land on a day the parent is free.
 */

const Change = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), id: z.string().max(200) }),
  z.object({ action: z.literal("unapprove"), id: z.string().max(200) }),
  z.object({ action: z.literal("swap"), id: z.string().max(200), to: z.string().max(200) }),
  z.object({ action: z.literal("unswap"), id: z.string().max(200) }),
  z.object({
    action: z.literal("move"),
    id: z.string().max(200),
    day: z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]),
  }),
]);

export async function GET(_req: Request, { params }: { params: Promise<{ household: string }> }) {
  const { household } = await params;
  if (!isHousehold(household)) return Response.json(EMPTY_OVERLAY, { status: 404 });
  return Response.json(await overlayFor(household), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request, { params }: { params: Promise<{ household: string }> }) {
  const { household } = await params;
  if (!isHousehold(household)) return Response.json({ error: "No such household" }, { status: 404 });
  const parsed = Change.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid change" }, { status: 400 });
  const change = parsed.data;
  const board = loadBoard(household);
  const item = board.items.find((i) => i.id === change.id);
  if (!item) return Response.json({ error: "Not in this week's plan" }, { status: 404 });

  const current = await overlayFor(household);
  const state: ItemState = {
    household,
    id: change.id,
    status: current.status[change.id],
    swapTo: current.swaps[change.id] ?? null,
    moveTo: current.moves[change.id] ?? null,
  };
  if (change.action === "approve") state.status = "approved";
  if (change.action === "unapprove") state.status = "suggested";
  if (change.action === "swap") {
    if (!(board.alternatives[change.id] ?? []).some((a) => a.id === change.to)) {
      return Response.json({ error: "Not one of the planner's alternatives for this outing" }, { status: 400 });
    }
    state.swapTo = change.to;
    state.status = "suggested";
  }
  if (change.action === "unswap") state.swapTo = null;
  if (change.action === "move") {
    // The item as it stands after a swap: the move is checked against that place's hours.
    const shown = (state.swapTo && board.alternatives[change.id]?.find((a) => a.id === state.swapTo)) || item;
    const problem = change.day === shown.day ? null : moveProblem(board, shown, change.day);
    if (problem) return Response.json({ error: problem.description }, { status: 400 });
    state.moveTo = change.day === item.day ? null : change.day;
  }
  await saveRecord("plan", `${household}:${change.id}`, state as unknown as Record<string, unknown>);
  return Response.json(await overlayFor(household));
}
