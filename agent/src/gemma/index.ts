import type { DataClass } from "@roundtrip/core/privacy";
import { assertOutbound } from "@roundtrip/core/privacy";
import { z } from "zod";
import { createGemmaFetch, defaultConfig, type GemmaConfig, ReplayMiss } from "./client";
import { EMBEDDING_DIMS, EMBEDDING_MODEL, embeddingsUrl } from "./providers";
import { hashKey } from "./store";

export { createGemmaFetch, defaultConfig, GemmaUnavailable, type GemmaConfig, ReplayMiss } from "./client";
export { EMBEDDING_DIMS, PROVIDERS } from "./providers";
export { FileCache, FileUsageStore, MemoryCache, MemoryUsageStore } from "./store";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  messages: ChatMessage[];
  purpose: string;
  dataClass: DataClass;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResult {
  text: string;
  provider: string;
  cached: boolean;
  latencyMs: number;
}

export class Gemma {
  readonly fetch: typeof fetch;
  constructor(readonly config: GemmaConfig = defaultConfig()) {
    this.fetch = createGemmaFetch(config);
  }

  private async post(body: Record<string, unknown>, purpose: string, dataClass: DataClass) {
    const started = Date.now();
    const res = await this.fetch("gemma://chat", {
      method: "POST",
      headers: { "x-roundtrip-data-class": dataClass, "x-roundtrip-purpose": purpose },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { choices: Array<{ message: { content?: string | null } }> };
    return {
      text: json.choices[0]?.message?.content ?? "",
      provider: res.headers.get("x-roundtrip-provider") ?? "unknown",
      cached: res.headers.get("x-roundtrip-cache") === "hit",
      latencyMs: Date.now() - started,
    };
  }

  async chat(opts: ChatOptions): Promise<ChatResult> {
    return this.post(
      {
        messages: opts.messages,
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? 800,
      },
      opts.purpose,
      opts.dataClass,
    );
  }

  /**
   * Structured output: asks for the JSON schema, then validates with Zod. A failed parse gets one
   * corrective follow-up message, which is a different prompt and so a different cache entry.
   */
  async chatJson<T extends z.ZodType>(
    opts: ChatOptions & { schema: T; schemaName: string },
  ): Promise<ChatResult & { data: z.infer<T> }> {
    const jsonSchema = z.toJSONSchema(opts.schema, { target: "draft-7" });
    const body = (messages: ChatMessage[]) => ({
      messages,
      temperature: opts.temperature ?? 0,
      max_tokens: opts.maxTokens ?? 800,
      response_format: {
        type: "json_schema",
        json_schema: { name: opts.schemaName, schema: jsonSchema, strict: true },
      },
    });
    const first = await this.post(body(opts.messages), opts.purpose, opts.dataClass);
    const parsed = parseJson(first.text, opts.schema);
    if (parsed.ok) return { ...first, data: parsed.data };
    const retryMessages: ChatMessage[] = [
      ...opts.messages,
      { role: "assistant", content: first.text },
      {
        role: "user",
        content: `That wasn't valid. ${parsed.error}. Reply with only JSON matching the schema, no prose.`,
      },
    ];
    const second = await this.post(body(retryMessages), `${opts.purpose}:retry`, opts.dataClass);
    const again = parseJson(second.text, opts.schema);
    if (!again.ok) throw new Error(`Gemma returned invalid JSON for ${opts.schemaName}: ${again.error}`);
    return { ...second, data: again.data };
  }

  /** EmbeddingGemma on Workers AI (768 dims). Cached like chat calls; no fallback host. */
  async embed(texts: string[], dataClass: DataClass): Promise<number[][]> {
    const { cache, mode, env } = this.config;
    const doFetch = this.config.fetchImpl ?? fetch;
    const out: Array<number[] | null> = [];
    const missing: number[] = [];
    for (const [i, t] of texts.entries()) {
      const hit = mode === "record" ? null : await cache.get(hashKey({ embed: EMBEDDING_MODEL, t }));
      out[i] = hit ? (hit.body as number[]) : null;
      if (!hit) missing.push(i);
    }
    if (missing.length && mode === "replay") throw new ReplayMiss(hashKey({ embed: EMBEDDING_MODEL, t: texts[missing[0]!] }));
    const url = embeddingsUrl(env);
    if (missing.length && (!url || !env.CLOUDFLARE_API_TOKEN)) throw new Error("Embeddings need Cloudflare keys.");
    for (let start = 0; start < missing.length; start += 50) {
      const batch = missing.slice(start, start + 50);
      assertOutbound("cloudflare.embeddings", dataClass, url!);
      const res = await doFetch(url!, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: batch.map((i) => texts[i]) }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`Embeddings failed: HTTP ${res.status}`);
      const json = (await res.json()) as { data: Array<{ embedding: number[]; index: number }> };
      for (const d of json.data) {
        const i = batch[d.index]!;
        if (d.embedding.length !== EMBEDDING_DIMS) throw new Error(`Unexpected embedding size ${d.embedding.length}`);
        out[i] = d.embedding;
        await cache.set(hashKey({ embed: EMBEDDING_MODEL, t: texts[i] }), {
          body: d.embedding,
          provider: "cloudflare",
          model: EMBEDDING_MODEL,
          createdAt: new Date().toISOString(),
        });
      }
    }
    return out as number[][];
  }
}

export function parseJson<T extends z.ZodType>(
  text: string,
  schema: T,
): { ok: true; data: z.infer<T> } | { ok: false; error: string } {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "")
    .trim();
  let raw: unknown;
  try {
    raw = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return { ok: false, error: "No JSON object found" };
    try {
      raw = JSON.parse(match[0]);
    } catch {
      return { ok: false, error: "JSON didn't parse" };
    }
  }
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

let shared: Gemma | null = null;
/** The process-wide helper, built from the environment on first use. */
export function gemma(): Gemma {
  shared ??= new Gemma(defaultConfig());
  return shared;
}
