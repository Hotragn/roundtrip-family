import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Gemma, type GemmaConfig, GemmaUnavailable, MemoryCache, MemoryUsageStore, ReplayMiss } from "../src/gemma";

const env = {
  CLOUDFLARE_ACCOUNT_ID: "acct",
  CLOUDFLARE_API_TOKEN: "cf-token",
  OPENROUTER_API_KEY: "or-key",
} as unknown as NodeJS.ProcessEnv;

function completion(content: string, neurons = 3) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { role: "assistant", content } }],
      usage: { prompt_tokens: 20, completion_tokens: 10, neurons },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

type Handler = (url: string, body: Record<string, unknown>) => Response;

function setup(handler: Handler, over: Partial<GemmaConfig> = {}) {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const usage = new MemoryUsageStore();
  const cache = new MemoryCache();
  const g = new Gemma({
    mode: "live",
    cache,
    usage,
    env,
    dailyNeurons: 9500,
    maxAttemptsPerProvider: 3,
    baseDelayMs: 1,
    sleep: async () => {},
    fetchImpl: (async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      calls.push({ url, body });
      return handler(url, body);
    }) as unknown as typeof fetch,
    ...over,
  });
  return { g, calls, usage, cache };
}

const ask = {
  messages: [{ role: "user" as const, content: "Say hello" }],
  purpose: "test",
  dataClass: "synthetic" as const,
};

describe("Gemma helper", () => {
  it("uses Cloudflare first, turns thinking off, and caches the answer", async () => {
    const { g, calls, usage } = setup(() => completion("హలో"));
    const a = await g.chat(ask);
    expect(a.text).toBe("హలో");
    expect(a.provider).toBe("cloudflare");
    expect(calls[0]?.url).toContain("api.cloudflare.com/client/v4/accounts/acct/ai/v1/chat/completions");
    expect(calls[0]?.body.chat_template_kwargs).toEqual({ enable_thinking: false });
    const b = await g.chat(ask);
    expect(b.cached).toBe(true);
    expect(calls).toHaveLength(1);
    expect([...usage.days.values()][0]).toBe(3);
  });

  it("falls back to OpenRouter after repeated 429s", async () => {
    const { g, calls } = setup((url) =>
      url.includes("cloudflare") ? new Response("busy", { status: 429 }) : completion("from openrouter"),
    );
    const a = await g.chat(ask);
    expect(a.provider).toBe("openrouter-31b");
    expect(calls.filter((c) => c.url.includes("cloudflare"))).toHaveLength(3);
    expect(calls.at(-1)?.body.model).toBe("google/gemma-4-31b-it:free");
  });

  it("moves on at once after a non-retryable error", async () => {
    const { g, calls } = setup((url) =>
      url.includes("cloudflare") ? new Response("bad", { status: 400 }) : completion("ok"),
    );
    await g.chat(ask);
    expect(calls.filter((c) => c.url.includes("cloudflare"))).toHaveLength(1);
  });

  it("skips Cloudflare once the daily neuron budget is spent", async () => {
    const { g, calls, usage } = setup(() => completion("ok"));
    await usage.addNeurons(new Date().toISOString().slice(0, 10), 9499);
    const a = await g.chat(ask);
    expect(a.provider).toBe("openrouter-31b");
    expect(calls.some((c) => c.url.includes("cloudflare"))).toBe(false);
  });

  it("throws when every host fails", async () => {
    const { g } = setup(() => new Response("down", { status: 503 }));
    await expect(g.chat(ask)).rejects.toBeInstanceOf(GemmaUnavailable);
  });

  it("replays recorded answers and refuses to call out in replay mode", async () => {
    const recorder = setup(() => completion("recorded"));
    await recorder.g.chat(ask);
    const replay = setup(
      () => {
        throw new Error("network used in replay mode");
      },
      { mode: "replay", cache: recorder.cache },
    );
    expect((await replay.g.chat(ask)).text).toBe("recorded");
    await expect(replay.g.chat({ ...ask, messages: [{ role: "user", content: "new" }] })).rejects.toBeInstanceOf(
      ReplayMiss,
    );
  });

  it("refuses personal data", async () => {
    const { g, calls } = setup(() => completion("ok"));
    await expect(g.chat({ ...ask, dataClass: "personal" })).rejects.toThrow(/may not carry personal/);
    expect(calls).toHaveLength(0);
  });

  it("validates JSON and retries once with a correction", async () => {
    let n = 0;
    const { g } = setup(() => {
      n++;
      return completion(n === 1 ? 'Sure! {"languageMatch": 7}' : '{"languageMatch": 2}');
    });
    const out = await g.chatJson({
      ...ask,
      schema: z.object({ languageMatch: z.number().int().min(0).max(2) }),
      schemaName: "event",
    });
    expect(out.data.languageMatch).toBe(2);
    expect(n).toBe(2);
  });
});
