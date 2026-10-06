import { ExternalLink, Phone, Wifi } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SafetySettingsForm, type TimerExample } from "@/components/dashboard/safety-settings";
import { DashboardShell } from "@/components/dashboard/shell";
import { Panel } from "@/components/shell/panel";
import { HOUSEHOLDS, isHousehold, loadBoard } from "@/lib/plan-board";
import { DAY_NAMES, longDate } from "@/lib/plan-format";

export const dynamicParams = false;
export function generateStaticParams() {
  return Object.keys(HOUSEHOLDS).map((household) => ({ household }));
}

export const metadata: Metadata = { title: "Safety" };

/** Safety: the timer on every outing, its settings, and what they have if they need help. */
export default async function Safety({ params }: PageProps<"/plan/[household]/safety">) {
  const { household } = await params;
  if (!isHousehold(household)) notFound();
  const board = loadBoard(household);
  const h = board.household;
  const bundle = HOUSEHOLDS[household].bundle();

  // A real outing from this week to show the timer with.
  const solo = board.items.find((i) => i.defaultStatus === "approved" && !i.withAdultChild && i.parentIds.length === 1);
  const parent = solo ? board.parents.find((p) => p.id === solo.parentIds[0]) : undefined;
  const example: TimerExample | null =
    solo && parent
      ? {
          who: parent.firstName,
          place: solo.title,
          day: DAY_NAMES[solo.day] ?? solo.day,
          depart: solo.depart,
          back: solo.back,
        }
      : null;
  const first = board.parents[0]!;
  const fill = (s: string) => s.replace("{name}", first.firstName).replace("{area}", h.homeArea);
  const numbers = [h.emergency, ...(h.secondaryEmergency ? [h.secondaryEmergency] : [])];

  return (
    <DashboardShell household={household} weekLabel={board.week.label} parents={board.parents} theme="sea">
      <div className="space-y-8">
        <div className="max-w-[720px] space-y-2">
          <h1 className="text-[31px] font-semibold leading-tight">Safety</h1>
          <p className="text-base text-text-muted">
            What happens on every outing they take on their own, when you&rsquo;d hear about it, and what they carry if
            they need help.
          </p>
        </div>

        <Panel className="p-5 sm:p-6">
          <SafetySettingsForm
            household={household}
            defaults={bundle.household.safety}
            example={example}
            usesFahrenheit={h.hostCountry === "US"}
          />
        </Panel>

        <section aria-labelledby="help" className="space-y-4">
          <h2 id="help" className="text-[20px] font-semibold">
            If they need help
          </h2>
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel className="space-y-4 p-5">
              <h3 className="font-semibold">Emergency numbers</h3>
              <ul className="space-y-3">
                {numbers.map((n) => (
                  <li key={n.number} className="flex items-baseline gap-3">
                    <span className="text-[31px] font-semibold tabular-nums leading-none">{n.number}</span>
                    <span className="text-[15px] leading-snug">{n.covers}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[13px] text-text-muted">
                From the official source,{" "}
                <a
                  href={h.emergency.source}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 underline underline-offset-2"
                >
                  {new URL(h.emergency.source).hostname.replace(/^www\./, "")}
                  <ExternalLink aria-hidden="true" className="size-3" />
                </a>
                {h.emergency.verifiedOn ? `, checked ${longDate(h.emergency.verifiedOn)}` : ""}. Never typed from
                memory.
              </p>
            </Panel>

            <Panel className="space-y-3 p-5">
              <h3 className="font-semibold">Their help card</h3>
              <p className="text-[13px] text-text-muted">
                &ldquo;I&rsquo;m lost&rdquo; is on every screen of their app. It shows this, large, for a stranger to
                read:
              </p>
              <figure lang={h.localLanguage} className="space-y-1.5 rounded-ticket bg-paper p-4 ring-1 ring-line">
                <p className="text-[20px] font-semibold leading-snug">{h.localPhrases.helpTitle}</p>
                <p className="text-[15px]">{fill(h.localPhrases.myName)}</p>
                <p className="text-[15px]">{fill(h.localPhrases.stayingNear)}</p>
                <p className="text-[15px]">{h.localPhrases.callFamily}</p>
                <p className="text-[20px] font-semibold tabular-nums">{h.contact.phone}</p>
              </figure>
              <p className="text-[13px] text-text-muted">
                It names the stop near home, never the address
                {h.contact.fictional ? ". The number is a fictional one" : ""}.
              </p>
              <a
                href={`/parents/${household}/${first.id}?v=lost`}
                target="_blank"
                rel="noreferrer"
                className="inline-block text-sm font-semibold text-sea-text underline-offset-4 hover:underline"
              >
                See it on {first.firstName}&rsquo;s phone
              </a>
            </Panel>

            <Panel className="space-y-3 p-5">
              <h3 className="font-semibold">Their phones</h3>
              {h.phonePlan.hasLocalPlan ? (
                <p className="flex gap-3 text-[15px] leading-snug">
                  <Phone aria-hidden="true" className="mt-0.5 size-5 shrink-0 stroke-[1.75] text-sea-line" />
                  They have a local phone plan, so the help card can call you with one tap.
                </p>
              ) : (
                <>
                  <p className="flex gap-3 text-[15px] leading-snug">
                    <Wifi aria-hidden="true" className="mt-0.5 size-5 shrink-0 stroke-[1.75] text-sea-line" />
                    They&rsquo;re on home Wi-Fi only. Their app works offline on every outing: the ticket, directions,
                    phrases and the help card are all on the phone.
                  </p>
                  <p className="flex gap-3 text-[15px] leading-snug">
                    <Phone aria-hidden="true" className="mt-0.5 size-5 shrink-0 stroke-[1.75] text-sea-line" />
                    Calling for help needs a phone plan. A prepaid local SIM or eSIM for the length of the visit is
                    enough.
                  </p>
                </>
              )}
            </Panel>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
