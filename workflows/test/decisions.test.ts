import { parseReply, SIGNAL } from "@roundtrip/agent/email";
import { describe, expect, it } from "vitest";
import {
  approveSignal,
  emailReplySignal,
  homeSignal,
  howWasItSignal,
  type ProposalState,
  rodeSignal,
} from "../src/contract";
import { applyResolution, choiceFromReply, resolveChoice, toChoice } from "../src/decisions";

/** What an answer does to the week, from an email reply or the dashboard. No Temporal needed. */

const week = (n: number): ProposalState[] =>
  Array.from({ length: n }, (_, i) => ({
    n: i + 1,
    status: "pending",
    outingId: `o${i + 1}`,
    parentIds: ["p_sarala"],
    day: "mon",
    date: "2026-10-12",
    departAt: "2026-10-12T15:30:00.000Z",
    backAt: "2026-10-12T17:10:00.000Z",
    withAdultChild: false,
    firstRideTogether: false,
    safetyWorkflowId: `outing-safety-o${i + 1}`,
    trialRunWorkflowId: `trial-run-o${i + 1}`,
  }));

const fromReply = (text: string, proposals = week(4)) => {
  const parsed = parseReply(text, { count: proposals.length });
  if (parsed.kind !== "decision") throw new Error(`unclear: ${parsed.why}`);
  return resolveChoice(proposals, choiceFromReply(parsed));
};

describe("answers", () => {
  it.each([
    ["yes", [1, 2, 3, 4], [], []],
    ["approve 1 and 3", [1, 3], [2, 4], []],
    ["skip 2", [1, 3, 4], [2], []],
    ["swap 2", [], [], [2]],
    ["yes but swap 2", [1, 3, 4], [], [2]],
    ["approve 1 and 3, swap 2", [1, 3], [4], [2]],
    ["swap 2 and skip 4", [1, 3], [4], [2]],
    ["no", [], [1, 2, 3, 4], []],
  ])("%j approves %j, skips %j and swaps %j", (text, approve, skip, swap) => {
    expect(fromReply(text)).toEqual({ ok: true, approve, skip, swap });
  });

  it("reads a signal whose empty lists arrived as null", () => {
    // Temporal's HTTP API shorthand turns [] into null; the workflow must not trip on it.
    const choice = toChoice({ approve: [1, 3], skip: null, swap: null });
    expect(choice).toEqual({ approve: [1, 3], skip: [], swap: [] });
    expect(resolveChoice(week(4), choice)).toEqual({ ok: true, approve: [1, 3], skip: [2, 4], swap: [] });
    expect(toChoice({ approve: "all" })).toEqual({ approve: "all", skip: [], swap: [] });
    expect(toChoice({ approve: [1, { bad: true } as never, "o2"] }).approve).toEqual([1, "o2"]);
  });

  it("the dashboard names outings by id", () => {
    expect(resolveChoice(week(3), { approve: ["o1", "o3"], skip: [], swap: [] })).toEqual({
      ok: true,
      approve: [1, 3],
      skip: [2],
      swap: [],
    });
  });

  it("refuses outings that aren't in the week, or are already decided", () => {
    expect(resolveChoice(week(4), { approve: [6], skip: [], swap: [] })).toEqual({
      ok: false,
      why: "There's no outing 6 this week. The outings are numbered 1 to 4.",
    });
    expect(resolveChoice(week(2), { approve: ["elsewhere"], skip: [], swap: [] })).toMatchObject({ ok: false });
    const decided = applyResolution(week(3), { ok: true, approve: [1], skip: [], swap: [] });
    expect(resolveChoice(decided, { approve: [], skip: [1], swap: [] })).toEqual({
      ok: false,
      why: "Outing 1 is already approved. Changes to it can be made on the dashboard.",
    });
  });

  it("after a swap, a second answer covers only what's still waiting", () => {
    const after = applyResolution(week(4), { ok: true, approve: [1, 3], skip: [4], swap: [2] });
    expect(after.map((p) => p.status)).toEqual(["approved", "pending", "approved", "skipped"]);
    expect(resolveChoice(after, { approve: "all", skip: [], swap: [] })).toEqual({
      ok: true,
      approve: [2],
      skip: [],
      swap: [],
    });
  });
});

describe("signal names", () => {
  it("match the names the web app and the email listener send", () => {
    expect(approveSignal.name).toBe(SIGNAL.approve);
    expect(emailReplySignal.name).toBe(SIGNAL.emailReply);
    expect(howWasItSignal.name).toBe(SIGNAL.howWasIt);
    expect(homeSignal.name).toBe(SIGNAL.home);
    expect(rodeSignal.name).toBe(SIGNAL.rode);
  });
});
