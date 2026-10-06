import { OUTBOUND } from "@roundtrip/core/privacy";
import { BookLock, Bus, DoorClosed, Mic, Phone, ScanSearch, ShieldCheck, Star, UserRound, Users } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrivacyTable } from "@/components/dashboard/privacy-table";
import { DashboardShell } from "@/components/dashboard/shell";
import { Panel } from "@/components/shell/panel";
import { HOUSEHOLDS, isHousehold, loadBoard } from "@/lib/plan-board";

export const dynamicParams = false;
export function generateStaticParams() {
  return Object.keys(HOUSEHOLDS).map((household) => ({ household }));
}

export const metadata: Metadata = { title: "Privacy" };

const STAYS = [
  { icon: UserRound, what: "Their names and the home address", where: "Only in your household's own database." },
  {
    icon: Phone,
    what: "Phone numbers and contacts",
    where: "On their phones and in your database, for the help card.",
  },
  { icon: Mic, what: "Their voices", where: "Recordings are transcribed by open models on your own hardware." },
  {
    icon: BookLock,
    what: "Diary entries",
    where: "Encrypted on the phone, one key for each parent. You see only what they share.",
  },
  { icon: Star, what: "How they rated each outing", where: "Used by the ranker only as numbers, with no names." },
  { icon: Users, what: "The people they've met", where: "Described to the planner without names." },
];

const CHECKS = [
  {
    icon: DoorClosed,
    title: "One door for every outside call",
    body: "Each call names its route in the table below. The route lists the hosts it may reach and the kinds of data it may carry; anything else is stopped before it leaves.",
  },
  {
    icon: ShieldCheck,
    title: "Checked on every change",
    body: "A privacy check reads the code and fails the build when a call reaches a host that isn't listed here.",
  },
  {
    icon: ScanSearch,
    title: "Searches carry only language, interest and area",
    body: "A search with a name, a phone number or an email address in it is refused, for example 'Telugu events in Fremont, California' goes out and nothing about who is asking.",
  },
  {
    icon: Bus,
    title: "Directions start at the bus stop",
    body: "Routes are looked up from the stop nearest home, never from the home address.",
  },
];

/** Privacy: what stays with the family, the live table of where data goes, and how that's enforced. */
export default async function Privacy({ params }: PageProps<"/plan/[household]/privacy">) {
  const { household } = await params;
  if (!isHousehold(household)) notFound();
  const board = loadBoard(household);
  const services = new Set(OUTBOUND.map((r) => r.service.split(" (")[0])).size;
  return (
    <DashboardShell household={household} weekLabel={board.week.label} parents={board.parents} theme="sea">
      <div className="space-y-8">
        <div className="max-w-[720px] space-y-2">
          <h1 className="text-[31px] font-semibold leading-tight">Privacy</h1>
          <p className="text-base text-text-muted">
            Where your family&rsquo;s information goes. Roundtrip uses {services} outside services, and every one is in
            the table below, generated from the same list the code is held to.
          </p>
        </div>

        <Panel className="p-5 sm:p-6">
          <h2 className="text-[20px] font-semibold">What stays with your family</h2>
          <p className="mt-1 text-[15px] text-text-muted">None of this is sent to a hosted service.</p>
          <ul className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {STAYS.map(({ icon: Icon, what, where }) => (
              <li key={what} className="flex gap-3">
                <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 stroke-[1.75] text-sea-line" />
                <div>
                  <p className="font-semibold leading-snug">{what}</p>
                  <p className="text-[14px] leading-snug text-text-muted">{where}</p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel className="p-5 sm:p-6">
          <h2 className="text-[20px] font-semibold">Where data goes</h2>
          <p className="mb-5 mt-1 max-w-[760px] text-[15px] text-text-muted">
            Each service, what it&rsquo;s for, what it receives and which kinds of data it may carry. &ldquo;Fictional
            family&rdquo; means the demo households; a real family&rsquo;s data stays in its own database.
          </p>
          <PrivacyTable routes={OUTBOUND} />
        </Panel>

        <section aria-labelledby="checks" className="space-y-4">
          <h2 id="checks" className="text-[20px] font-semibold">
            How it&rsquo;s held to that
          </h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {CHECKS.map(({ icon: Icon, title, body }) => (
              <li key={title}>
                <Panel className="flex h-full gap-3 p-5">
                  <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 stroke-[1.75] text-sea-line" />
                  <div>
                    <p className="font-semibold leading-snug">{title}</p>
                    <p className="mt-1 text-[14px] leading-relaxed text-text-muted">{body}</p>
                  </div>
                </Panel>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </DashboardShell>
  );
}
