import type { ReplyDecision } from "@roundtrip/agent/email";
import type { ProposalState } from "./contract";

/**
 * What an answer does to the week, the same for an email reply and the dashboard. Pure code,
 * used inside the weekPlan workflow and tested on its own.
 *
 * - "all" approves every outing still waiting.
 * - Naming outings to approve ("approve 1 and 3") leaves out the others.
 * - Naming only outings to skip ("skip 2") approves the others.
 * - "Skip all" approves nothing.
 * - A swapped outing is replaced by the planner's next option and asked about again; with only
 *   swaps, the others wait too.
 */

export type Ref = number | string;

export interface Choice {
  approve: "all" | Ref[];
  skip: "all" | Ref[];
  swap: Ref[];
}

export type Resolution = { ok: true; approve: number[]; skip: number[]; swap: number[] } | { ok: false; why: string };

type Loose = "all" | Ref[] | null | undefined;
const refs = (x: Loose): Ref[] =>
  Array.isArray(x) ? x.filter((r) => typeof r === "number" || typeof r === "string") : [];

/**
 * A choice from a signal, made safe: signals come from outside the workflow, and a list may
 * arrive as null (Temporal's HTTP API shorthand sends an empty list that way).
 */
export function toChoice(c: { approve?: Loose; skip?: Loose; swap?: Loose }): Choice {
  return {
    approve: c.approve === "all" ? "all" : refs(c.approve),
    skip: c.skip === "all" ? "all" : refs(c.skip),
    swap: refs(c.swap),
  };
}

export function choiceFromReply(d: ReplyDecision): Choice {
  return toChoice(d);
}

const sorted = (xs: number[]) => [...new Set(xs)].sort((a, b) => a - b);

export function resolveChoice(proposals: ProposalState[], choice: Choice): Resolution {
  const numberOf = (ref: Ref): number | null =>
    typeof ref === "number"
      ? proposals.some((p) => p.n === ref)
        ? ref
        : null
      : (proposals.find((p) => p.outingId === ref)?.n ?? null);
  const listed = (refs: "all" | Ref[]) => (refs === "all" ? [] : refs);
  const all = [...listed(choice.approve), ...listed(choice.skip), ...choice.swap];
  for (const ref of all) {
    if (numberOf(ref) !== null) continue;
    return {
      ok: false,
      why:
        typeof ref === "number"
          ? proposals.length === 1
            ? `There's no outing ${ref} this week. There's only outing 1.`
            : `There's no outing ${ref} this week. The outings are numbered 1 to ${proposals.length}.`
          : "That outing isn't in this week's plan.",
    };
  }
  const approve = listed(choice.approve).map((r) => numberOf(r)!);
  const skip = listed(choice.skip).map((r) => numberOf(r)!);
  const swap = choice.swap.map((r) => numberOf(r)!);
  if (choice.approve === "all" && choice.skip === "all") return { ok: false, why: "Which outings should go ahead?" };
  const mentioned = [...approve, ...skip, ...swap];
  const twice = mentioned.find((n, i) => mentioned.indexOf(n) !== i);
  if (twice !== undefined && new Set([approve, skip, swap].filter((l) => l.includes(twice))).size > 1) {
    return { ok: false, why: `Outing ${twice} appears twice. Should it go ahead, be skipped or be swapped?` };
  }
  for (const n of mentioned) {
    const p = proposals.find((x) => x.n === n)!;
    if (p.status === "pending") continue;
    return {
      ok: false,
      why: `Outing ${n} is already ${p.status}. Changes to it can be made on the dashboard.`,
    };
  }

  const rest = proposals.filter((p) => p.status === "pending" && !mentioned.includes(p.n)).map((p) => p.n);
  let toApprove = approve;
  let toSkip = skip;
  if (choice.approve === "all") toApprove = [...approve, ...rest];
  else if (choice.skip === "all" || approve.length) toSkip = [...skip, ...rest];
  else if (skip.length) toApprove = [...approve, ...rest];
  return { ok: true, approve: sorted(toApprove), skip: sorted(toSkip), swap: sorted(swap) };
}

/** The proposals after a resolution. Swapped ones stay pending until the activity replaces them. */
export function applyResolution(proposals: ProposalState[], r: Extract<Resolution, { ok: true }>): ProposalState[] {
  return proposals.map((p) =>
    r.approve.includes(p.n) ? { ...p, status: "approved" } : r.skip.includes(p.n) ? { ...p, status: "skipped" } : p,
  );
}

export const numbersWith = (proposals: ProposalState[], status: ProposalState["status"]) =>
  proposals.filter((p) => p.status === status).map((p) => p.n);

const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_MS = 86_400_000;

/**
 * The dashboard's day moves, keyed by outing id (or the outing a swap replaced): each pending
 * outing moves to its new day at the same clock time, so its reminder and safety timer follow.
 * ponytail: shifts by whole days in UTC, so a move across a daylight-saving change is an hour off.
 */
export function applyMoves(proposals: ProposalState[], moveTo: Record<string, unknown>): ProposalState[] {
  return proposals.map((p) => {
    const to = moveTo[p.outingId] ?? p.swappedFrom?.map((id) => moveTo[id]).find(Boolean);
    const shift = typeof to === "string" && WEEK.includes(to) ? WEEK.indexOf(to) - WEEK.indexOf(p.day) : 0;
    if (p.status !== "pending" || !shift) return p;
    const by = (iso: string) => new Date(Date.parse(iso) + shift * DAY_MS).toISOString();
    const date = new Date(Date.parse(`${p.date}T12:00:00Z`) + shift * DAY_MS).toISOString().slice(0, 10);
    return { ...p, day: to as string, date, departAt: by(p.departAt), backAt: by(p.backAt) };
  });
}
