"use client";

import { useQuery } from "@tanstack/react-query";
import { BellRing, Check, Clock, Frown, Meh, Mic, Smile } from "lucide-react";
import Link from "next/link";
import type { AlertView } from "@/app/(site)/plan/api/alerts/[household]/route";
import { Panel } from "@/components/shell/panel";
import type { Visit } from "@/lib/family";
import { checkinLine, hhmm, longDate, sampleWeek, tripLine, whoFor } from "@/lib/plan-format";
import type { PlanBoard } from "@/lib/plan-types";
import { cn } from "@/lib/utils";
import { DEMO_NOW } from "@/lib/week";
import { howItWent } from "./memory-lists";
import { alertLine, useSafetyAlerts } from "./safety-alerts";
import { type EffectiveItem, useEffectiveItems, useOverlay } from "./use-overlay";

/**
 * Their week: the outings you approved, with what their phones reported ("I'm home", and the
 * face they picked for "How was it?"), then the visit so far. Check-ins come from the parents'
 * app in this same browser session, so tapping "I'm home" on a demo phone shows up here.
 */

interface Checkin {
  outingId: string;
  parentId: string;
  createdAt: string;
}
interface Reply extends Checkin {
  face: "good" | "okay" | "not_good" | null;
  hasAudio: boolean;
}

const FACE = {
  good: { icon: Smile, label: "Good" },
  okay: { icon: Meh, label: "Okay" },
  not_good: { icon: Frown, label: "Not good" },
} as const;

