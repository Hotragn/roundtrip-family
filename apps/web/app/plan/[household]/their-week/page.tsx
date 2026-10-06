import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/shell";
import { TheirWeek } from "@/components/dashboard/their-week";
import { loadMemory } from "@/lib/family";
import { HOUSEHOLDS, isHousehold, loadBoard } from "@/lib/plan-board";

export const dynamicParams = false;
export function generateStaticParams() {
  return Object.keys(HOUSEHOLDS).map((household) => ({ household }));
}

export const metadata: Metadata = { title: "Their week" };

/** Their week: what they went to, what they said, and the visit so far. */
export default async function TheirWeekPage({ params }: PageProps<"/plan/[household]/their-week">) {
  const { household } = await params;
  if (!isHousehold(household)) notFound();
  const board = loadBoard(household);
  const { visits } = loadMemory(household);
  const parents = board.parents.map((p) => p.firstName).join(" and ");
  return (
    <DashboardShell household={household} weekLabel={board.week.label} parents={board.parents}>
      <div className="space-y-6">
        <div className="max-w-[720px] space-y-2">
          <h1 className="text-[31px] font-semibold leading-tight">Their week</h1>
          <p className="text-base text-text-muted">
            What {parents} went to and what they said about it. Only what their phones report is here: whether they got
            home, and the face they picked. Diary entries stay theirs unless they share one.
          </p>
        </div>
        <TheirWeek board={board} history={visits} />
        <p className="text-[13px] text-text-muted">
          The family and their outing history are fictional, made up for this demo.
        </p>
      </div>
    </DashboardShell>
  );
}
