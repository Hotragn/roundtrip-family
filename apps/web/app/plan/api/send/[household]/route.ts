import { isHousehold, loadBoard } from "@/lib/plan-board";
import { weekAnswer } from "@/lib/plan-format";
import { overlayFor } from "@/lib/server/plan-overlay";
import { signalWeekAnswer, temporalOn } from "@/lib/server/temporal";

/**
 * Sends the dashboard's approvals and swaps to the household's weekPlan workflow, which sets up
 * the safety timers and first rides. Only where Temporal runs (TEMPORAL_ADDRESS, the Codespace);
 * the hosted demo has none, and its phones get the changes through the visitor's session.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ on: temporalOn() });
}

export async function POST(_req: Request, { params }: { params: Promise<{ household: string }> }) {
  const { household } = await params;
  if (!isHousehold(household)) return Response.json({ error: "No such household" }, { status: 404 });
  const answer = weekAnswer(loadBoard(household).items, await overlayFor(household));
  if (answer.approve.length === 0)
    return Response.json({ error: "Approve at least one outing first." }, { status: 400 });
  const result = await signalWeekAnswer(household, answer);
  if (result !== "sent") return Response.json({ result }, { status: 503 });
  return Response.json({ result, approved: answer.approve.length });
}
