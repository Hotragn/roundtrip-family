"use client";

import { useQuery } from "@tanstack/react-query";
import { BellRing } from "lucide-react";
import Link from "next/link";
import type { AlertView } from "@/app/(site)/plan/api/alerts/[household]/route";

/**
 * Missed check-ins from the hosted safety timer (lib/server/safety-timers.ts): a banner at the
 * top of every dashboard page, and the same alert on the outing in Their week. Yellow and ink,
 * like the phone's "your stop is next"; red stays reserved for "I'm lost" (docs/brand.md).
 */

export function useSafetyAlerts(household: string) {
  return useQuery({
    queryKey: ["safety-alerts", household],
    queryFn: async (): Promise<AlertView[]> => {
      const res = await fetch(`/plan/api/alerts/${household}`, { cache: "no-store" });
      return res.ok ? ((await res.json()) as { alerts: AlertView[] }).alerts : [];
    },
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}

const and = (who: string[]) =>
  who.length > 1 ? `${who.slice(0, -1).join(", ")} and ${who.at(-1)}` : (who[0] ?? "They");
export function alertLine(a: AlertView): string {
  const not = a.who.length > 1 ? "aren't" : "isn't";
  return `${and(a.who)} ${not} home yet from ${a.title}. Expected back by ${a.back}, and no "I'm home" since. Call to check on them.`;
}

export function SafetyAlertBanner({ household }: { household: string }) {
  const alerts = (useSafetyAlerts(household).data ?? []).filter((a) => a.state === "alerted");
  if (alerts.length === 0) return null;
  return (
    <div role="alert" className="mt-4 space-y-2 rounded-card border-2 border-ink bg-bus p-4 text-on-bus sm:p-5">
      {alerts.map((a) => (
        <p key={a.outingIds[0]} className="flex gap-3 text-[18px] font-semibold leading-snug">
          <BellRing aria-hidden="true" className="mt-0.5 size-6 shrink-0 stroke-[2]" />
          <span>{alertLine(a)}</span>
        </p>
      ))}
      <Link
        href={`/plan/${household}/their-week`}
        className="ml-9 inline-block text-[15px] font-semibold underline underline-offset-4"
      >
        Open their week
      </Link>
    </div>
  );
}
