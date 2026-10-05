import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@roundtrip/core/server-env";
import { z } from "zod";
import { type Gemma, gemma } from "../gemma";
import { checkTeluguScript } from "../telugu";
import { type CardInput, checkCard } from "./rubric";

/**
 * The card writer: one outing, one parent, a warm Telugu card of 60 words or fewer.
 * Writers share one interface so the Tinker-tuned model can replace Gemma (docs/card-style.md
 * is Gemma's instruction prefix). Every draft goes through the rubric; a failing draft gets one
 * corrective retry with the failures listed.
 */

export interface CardFacts {
  addressee: "mother" | "father";
  addressAs: string;
  venue: string;
  day: string;
  departTime: string;
  backTime: string;
  trip: string;
  whatsThere: string;
  /** Names that must appear exactly: the venue, the first bus and its stop, the last stop. */
  names: string[];
  /** Other route names the card may mention (transfers), in English letters. */
  optionalNames?: string[];
  /** Numbers the card may use. */
  numbers: string[];
  firstCard: boolean;
}

export interface WrittenCard {
  title: string;
  body: string;
  writer: { kind: "tinker_lora" | "tinker_base" | "gemma"; model: string; latencyMs: number };
  rubric: { passed: boolean; failures: string[]; words: number; scriptOk: boolean };
  attempts: number;
}

export interface CardWriter {
  write(facts: CardFacts): Promise<WrittenCard>;
}

let styleCache: string | null = null;
export function cardStyle(): string {
  styleCache ??= readFileSync(join(repoRoot(), "docs/card-style.md"), "utf8");
  return styleCache;
}

const Out = z.object({ title: z.string().min(2).max(80), body: z.string().min(10).max(600) });

export function factsPrompt(f: CardFacts): string {
  return [
    `Write the card for the ${f.addressee}. Address them as ${f.addressAs}.`,
    `Venue: ${f.venue}`,
    `When: ${f.day}, leave at ${f.departTime}, back by ${f.backTime}`,
    `Trip: ${f.trip}`,
    `What's there: ${f.whatsThere}`,
    `Names to keep exactly, in English letters: ${f.names.join("; ")}`,
    f.optionalNames?.length ? `Other stops on the way (mention only if needed): ${f.optionalNames.join("; ")}` : "",
    f.firstCard ? "This is the first card of the visit: end with the one-line safety tip." : "",
    'Answer with only JSON: {"title": "...", "body": "..."}',
  ]
    .filter(Boolean)
    .join("\n");
}

export function rubricInput(f: CardFacts): CardInput {
  return {
    names: f.names,
    numbers: f.numbers,
    addressee: f.addressee,
    extraAllowed: [f.venue, ...(f.optionalNames ?? [])],
  };
}

export class GemmaCardWriter implements CardWriter {
  constructor(private readonly g: Gemma = gemma()) {}

  async write(facts: CardFacts): Promise<WrittenCard> {
    const system = cardStyle();
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: system },
      { role: "user", content: factsPrompt(facts) },
    ];
    let latency = 0;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = await this.g.chatJson({
        purpose: `card:gemma:${attempt}`,
        dataClass: "synthetic",
        schema: Out,
        schemaName: "card",
        temperature: 0.4,
        maxTokens: 500,
        messages,
      });
      latency += res.latencyMs;
      const r = checkCard(`${res.data.title} ${res.data.body}`, rubricInput(facts));
      const script = checkTeluguScript(res.data.body);
      if ((r.passed && script.ok) || attempt === 2) {
        return {
          title: res.data.title,
          body: res.data.body,
          writer: { kind: "gemma", model: "@cf/google/gemma-4-26b-a4b-it", latencyMs: latency },
          rubric: { passed: r.passed && script.ok, failures: r.failures, words: r.words, scriptOk: script.ok },
          attempts: attempt,
        };
      }
      messages.push(
        { role: "assistant", content: JSON.stringify(res.data) },
        { role: "user", content: `Fix these and answer with the corrected JSON only: ${r.failures.join("; ")}` },
      );
    }
    throw new Error("unreachable");
  }
}
