import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@roundtrip/core/server-env";
import { describe, expect, it } from "vitest";
import { TinkerCardWriter, trainedAdapter } from "../src/cards/tinker-writer";
import { type CardFacts, type CardWriter, factsPrompt, type WrittenCard } from "../src/cards/writer";
import { FileCache, hashKey, MemoryCache } from "../src/gemma/store";
import { SpendCapReached, Tinker } from "../src/tinker/client";

/** Synthetic outing (fictional family; venue and stops from live search). */
const facts: CardFacts = {
  addressee: "mother",
  addressAs: "అమ్మా",
  venue: "Central Park",
  day: "బుధవారం",
  departTime: "08:30",
  backTime: "10:28",
  trip: "walk 3 minutes to Fremont Blvd & Mowry Av; take Bus 210 toward Ohlone College for 4 stops, get off at Fremont Blvd & Stevenson Blvd; walk 21 minutes to Central Park",
  whatsThere: "Lakeside park with walking paths",
  names: ["Central Park", "Bus 210", "Fremont Blvd & Mowry Av", "Fremont Blvd & Stevenson Blvd"],
  optionalNames: [],
  numbers: ["08:30", "10:28", "4", "3", "21"],
  firstCard: false,
};

const MODEL = "tinker://run-id:train:0/sampler_weights/card-writer-te-epoch3";
const good = {
  title: "Central Park కి",
  body: "అమ్మా, బుధవారం 08:30కి Central Park కి వెళ్దాం. Fremont Blvd & Mowry Av దగ్గర Bus 210 ఎక్కండి, 4 స్టాపుల తర్వాత Fremont Blvd & Stevenson Blvd దగ్గర దిగండి. చెరువు పక్కన నడవొచ్చు. 10:28కి ఇంటికి వచ్చేయొచ్చు.",
};
const missingStop = { ...good, body: good.body.replace("Fremont Blvd & Stevenson Blvd దగ్గర ", "") };

type Msg = { role: "system" | "user" | "assistant"; content: string };
/** The cache key agent/src/tinker/client.ts uses for a request. */
const keyFor = (messages: Msg[]) =>
  hashKey({ tinker: true, model: MODEL, messages, max_tokens: 400, temperature: 0.4, reasoning_effort: false });
const recorded = (text: string) => ({
  body: text,
  provider: "tinker",
  model: MODEL,
  createdAt: "2026-10-06T00:00:00Z",
  latencyMs: 700,
});
const env = { TINKER_API_KEY: "test-key", MAX_TINKER_SPEND_USD: "0" } as unknown as NodeJS.ProcessEnv;

describe("Tinker card writer, replaying recorded answers", () => {
  it("sends the adapter the facts prompt alone and returns a passing card", async () => {
    const cache = new MemoryCache();
    const first: Msg[] = [{ role: "user", content: factsPrompt(facts) }];
    await cache.set(keyFor(first), recorded(JSON.stringify(good)));
    const writer = new TinkerCardWriter({ model: MODEL, tinker: new Tinker(env, cache, "replay") });
    const card = await writer.write(facts);
    expect(card.writer).toEqual({ kind: "tinker_lora", model: MODEL, latencyMs: 700 });
    expect(card.rubric.passed).toBe(true);
    expect(card.attempts).toBe(1);
    expect(card.body).toBe(good.body);
  });

  it("regenerates once with the failures listed, like the Gemma writer", async () => {
    const cache = new MemoryCache();
    const first: Msg[] = [{ role: "user", content: factsPrompt(facts) }];
    const draft = JSON.stringify(missingStop);
    await cache.set(keyFor(first), recorded(draft));
    const second: Msg[] = [
      ...first,
      { role: "assistant", content: draft },
      {
        role: "user",
        content: "Fix these and answer with the corrected JSON only: missing exact name: Fremont Blvd & Stevenson Blvd",
      },
    ];
    await cache.set(keyFor(second), recorded(JSON.stringify(good)));
    const card = await new TinkerCardWriter({ model: MODEL, tinker: new Tinker(env, cache, "replay") }).write(facts);
    expect(card.attempts).toBe(2);
    expect(card.rubric.passed).toBe(true);
    expect(card.writer.latencyMs).toBe(1400);
  });

  it("never calls Tinker in replay: a missing recording throws, or the fallback writes the card", async () => {
    const writer = new TinkerCardWriter({ model: MODEL, tinker: new Tinker(env, new MemoryCache(), "replay") });
    await expect(writer.write(facts)).rejects.toThrow(/No recorded Tinker response/);
    const fallbackCard: WrittenCard = {
      ...good,
      writer: { kind: "gemma", model: "@cf/google/gemma-4-26b-a4b-it", latencyMs: 1 },
      rubric: { passed: true, failures: [], words: 30, scriptOk: true },
      attempts: 1,
    };
    const fallback: CardWriter = { write: async () => fallbackCard };
    const withFallback = new TinkerCardWriter({
      model: MODEL,
      tinker: new Tinker(env, new MemoryCache(), "replay"),
      fallback,
    });
    expect((await withFallback.write(facts)).writer.kind).toBe("gemma");
  });

  it("stops a live call at the spend cap before any request is sent", async () => {
    const writer = new TinkerCardWriter({ model: MODEL, tinker: new Tinker(env, new MemoryCache(), "live") });
    await expect(writer.write(facts)).rejects.toBeInstanceOf(SpendCapReached);
  });
});

describe("prompt shared with the fine-tune", () => {
  const { cases } = JSON.parse(readFileSync(join(repoRoot(), "data/demo/finetune/prompt-cases.json"), "utf8")) as {
    cases: Array<{ id: string; facts: CardFacts; prompt: string }>;
  };
  it.each(cases.map((c) => [c.id, c]))("%s is the prompt the adapter was trained on", (_id, c) => {
    expect(factsPrompt(c.facts)).toBe(c.prompt);
  });
});

const adapterFile = join(repoRoot(), "data/demo/finetune/adapter.json");
const evalCards = join(repoRoot(), "data/demo/finetune/eval/cards-tinker-lora.jsonl");

describe.skipIf(!existsSync(adapterFile) || !existsSync(evalCards))(
  "the trained adapter, replayed from saved outputs",
  () => {
    it("rewrites a held-out card from the recording without calling Tinker", async () => {
      const outings = readFileSync(join(repoRoot(), "data/demo/finetune/eval/outings.jsonl"), "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l) as { id: string; facts: CardFacts });
      const saved = readFileSync(evalCards, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l) as WrittenCard & { id: string });
      const target = saved.find((c) => c.title)!;
      const outing = outings.find((o) => o.id === target.id)!;
      const writer = TinkerCardWriter.tuned({ tinker: new Tinker(env, new FileCache(), "replay") });
      const card = await writer.write(outing.facts);
      expect(card.body).toBe(target.body);
      expect(card.writer.model).toBe(trainedAdapter().model);
      expect(card.writer.model.startsWith("tinker://")).toBe(true);
    });
  },
);
