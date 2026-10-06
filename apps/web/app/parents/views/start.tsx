"use client";

import { Mark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { DEMO_HOUSEHOLDS, type WeekView } from "@/lib/week";

/** Whose phone is this? Chosen once; in a real family the setup link sets it. */
export function StartView({
  weeks,
  household,
  onHousehold,
  onParent,
  t,
}: {
  weeks: Record<string, WeekView | null | undefined>;
  household: string;
  onHousehold: (slug: string) => void;
  onParent: (id: string) => void;
  t: (k: string) => string;
}) {
  const week = weeks[household];
  return (
    <div className="space-y-8 pt-6">
      <div className="flex items-center gap-3">
        <Mark size={44} />
        <span className="rounded-full bg-surface-sunken px-3 py-1 text-[14px] text-text-muted" lang="en">
          {t("Parents.demo")}
        </span>
      </div>
      <div className="space-y-3">
        <p className="text-[17px] text-text-muted" lang="te">
          {t("Parents.household")}
        </p>
        <div className="grid gap-2">
          {DEMO_HOUSEHOLDS.map((h) => (
            <button
              key={h.slug}
              type="button"
              aria-pressed={household === h.slug}
              onClick={() => onHousehold(h.slug)}
              className={cn(
                "min-h-14 rounded-xl border px-5 text-left text-[19px]",
                household === h.slug ? "border-ink bg-surface font-semibold" : "border-line-strong bg-surface",
              )}
              lang="en"
            >
              {h.label}
              <span className="block text-[15px] font-normal text-text-muted">{h.note}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <h1 className="text-[34px] font-semibold" lang="te">
          {t("Parents.whose")}
        </h1>
        <div className="grid grid-cols-2 gap-3" aria-busy={week === undefined}>
          {week === undefined ? (
            <>
              <div aria-hidden="true" className="min-h-28 rounded-ticket bg-surface-sunken motion-safe:animate-pulse" />
              <div aria-hidden="true" className="min-h-28 rounded-ticket bg-surface-sunken motion-safe:animate-pulse" />
            </>
          ) : null}
          {(week?.parents ?? []).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onParent(p.id)}
              className="flex min-h-28 flex-col items-center justify-center gap-1 rounded-ticket bg-surface shadow-raised ring-1 ring-line"
            >
              <span className="text-[30px] font-semibold" lang="te">
                {p.role === "father" ? t("Parents.father") : t("Parents.mother")}
              </span>
              <span className="text-[17px] text-text-muted" lang="en">
                {p.firstName}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
