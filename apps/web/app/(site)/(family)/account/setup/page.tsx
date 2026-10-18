import { COUNTRIES, LANGUAGES } from "@roundtrip/core";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardProviders } from "@/components/dashboard/providers";
import { type CountryOption, SetupWizard } from "@/components/dashboard/setup-wizard";
import { currentAccount, householdOf } from "@/lib/server/accounts";
import { DAYS, type SetupForm } from "@/lib/setup-schema";

export const metadata: Metadata = { title: "Set up your household" };
export const dynamic = "force-dynamic";

/** A signed-in family's own setup: the demo's wizard, empty, saving to their household. */
export default async function FamilySetup() {
  const account = await currentAccount();
  if (!account) redirect("/account");
  const existing = await householdOf(account);
  const initial: SetupForm = existing?.setup ?? {
    hostCountry: "US",
    localLanguage: "en",
    searchLocation: "",
    homeStop: "",
    parents: [
      {
        firstName: "",
        addressAs: "",
        language: LANGUAGES[0]!.code,
        readingSupport: "audio_first",
        maxWalkMinutes: 15,
        transitComfort: "with_company",
        bestStart: "09:00",
        bestEnd: "12:00",
        napStart: "",
        napEnd: "",
      },
    ],
    alone: DAYS.map((day) => ({ day, on: false, start: "09:00", end: "17:00" })),
    trialRunDays: [],
    contactLabel: "Your child",
    contactPhone: "",
    phonePlan: "wifi_only",
  };
  const countries: CountryOption[] = Object.values(COUNTRIES).map((c) => ({
    code: c.code,
    name: c.name,
    localLanguage: c.localLanguage,
    emergency: c.emergency,
    secondaryEmergency: c.secondaryEmergency,
  }));
  return (
    <div className="space-y-6">
      <div className="max-w-[720px] space-y-2">
        <h1 className="text-[31px] font-semibold leading-tight">Set up your household</h1>
        <p className="text-base text-text-muted">
          Five short steps. First names and the nearest bus stop only, never an address. Only you can see this
          household.
        </p>
      </div>
      <DashboardProviders>
        <SetupWizard
          household={existing?._id ?? "new"}
          initial={initial}
          countries={countries}
          languages={LANGUAGES}
          saveUrl="/api/household"
        />
      </DashboardProviders>
    </div>
  );
}
