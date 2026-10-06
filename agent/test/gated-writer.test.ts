import { describe, expect, it } from "vitest";
import { GatedCardWriter, type GateResult } from "../src/cards/gated-writer";
import type { CardFacts, CardWriter, WrittenCard } from "../src/cards/writer";
import type { Gemma } from "../src/gemma";

/** Synthetic outing (fictional family; venue and stops from live search). */
const facts: CardFacts = {
  addressee: "mother",
  addressAs: "అమ్మా",
  venue: "Karya Siddhi Hanuman Temple",
  day: "సోమవారం",
  departTime: "08:30",
  backTime: "10:10",
  trip: "walk 3 minutes to Fremont Blvd & Mowry Ave; take Bus 211 toward Union City BART for 7 stops, get off at Fremont Blvd. at Peralta Ct.; walk 8 minutes to Karya Siddhi Hanuman Temple",
  whatsThere: "Hindu temple",
  names: ["Karya Siddhi Hanuman Temple", "Bus 211", "Fremont Blvd & Mowry Ave", "Fremont Blvd. at Peralta Ct."],
  numbers: ["08:30", "10:10", "7", "3", "8"],
  firstCard: false,
  walkToPlace: 8,
};

const card = (kind: WrittenCard["writer"]["kind"], body: string): WrittenCard => ({
  title: "Karya Siddhi Hanuman Temple కి",
  body,
  writer: { kind, model: kind, latencyMs: 1 },
  rubric: { passed: true, failures: [], words: 30, scriptOk: true },
  attempts: 1,
});
const writes = (c: WrittenCard): CardWriter & { calls: number } => ({
  calls: 0,
  async write() {
    this.calls++;
    return c;
  },
});
/** A stand-in for Gemma that answers the judge with a fixed verdict. */
const judge = (verdict: { tone: number; factsOk: boolean; problem: string }) =>
  ({ chatJson: async () => ({ data: verdict, latencyMs: 1, cached: true }) }) as unknown as Gemma;

const withWalk = "అమ్మా, సోమవారం 08:30కి ... దిగి, 8 నిమిషాలు నడవండి. 10:10కి ఇంటికి వచ్చేయొచ్చు.";
const noWalk = "అమ్మా, సోమవారం 08:30కి ... దిగండి. 10:10కి ఇంటికి వచ్చేయొచ్చు.";

describe("the card quality gate", () => {
  it("keeps the tuned card when it passes, without asking the next writer", async () => {
    const tuned = writes(card("tinker_lora", withWalk));
    const gemmaWriter = writes(card("gemma", withWalk));
    const out = await new GatedCardWriter([tuned, gemmaWriter], judge({ tone: 5, factsOk: true, problem: "" })).write(
      facts,
    );
    expect(out.writer.kind).toBe("tinker_lora");
    expect(gemmaWriter.calls).toBe(0);
  });

  it("counts the walk only as its own number, not the 8 in 08:30", async () => {
    const rejected: GateResult[] = [];
    const out = await new GatedCardWriter(
      [writes(card("tinker_lora", noWalk)), writes(card("gemma", withWalk))],
      judge({ tone: 5, factsOk: true, problem: "" }),
      (_, r) => rejected.push(r),
    ).write(facts);
    expect(out.writer.kind).toBe("gemma");
    expect(rejected).toEqual([{ writer: "tinker_lora", problems: ["doesn't say the 8-minute walk from the stop"] }]);
  });

  it("sends a card the judge doubts to the next writer, and keeps the closest when none passes", async () => {
    const rejected: GateResult[] = [];
    const gate = new GatedCardWriter(
      [writes(card("tinker_lora", withWalk)), writes(card("gemma", noWalk))],
      judge({ tone: 3, factsOk: false, problem: "a word that isn't Telugu" }),
      (_, r) => rejected.push(r),
    );
    const out = await gate.write(facts);
    expect(rejected.map((r) => r.problems.length)).toEqual([2, 1]);
    expect(out.writer.kind).toBe("gemma");
  });
});
