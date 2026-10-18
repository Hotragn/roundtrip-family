import "server-only";
import type { COLLECTIONS } from "@roundtrip/agent/db";

/**
 * A small document store for real families' records: MongoDB when MONGODB_URI is set, a map in
 * memory otherwise (tests, CI, a local run), like lib/server/session.ts. Filters are plain
 * field equality, which is all accounts and households need.
 */

export type Doc = { _id: string } & Record<string, unknown>;
type Name = keyof typeof COLLECTIONS;

// On globalThis: Next bundles pages and route handlers separately, and they must share one map.
const g = globalThis as { __rtStore?: Map<Name, Map<string, Doc>> };
g.__rtStore ??= new Map();
const memory = g.__rtStore;
const table = (name: Name) => {
  const t = memory.get(name) ?? new Map<string, Doc>();
  memory.set(name, t);
  return t;
};

async function mongo(name: Name) {
  if (!process.env.MONGODB_URI) return null;
  const { getDb, col } = await import("@roundtrip/agent/db");
  return col<Doc>(await getDb(), name);
}

const matches = (d: Doc, filter: Record<string, unknown>) => Object.entries(filter).every(([k, v]) => d[k] === v);

export async function put(name: Name, doc: Doc): Promise<void> {
  const c = await mongo(name);
  if (c) await c.replaceOne({ _id: doc._id }, doc, { upsert: true });
  else table(name).set(doc._id, structuredClone(doc));
}

export async function get<T extends Doc = Doc>(name: Name, id: string): Promise<T | null> {
  const c = await mongo(name);
  if (c) return (await c.findOne({ _id: id })) as T | null;
  const d = table(name).get(id);
  return d ? (structuredClone(d) as T) : null;
}

export async function find<T extends Doc = Doc>(name: Name, filter: Record<string, unknown>): Promise<T[]> {
  const c = await mongo(name);
  if (c) return (await c.find(filter).toArray()) as T[];
  return [...table(name).values()].filter((d) => matches(d, filter)).map((d) => structuredClone(d) as T);
}

/** Removes every matching document; returns how many went. */
export async function remove(name: Name, filter: Record<string, unknown>): Promise<number> {
  const c = await mongo(name);
  if (c) return (await c.deleteMany(filter)).deletedCount;
  let n = 0;
  for (const [id, d] of table(name)) if (matches(d, filter) && table(name).delete(id)) n++;
  return n;
}
