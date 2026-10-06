import { liveWeekContext } from "@roundtrip/agent/live-week";
import { planWeek } from "@roundtrip/agent/planner";
import { z } from "zod";
import { HOUSEHOLDS, isHousehold } from "@/lib/plan-board";
import type { ReplanResult } from "@/lib/replan-types";
import { take } from "@/lib/server/rate-limit";
import { sessionId } from "@/lib/server/session";
import { traced } from "@/sentry.server";

/**
 * Plan the coming week, live: the planner runs now on the household's saved places with the
 * live forecast, TabPFN through the ranker, and Gemma 4 choosing and explaining. No new
 * searches are made. Rate-limited, because every run spends free allowances: three runs an
 * hour per visitor and forty a day for the whole demo. The result isn't put on their phones;
 * the demo week stays as it is.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z.object({ only: z.enum(["mother", "father"]).optional() });
const DAY_NAME: Record<string, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

export async function POST(req: Request, { params }: { params: Promise<{ household: string }> }) {
  const { household } = await params;
  if (!isHousehold(household)) return Response.json({ error: "No such household" }, { status: 404 });
  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return Response.json({ error: "Invalid choice" }, { status: 400 });

  const sid = await sessionId();
  const allowed = take([
    { key: `replan:${sid}`, max: 3, windowMs: 60 * 60 * 1000 },
    { key: "replan:all", max: 40, windowMs: 24 * 60 * 60 * 1000 },
  ]);
  if (!allowed.ok) {
    return Response.json(
      { error: `That's as many plans as the demo makes for now. Try again in ${allowed.retryInMinutes} minutes.` },
      { status: 429 },
    );
  }

  const bundle = HOUSEHOLDS[household].bundle();
  const started = Date.now();
  try {
    const { ctx, forecast } = await liveWeekContext(bundle, { only: body.data.only });
    const plan = await traced(
      "plan the coming week",
      () => planWeek(ctx),
      (p) => ({
        household,
        suggestions: p.suggestions.length,
        modelCalls: p.stats.modelCalls,
        cachedModelCalls: p.stats.cachedModelCalls,
        rankerCalls: p.stats.rankerCalls,
        ms: p.stats.ms,
      }),
    );
    const name = (ids: string[]) =>
      bundle.parents
        .filter((p) => ids.includes(p._id))
        .map((p) => p.firstName)
        .join(" and ");
    const result: ReplanResult = {
      week: { label: ctx.week.label, monday: ctx.week.monday },
      forecast,
      note: plan.note,
      suggestions: plan.suggestions.map((s) => ({
        id: s.id,
        title: s.candidate.title.replace(/\s+[-|]\s+.*$/, ""),
        day: DAY_NAME[s.slot.day] ?? s.slot.day,
        depart: s.slot.depart,
        back: s.slot.back,
        withAdultChild: s.slot.withAdultChild,
        who: name(s.parentIds),
        ladderLevel: s.ladderLevel,
        ladderLabel: s.ladderLabel,
        reasonText: s.reasonText,
        chips: s.chips,
        score: s.score.combined,
      })),
      stats: {
        seconds: Math.round((Date.now() - started) / 100) / 10,
        modelCalls: plan.stats.modelCalls,
        cachedModelCalls: plan.stats.cachedModelCalls,
        rankerCalls: plan.stats.rankerCalls,
        candidates: plan.stats.candidates,
        feasible: plan.stats.feasible,
        steps: plan.stats.toolCalls.map((t) => ({ tool: t.tool, ms: t.ms, detail: t.detail.slice(0, 200) })),
      },
    };
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.warn(`Plan the coming week failed: ${e instanceof Error ? e.message.slice(0, 300) : e}`);
    return Response.json(
      { error: "The planner didn't finish this time. The free servers may be waking up; try again in a minute." },
      { status: 503 },
    );
  }
}
