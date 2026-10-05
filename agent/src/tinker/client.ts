import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { type DataClass, outboundFetch } from "@roundtrip/core/privacy";
import { repoRoot } from "@roundtrip/core/server-env";
import { FileCache, hashKey, type LlmCache } from "../gemma/store";

/**
 * Tinker sampling through its OpenAI-compatible endpoint, with a hard spend cap.
 *
 * Docs: https://tinker-docs.thinkingmachines.ai/tinker/compatible-apis/openai/
 * Base URL https://tinker.thinkingmachines.dev/services/tinker-prod/oai/api/v1; the model is a
 * base model name or a tinker:// sampler checkpoint path. Hybrid models think by default;
 * `reasoning_effort: false` turns it off (checked 2026-10-05). The endpoint is meant for low
 * traffic, so the hosted demo replays saved cards instead of calling it per visitor.
 * Prices per million tokens: https://tinker-docs.thinkingmachines.ai/tinker/models/models_and_pricing/
 */

export const TINKER_BASE = "https://tinker.thinkingmachines.dev/services/tinker-prod/oai/api/v1";

export const TINKER_PRICES: Record<string, { prefill: number; sample: number; train?: number }> = {
  "Qwen/Qwen3.5-4B": { prefill: 0.33, sample: 1.005, train: 0.737 },
  "Qwen/Qwen3.5-9B": { prefill: 0.66, sample: 1.995, train: 1.463 },
  "Qwen/Qwen3.6-35B-A3B": { prefill: 0.54, sample: 1.335, train: 1.177 },
  "Qwen/Qwen3.5-397B-A17B": { prefill: 3.0, sample: 7.5, train: 6.6 },
  "moonshotai/Kimi-K2.6": { prefill: 2.205, sample: 5.49, train: 4.84 },
};

export class SpendCapReached extends Error {
  constructor(spent: number, cap: number, next: number) {
    super(`Tinker spend cap: $${spent.toFixed(4)} spent, next call up to $${next.toFixed(4)}, cap $${cap}.`);
    this.name = "SpendCapReached";
  }
}

export interface TinkerLedgerEntry {
  ts: string;
  model: string;
  purpose: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  kind: "sample" | "train";
}

const LEDGER = () => join(repoRoot(), "data/demo/usage/tinker-ledger.jsonl");

export async function tinkerSpent(): Promise<number> {
  try {
    const lines = (await readFile(LEDGER(), "utf8")).split("\n").filter(Boolean);
    return lines.reduce((s, l) => s + (JSON.parse(l) as TinkerLedgerEntry).costUsd, 0);
  } catch {
    return 0;
  }
}

export async function recordTinker(entry: TinkerLedgerEntry): Promise<void> {
  await mkdir(join(repoRoot(), "data/demo/usage"), { recursive: true });
  await appendFile(LEDGER(), `${JSON.stringify(entry)}\n`, "utf8");
}

function price(model: string) {
  const base = model.startsWith("tinker://") ? "Qwen/Qwen3.5-4B" : model;
  const p = TINKER_PRICES[base];
  if (!p) throw new Error(`No Tinker price for ${model}; add it to TINKER_PRICES first.`);
  return p;
}

export function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const p = price(model);
  return (promptTokens * p.prefill + completionTokens * p.sample) / 1_000_000;
}

export interface TinkerChatOptions {
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  purpose: string;
  dataClass: DataClass;
  maxTokens?: number;
  temperature?: number;
  /** Base model for a tinker:// checkpoint, for pricing. */
  pricedAs?: string;
}

export class Tinker {
  constructor(
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly cache: LlmCache = new FileCache(),
    private readonly mode: "live" | "replay" | "record" = (env.LLM_MODE as "live") || (env.CI ? "replay" : "live"),
  ) {}

  get cap(): number {
    const v = Number(this.env.MAX_TINKER_SPEND_USD);
    return Number.isFinite(v) && v > 0 ? v : 0;
  }

  async chat(opts: TinkerChatOptions): Promise<{ text: string; latencyMs: number; cached: boolean; costUsd: number }> {
    const body = {
      model: opts.model,
      messages: opts.messages,
      max_tokens: opts.maxTokens ?? 400,
      temperature: opts.temperature ?? 0.4,
      reasoning_effort: false,
    };
    const key = hashKey({ tinker: true, ...body });
    if (this.mode !== "record") {
      const hit = await this.cache.get(key);
      if (hit) return { text: hit.body as string, latencyMs: hit.latencyMs ?? 0, cached: true, costUsd: 0 };
      if (this.mode === "replay") throw new Error(`No recorded Tinker response for ${key.slice(0, 12)}.`);
    }
    if (!this.env.TINKER_API_KEY) throw new Error("TINKER_API_KEY is not set.");
    const pricedModel = opts.pricedAs ?? opts.model;
    const promptEstimate = Math.ceil(JSON.stringify(opts.messages).length / 2.5);
    const worst = estimateCost(pricedModel, promptEstimate, body.max_tokens);
    const spent = await tinkerSpent();
    if (spent + worst > this.cap) throw new SpendCapReached(spent, this.cap, worst);

    const started = Date.now();
    const res = await outboundFetch("tinker", opts.dataClass, `${TINKER_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.env.TINKER_API_KEY}`,
        "Content-Type": "application/json",
        "User-Agent": "roundtrip-family/0.1 (+https://github.com/Hotragn/roundtrip-family)",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) throw new Error(`Tinker HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as {
      choices: Array<{ message: { content?: string | null } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = json.choices[0]?.message?.content ?? "";
    const promptTokens = json.usage?.prompt_tokens ?? promptEstimate;
    const completionTokens = json.usage?.completion_tokens ?? body.max_tokens;
    const costUsd = estimateCost(pricedModel, promptTokens, completionTokens);
    await recordTinker({
      ts: new Date().toISOString(),
      model: opts.model,
      purpose: opts.purpose,
      promptTokens,
      completionTokens,
      costUsd,
      kind: "sample",
    });
    const latencyMs = Date.now() - started;
    await this.cache.set(key, {
      body: text,
      provider: "tinker",
      model: opts.model,
      createdAt: new Date().toISOString(),
      latencyMs,
    });
    return { text, latencyMs, cached: false, costUsd };
  }
}
