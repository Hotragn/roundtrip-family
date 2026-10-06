import { afterEach, describe, expect, it } from "vitest";
import { Gemma, MemoryCache, MemoryUsageStore } from "../src/gemma";
import { type SpanAttributes, setSpanStarter, span } from "../src/observability/trace";

const env = {
  CLOUDFLARE_ACCOUNT_ID: "acct",
  CLOUDFLARE_API_TOKEN: "cf-token",
  OPENROUTER_API_KEY: "or-key",
} as unknown as NodeJS.ProcessEnv;

const completion = (content: string) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { role: "assistant", content } }],
      usage: { prompt_tokens: 20, completion_tokens: 10, neurons: 3 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

function gemmaWith(handler: (url: string) => Response) {
  return new Gemma({
    mode: "live",
    cache: new MemoryCache(),
    usage: new MemoryUsageStore(),
    env,
    dailyNeurons: 9500,
    maxAttemptsPerProvider: 2,
    baseDelayMs: 1,
    sleep: async () => {},
    fetchImpl: (async (url: string) => handler(url)) as unknown as typeof fetch,
  });
}

/** Records spans the way Sentry's startSpan would receive them. */
function recordSpans() {
  const spans: Array<{ name: string; op: string; attributes: SpanAttributes }> = [];
  setSpanStarter(async (opts, fn) => {
    const s = { name: opts.name, op: opts.op, attributes: { ...opts.attributes } };
    spans.push(s);
    return fn({ setAttributes: (a) => Object.assign(s.attributes, a) });
  });
  return spans;
}

const PROMPT = "Plan a quiet outing for the mother near Mowry Ave";

afterEach(() => setSpanStarter(null));

describe("planner spans", () => {
  it("cost nothing when no starter is registered", async () => {
    expect(await span("x", "y", {}, async () => 42)).toBe(42);
  });

  it("give each model call one chat span with the host, model, tokens and failed attempts, never the prompt", async () => {
    const spans = recordSpans();
    let calls = 0;
    const g = gemmaWith((url) => {
      calls++;
      return url.includes("cloudflare") && calls === 1 ? new Response("busy", { status: 429 }) : completion("ok");
    });
    await g.chat({ messages: [{ role: "user", content: PROMPT }], purpose: "plan:test", dataClass: "synthetic" });
    expect(spans).toHaveLength(1);
    const [chat] = spans;
    expect(chat).toMatchObject({ name: "chat gemma-4", op: "gen_ai.chat" });
    expect(chat?.attributes).toMatchObject({
      "gen_ai.operation.name": "chat",
      "gen_ai.provider.name": "cloudflare",
      "gen_ai.usage.input_tokens": 20,
      "gen_ai.usage.output_tokens": 10,
      "roundtrip.purpose": "plan:test",
      "roundtrip.cached": false,
      "roundtrip.failed_attempts": 1,
    });
    const values = JSON.stringify(spans);
    expect(values).not.toContain("Mowry");
    expect(values).not.toContain("quiet outing");
  });

  it("mark an answer from the cache", async () => {
    const g = gemmaWith(() => completion("ok"));
    const ask = {
      messages: [{ role: "user" as const, content: PROMPT }],
      purpose: "p",
      dataClass: "synthetic" as const,
    };
    await g.chat(ask);
    const spans = recordSpans();
    await g.chat(ask);
    expect(spans[0]?.attributes["roundtrip.cached"]).toBe(true);
  });
});
