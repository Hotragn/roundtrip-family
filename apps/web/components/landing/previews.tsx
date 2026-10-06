import { TravelLine, TravelLines } from "@/components/travel/travel-line";
import { cn } from "@/lib/utils";
import type { DemoWeek } from "./demo";
import { CheckIcon, LockIcon, ReasonChip } from "./ui";

/**
 * Small, exact pictures of the product inside the story panels, drawn from the demo week:
 * the dashboard's plan, the parent's ticket, the way home and the diary.
 */

function Frame({ children, className, label }: { children: React.ReactNode; className?: string; label: string }) {
  return (
    <figure aria-label={label} className={cn("mt-6 rounded-[14px] bg-surface-sunken p-1.5", className)}>
      <div className="rounded-[10px] bg-surface p-4 ring-1 ring-line sm:p-5">{children}</div>
    </figure>
  );
}

export function WeekPreview({ week }: { week: DemoWeek }) {
  if (week.plan.length === 0) return null;
  return (
    <Frame label={`${week.name}'s week on the dashboard`}>
      <ul className="divide-y divide-line">
        {week.plan.map((o) => (
          <li key={o.id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-text-muted">{o.when}</span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-sm font-medium",
                  o.approved ? "text-accent-text" : "text-text-muted",
                )}
              >
                {o.approved ? <CheckIcon className="size-4" /> : null}
                {o.approved ? "Approved" : "Suggested"}
              </span>
            </div>
            <div className="mt-0.5 text-base font-semibold">{o.place}</div>
            {o.trip ? <div className="text-sm text-text-muted">{o.trip}</div> : null}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {o.chips.map((c) => (
                <ReasonChip key={c.label} tone={c.tone}>
                  {c.label}
                </ReasonChip>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

export function TicketPreview({ week }: { week: DemoWeek }) {
  const t = week.ticket;
  if (!t) return null;
  return (
    <Frame label={`${week.name}'s ticket on her phone, in Telugu, and the card she shows the driver`}>
      <TravelLines legs={t.legs} width={360} label={t.linesLabel} />
      <div className="mt-3 flex items-end justify-between gap-4">
        <div lang="te" className="font-semibold">
          <div className="text-sm text-text-muted">{week.te.leave}</div>
          <div className="text-[28px] leading-none tabular-nums" lang="en">
            {t.leave}
          </div>
        </div>
        <div className="text-right text-sm font-medium text-text-muted">Bus {t.bus}</div>
      </div>
      <p lang="te" className="mt-3 text-[21px] font-semibold leading-snug">
        {t.title}
      </p>
      <div aria-hidden="true" className="relative my-4 h-0">
        <div className="absolute inset-x-0 border-t-2 border-dashed border-line-strong" />
      </div>
      <div className="text-sm text-text-muted">{t.driverLead}</div>
      <div className="mt-0.5 text-[22px] font-bold leading-tight tracking-tight">{t.driverStop}</div>
    </Frame>
  );
}

export function HomePreview({ week }: { week: DemoWeek }) {
  const s = week.safety;
  if (!s) return null;
  const steps = [
    { time: s.due, text: "Due back" },
    { time: s.check, text: "The app checks on her" },
    { time: s.email, text: "An email to you" },
  ];
  return (
    <Frame label={`The I'm home button on ${week.name}'s phone, and what happens if it doesn't come`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div
          aria-hidden="true"
          lang="te"
          className="inline-flex min-h-14 items-center gap-2 rounded-xl bg-home-green px-5 text-[20px] font-semibold text-white"
        >
          <CheckIcon className="size-5 stroke-[2.25]" />
          {week.te.imHome}
        </div>
        <span className="text-sm text-text-muted">I'm home</span>
      </div>
      <ol className="mt-5 grid grid-cols-3 gap-3">
        {steps.map((step, i) => (
          <li key={step.text} className="relative">
            <div aria-hidden="true" className="flex items-center">
              <span className="size-2.5 shrink-0 rounded-full border-2 border-text bg-surface" />
              {i < steps.length - 1 ? <span className="h-0.5 flex-1 bg-line-strong" /> : null}
            </div>
            <div className="mt-2 text-base font-semibold tabular-nums">{step.time}</div>
            <div className="text-sm leading-snug text-text-muted">{step.text}</div>
          </li>
        ))}
      </ol>
    </Frame>
  );
}

export function DiaryPreview({ week }: { week: DemoWeek }) {
  return (
    <Frame label={`${week.name}'s private diary, with feeling words in Telugu`}>
      <div className="flex items-center justify-between gap-3">
        <span lang="te" className="text-[20px] font-semibold">
          {week.te.diary}
        </span>
        <span className="inline-flex items-center gap-1.5 text-sm text-text-muted">
          <LockIcon className="size-4" />
          Private
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2" lang="te">
        {week.feelings.map((w) => (
          <span
            key={w}
            className="inline-flex h-9 items-center rounded-chip border border-line bg-surface px-3 text-base font-semibold"
          >
            {w}
          </span>
        ))}
      </div>
    </Frame>
  );
}

export function CountriesPreview() {
  const routes = [
    { from: "Guntur", to: "Fremont, California", family: "Sarala and Venkat", local: "English" },
    { from: "Vijayawada", to: "München, Germany", family: "Kamala and Raghu", local: "German" },
  ];
  return (
    <figure aria-label="The two demo families, where they are from and where they are staying" className="mt-6">
      <ul className="space-y-2.5">
        {routes.map((r) => (
          <li key={r.to} className="rounded-[12px] bg-surface-sunken px-4 py-3.5">
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
              <span className="text-sm font-medium text-text-muted">{r.from}</span>
              <span aria-hidden="true" className="flex justify-center">
                <TravelLine mode="sky" width={84} />
              </span>
              <span className="text-base font-semibold">{r.to}</span>
            </div>
            <div className="mt-1 text-sm text-text-muted">
              {r.family}. {r.local} around them, Telugu at home.
            </div>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** The sky theme's vehicle, as a small mark beside a heading. */
export function Aircraft({ className }: { className?: string }) {
  return (
    // biome-ignore lint/performance/noImgElement: a fixed-size baked render, already sized for 1x and 2x
    <img
      src="/art/aircraft.webp"
      srcSet="/art/aircraft.webp 1x, /art/aircraft@2x.webp 2x"
      width={88}
      height={25}
      alt=""
      loading="lazy"
      decoding="async"
      className={className}
    />
  );
}
