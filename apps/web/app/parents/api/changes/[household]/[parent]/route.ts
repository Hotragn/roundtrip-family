import { DEMO_WEEKS } from "@/lib/demo-weeks";
import { isHousehold } from "@/lib/plan-board";
import { overlayFor } from "@/lib/server/plan-overlay";
import { forParent, type OutingView, type WeekChanges, type WeekView } from "@/lib/week";

/**
 * What the dashboard changed for one parent's week in this visitor's session: outings approved
 * there (with this parent's ticket), outings taken off or swapped away, and outings moved to
 * another day. The phone applies it on top of the week built into its page, and keeps a copy
 * for when it's offline. Same browser, same session: nothing here leaves the demo server.
 */

export const dynamic = "force-dynamic";

const DAY_INDEX: Record<string, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

export async function GET(_req: Request, { params }: { params: Promise<{ household: string; parent: string }> }) {
  const { household, parent } = await params;
  const week = DEMO_WEEKS[household] as WeekView | undefined;
  if (!isHousehold(household) || !week?.parents.some((p) => p.id === parent)) {
    return Response.json({ error: "No such parent" }, { status: 404 });
  }
  const overlay = await overlayFor(household);
  const isApproved = (o: OutingView) => {
    if (overlay.swaps[o.id]) return false;
    return (overlay.status[o.id] ?? o.status) === "approved";
  };
  const mine = (o: OutingView) => o.parentIds.includes(parent) && o.cards.some((c) => c.parentId === parent);
  const seeded = new Set(forParent(week, parent).outings.map((o) => o.id));
  const shown = week.outings
    .filter((o) => mine(o) && isApproved(o))
    .map((o) => ({ ...o, status: "approved" as const }));

  const monday = new Date(`${week.week.monday}T12:00:00Z`);
  const dateOf = (day: string) => {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() + (DAY_INDEX[day] ?? 0));
    return d.toISOString().slice(0, 10);
  };
  const changes: WeekChanges = {
    added: forParent({ ...week, outings: shown.filter((o) => !seeded.has(o.id)) }, parent).outings,
    removed: [...seeded].filter((id) => !shown.some((o) => o.id === id)),
    moved: Object.fromEntries(
      Object.entries(overlay.moves)
        .filter(([id]) => shown.some((o) => o.id === id))
        .map(([id, day]) => [id, { day, date: dateOf(day) }]),
    ),
  };
  return Response.json(changes, { headers: { "Cache-Control": "no-store" } });
}
