import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PeopleList, PlacesList } from "@/components/dashboard/memory-lists";
import { DashboardShell } from "@/components/dashboard/shell";
import { Panel } from "@/components/shell/panel";
import { loadMemory } from "@/lib/family";
import { HOUSEHOLDS, isHousehold, loadBoard } from "@/lib/plan-board";

export const dynamicParams = false;
export function generateStaticParams() {
  return Object.keys(HOUSEHOLDS).map((household) => ({ household }));
}

export const metadata: Metadata = { title: "People and places" };

/** People and places: what Roundtrip remembers, and what the planner is told about it. */
export default async function PeopleAndPlaces({ params }: PageProps<"/plan/[household]/people">) {
  const { household } = await params;
  if (!isHousehold(household)) notFound();
  const board = loadBoard(household);
  const { people, places } = loadMemory(household);
  return (
    <DashboardShell household={household} weekLabel={board.week.label} parents={board.parents}>
      <div className="space-y-8">
        <div className="max-w-[720px] space-y-2">
          <h1 className="text-[31px] font-semibold leading-tight">People and places</h1>
          <p className="text-base text-text-muted">
            What Roundtrip remembers, so it can suggest a familiar face or a place they liked. It stays in your
            household&rsquo;s own database; the planner hears about people without names. Forget anything here and it
            won&rsquo;t be used again.
          </p>
        </div>

        <section aria-labelledby="people" className="space-y-4">
          <h2 id="people" className="text-[20px] font-semibold">
            People they know
          </h2>
          <PeopleList household={household} people={people} />
        </section>

        <section aria-labelledby="places">
          <Panel className="p-5 sm:p-6">
            <h2 id="places" className="text-[20px] font-semibold">
              Places they&rsquo;ve been
            </h2>
            <p className="mb-4 mt-1 max-w-[760px] text-[15px] text-text-muted">
              From their replies after each outing, best first. The ranker learns from these ratings as numbers only.
            </p>
            <PlacesList household={household} places={places} />
          </Panel>
        </section>

        <p className="text-[13px] text-text-muted">
          The family, the people they know and their outing history are fictional, made up for this demo.
        </p>
      </div>
    </DashboardShell>
  );
}
