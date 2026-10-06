import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SharedDiary } from "@/components/dashboard/shared-diary";
import { DashboardShell } from "@/components/dashboard/shell";
import { sharedSeeds } from "@/lib/diary-seeds";
import { HOUSEHOLDS, isHousehold, loadBoard } from "@/lib/plan-board";

export const dynamicParams = false;
export function generateStaticParams() {
  return Object.keys(HOUSEHOLDS).map((household) => ({ household }));
}

export const metadata: Metadata = { title: "Shared with you" };

/** Shared with you: the diary entries their parents chose to share, and their memory book (home theme). */
export default async function Shared({ params }: PageProps<"/plan/[household]/shared">) {
  const { household } = await params;
  if (!isHousehold(household)) notFound();
  const board = loadBoard(household);
  return (
    <DashboardShell household={household} weekLabel={board.week.label} parents={board.parents} theme="home">
      <div className="space-y-6">
        <div className="max-w-[720px] space-y-2">
          <h1 className="text-[31px] font-semibold leading-tight">Shared with you</h1>
          <p className="text-base text-text-muted">
            Diary entries {board.parents.map((p) => p.firstName).join(" and ")} chose to share with you.
          </p>
        </div>
        <SharedDiary board={board} initial={sharedSeeds(household)} />
      </div>
    </DashboardShell>
  );
}
