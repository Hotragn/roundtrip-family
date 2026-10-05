import type { DataClass } from "@roundtrip/core/privacy";
import { assertOutbound } from "@roundtrip/core/privacy";
import { estimateNeurons, PROVIDERS, type Provider } from "./providers";
import {
  type CachedResponse,
  FileCache,
  FileUsageStore,
  hashKey,
  type LlmCache,
  type UsageStore,
  utcDay,
} from "./store";

/**
 * One fetch-compatible function for every Gemma call. It walks the provider chain
 * (Cloudflare, then OpenRouter 31B, then OpenRouter 26B) with exponential backoff, a
 * per-provider request interval, Cloudflare's daily neuron budget, the privacy guard and a
 * response cache keyed by the prompt. The Mastra agent gets it through the AI SDK's
 * OpenAI-compatible provider, so planner calls follow the same rules as direct calls.
 *
 * Two control headers ride along and are stripped before anything leaves:
 * x-roundtrip-data-class (required) and x-roundtrip-purpose.
 */

export type LlmMode = "live" | "replay" | "record";

export interface GemmaConfig {
  mode: LlmMode;
  cache: LlmCache;
  usage: UsageStore;
  env: NodeJS.ProcessEnv;
  /** Daily neuron allowance kept for Cloudflare; the free plan gives 10,000. */
  dailyNeurons: number;
  maxAttemptsPerProvider: number;
  baseDelayMs: number;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  providers?: Provider[];
}

export class ReplayMiss extends Error {
  constructor(public readonly key: string) {
    super(`No recorded Gemma response for ${key.slice(0, 12)}. Run once with LLM_MODE=live to record it.`);
    this.name = "ReplayMiss";
  }
}

export class GemmaUnavailable extends Error {
  constructor(public readonly failures: string[]) {
    super(`Every Gemma host failed: ${failures.join("; ")}`);
    this.name = "GemmaUnavailable";
  }
}

const RETRYABLE = new Set([408, 409, 425, 429, 500, 502, 503, 504, 524]);

export function defaultConfig(env: NodeJS.ProcessEnv = process.env): GemmaConfig {
  const mode = (env.LLM_MODE as LlmMode) || (env.CI ? "replay" : "live");
  return {
    mode,
    cache: new FileCache(),
    usage: new FileUsageStore(),
    env,
    dailyNeurons: Number(env.GEMMA_DAILY_NEURONS) || 9500,
    maxAttemptsPerProvider: 3,
    baseDelayMs: 1000,
  };
}

/** The part of a request that defines the answer. The model and host extras are left out on purpose. */
export function cacheKeyFor(body: Record<string, unknown>): string {
  const { model: _model, stream: _stream, chat_template_kwargs: _c, reasoning: _r, ...rest } = body;
  return hashKey({ family: "gemma-4", ...rest });
}

