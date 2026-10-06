"use client";

import { useQuery } from "@tanstack/react-query";
import { Frown, Meh, Mic, Smile } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Panel } from "@/components/shell/panel";
import type { Visit } from "@/lib/family";
import { hhmm, longDate, tripLine, whoFor } from "@/lib/plan-format";
import type { PlanBoard } from "@/lib/plan-types";
import { cn } from "@/lib/utils";
import { howItWent } from "./memory-lists";
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

/** Minutes since midnight now, and today's date, in the household's time zone. */
function useNow(timezone: string) {
  const [now, setNow] = useState<{ date: string; minutes: number } | null>(null);
  useEffect(() => {
    const read = () => {
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-CA", {
          timeZone: timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        })
          .formatToParts(new Date())
          .map((p) => [p.type, p.value]),
      );
      setNow({
        date: `${parts.year}-${parts.month}-${parts.day}`,
        minutes: Number(parts.hour) * 60 + Number(parts.minute),
      });
    };
    read();
    const t = setInterval(read, 60_000);
    return () => clearInterval(t);
  }, [timezone]);
  return now;
}

/** "didn't know which bus" as a sentence: "Didn't know which bus." */
const sentence = (t: string) => `${t.charAt(0).toUpperCase()}${t.slice(1)}${/[.!?]$/.test(t) ? "" : "."}`;

function clockIn(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );
}

function Status({
  item,
  date,
  board,
  checkins,
  replies,
  now,
}: {
  item: EffectiveItem;
  date: string;
  board: PlanBoard;
  checkins: Checkin[];
  replies: Reply[];
  now: { date: string; minutes: number } | null;
}) {
  const tz = board.household.timezone;
  const mine = (r: Checkin) => r.outingId === item.slotId || r.outingId === item.id;
  const home = checkins.filter(mine);
  const said = replies.filter(mine);
  if (home.length || said.length) {
    return (
      <div className="space-y-1.5">
        {home.map((c) => (
          <p key={`${c.parentId}-${c.createdAt}`} className="text-[14px] font-semibold">
            {board.parents.find((p) => p.id === c.parentId)?.firstName} was home at {clockIn(c.createdAt, tz)}
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
  if (!now) return null;
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
  return (
    <p className={cn("text-[14px]", when === "past" && !item.withAdultChild ? "font-medium" : "text-text-muted")}>
      {text}
    </p>
  );
}

export function TheirWeek({ board, history }: { board: PlanBoard; history: Visit[] }) {
  const { overlay } = useOverlay(board.household.slug);
  const items = useEffectiveItems(board, overlay).filter((i) => i.status === "approved");
  const checkins = useRecords<Checkin>("checkin").data ?? [];
  const replies = useRecords<Reply>("reply").data ?? [];
  const now = useNow(board.household.timezone);
  const days = board.week.days.filter((d) => items.some((i) => i.day === d.day));
  const went = history.filter((v) => v.went).reverse();
  const missed = history.filter((v) => !v.went);

  return (
    <div className="space-y-8">
      <section aria-labelledby="this-week" className="space-y-4">
        <h2 id="this-week" className="text-[20px] font-semibold">
          This week, {board.week.label}
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
                            now={now}
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
          .
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
