import { isHousehold, loadBoard } from "@/lib/plan-board";
import { onClock } from "@/lib/plan-format";
import { deliverAlert } from "@/lib/server/safety-alert";
import { hostedTimersOn, tick, timersFor } from "@/lib/server/safety-timers";
import { sessionId } from "@/lib/server/session";

/**
 * This visitor's safety timers that need attention, for the dashboard's alert banner and Their
 * week. Reading also fires anything due (the same atomic claim the ticker uses), so the alert
 * shows even if the minute ticker hasn't run yet. Empty where Temporal runs the timers.
 */
export const dynamic = "force-dynamic";

export interface AlertView {
  outingIds: string[];
  who: string[];
  title: string;
  state: "nudged" | "alerted";
  /** Expected back on the household's clock, "10:10". */
  back: string;
  alertedAt: string | null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ household: string }> }) {
  const { household } = await params;
  if (!isHousehold(household)) return Response.json({ alerts: [] }, { status: 404 });
  if (!hostedTimersOn()) return Response.json({ alerts: [] });
  await tick(new Date(), deliverAlert);
  const tz = loadBoard(household).household.timezone;
  const alerts: AlertView[] = (await timersFor(await sessionId(), household))
    .filter((t) => t.state === "alerted" || t.state === "nudged")
    .map((t) => ({
      outingIds: t.outingIds,
      who: t.who,
      title: t.title,
      state: t.state as AlertView["state"],
      back: onClock(new Date(t.expectedBack).toISOString(), tz).time,
      alertedAt: t.alertedAt ? new Date(t.alertedAt).toISOString() : null,
    }));
  return Response.json({ alerts }, { headers: { "Cache-Control": "no-store" } });
}