export function createGemmaFetch(config: GemmaConfig): typeof fetch {
  const doFetch = config.fetchImpl ?? fetch;
  const sleep = config.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = config.now ?? (() => new Date());
  const providers = config.providers ?? PROVIDERS;
  const lastCall = new Map<string, number>();

  const gemmaFetch = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    const dataClass = headers.get("x-roundtrip-data-class") as DataClass | null;
    const purpose = headers.get("x-roundtrip-purpose") ?? "unspecified";
    if (!dataClass) throw new Error("Gemma calls must declare x-roundtrip-data-class.");
    if (typeof init?.body !== "string") throw new Error("Gemma calls need a JSON string body.");
    const body = JSON.parse(init.body) as Record<string, unknown>;
    if (body.stream) throw new Error("Streaming isn't supported; use non-streaming generate calls.");

    const key = cacheKeyFor(body);
    if (config.mode !== "record") {
      const hit = await config.cache.get(key);
      if (hit) {
        await config.usage.log({
          ts: now().toISOString(),
          service: hit.provider,
          model: hit.model,
          purpose,
          promptTokens: null,
          completionTokens: null,
          neurons: 0,
          latencyMs: 0,
          cached: true,
          attempts: 0,
          ok: true,
        });
        return jsonResponse(hit.body, { "x-roundtrip-cache": "hit", "x-roundtrip-provider": hit.provider });
      }
      if (config.mode === "replay") throw new ReplayMiss(key);
    }

    const failures: string[] = [];
    const promptChars = JSON.stringify(body.messages ?? "").length;
    const maxTokens = Number(body.max_tokens ?? body.max_completion_tokens ?? 1024);

    for (const p of providers) {
      const url = p.url(config.env);
      const auth = p.headers(config.env);
      if (!url || !auth) {
        failures.push(`${p.id}: no key`);
        continue;
      }
      assertOutbound(p.route, dataClass, url);
      if (p.id === "cloudflare") {
        const spent = await config.usage.neuronsOn(utcDay(now()));
        if (spent + estimateNeurons(promptChars, maxTokens) > config.dailyNeurons) {
          failures.push(`${p.id}: daily neuron budget reached (${Math.round(spent)})`);
          continue;
        }
      }
      const outBody = JSON.stringify({ ...body, model: p.model, ...p.extraBody });
      for (let attempt = 1; attempt <= config.maxAttemptsPerProvider; attempt++) {
        const wait = (lastCall.get(p.id) ?? 0) + p.minIntervalMs - now().getTime();
        if (wait > 0) await sleep(wait);
        lastCall.set(p.id, now().getTime());
        const started = Date.now();
        let status = 0;
        let error = "";
        try {
          const res = await doFetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...auth },
            body: outBody,
            signal: AbortSignal.timeout(90_000),
          });
          status = res.status;
          if (res.ok) {
            const json = (await res.json()) as {
              usage?: { prompt_tokens?: number; completion_tokens?: number; neurons?: number };
              choices?: unknown[];
            };
            if (!Array.isArray(json.choices) || json.choices.length === 0) {
              error = "empty choices";
            } else {
              const neurons = p.id === "cloudflare" ? (json.usage?.neurons ?? estimateNeurons(promptChars, maxTokens)) : 0;
              if (p.id === "cloudflare") await config.usage.addNeurons(utcDay(now()), neurons);
              await config.usage.log({
                ts: now().toISOString(),
                service: p.id,
                model: p.model,
                purpose,
                promptTokens: json.usage?.prompt_tokens ?? null,
                completionTokens: json.usage?.completion_tokens ?? null,
                neurons,
                latencyMs: Date.now() - started,
                cached: false,
                attempts: attempt,
                ok: true,
              });
              const record: CachedResponse = {
                body: json,
                provider: p.id,
                model: p.model,
                createdAt: now().toISOString(),
              };
              await config.cache.set(key, record);
              return jsonResponse(json, { "x-roundtrip-cache": "miss", "x-roundtrip-provider": p.id });
            }
          } else {
            error = `HTTP ${status}`;
            await res.body?.cancel();
          }
        } catch (e) {
          error = e instanceof Error ? e.name : "network error";
        }
        await config.usage.log({
          ts: now().toISOString(),
          service: p.id,
          model: p.model,
          purpose,
          promptTokens: null,
          completionTokens: null,
          neurons: null,
          latencyMs: Date.now() - started,
          cached: false,
          attempts: attempt,
          ok: false,
          error,
        });
        const retryable = status === 0 || RETRYABLE.has(status) || error === "empty choices";
        if (!retryable) {
          failures.push(`${p.id}: ${error}`);
          break;
        }
        if (attempt === config.maxAttemptsPerProvider) {
          failures.push(`${p.id}: ${error} after ${attempt} tries`);
          break;
        }
        const jitter = Math.random() * 0.25 + 0.875;
        await sleep(config.baseDelayMs * 2 ** (attempt - 1) * jitter);
      }
    }
    throw new GemmaUnavailable(failures);
  };
  return gemmaFetch as typeof fetch;
}

function jsonResponse(body: unknown, extra: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...extra },
  });
}