function useRecords<T>(kind: "checkin" | "reply") {
  return useQuery({
    queryKey: ["parents", kind],
    queryFn: async (): Promise<T[]> => {
      const res = await fetch(`/parents/api/${kind}`, { cache: "no-store" });
      return res.ok ? ((await res.json()) as { records: T[] }).records : [];
    },
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}

/** "didn't know which bus" as a sentence: "Didn't know which bus." */
const sentence = (t: string) => `${t.charAt(0).toUpperCase()}${t.slice(1)}${/[.!?]$/.test(t) ? "" : "."}`;

function Status({
  item,
  date,
  board,
  checkins,
  replies,
  alerts,
}: {
  item: EffectiveItem;
  date: string;
  board: PlanBoard;
  checkins: Checkin[];
  replies: Reply[];
  alerts: AlertView[];
}) {
  const tz = board.household.timezone;
  const mine = (r: Checkin) => r.outingId === item.slotId || r.outingId === item.id;
  const home = checkins.filter(mine);
  const said = replies.filter(mine);
  const alert = alerts.find((a) => a.outingIds.includes(item.slotId) || a.outingIds.includes(item.id));
  if (alert && home.length === 0) {
    return (
      <p
        role={alert.state === "alerted" ? "alert" : undefined}
        className="flex items-start gap-1.5 rounded-chip border-2 border-ink bg-bus px-2.5 py-1 text-[14px] font-semibold text-on-bus"
      >
        <BellRing aria-hidden="true" className="mt-0.5 size-4 shrink-0 stroke-[2]" />
        {alert.state === "alerted"
          ? alertLine(alert)
          : `Not home yet: the phone is asking "Are you home?". If there's no answer, you'll be told.`}
      </p>
    );
  }
  if (home.length || said.length) {
    return (
      <div className="space-y-1.5">
        {home.map((c) => (
          <p
            key={`${c.parentId}-${c.createdAt}`}
            className="inline-flex items-center gap-1.5 rounded-chip bg-home-green/10 px-2.5 py-1 text-[14px] font-semibold text-home-green-text"
          >
            <Check aria-hidden="true" className="size-4 stroke-[2.25]" />
            {checkinLine(board.parents.find((p) => p.id === c.parentId)?.firstName ?? "", c.createdAt, tz, {
              date,
              depart: item.depart,
            })}
          </p>
        ))}
        {said.map((r) => {
          const face = r.face ? FACE[r.face] : null;
          const Icon = face?.icon;
          return (
            <p key={`${r.parentId}-${r.createdAt}`} className="flex items-center gap-1.5 text-[14px]">
              {Icon ? <Icon aria-hidden="true" className="size-4 stroke-[1.75]" /> : null}
              {board.parents.find((p) => p.id === r.parentId)?.firstName}: {face ? face.label : "replied"}
              {r.hasAudio ? (
                <span className="inline-flex items-center gap-1 text-text-muted">
                  <Mic aria-hidden="true" className="ml-1 size-3.5" /> a voice note, kept on their phone
                </span>
              ) : null}
            </p>
          );
        })}
      </div>
    );
  }
  // The sample week's own clock (Monday morning, as on their phones), never the real today.
  const now = DEMO_NOW;
  const when =
    date < now.date
      ? "past"
      : date > now.date
        ? "future"
        : now.minutes < item.depart
          ? "future"
          : now.minutes <= item.back
            ? "out"
            : "past";
  const text =
    when === "future"
      ? `Planned: leaves ${hhmm(item.depart)}, home by ${hhmm(item.back)}`
      : when === "out"
        ? `Out now, home by ${hhmm(item.back)}`
        : item.withAdultChild
          ? "With you"
          : `No “I’m home” yet. The phone checks ${board.household.safety.bufferMinutes} minutes after ${hhmm(item.back)}.`;
  const waiting = when === "past" && !item.withAdultChild;
  return (
    <p
      className={cn(
        "text-[14px]",
        waiting && "inline-flex items-start gap-1.5 rounded-chip bg-surface-sunken px-2.5 py-1 font-medium",
        when === "out" && "inline-flex rounded-chip bg-bus/15 px-2.5 py-1 font-medium",
        !waiting && when !== "out" && "text-text-muted",
      )}
    >
      {waiting ? <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0 stroke-[1.75]" /> : null}
      {text}
    </p>
  );
}

export function TheirWeek({ board, history }: { board: PlanBoard; history: Visit[] }) {
  const { overlay } = useOverlay(board.household.slug);
  const items = useEffectiveItems(board, overlay).filter((i) => i.status === "approved");
  const checkins = useRecords<Checkin>("checkin").data ?? [];
  const replies = useRecords<Reply>("reply").data ?? [];
  const alerts = useSafetyAlerts(board.household.slug).data ?? [];
  const days = board.week.days.filter((d) => items.some((i) => i.day === d.day));
  const went = history.filter((v) => v.went).reverse();
  const missed = history.filter((v) => !v.went);

  return (
    <div className="space-y-8">
      <section aria-labelledby="this-week" className="space-y-4">
        <h2 id="this-week" className="text-[20px] font-semibold">
          {sampleWeek(board.week.label)}
        </h2>
        {items.length === 0 ? (
          <Panel className="p-5">
            <p className="text-[15px]">
              Nothing approved yet.{" "}
              <Link href={`/plan/${board.household.slug}`} className="font-semibold underline underline-offset-4">
                Approve outings on This week
              </Link>{" "}
              and they show up here with what their phones report.
            </p>
          </Panel>
        ) : (
          <ol className="space-y-4">
            {days.map((d) => (
              <li key={d.day}>
                <Panel className="p-5">
                  <h3 className="mb-3 text-[15px] font-semibold">{longDate(d.date)}</h3>
                  <ul className="divide-y divide-line">
                    {items
                      .filter((i) => i.day === d.day)
                      .sort((a, b) => a.depart - b.depart)
                      .map((i) => (
                        <li
                          key={i.slotId}
                          className="grid gap-x-6 gap-y-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[7rem_1fr_1.2fr]"
                        >
                          <p className="text-[14px] font-semibold tabular-nums">
                            {hhmm(i.depart)} to {hhmm(i.back)}
                          </p>
                          <div>
                            <p className="font-semibold leading-snug">{i.title}</p>
                            <p className="text-[13px] text-text-muted">
                              {whoFor(i, board)} · {tripLine(i)}
                            </p>
                          </div>
                          <Status
                            item={i}
                            date={d.date}
                            board={board}
                            checkins={checkins}
                            replies={replies}
                            alerts={alerts}
                          />
                        </li>
                      ))}
                  </ul>
                </Panel>
              </li>
            ))}
          </ol>
        )}
        <p className="text-[13px] text-text-muted">
          Check-ins appear here a moment after they tap &ldquo;I&rsquo;m home&rdquo; or answer &ldquo;How was
          it?&rdquo;. In this demo, try it on{" "}
          <a
            href={`/parents/${board.household.slug}/${board.parents[0]?.id}`}
            target="_blank"
            rel="noreferrer"
            className="font-semibold underline underline-offset-4"
          >
            {board.parents[0]?.firstName}&rsquo;s phone
          </a>
          . The plan is shown as it stands on Monday morning of the sample week, as on their phones.
        </p>
      </section>

      {missed.length ? (
        <section aria-labelledby="missed" className="space-y-4">
          <h2 id="missed" className="text-[20px] font-semibold">
            What they wanted to go to and couldn&rsquo;t
          </h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {missed.map((v) => (
              <li key={v.id}>
                <Panel className="h-full space-y-1.5 p-5">
                  <p className="font-semibold leading-snug">{v.title}</p>
                  <p className="text-[13px] text-text-muted">
                    {v.kind} · {v.who.join(" and ")}
                  </p>
                  {v.notes ? (
                    <p className="text-[15px] leading-snug">{sentence(v.notes.replace(/^Didn't go: /, ""))}</p>
                  ) : null}
                </Panel>
              </li>
            ))}
          </ul>
          <p className="text-[13px] text-text-muted">
            This is why every new route starts with a first ride together at the weekend, and why each ticket says which
            stop to get off at.
          </p>
        </section>
      ) : null}

      <section aria-labelledby="so-far">
        <Panel className="p-5 sm:p-6">
          <h2 id="so-far" className="text-[20px] font-semibold">
            Their visit so far
          </h2>
          <p className="mb-4 mt-1 text-[15px] text-text-muted">Every outing and how it went, latest first.</p>
          <ul className="divide-y divide-line">
            {went.map((v) => (
              <li key={v.id} className="grid gap-x-6 gap-y-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[1.4fr_1fr_1.4fr]">
                <div>
                  <p className="font-semibold leading-snug">{v.title}</p>
                  <p className="text-[13px] text-text-muted">
                    {v.kind} · {v.who.join(" and ")} · {v.withYou ? "with you" : "on their own"}
                  </p>
                </div>
                <p className="text-[14px]">
                  <span className="font-medium">{howItWent(v.enjoyment)}</span>
                  {v.enjoyment !== null ? <span className="text-text-muted"> · {v.enjoyment} of 5</span> : null}
                </p>
                <p className="text-[14px] leading-snug text-text-muted">{v.notes}</p>
              </li>
            ))}
          </ul>
        </Panel>
      </section>
    </div>
  );
}
