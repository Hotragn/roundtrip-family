import { COUNTRIES, LANGUAGES } from "@roundtrip/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { type CountryOption, SetupWizard } from "@/components/dashboard/setup-wizard";
import { DashboardShell } from "@/components/dashboard/shell";
import { HOUSEHOLDS, isHousehold, loadBoard } from "@/lib/plan-board";
import { DAYS, type SetupForm } from "@/lib/setup-schema";

export const dynamicParams = false;
export function generateStaticParams() {
  return Object.keys(HOUSEHOLDS).map((household) => ({ household }));
}

export const metadata: Metadata = { title: "Setup" };

/** Setup: the household wizard, prefilled with the demo household. */
export default async function Setup({ params }: PageProps<"/plan/[household]/setup">) {
  const { household } = await params;
  if (!isHousehold(household)) notFound();
  const board = loadBoard(household);
  const { household: h, parents } = HOUSEHOLDS[household].bundle();

  const initial: SetupForm = {
    hostCountry: h.hostCountry,
    localLanguage: h.localLanguage,
    searchLocation: h.homeArea.searchLocation,
    homeStop: h.homeArea.nearestStop.name,
    parents: parents.map((p) => ({
      firstName: p.firstName,
      addressAs: p.addressAs,
      language: p.language,
      readingSupport: p.readingSupport,
      maxWalkMinutes: p.mobility.maxWalkMinutes,
      transitComfort: p.mobility.transitComfort,
      bestStart: p.bestTimes[0]?.start ?? "09:00",
      bestEnd: p.bestTimes[0]?.end ?? "12:00",
      napStart: p.naps[0]?.start ?? "",
      napEnd: p.naps[0]?.end ?? "",
    })),
    alone: DAYS.map((day) => {
      const w = h.aloneWindows.find((x) => x.day === day);
      return { day, on: Boolean(w), start: w?.start ?? "09:00", end: w?.end ?? "17:00" };
    }),
    trialRunDays: h.trialRunDays,
    contactLabel: h.contacts[0]?.label ?? "Your child",
    contactPhone: h.contacts[0]?.phone ?? "",
    phonePlan: h.phonePlan.hasLocalPlan ? "local_plan" : "wifi_only",
  };
  const countries: CountryOption[] = Object.values(COUNTRIES).map((c) => ({
    code: c.code,
    name: c.name,
    localLanguage: c.localLanguage,
    emergency: c.emergency,
    secondaryEmergency: c.secondaryEmergency,
  }));

  return (
    <DashboardShell household={household} weekLabel={board.week.label} parents={board.parents}>
      <div className="space-y-6">
        <div className="max-w-[720px] space-y-2">
          <h1 className="text-[31px] font-semibold leading-tight">Setup</h1>
          <p className="text-base text-text-muted">
            Everything the planner needs to know, in five short steps. It asks for first names and the nearest bus stop,
            never an address. This one is filled in with the fictional demo family.
          </p>
        </div>
        <SetupWizard household={household} initial={initial} countries={countries} languages={LANGUAGES} />
      </div>
    </DashboardShell>
  );
}
