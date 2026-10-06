import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { take } = await import("../lib/server/rate-limit");

describe("rate limits for free allowances", () => {
  it("allows up to the limit, then says when to come back", () => {
    const limits = [{ key: "t:visitor", max: 3, windowMs: 60 * 60 * 1000 }];
    expect(take(limits)).toEqual({ ok: true });
    expect(take(limits)).toEqual({ ok: true });
    expect(take(limits)).toEqual({ ok: true });
    const fourth = take(limits);
    expect(fourth.ok).toBe(false);
    if (!fourth.ok) expect(fourth.retryInMinutes).toBeGreaterThan(55);
  });

  it("doesn't spend the shared allowance on a visitor who is over their own", () => {
    const visitor = { key: "t:v2", max: 1, windowMs: 60_000 };
    const all = { key: "t:all", max: 2, windowMs: 60_000 };
    expect(take([visitor, all]).ok).toBe(true);
    expect(take([visitor, all]).ok).toBe(false); // the visitor is over; "all" still has one left
    expect(take([{ key: "t:v3", max: 1, windowMs: 60_000 }, all]).ok).toBe(true);
    expect(take([{ key: "t:v4", max: 1, windowMs: 60_000 }, all]).ok).toBe(false);
  });
});
