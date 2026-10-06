import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/shell";
import { WeekBoard } from "@/components/dashboard/week-board";
import { HOUSEHOLDS, isHousehold, loadBoard } from "@/lib/plan-board";

export const dynamicParams = false;
export function generateStaticParams() {
  return Object.keys(HOUSEHOLDS).map((household) => ({ household }));
}

export const metadata: Metadata = { title: "This week" };

export default async function ThisWeek({ params }: PageProps<"/plan/[household]">) {
  const { household } = await params;
  if (!isHousehold(household)) notFound();
  const board = loadBoard(household);
  return (
    <DashboardShell household={household} weekLabel={board.week.label} parents={board.parents}>
      <WeekBoard board={board} />
    </DashboardShell>
  );
}
