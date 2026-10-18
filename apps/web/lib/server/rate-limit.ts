import "server-only";

/**
 * Counting windows for things that spend free-tier allowances (Gemma neurons, TabPFN pools) or
 * fill the free database (diary writes). With MONGODB_URI the counts live in MongoDB, so a
 * restart or a second instance doesn't start them afresh; otherwise, and for a minute after the
 * database fails to answer, in memory.
 */

export interface Limit {
  key: string;
  max: number;
  windowMs: number;
}
export type Taken = { ok: true } | { ok: false; retryInMinutes: number };

export interface Store {
  /** Counts one hit against every limit, or none when any is full. */
  take(limits: Limit[], now: number): Promise<Taken>;
}

const minutes = (ms: number) => Math.max(1, Math.ceil(ms / 60_000));

/** A sliding window per key, in this process only. */
export function memoryStore(): Store {
  const hits = new Map<string, number[]>();
  return {
    async take(limits, now) {
      const lists = limits.map((l) => {
        const list = (hits.get(l.key) ?? []).filter((t) => now - t < l.windowMs);
        hits.set(l.key, list);
        return list;
      });
      for (const [i, l] of limits.entries()) {
        const list = lists[i]!;
        if (list.length >= l.max) return { ok: false, retryInMinutes: minutes(l.windowMs - (now - list[0]!)) };
      }
      for (const list of lists) list.push(now);
      return { ok: true };
    },
  };
}

/** The part of a MongoDB collection the counters use (a test double needs only these). */
export interface Counters {
  findOneAndUpdate(
    filter: { _id: string },
    update: { $inc: { count: number }; $setOnInsert: { expiresAt: Date } },
    options: { upsert: true; returnDocument: "after" },
  ): Promise<{ count: number } | null>;
  updateOne(filter: { _id: string }, update: { $inc: { count: number } }): Promise<unknown>;
}

/**
 * A fixed window per key in MongoDB: one document per key and window, counted with an atomic
 * $inc and removed by a TTL index once the window ends. A take that pushes any counter past its
 * limit gives back what it counted, so concurrent requests on several instances never exceed it.
 */
export function mongoStore(counters: Counters): Store {
  return {
    async take(limits, now) {
      const counted: string[] = [];
      for (const l of limits) {
        const start = now - (now % l.windowMs);
        const _id = `${l.key}:${start}`;
        const doc = await counters.findOneAndUpdate(
          { _id },
          { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(start + l.windowMs) } },
          { upsert: true, returnDocument: "after" },
        );
        counted.push(_id);
        if ((doc?.count ?? 1) > l.max) {
          await Promise.all(counted.map((id) => counters.updateOne({ _id: id }, { $inc: { count: -1 } })));
          return { ok: false, retryInMinutes: minutes(start + l.windowMs - now) };
        }
      }
      return { ok: true };
    },
  };
}

const memory = memoryStore();
let mongo: Store | null = null;
let downUntil = 0;

async function store(): Promise<Store> {
  if (!process.env.MONGODB_URI || Date.now() < downUntil) return memory;
  if (mongo) return mongo;
  const { getDb } = await import("@roundtrip/agent/db");
  const c = (await getDb()).collection<{ _id: string; count: number; expiresAt: Date }>("rate_limits");
  await c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  mongo = mongoStore(c as unknown as Counters);
  return mongo;
}

/** Checks every limit first and counts against all of them only when each has room. */
export async function take(limits: Limit[]): Promise<Taken> {
  const now = Date.now();
  try {
    return await (await store()).take(limits, now);
  } catch (e) {
    // The database didn't answer: count in memory for a minute rather than refuse everyone.
    downUntil = Date.now() + 60_000;
    console.warn(`Rate limits in memory for a minute: ${e instanceof Error ? e.name : "error"}`);
    return memory.take(limits, now);
  }
}
