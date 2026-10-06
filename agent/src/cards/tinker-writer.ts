import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@roundtrip/core/server-env";
import { z } from "zod";
import { parseJson } from "../gemma";
import { checkTeluguScript } from "../telugu";
import { Tinker } from "../tinker/client";
import { checkCard } from "./rubric";
import { type CardFacts, type CardWriter, cardStyle, factsPrompt, rubricInput, type WrittenCard } from "./writer";

/**
 * The Tinker card writer: Qwen3.5-4B with the LoRA trained in finetune/ (prompt distillation,
 * so the adapter gets only the outing's facts; docs/card-style.md is in its weights), sampled
 * through Tinker's OpenAI-compatible endpoint by agent/src/tinker/client.ts. That client checks
 * MAX_TINKER_SPEND_USD before every live call, logs each call to the ledger, and caches every
 * answer by a hash of the request, so the hosted demo and CI replay saved cards and never call
 * Tinker. Same interface and policy as GemmaCardWriter: the rubric and script checks on every
 * draft, and one corrective regeneration that lists the failures.
 *
 * OpenAI-compatible endpoint, model = tinker:// sampler path:
 * https://tinker-docs.thinkingmachines.ai/tinker/compatible-apis/openai/
 * Sampler checkpoints: https://tinker-docs.thinkingmachines.ai/tinker/howto/checkpoints/
 */

export interface AdapterRecord {
  /** The tinker:// path of the saved sampler weights. */
  model: string;
  baseModel: string;
  huggingFace?: string | null;
}

const Out = z.object({ title: z.string().min(2).max(80), body: z.string().min(10).max(600) });

/** data/demo/finetune/adapter.json, written by finetune/finetune/train.py. */
export function trainedAdapter(path = join(repoRoot(), "data/demo/finetune/adapter.json")): AdapterRecord {
  return JSON.parse(readFileSync(path, "utf8")) as AdapterRecord;
}

export interface TinkerWriterOptions {
  /** A tinker:// sampler path, or a base model name (for comparing against the untuned model). */
  model: string;
  /** The base model a tinker:// path was trained on, for pricing. */
  baseModel?: string;
  /** Send docs/card-style.md as the system prompt. The tuned adapter doesn't need it; a base model does. */
  includeStyle?: boolean;
  temperature?: number;
  maxTokens?: number;
  tinker?: Tinker;
  /** Used when Tinker can't write the card (no key, the spend cap, an unreadable answer). */
  fallback?: CardWriter;
}

export class TinkerCardWriter implements CardWriter {
  private readonly tinker: Tinker;
  constructor(private readonly opts: TinkerWriterOptions) {
    this.tinker = opts.tinker ?? new Tinker();
  }

  /** The tuned writer from data/demo/finetune/adapter.json. */
  static tuned(extra: Omit<TinkerWriterOptions, "model" | "baseModel"> = {}): TinkerCardWriter {
    const a = trainedAdapter();
    return new TinkerCardWriter({ model: a.model, baseModel: a.baseModel, ...extra });
  }

  /** The card schema's writer kinds: the trained adapter, or an untuned base model for comparison. */
  private get kind(): "tinker_lora" | "tinker_base" {
    return this.opts.model.startsWith("tinker://") ? "tinker_lora" : "tinker_base";
  }

  async write(facts: CardFacts): Promise<WrittenCard> {
    try {
      return await this.writeWithTinker(facts);
    } catch (e) {
      if (!this.opts.fallback) throw e;
      return this.opts.fallback.write(facts);
    }
  }

  private async writeWithTinker(facts: CardFacts): Promise<WrittenCard> {
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      ...(this.opts.includeStyle ? [{ role: "system" as const, content: cardStyle() }] : []),
      { role: "user", content: factsPrompt(facts) },
    ];
    const pricedAs = this.opts.model.startsWith("tinker://") ? (this.opts.baseModel ?? "Qwen/Qwen3.5-4B") : undefined;
    let latency = 0;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = await this.tinker.chat({
        model: this.opts.model,
        messages,
        purpose: `card:tinker:${attempt}`,
        dataClass: "synthetic",
        maxTokens: this.opts.maxTokens ?? 400,
        temperature: this.opts.temperature ?? 0.4,
        pricedAs,
      });
      latency += res.latencyMs;
      const parsed = parseJson(res.text, Out);
      const failures = parsed.ok ? [] : [`the answer wasn't the JSON asked for (${parsed.error})`];
      if (parsed.ok) {
        const r = checkCard(`${parsed.data.title} ${parsed.data.body}`, rubricInput(facts));
        const script = checkTeluguScript(parsed.data.body);
        if ((r.passed && script.ok) || attempt === 2) {
          return {
            title: parsed.data.title,
            body: parsed.data.body,
            writer: { kind: this.kind, model: this.opts.model, latencyMs: latency },
            rubric: { passed: r.passed && script.ok, failures: r.failures, words: r.words, scriptOk: script.ok },
            attempts: attempt,
          };
        }
        failures.push(...r.failures, ...(script.ok ? [] : ["broken Telugu script"]));
      } else if (attempt === 2) {
        throw new Error(`The Tinker card writer returned no card for ${facts.venue}.`);
      }
      messages.push(
        { role: "assistant", content: res.text },
        { role: "user", content: `Fix these and answer with the corrected JSON only: ${failures.join("; ")}` },
      );
    }
    throw new Error("unreachable");
  }
}
