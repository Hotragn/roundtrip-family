"use client";

import { CloudRain, CloudSun, Snowflake, Sun, Thermometer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Panel } from "@/components/shell/panel";
import { Button } from "@/components/ui/button";
import { hhmm, shortDate } from "@/lib/plan-format";
import type { PlanBoard } from "@/lib/plan-types";
import type { ReplanResult } from "@/lib/replan-types";
import { cn } from "@/lib/utils";
import { LadderBadge, ReasonChips } from "./reason";

/**
 * Plan the coming week, live. Runs the planner on the server with the live forecast and shows
 * what it chose and why, with how long it took and what it called. It doesn't touch this week's
 * board or their phones. Rate-limited on the server.
 */

const WEATHER_ICON: Record<string, typeof Sun> = {
  very_hot: Thermometer,
  hot: Sun,
  pleasant: CloudSun,
  cool: CloudSun,
  cold: Snowflake,
  rainy: CloudRain,
};

export function Replan({ board }: { board: PlanBoard }) {
  const [only, setOnly] = useState<"both" | "mother" | "father">("both");
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<ReplanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => void (timer.current && clearInterval(timer.current)), []);

  // The free ranker sleeps when idle; wake it once this panel is in view, so it's up by the click.
  const intro = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = intro.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      void fetch("/plan/api/replan/wake").catch(() => {});
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const mother = board.parents.find((p) => p.role === "mother");
  const father = board.parents.find((p) => p.role === "father");
  const choices = [
    { id: "both" as const, label: "Both of them" },
    ...(mother ? [{ id: "mother" as const, label: `Only ${mother.firstName}` }] : []),
    ...(father ? [{ id: "father" as const, label: `Only ${father.firstName}` }] : []),
  ];

  async function run() {
    setState("running");
    setError(null);
    setElapsed(0);
    const t0 = Date.now();
    timer.current = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    try {
      const res = await fetch(`/plan/api/replan/${board.household.slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(only === "both" ? {} : { only }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "The planner didn't finish. Try again in a minute.");
      setResult(body as ReplanResult);
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The planner didn't finish. Try again in a minute.");
      setState("error");
    } finally {
      if (timer.current) clearInterval(timer.current);
    }
  }

  return (
    <Panel className="space-y-5 p-5 sm:p-6">
      <div ref={intro} className="max-w-[760px] space-y-1.5">
        <h2 className="text-[20px] font-semibold">Plan the coming week</h2>
        <p className="text-[15px] text-text-muted">
          Run the planner now for next Monday to Sunday: the live forecast, the places from the saved searches, TabPFN
          scoring each option from their history, and Gemma 4 choosing and explaining. It takes about half a minute and
          doesn&rsquo;t change this week or their phones.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="radiogroup"
          aria-label="Who to plan for"
          className="flex flex-wrap gap-1 rounded-lg bg-surface-sunken p-1"
        >
          {choices.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={only === c.id}
              onClick={() => setOnly(c.id)}
              className="rounded-md px-3 py-1.5 text-[13px] font-medium text-text-muted transition-colors hover:text-text aria-checked:bg-surface aria-checked:text-text aria-checked:shadow-raised"
            >
              {c.label}
            </button>
          ))}
        </div>
        <Button variant="secondary" onClick={() => void run()} disabled={state === "running"}>
          {state === "running" ? "Planning" : state === "done" ? "Plan it again" : "Plan it now"}
        </Button>
        <p role="status" aria-live="polite" className="text-[13px] text-text-muted">
          {state === "running"
            ? `Planning, ${elapsed} s. A free server may take a moment to wake.`
            : state === "done" && result
              ? `Made just now in ${result.stats.seconds} s.`
              : ""}
        </p>
      </div>
      {state === "error" && error ? (
        <p role="alert" className="text-[15px] font-medium">
          {error}
        </p>
      ) : null}

      {state === "done" && result ? (
        <div className="space-y-5 border-t border-line pt-5">
          <div className="space-y-2">
            <h3 className="text-[15px] font-semibold">
              The forecast for {shortDate(result.week.monday)} to{" "}
              {shortDate(result.forecast.at(-1)?.date ?? result.week.monday)}
            </h3>
            <ul className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {result.forecast.map((f) => {
                const Icon = WEATHER_ICON[f.label] ?? CloudSun;
                return (
                  <li key={f.date} className="rounded-lg bg-surface-sunken px-2 py-2 text-center">
                    <p className="text-[13px] font-medium">{shortDate(f.date).split(" ")[0]}</p>
                    <Icon aria-hidden="true" className="mx-auto my-1 size-5 stroke-[1.75] text-text-muted" />
                    <p className="text-[13px] tabular-nums">{f.maxC}°C</p>
                    <p className="text-[11px] text-text-muted tabular-nums">{Math.round(f.rainChance * 100)}% rain</p>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="space-y-2">
            <h3 className="text-[15px] font-semibold">What the planner chose</h3>
            {result.note ? <p className="text-[15px] text-text-muted">{result.note}</p> : null}
            <ol className="divide-y divide-line">
              {result.suggestions.map((s) => (
                <li key={s.id} className="grid gap-x-6 gap-y-2 py-3 sm:grid-cols-[11rem_1fr]">
                  <div>
                    <p className="text-[14px] font-semibold">{s.day}</p>
                    <p className="text-[13px] tabular-nums text-text-muted">
                      {hhmm(s.depart)} to {hhmm(s.back)}
                      {s.withAdultChild ? ", with you" : ""}
                    </p>
                    <p className="text-[13px] text-text-muted">{s.who}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="font-semibold leading-snug">{s.title}</p>
                    <LadderBadge level={s.ladderLevel} label={s.ladderLabel} size="sm" />
                    <p className="text-[14px] leading-relaxed">{s.reasonText}</p>
                    <ReasonChips chips={s.chips} max={2} size="sm" />
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <p className={cn("text-[13px] text-text-muted")}>
            {result.stats.modelCalls} Gemma {result.stats.modelCalls === 1 ? "call" : "calls"} made live
            {result.stats.cachedModelCalls ? `, ${result.stats.cachedModelCalls} answered from saved runs` : ""};{" "}
            {result.stats.rankerCalls} TabPFN {result.stats.rankerCalls === 1 ? "ranking" : "rankings"};{" "}
            {result.stats.candidates} places considered, {result.stats.feasible} of them fit a free time. Places come
            from the saved searches of 5 October; no new searches were made. The family is fictional.
          </p>
        </div>
      ) : null}
    </Panel>
  );
}
