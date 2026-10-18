import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { take, memoryStore, mongoStore } = await import("../lib/server/rate-limit");
type Counters = Parameters<typeof mongoStore>[0];

/** An in-memory stand-in for the MongoDB collection: atomic per call, as the server is. */
function fakeCollection() {
  const docs = new Map<string, { count: number; expiresAt: Date }>();
  const counters: Counters = {
    async findOneAndUpdate({ _id }, { $inc, $setOnInsert }) {
      const doc = docs.get(_id) ?? { count: 0, ...$setOnInsert };
      doc.count += $inc.count;
      docs.set(_id, doc);
      return { ...doc };
    },
    async updateOne({ _id }, { $inc }) {
      const doc = docs.get(_id);
      if (doc) doc.count += $inc.count;
    },
  };
  return { docs, counters };
}

const HOUR = 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 18, 10, 0, 0);

for (const [name, make] of [
  ["memory", () => memoryStore()],
  ["MongoDB", () => mongoStore(fakeCollection().counters)],
] as const) {
  describe(`rate limits for free allowances (${name})`, () => {
    it("allows up to the limit, then says when to come back", async () => {
      const store = make();
      const limits = [{ key: "t:visitor", max: 3, windowMs: HOUR }];
      for (let i = 0; i < 3; i++) expect(await store.take(limits, T0 + i)).toEqual({ ok: true });
      const fourth = await store.take(limits, T0 + 5);
      expect(fourth.ok).toBe(false);
      if (!fourth.ok) expect(fourth.retryInMinutes).toBeGreaterThan(55);
      expect((await store.take(limits, T0 + HOUR + 10)).ok).toBe(true);
    });

    it("doesn't spend the shared allowance on a visitor who is over their own", async () => {
      const store = make();
      const all = { key: "t:all", max: 2, windowMs: 60_000 };
      const v = (k: string) => ({ key: k, max: 1, windowMs: 60_000 });
      expect((await store.take([v("t:v2"), all], T0)).ok).toBe(true);
      expect((await store.take([v("t:v2"), all], T0)).ok).toBe(false); // over; "all" still has one
      expect((await store.take([v("t:v3"), all], T0)).ok).toBe(true);
      expect((await store.take([v("t:v4"), all], T0)).ok).toBe(false);
      expect((await store.take([v("t:v4")], T0)).ok).toBe(true); // the refusal didn't count v4
    });
  });
}

describe("rate limits in MongoDB", () => {
  it("survive a restart: a new store on the same collection keeps the counts", async () => {
    const { counters } = fakeCollection();
    const limits = [{ key: "t:r", max: 2, windowMs: HOUR }];
    await mongoStore(counters).take(limits, T0);
    await mongoStore(counters).take(limits, T0);
    expect((await mongoStore(counters).take(limits, T0)).ok).toBe(false);
  });

  it("never pass the limit under concurrent takes, and expire with their window", async () => {
    const { counters, docs } = fakeCollection();
    const store = mongoStore(counters);
    const limits = [{ key: "t:c", max: 5, windowMs: HOUR }];
    const results = await Promise.all(Array.from({ length: 20 }, () => store.take(limits, T0)));
    expect(results.filter((r) => r.ok)).toHaveLength(5);
    const [doc] = [...docs.values()];
    expect(doc!.count).toBe(5);
    expect(doc!.expiresAt.getTime()).toBe(T0 - (T0 % HOUR) + HOUR);
  });

  it("take() counts in memory without MONGODB_URI", async () => {
    expect(process.env.MONGODB_URI).toBeUndefined();
    const limits = [{ key: "t:default", max: 1, windowMs: HOUR }];
    expect(await take(limits)).toEqual({ ok: true });
    expect((await take(limits)).ok).toBe(false);
  });
});
