import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { Agent } from "@mastra/core/agent";
import { LADDER_LABELS, type LadderLevel, type ReasonChip } from "@roundtrip/core";
import type { DataClass } from "@roundtrip/core/privacy";
import { z } from "zod";
import { gemma, parseJson } from "../gemma";
import { rankOutings } from "../tools/ranker";
import { type Candidate, tripMode } from "./candidates";
import {
  anonymizedPeople,
  type DayWeather,
  type PlannerContext,
  parentByRole,
  pastSummary,
  plan,
  type Role,
  viewOf,
} from "./context";
import { offersSelfAsCompany } from "./honesty";
import { type JoinCard, joinCard } from "./join";
import { type Day, fmt, type Slot } from "./slots";
import { plannerTools } from "./tools";

export type { PlannerContext } from "./context";
export { offersSelfAsCompany } from "./honesty";

/**
 * The planner. Code does what must be exact: discovery down the fallback ladder, each
 * parent's feasible slots, and TabPFN scores with reason chips. The Mastra agent on Gemma 4
 * then decides which real candidates make a good week and writes the reasons; it can call
 * tools for first rides, help joining and the people memory. Code validates every choice.
 * Gemma runs through the shared helper's fetch: fallback, cache, budget and privacy guard apply.
 * Docs: mastra.ai/docs/agents/overview, mastra.ai/models (AI SDK provider modules).
 */

export const PLANNER_INSTRUCTIONS = `You plan a week of outings for parents who are visiting their adult child in another country. You are a planning tool for the family, not a companion.

Rules:
1. Route to humans. Choose only from the candidates listed, by their exact id. Every outing is a real place or a real group of people. Never suggest talking to you, to an app or to a chatbot, and never describe yourself as company, a friend or a person.
2. Follow the fallback ladder: same language first, then shared culture, then places where language barely matters, then programs for newcomers and older adults, then a regular routine. If nothing in their language was found this week, say so plainly in the note.
3. Only choose a candidate for a parent if that parent has a slot for it.
4. Prefer higher scores, keep variety (at most two outings of the same kind), give each parent at least one outing, and include at least one option from a lower ladder level that matches an interest, such as a walk for someone who enjoys walking.
5. If a known person could come along to an outing where no shared language is needed, name them as "bringSomeone" using the description from recall.
6. The app marks a first ride together for any new route, so you don't need to.
7. The reason is one plain sentence of at most 20 words saying why this parent would like it, using what they enjoyed before. The app adds the ladder level and the trip. No exclamation marks, no flattery.

Choose 4 to 6 outings in total. Answer with only this JSON:
{"outings":[{"candidateId":"...","parent":"mother"|"father"|"both","reason":"...","firstRideTogether":true|false,"bringSomeone":null|"...","joinHelp":true|false}],"note":"..."}`;

