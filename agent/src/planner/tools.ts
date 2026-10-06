import { createTool } from "@mastra/core/tools";
import { LADDER_LABELS } from "@roundtrip/core";
import { z } from "zod";
import { AGENT_NAME, span } from "../observability/trace";
import { rankOutings } from "../tools/ranker";
import { anonymizedPeople, type PlannerContext, parentByRole, pastSummary, plan, type Role, viewOf } from "./context";
import { joinCard } from "./join";

/**
 * The planner's tools. Every result describes real places and events from search results;
 * the agent can only propose candidates these tools returned. Docs: mastra.ai/docs/agents/tools
 */

const role = z.enum(["mother", "father"]);

export function plannerTools(ctx: PlannerContext) {
  // Each call goes in the run's log (shown on the dashboard) and, on Render, an "execute_tool"
  // span with the tool's name only: arguments and results stay out of Sentry.
  const timed = async <T>(tool: string, detail: string, fn: () => Promise<T>): Promise<T> => {
    const t = Date.now();
    const attributes = {
      "gen_ai.operation.name": "execute_tool",
      "gen_ai.tool.name": tool,
      "gen_ai.agent.name": AGENT_NAME,
    };
    try {
      return await span(`execute_tool ${tool}`, "gen_ai.execute_tool", attributes, () => fn());
    } finally {
      ctx.log.push({ tool, ms: Date.now() - t, detail });
    }
  };

  const findCandidates = createTool({
    id: "findCandidates",
    description:
      "List this week's real candidate outings found by search, with their fallback-ladder level (1 same language, 2 shared culture, 3 language barely matters, 4 programs for newcomers and older adults, 5 a regular routine), travel time, and when each parent could go. Call this first.",
    inputSchema: z.object({ level: z.number().int().min(1).max(5).optional().describe("Only this ladder level") }),
    execute: async (input) =>
      timed("findCandidates", `level ${input.level ?? "all"}`, async () => {
        const list = ctx.candidates
          .filter((c) => !input.level || c.ladderLevel === input.level)
          .map((c) => viewOf(ctx, c));
        const sameLanguage = ctx.candidates.some((c) => c.ladderLevel === 1);
        return {
          note: sameLanguage
            ? `There are ${ctx.languageName} options this week.`
            : `No ${ctx.languageName} events or groups were found nearby this week, so say so honestly and use lower ladder levels.`,
          levels: LADDER_LABELS,
          candidates: list,
        };
      }),
  });

  const rank = createTool({
    id: "rankOutings",
    description:
      "Score candidates for one parent with TabPFN, trained on what this family enjoyed before. Returns the probability they'd go, expected enjoyment from 1 to 5, a combined score, and up to three plain-language reasons. Only feasible candidates are scored.",
    inputSchema: z.object({ parent: role, candidateIds: z.array(z.string()).min(1).max(20) }),
    execute: async (input) =>
      timed("rankOutings", `${input.parent}: ${input.candidateIds.length}`, async () => {
        const planned = input.candidateIds
          .map((id) => ctx.candidates.find((c) => c.id === id))
          .filter((c): c is NonNullable<typeof c> => Boolean(c))
          .map((c) => plan(ctx, c, input.parent as Role))
          .filter((p) => p.feasibility.ok);
        if (planned.length === 0) return { results: [], note: "None of these are feasible for this parent this week." };
        const parent = parentByRole(ctx, input.parent as Role);
        const row = (o: (typeof ctx.pastOutings)[number]) => ({
          features: o.features,
          went: o.result?.went ? 1 : 0,
          enjoyment: o.result?.enjoyment ?? null,
        });
        const mine = ctx.pastOutings.filter((o) => o.parentIds.includes(parent._id)).map(row);
        const res = await rankOutings(
          mine.length >= 3 ? mine : ctx.pastOutings.map(row),
          planned.map((p) => p.features),
          {
            dataClass: "synthetic",
          },
        );
        return {
          results: res.results.map((r) => ({
            id: planned[r.index]!.candidate.id,
            name: planned[r.index]!.candidate.title,
            score: Math.round(r.combined * 100) / 100,
            pGo: Math.round(r.pGo * 100) / 100,
            enjoyment: Math.round(r.enjoyment * 10) / 10,
            reasons: r.reasons.map((x) => `${x.direction === "for" ? "+" : "-"} ${x.label}`),
          })),
        };
      }),
  });

  const recall = createTool({
    id: "recall",
    description:
      "Recall what the family's memory holds: 'people' (people they've met, described without names) or 'history' (which kinds of outings they loved, liked and disliked).",
    inputSchema: z.object({ about: z.enum(["people", "history"]) }),
    execute: async (input) =>
      timed("recall", input.about, async () =>
        input.about === "people" ? { people: anonymizedPeople(ctx) } : { history: pastSummary(ctx) },
      ),
  });

  const remember = createTool({
    id: "remember",
    description: "Save a short planning note for next week, without names. Use sparingly.",
    inputSchema: z.object({ note: z.string().max(200) }),
    execute: async (input) =>
      timed("remember", input.note.slice(0, 40), async () => {
        ctx.notes.push(input.note);
        return { saved: true };
      }),
  });

  const suggestTrialRun = createTool({
    id: "suggestTrialRun",
    description:
      "Check whether a candidate's route is new to them. A new route should be ridden once together on a weekend before they go alone.",
    inputSchema: z.object({ candidateId: z.string() }),
    execute: async (input) =>
      timed("suggestTrialRun", input.candidateId, async () => {
        const c = ctx.candidates.find((x) => x.id === input.candidateId);
        if (!c) return { error: "Unknown candidate" };
        const known = ctx.soloReadyRoutes.includes(c.id);
        return known
          ? { firstRideTogether: false, note: "They have ridden this route before; it's solo-ready." }
          : {
              firstRideTogether: true,
              note: `New route. Ride it together on ${ctx.household.trialRunDays.join(" or ")} first, then mark it solo-ready.`,
            };
      }),
  });

  const howToJoin = createTool({
    id: "howToJoin",
    description:
      "Get a short card in the local language for joining a group or volunteering at a candidate, plus who to ask there.",
    inputSchema: z.object({ candidateId: z.string(), parent: role }),
    execute: async (input) =>
      timed("howToJoin", input.candidateId, async () => {
        const c = ctx.candidates.find((x) => x.id === input.candidateId);
        if (!c) return { error: "Unknown candidate" };
        return joinCard(c, parentByRole(ctx, input.parent as Role), ctx.household.localLanguage);
      }),
  });

  return { findCandidates, rankOutings: rank, recall, remember, suggestTrialRun, howToJoin };
}
