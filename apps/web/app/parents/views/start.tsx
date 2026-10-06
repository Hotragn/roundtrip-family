"use client";

import { Check, House, Lock, WifiOff } from "lucide-react";
import { Mark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { DEMO_HOUSEHOLDS, type WeekView } from "@/lib/week";

/**
 * Setting up a phone: where they're staying, then whose phone this is. Usually the adult child
 * does it with them at home, so each step has a short English line under the Telugu. Chosen once;
 * in a real family the setup link sets it.
 */
function StepTitle({ n, te, en, as: Tag = "h2" }: { n: number; te: string; en: string; as?: "h1" | "h2" }) {
  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-[17px] font-semibold text-white"
      >
        {n}
      </span>
      <div>
        <Tag className="text-[26px] font-semibold" lang="te">
          {te}
        </Tag>
        <p className="text-[15px] text-text-muted" lang="en">
          {en}
        </p>
      </div>
    </div>
  );
}

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
  const notes = [
    { icon: WifiOff, text: t("Parents.offlineNote") },
    { icon: House, text: t("Parents.installNote") },
    { icon: Lock, text: t("Parents.privateNote") },
  ];
  return (
    <div className="space-y-8 pt-6 pb-10">
      <div className="flex items-center justify-between gap-3">
        <Mark size={44} />
        <span className="rounded-full bg-surface-sunken px-3 py-1 text-[14px] text-text-muted" lang="en">
          {t("Parents.demo")}
        </span>
      </div>

      <section className="rounded-ticket bg-surface p-6 shadow-raised ring-1 ring-line">
        <p className="text-[30px] font-semibold" lang="te">
          {t("Parents.welcome")}
        </p>
        <p className="mt-2 text-parent text-text-muted" lang="te">
          {t("Parents.welcomeLine")}
        </p>
        <p className="mt-4 border-t border-line pt-4 text-[15px] text-text-muted" lang="en">
          Setting this up for a parent? Choose where they're staying, then whose phone this is. It takes a few seconds.
        </p>
      </section>

      <section className="space-y-4">
        <StepTitle n={1} te={t("Parents.household")} en="Where they're staying" />
        <div className="grid gap-3">
          {DEMO_HOUSEHOLDS.map((h) => {
            const on = household === h.slug;
            return (
              <button
                key={h.slug}
                type="button"
                aria-pressed={on}
                onClick={() => onHousehold(h.slug)}
                className={cn(
                  "flex min-h-16 items-center justify-between gap-3 rounded-xl border-2 bg-surface px-5 py-3 text-left transition-colors",
                  on ? "border-ink" : "border-line hover:border-line-strong",
                )}
                lang="en"
              >
                <span className="text-[19px] font-semibold">
                  {h.label}
                  <span className="block text-[15px] font-normal text-text-muted">{h.note}</span>
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border-2",
                    on ? "border-ink bg-ink text-white" : "border-line-strong",
                  )}
                >
                  {on ? <Check className="size-4 stroke-[2.5]" /> : null}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <StepTitle n={2} te={t("Parents.whose")} en="Whose phone is this?" as="h1" />
        <div className="grid grid-cols-2 gap-3" aria-busy={week === undefined}>
          {week === undefined ? (
            <>
              <div aria-hidden="true" className="min-h-32 rounded-ticket bg-surface-sunken motion-safe:animate-pulse" />
              <div aria-hidden="true" className="min-h-32 rounded-ticket bg-surface-sunken motion-safe:animate-pulse" />
            </>
          ) : null}
          {(week?.parents ?? []).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onParent(p.id)}
              className="flex min-h-32 flex-col items-center justify-center gap-1 rounded-ticket bg-surface shadow-raised ring-1 ring-line transition-transform active:translate-y-px"
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
      </section>

      <ul className="space-y-3 rounded-ticket bg-surface-sunken p-5">
        {notes.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-3">
            <Icon aria-hidden="true" className="mt-1 size-5 shrink-0 stroke-[1.75] text-text-muted" />
            <span className="text-[18px] leading-[1.6]" lang="te">
              {text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