export const PlanOutput = z.object({
  outings: z
    .array(
      z.object({
        candidateId: z.string(),
        parent: z.enum(["mother", "father", "both"]),
        reason: z.string().max(400),
        firstRideTogether: z.boolean().default(false),
        bringSomeone: z.string().nullable().default(null),
        joinHelp: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(8),
  note: z.string().max(500).default(""),
});
export type PlanOutput = z.infer<typeof PlanOutput>;

export function gemmaModel(purpose: string, dataClass: DataClass) {
  const provider = createOpenAICompatible({
    name: "gemma",
    // The helper's fetch routes every call (Cloudflare, then OpenRouter); this URL is never dialed.
    baseURL: "gemma://helper/v1",
    apiKey: "routed-by-helper",
    headers: { "x-roundtrip-data-class": dataClass, "x-roundtrip-purpose": purpose },
    fetch: gemma().fetch,
  });
  return provider.chatModel("gemma-4");
}

export function createPlannerAgent(ctx: PlannerContext) {
  const t = plannerTools(ctx);
  return new Agent({
    id: "roundtrip-planner",
    name: "Roundtrip planner",
    instructions: PLANNER_INSTRUCTIONS,
    model: gemmaModel("planner", "synthetic"),
    // suggestTrialRun stays out: first rides are decided by code from the routes already ridden,
    // and Gemma's arguments for it often failed to parse.
    tools: { howToJoin: t.howToJoin, recall: t.recall, remember: t.remember },
  });
}

export interface Suggestion {
  id: string;
  candidate: Candidate;
  role: Role | "both";
  parentIds: string[];
  slot: Slot;
  ladderLevel: LadderLevel;
  ladderLabel: string;
  score: { pGo: number; enjoyment: number; combined: number; rank: number };
  chips: ReasonChip[];
  reasonText: string;
  reasonBy: "planner" | "fallback";
  firstRideTogether: boolean;
  /** A person they already know who could come along, from the people memory (kept on the family's side). */
  bringSomeone: { personId: string; label: string; why: string } | null;
  joinCard: JoinCard | null;
  features: ReturnType<typeof plan>["features"];
}

export interface WeekPlan {
  householdId: string;
  week: string;
  provenance: "synthetic";
  sourceOfCandidates: "live_search" | "synthetic" | "mixed";
  suggestions: Suggestion[];
  note: string;
  sameLanguageFound: boolean;
  rejected: Array<{ candidateId: string; why: string }>;
  stats: {
    ms: number;
    modelCalls: number;
    cachedModelCalls: number;
    fallbacks: number;
    retries: number;
    toolCalls: Array<{ tool: string; ms: number; detail: string }>;
    rankerCalls: number;
    candidates: number;
    feasible: number;
    agentChoicesUsed: number;
  };
}

interface Scored {
  c: Candidate;
  role: Role;
  combined: number;
  pGo: number;
  enjoyment: number;
  chips: ReasonChip[];
}

const ROLES: Role[] = ["mother", "father"];

async function scoreFeasible(ctx: PlannerContext): Promise<{ scored: Scored[]; rankerCalls: number }> {
  const scored: Scored[] = [];
  let rankerCalls = 0;
  for (const role of ROLES) {
    if (
      !ctx.parents.some(
        (p) => parentByRole(ctx, role)._id === p._id && (role === "father") === p.addressAs.includes("నాన్న"),
      )
    )
      continue;
    const planned = ctx.candidates.map((c) => plan(ctx, c, role)).filter((p) => p.feasibility.ok);
    if (planned.length === 0) continue;
    const parent = parentByRole(ctx, role);
    const row = (o: (typeof ctx.pastOutings)[number]) => ({
      features: o.features,
      went: o.result?.went ? 1 : 0,
      enjoyment: o.result?.enjoyment ?? null,
    });
    const mine = ctx.pastOutings.filter((o) => o.parentIds.includes(parent._id)).map(row);
    const t = Date.now();
    const res = await rankOutings(
      mine.length >= 3 ? mine : ctx.pastOutings.map(row),
      planned.map((p) => p.features),
      { dataClass: "synthetic" },
    );
    ctx.log.push({ tool: "rankOutings", ms: Date.now() - t, detail: `${role}: ${planned.length} feasible` });
    rankerCalls++;
    for (const r of res.results) {
      scored.push({
        c: planned[r.index]!.candidate,
        role,
        combined: r.combined,
        pGo: r.pGo,
        enjoyment: r.enjoyment,
        chips: r.reasons.map((x) => ({ label: x.label, feature: x.feature, direction: x.direction })),
      });
    }
  }
  return { scored, rankerCalls };
}

/** Candidates the prompt lists, with short aliases (c1, c2, ...) that the agent answers with. */
function shortlist(scored: Scored[]): Map<string, string> {
  const ids = [...new Set(scored.map((s) => s.c.id))];
  const top = ids
    .map((id) => ({ id, best: Math.max(...scored.filter((s) => s.c.id === id).map((s) => s.combined)) }))
    .sort((a, b) => b.best - a.best)
    .slice(0, 14);
  return new Map(top.map(({ id }, i) => [`c${i + 1}`, id]));
}

function table(ctx: PlannerContext, scored: Scored[], aliases: Map<string, string>): string {
  return [...aliases.entries()]
    .map(([alias, id]) => {
      const c = ctx.candidates.find((x) => x.id === id)!;
      const v = viewOf(ctx, c);
      const per = ROLES.map((r) => {
        const s = scored.find((x) => x.c.id === id && x.role === r);
        if (!s) return `${r}: no slot`;
        return `${r}: ${v[r]}; score ${s.combined.toFixed(2)}; ${s.chips.map((x) => `${x.direction === "for" ? "+" : "-"}${x.label}`).join(", ")}`;
      }).join(" | ");
      return `- ${alias} | ${c.title} | level ${c.ladderLevel} (${LADDER_LABELS[c.ladderLevel]}) | ${c.category}${v.when ? ` | ${v.when}` : ""} | about ${v.travelMinutes ?? "?"} min | ${per}`;
    })
    .join("\n");
}

function profile(ctx: PlannerContext, role: Role): string {
  const p = parentByRole(ctx, role);
  return `${role}: enjoys ${p.interests.slice(0, 6).join(", ")}; not interested in ${p.notInterested.join(", ") || "nothing listed"}; dislikes ${p.dislikes.join(", ")}; walks up to ${p.mobility.maxWalkMinutes} minutes.`;
}

function buildPrompt(ctx: PlannerContext, scored: Scored[], aliases: Map<string, string>): string {
  const days = Object.entries(ctx.weather) as Array<[string, DayWeather]>;
  const sameLanguage = ctx.candidates.some((c) => c.ladderLevel === 1);
  return [
    `Week: ${ctx.week.label}. Their language: ${ctx.languageName}. Local language: ${ctx.household.localLanguage === "de" ? "German" : "English"}.`,
    `Weather: ${days.map(([d, w]) => `${d} ${w.label} ${Math.round(w.tempC)}°C`).join(", ")}.`,
    sameLanguage
      ? `There are ${ctx.languageName} options this week.`
      : `No ${ctx.languageName} events or groups were found nearby this week.`,
    `What they enjoyed before: ${pastSummary(ctx)}`,
    `People they know: ${anonymizedPeople(ctx).join(" ") || "none recorded"}`,
    `Parents this week: ${ctx.parents.map((p) => (p.addressAs.includes("నాన్న") ? "father" : "mother")).join(" and ")}.`,
    ...ctx.parents.map((p) => profile(ctx, p.addressAs.includes("నాన్న") ? "father" : "mother")),
    "",
    "Candidates (real places and events from search, with each parent's slot, TabPFN score and reasons). Answer with the candidate's short id, like c3:",
    table(ctx, scored, aliases),
  ].join("\n");
}

export async function planWeek(ctx: PlannerContext): Promise<WeekPlan> {
  const started = Date.now();
  const before = { ...gemma().counters };
  const { scored, rankerCalls } = await scoreFeasible(ctx);
  const sameLanguageFound = ctx.candidates.some((c) => c.ladderLevel === 1);

  let output: PlanOutput | null = null;
  const aliases = shortlist(scored);
  if (scored.length > 0) {
    try {
      const agent = createPlannerAgent(ctx);
      const t = Date.now();
      const res = await agent.generate(buildPrompt(ctx, scored, aliases), { maxSteps: 8 });
      ctx.log.push({ tool: "agent", ms: Date.now() - t, detail: `${res.steps?.length ?? 0} steps` });
      const parsed = parseJson(res.text ?? "", PlanOutput);
      output = parsed.ok ? parsed.data : null;
      if (!parsed.ok) ctx.log.push({ tool: "agent", ms: 0, detail: `unparsed answer: ${parsed.error.slice(0, 80)}` });
    } catch (e) {
      ctx.log.push({
        tool: "agent",
        ms: Date.now() - started,
        detail: `failed: ${e instanceof Error ? e.message.slice(0, 120) : e}`,
      });
    }
  }

  const rejected: WeekPlan["rejected"] = [];
  const usedDays: Record<Role, Day[]> = { mother: [], father: [] };
  const suggestions: Suggestion[] = [];
  const add = (
    c: Candidate,
    who: Role | "both",
    o: Partial<PlanOutput["outings"][number]>,
    by: Suggestion["reasonBy"],
  ): boolean => {
    const roles: Role[] = who === "both" ? ROLES.filter((r) => scored.some((s) => s.role === r)) : [who];
    if (roles.length === 0) return false;
    const planned = roles.map((r) => plan(ctx, c, r, { excludeDays: usedDays[r] }));
    if (!planned.every((p) => p.feasibility.ok)) {
      rejected.push({ candidateId: c.id, why: "no free slot for that parent" });
      return false;
    }
    const first = planned[0]!;
    const slot = first.feasibility.slot!;
    const s = scored.find((x) => x.c.id === c.id && x.role === roles[0]);
    for (const r of roles) usedDays[r].push(slot.day);
    suggestions.push({
      id: `${ctx.household._id}:${ctx.week.key}:${c.id}`,
      candidate: c,
      role: who,
      parentIds: roles.map((r) => parentByRole(ctx, r)._id),
      slot,
      ladderLevel: c.ladderLevel,
      ladderLabel: LADDER_LABELS[c.ladderLevel],
      score: { pGo: s?.pGo ?? 0, enjoyment: s?.enjoyment ?? 0, combined: s?.combined ?? 0, rank: 0 },
      chips: s?.chips ?? [],
      reasonText: composeReason(ctx, c, slot, o.reason?.trim() ?? "", sameLanguageFound),
      reasonBy: o.reason?.trim() ? by : "fallback",
      firstRideTogether: !slot.withAdultChild && !ctx.soloReadyRoutes.includes(c.id),
      bringSomeone: companionFor(ctx, c, roles),
      joinCard:
        o.joinHelp || c.category === "temple" || c.category === "senior_center"
          ? joinCard(c, parentByRole(ctx, roles[0]!), ctx.household.localLanguage)
          : null,
      features: first.features,
    });
    return true;
  };

  let agentChoicesUsed = 0;
  for (const o of output?.outings ?? []) {
    const id = aliases.get(o.candidateId.trim()) ?? o.candidateId.trim();
    const c = ctx.candidates.find((x) => x.id === id);
    if (!c) {
      rejected.push({ candidateId: o.candidateId, why: "not a candidate from search" });
      continue;
    }
    const company = offersSelfAsCompany(`${o.reason} ${o.bringSomeone ?? ""}`);
    if (company) {
      rejected.push({ candidateId: o.candidateId, why: `offered the app as company: "${company}"` });
      continue;
    }
    if (suggestions.some((x) => x.candidate.id === c.id)) continue;
    if (add(c, o.parent, o, "planner")) agentChoicesUsed++;
  }

  // Every week gets two or three good options: fill from the ranked list, down the ladder.
  const target = Math.min(4, new Set(scored.map((s) => s.c.id)).size);
  const byLadder = [...scored].sort((a, b) => a.c.ladderLevel - b.c.ladderLevel || b.combined - a.combined);
  for (const s of byLadder) {
    if (suggestions.length >= target) break;
    if (
      suggestions.some((x) => x.candidate.id === s.c.id || (x.candidate.category === s.c.category && x.role === s.role))
    )
      continue;
    add(s.c, s.role, {}, "fallback");
  }
  // Still short of two (a rainy week with few indoor places): allow a second venue of the same kind.
  for (const s of byLadder) {
    if (suggestions.length >= Math.min(2, target)) break;
    if (suggestions.some((x) => x.candidate.id === s.c.id)) continue;
    add(s.c, s.role, {}, "fallback");
  }
  for (const role of ROLES) {
    if (!scored.some((s) => s.role === role) || suggestions.some((x) => x.role === role || x.role === "both")) continue;
    const best = scored
      .filter((s) => s.role === role && !suggestions.some((x) => x.candidate.id === s.c.id))
      .sort((a, b) => b.combined - a.combined)[0];
    if (best) add(best.c, role, {}, "fallback");
  }

  suggestions.sort((a, b) => b.score.combined - a.score.combined);
  for (const [i, s] of suggestions.entries()) s.score.rank = i + 1;
  const after = gemma().counters;
  const note =
    output?.note && !offersSelfAsCompany(output.note)
      ? output.note
      : sameLanguageFound
        ? `These start with ${ctx.languageName}-speaking options and follow the fallback ladder.`
        : `No ${ctx.languageName} events or groups were found nearby this week, so these start with shared culture and places where language barely matters.`;
  return {
    householdId: ctx.household._id,
    week: ctx.week.key,
    provenance: "synthetic",
    sourceOfCandidates: ctx.candidates.every((c) => c.provenance === "live_search")
      ? "live_search"
      : ctx.candidates.every((c) => c.provenance === "synthetic")
        ? "synthetic"
        : "mixed",
    suggestions,
    note,
    sameLanguageFound,
    rejected,
    stats: {
      ms: Date.now() - started,
      modelCalls: after.live - before.live,
      cachedModelCalls: after.cached - before.cached,
      fallbacks: after.fallbacks - before.fallbacks,
      retries: after.failedAttempts - before.failedAttempts,
      toolCalls: ctx.log,
      rankerCalls,
      candidates: ctx.candidates.length,
      feasible: new Set(scored.map((s) => s.c.id)).size,
      agentChoicesUsed,
    },
  };
}

const LEAD: Record<LadderLevel, string> = {
  1: "In their language.",
  2: "Shared culture.",
  3: "No language needed.",
  4: "A program for newcomers and older adults.",
  5: "A regular routine.",
};

/**
 * The reason the adult child reads: the honest ladder lead, the planner's one line about why
 * they'd like it, and the trip. "No Telugu events nearby this week" leads whenever that's true.
 */
function composeReason(ctx: PlannerContext, c: Candidate, slot: Slot, why: string, sameLanguageFound: boolean): string {
  const v = viewOf(ctx, c);
  const none = !sameLanguageFound && c.ladderLevel > 1 ? `No ${ctx.languageName} events nearby this week. ` : "";
  const line = why ? (/[.!?]$/.test(why) ? why : `${why}.`) : "";
  const mode = tripMode(ctx.household.homeArea.nearestStop.location, c.location);
  const trip =
    v.travelMinutes === null
      ? ""
      : mode === "walk"
        ? `A ${v.travelMinutes}-minute walk, back by ${fmt(slot.back)}.`
        : `By bus, about ${v.travelMinutes} minutes each way, back by ${fmt(slot.back)}.`;
  return `${none}${LEAD[c.ladderLevel]} ${line} ${trip}`.replace(/\s+/g, " ").trim();
}

/** Someone they already know who could come along where no shared language is needed. */
function companionFor(ctx: PlannerContext, c: Candidate, roles: Role[]): Suggestion["bringSomeone"] {
  if (c.ladderLevel < 3) return null;
  const ids = roles.map((r) => parentByRole(ctx, r)._id);
  const person = ctx.people.find((p) => p.knownParentIds.some((id) => ids.includes(id)));
  if (!person) return null;
  return {
    personId: person._id,
    label: person.label,
    why: "No shared language is needed here, so a neighbor can easily come along.",
  };
}

export { fmt };
