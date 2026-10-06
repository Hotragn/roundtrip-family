import { describe, expect, it } from "vitest";
import { answerLines, parseReply } from "../src/email/reply";

/** Approve by reply: the answers the planning email asks for, and the ones it must not guess. */

const decision = (approve: "all" | number[], skip: "all" | number[] = [], swap: number[] = []) => ({
  kind: "decision",
  approve,
  skip,
  swap,
});

describe("approve by reply", () => {
  it.each([
    ["yes", decision("all")],
    ["Yes", decision("all")],
    ["Yes please!", decision("all")],
    ["approve all", decision("all")],
    ["Approve all.", decision("all")],
    ["ok", decision("all")],
    ["Looks good", decision("all")],
    ["Sounds good, go ahead", decision("all")],
  ])("%j approves every outing", (text, expected) => {
    expect(parseReply(text, { count: 4 })).toEqual(expected);
  });

  it.each([
    ["approve 1 and 3", decision([1, 3])],
    ["Approve 1, 3", decision([1, 3])],
    ["approve 1 & 3", decision([1, 3])],
    ["yes to 1 and 3", decision([1, 3])],
    ["1 and 3 please", decision([1, 3])],
    ["approve #2", decision([2])],
    ["Approve the first and third", decision([1, 3])],
    ["No, just 1 and 3", decision([1, 3])],
  ])("%j approves only the outings named", (text, expected) => {
    expect(parseReply(text, { count: 4 })).toEqual(expected);
  });

  it.each([
    ["skip 2", decision([], [2])],
    ["Skip 2.", decision([], [2])],
    ["not 2", decision([], [2])],
    ["yes except 2", decision("all", [2])],
    ["all but 2", decision("all", [2])],
    ["approve all except 4", decision("all", [4])],
    ["skip 2, the rest are fine", decision("all", [2])],
    ["skip 2 and 4", decision([], [2, 4])],
  ])("%j leaves out the outings named", (text, expected) => {
    expect(parseReply(text, { count: 4 })).toEqual(expected);
  });

  it.each([
    ["swap 2", decision([], [], [2])],
    ["Swap 2 please", decision([], [], [2])],
    ["yes but swap 2", decision("all", [], [2])],
    ["approve 1 and 3, swap 2", decision([1, 3], [], [2])],
    ["swap 2 and skip 4", decision([], [4], [2])],
    ["swap 3, the rest are good", decision("all", [], [3])],
  ])("%j asks for another option", (text, expected) => {
    expect(parseReply(text, { count: 4 })).toEqual(expected);
  });

  it.each([
    ["no", decision([], "all")],
    ["No thanks", decision([], "all")],
    ["not this week", decision([], "all")],
    ["approve 1, skip the rest", decision([1])],
  ])("%j is a clear answer about the whole week", (text, expected) => {
    expect(parseReply(text, { count: 4 })).toEqual(expected);
  });

  it.each([
    ["", "Which outings should go ahead?"],
    ["Can we move 2 to Tuesday?", "Which outings should go ahead?"],
    ["maybe", "Which outings should go ahead?"],
    ["skip", 'Say which one to skip, for example "skip 2".'],
    ["swap", 'Say which one to swap, for example "swap 2".'],
    ["swap all", 'Say which one to swap, for example "swap 2".'],
    ["approve 7", "There's no outing 7 this week. The outings are numbered 1 to 4."],
    ["approve 2, skip 2", "Outing 2 appears twice. Should it go ahead, be skipped or be swapped?"],
    ["leave at 11:30 for 2", "Which outings should go ahead?"],
  ])("%j is unclear, so it asks again", (text, why) => {
    expect(parseReply(text, { count: 4 })).toEqual({ kind: "unclear", why });
  });

  it("reads past a greeting and stops at the signature and the quoted email", () => {
    const reply = [
      "Hi,",
      "",
      "Approve 1 and 3.",
      "Skip 2.",
      "Thanks,",
      "Priya",
      "",
      "On Sun, 11 Oct 2026 at 18:00, Roundtrip <roundtrip@agentmail.to> wrote:",
      "> 1. Monday 12 October, 08:30 to 10:10: Sarala",
      "> To answer, reply with yes",
    ].join("\n");
    expect(answerLines(reply)).toEqual(["Approve 1 and 3.", "Skip 2."]);
    expect(parseReply(reply, { count: 4 })).toEqual(decision([1, 3], [2]));
  });

  it("ignores quoted lines even without a header line", () => {
    expect(parseReply("Yes\n> Reply with skip 2 to leave one out", { count: 4 })).toEqual(decision("all"));
  });

  it("checks numbers only when it knows how many outings there are", () => {
    expect(parseReply("approve 9")).toEqual(decision([9]));
    expect(parseReply("approve 2", { count: 1 })).toEqual({
      kind: "unclear",
      why: "There's no outing 2 this week. There's only outing 1.",
    });
  });
});
