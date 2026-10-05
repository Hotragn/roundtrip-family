import type { HouseholdBundle } from "@roundtrip/core/persona";
import { type Collection, type Db, type Document, type Filter, MongoClient } from "mongodb";
import { cosine } from "../gemma";

/**
 * The MongoDB Atlas data layer (free cluster). Collections follow docs/plan.md section 7.
 * Driver docs: https://www.mongodb.com/docs/drivers/node/current/
 * Vector search: https://www.mongodb.com/docs/atlas/atlas-vector-search/vector-search-stage/
 */

export const COLLECTIONS = {
  households: "households",
  parents: "parents",
  places: "places",
  events: "events",
  outings: "outings",
  people: "people",
  cards: "cards",
  diary: "diary_entries",
  languages: "languages",
  sessions: "sessions",
  approvals: "approvals",
  checkins: "checkins",
  serpCache: "serpapi_cache",
  usage: "usage",
  emails: "email_log",
} as const;

export const VECTOR_INDEX = "embedding_vector";

let client: MongoClient | null = null;
let dbPromise: Promise<Db> | null = null;

export function hasDb(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.MONGODB_URI);
}

/** One client per process. The database name is "roundtrip". */
export function getDb(env: NodeJS.ProcessEnv = process.env): Promise<Db> {
  if (!env.MONGODB_URI) throw new Error("MONGODB_URI is not set.");
  dbPromise ??= (async () => {
    const connect = async () => {
      client = new MongoClient(env.MONGODB_URI as string, {
        appName: "roundtrip",
        maxPoolSize: 5,
        serverSelectionTimeoutMS: 10_000,
      });
      await client.connect();
    };
    try {
      await connect();
    } catch (e) {
      // Some Windows resolvers refuse SRV queries (querySrv ECONNREFUSED). Retry this process's
      // lookups through public resolvers; Render and Codespaces never take this path.
      if (!(e instanceof Error) || !/querySrv/.test(e.message)) throw e;
      const dns = await import("node:dns");
      dns.setServers(["1.1.1.1", "8.8.8.8"]);
      await connect();
    }
    return client!.db(env.MONGODB_DB ?? "roundtrip");
  })();
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

export async function closeDb(): Promise<void> {
  await client?.close();
  client = null;
  dbPromise = null;
}

export function col<T extends Document = Document>(db: Db, name: keyof typeof COLLECTIONS): Collection<T> {
  return db.collection<T>(COLLECTIONS[name]);
}

/** Regular indexes, TTLs for demo-visitor data, and the vector index when Atlas allows it. */
export async function ensureIndexes(
  db: Db,
): Promise<{ vectorIndex: "created" | "exists" | "unavailable"; detail?: string }> {
  await col(db, "parents").createIndex({ householdId: 1 });
  await col(db, "outings").createIndex({ householdId: 1, week: 1 });
  await col(db, "people").createIndex({ householdId: 1 });
  await col(db, "cards").createIndex({ outingId: 1, parentId: 1 });
  await col(db, "diary").createIndex({ householdId: 1, parentId: 1, createdAt: -1 });
  await col(db, "events").createIndex({ areaKey: 1, week: 1 });
  await col(db, "places").createIndex({ areaKey: 1, type: 1 });
  await col(db, "serpCache").createIndex({ key: 1 }, { unique: true });
  await col(db, "usage").createIndex({ key: 1 }, { unique: true });
  // Demo visitors' changes expire after a day.
  for (const name of ["diary", "approvals", "checkins", "sessions"] as const) {
    await col(db, name).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  }
  return ensureVectorIndex(db);
}

async function ensureVectorIndex(db: Db) {
  const results: string[] = [];
  let state: "created" | "exists" | "unavailable" = "exists";
  for (const name of ["events", "places"] as const) {
    const c = col(db, name);
    try {
      const existing = await c.listSearchIndexes(VECTOR_INDEX).toArray();
      if (existing.length > 0) continue;
      await c.createSearchIndex({
        name: VECTOR_INDEX,
        type: "vectorSearch",
        definition: {
          fields: [
            { type: "vector", path: "embedding", numDimensions: 768, similarity: "cosine" },
            { type: "filter", path: "areaKey" },
          ],
        },
      });
      state = "created";
    } catch (e) {
      results.push(`${name}: ${e instanceof Error ? e.message.slice(0, 160) : "failed"}`);
      state = "unavailable";
    }
  }
  return results.length ? { vectorIndex: state, detail: results.join("; ") } : { vectorIndex: state };
}

export interface Similar<T> {
  doc: T;
  score: number;
}

/**
 * "More like the ones they enjoyed": Atlas $vectorSearch when the index is ready, otherwise
 * cosine similarity in code over the stored embeddings (documented fallback).
 */
export async function similar<T extends Document & { embedding?: number[] }>(
  db: Db,
  name: "events" | "places",
  query: number[],
  opts: { areaKey: string; limit?: number; excludeIds?: string[] },
): Promise<{ results: Similar<T>[]; method: "vectorSearch" | "in-code" }> {
  const limit = opts.limit ?? 5;
  const c = col<T>(db, name);
  try {
    const rows = await c
      .aggregate<T & { score: number }>([
        {
          $vectorSearch: {
            index: VECTOR_INDEX,
            path: "embedding",
            queryVector: query,
            numCandidates: Math.max(50, limit * 10),
            limit: limit + (opts.excludeIds?.length ?? 0),
            filter: { areaKey: opts.areaKey },
          },
        },
        { $set: { score: { $meta: "vectorSearchScore" } } },
      ])
      .toArray();
    const results = rows
      .filter((r) => !opts.excludeIds?.includes(String(r._id)))
      .slice(0, limit)
      .map(({ score, ...doc }) => ({ doc: doc as unknown as T, score }));
    if (results.length > 0) return { results, method: "vectorSearch" };
  } catch {
    // Index missing or still building: fall through to the in-code path.
  }
  const docs = await c.find({ areaKey: opts.areaKey, embedding: { $exists: true } } as unknown as Filter<T>).toArray();
  const results = docs
    .filter((d) => !opts.excludeIds?.includes(String(d._id)))
    .map((d) => ({ doc: d as T, score: cosine(query, (d.embedding ?? []) as number[]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return { results, method: "in-code" };
}

/** Upserts a household bundle (synthetic demo data only). */
export async function upsertBundle(db: Db, b: HouseholdBundle): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const put = async (name: keyof typeof COLLECTIONS, docs: Array<{ _id: string } & Document>) => {
    if (docs.length === 0) return;
    const ops = docs.map((d) => ({ replaceOne: { filter: { _id: d._id }, replacement: d, upsert: true } }));
    await col<{ _id: string }>(db, name).bulkWrite(ops as never);
    counts[name] = docs.length;
  };
  await put("households", [b.household]);
  await put("parents", b.parents);
  await put("people", b.people);
  await put("outings", b.pastOutings);
  return counts;
}
