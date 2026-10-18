import { COUNTRIES, languageNameIn } from "@roundtrip/core";
import Link from "next/link";
import { SiteFooter } from "@/components/landing/site-footer";
import { Panel } from "@/components/shell/panel";
import { ThemeShell } from "@/components/shell/theme-shell";
import type { FamilyHousehold } from "@/lib/server/accounts";
import { DataRights } from "./data-rights";
import { SignOutButton } from "./passkey";

/**
 * A real family's private dashboard: what setup holds, each parent's phone link, and their
 * data rights. The planner doesn't run for real households yet (docs/decisions.md), so no
 * family data leaves this server.
 */
export function FamilyDashboard({ h, origin }: { h: FamilyHousehold; origin: string }) {
  const s = h.setup;
  return (
    <ThemeShell theme="home">
      <main id="main" className="mx-auto max-w-[960px] space-y-6 px-4 py-10 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[31px] font-semibold leading-tight">Your household</h1>
          <SignOutButton />
        </div>
        <Panel className="space-y-3 p-6">
          <h2 className="text-xl font-semibold">Where they're staying</h2>
          <p className="text-base">
            Near {s.homeStop}, {s.searchLocation} ({COUNTRIES[s.hostCountry]?.name ?? s.hostCountry}).
          </p>
          <p className="text-base text-text-muted">
            The planner doesn't run for your household yet: it only has saved searches for the two demo areas. Your
            setup is ready for when it does.
          </p>
          <Link href="/account/setup" className="font-semibold text-sky-text underline underline-offset-4">
            Change setup
          </Link>
        </Panel>
        <Panel className="space-y-3 p-6">
          <h2 className="text-xl font-semibold">Your parents' phones</h2>
          <p className="text-base text-text-muted">
            Send each parent their own link. Opening it sets up their app; they never sign in. Anyone with a link can
            open that phone's app, so send it only to them. Changing setup keeps the links.
          </p>
          <ul className="space-y-3">
            {h.parents.map((p, i) => (
              <li key={p.id} className="space-y-1">
                <div className="font-semibold">
                  {p.firstName} ({languageNameIn(s.parents[i]?.language ?? "en", "en")})
                </div>
                <code className="block break-all rounded-md bg-surface-sunken px-3 py-2 text-sm">
                  {`${origin}/parents/k/${p.token}`}
                </code>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel className="space-y-3 p-6">
          <h2 className="text-xl font-semibold">Your data</h2>
          <p className="text-base text-text-muted">
            Everything Roundtrip holds for your household, as one file, or gone for good. See the{" "}
            <Link href="/privacy-policy" className="underline underline-offset-4">
              privacy policy
            </Link>
            .
          </p>
          <DataRights household={h._id} />
        </Panel>
      </main>
      <SiteFooter />
    </ThemeShell>
  );
}
