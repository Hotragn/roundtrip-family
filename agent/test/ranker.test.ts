import { afterEach, describe, expect, it, vi } from "vitest";
import { postRanking, RankerUnavailable, rankerAwake } from "../src/tools/ranker";

/** The ranker client's cold-start handling, with fetch faked: nothing leaves the test. */

const URL_ = "https://roundtrip-ranker.onrender.com";
const env = { RANKER_URL: URL_ } as NodeJS.ProcessEnv;
const ok = (body: unknown = { status: "ok" }) => new Response(JSON.stringify(body), { status: 200 });
const status = (n: number) => new Response("starting", { status: n });
const ranking = { results: [], usage: { apiCalls: 0, cacheHits: 0 }, ms: 1 };
const init = { headers: { "Content-Type": "application/json" }, body: "{}" };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("waking the ranker", () => {
  it("keeps asking while Render starts it, then says it's up", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(status(502))
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetch);
    const awake = rankerAwake(env, 90_000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await awake).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[0]![0]).toBe(`${URL_}/health`);
  });

  it("gives up when the budget runs out", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(status(503)));
    const awake = rankerAwake(env, 10_000);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await awake).toBe(false);
  });

  it("has nothing to wake without a ranker URL", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await rankerAwake({} as NodeJS.ProcessEnv)).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("posting a ranking", () => {
  it("tries once more after a server error", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(status(500)).mockResolvedValueOnce(ok(ranking));
    vi.stubGlobal("fetch", fetch);
    expect(await postRanking(`${URL_}/rank`, init, "synthetic", { pauseMs: 0 })).toEqual(ranking);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("says the ranker is unavailable after two failures", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(status(429));
    vi.stubGlobal("fetch", fetch);
    await expect(postRanking(`${URL_}/rank`, init, "synthetic", { pauseMs: 0 })).rejects.toBeInstanceOf(
      RankerUnavailable,
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("doesn't retry a request the ranker refuses", async () => {
    const fetch = vi.fn().mockResolvedValue(status(422));
    vi.stubGlobal("fetch", fetch);
    await expect(postRanking(`${URL_}/rank`, init, "synthetic", { pauseMs: 0 })).rejects.toThrow(/HTTP 422/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
