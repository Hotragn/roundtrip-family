import { notFound } from "next/navigation";
import { DEMO_WEEKS } from "@/lib/demo-weeks";
import { forParent } from "@/lib/week";
import { ParentsApp } from "../../parents-app";

/**
 * One parent's phone: /parents/fremont-demo/p_sarala. Prerendered with that parent's week, so
 * today's ticket is in the HTML itself and shows before any script runs, online or offline.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.entries(DEMO_WEEKS).flatMap(([household, week]) =>
    week.parents.map((p) => ({ household, parent: p.id })),
  );
}

export default async function ParentPage({ params }: PageProps<"/parents/[household]/[parent]">) {
  const { household, parent } = await params;
  const week = DEMO_WEEKS[household];
  if (!week?.parents.some((p) => p.id === parent)) notFound();
  return <ParentsApp initial={{ household, parentId: parent, week: forParent(week, parent) }} />;
}
