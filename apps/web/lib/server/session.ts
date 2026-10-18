import "server-only";
import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";

/**
 * Demo visitors get their own session: whatever they approve, check in or write stays in that
 * session for a day (MongoDB TTL), and the seeded demo week is never changed. Without
 * MONGODB_URI (CI, local tests) the session lives in memory.
 *
 * A real family's phone carries its phone link's cookie (lib/server/accounts.ts), so what it
 * sends is kept under its household instead, with no expiry, until the family deletes it.
 */

export const SESSION_COOKIE = "rt_session";
const DAY_MS = 24 * 60 * 60 * 1000;

export async function sessionId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(SESSION_COOKIE)?.value;
  if (existing && /^[a-f0-9]{32}$/.test(existing)) return existing;
  const id = randomBytes(16).toString("hex");
  // Secure whenever the visitor came over HTTPS (Render's proxy says so in x-forwarded-proto);
  // a local production run over plain HTTP still keeps its session.
  const proto = (await headers()).get("x-forwarded-proto") ?? "http";
  jar.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: proto.split(",")[0]!.trim() === "https",
    maxAge: DAY_MS / 1000,
    path: "/",
  });
  return id;
}

export const PHONE_COOKIE = "rt_phone";

/** Whose records these are: a real family's household for its phones, otherwise this visit. */
async function owner(): Promise<{ id: string; keep: boolean }> {
  const token = (await cookies()).get(PHONE_COOKIE)?.value;
  if (token) {
    const { phoneLink } = await import("./accounts");
    const link = await phoneLink(token);
    if (link) return { id: householdOwner(link.household), keep: true };
  }
  return { id: await sessionId(), keep: false };
}

export const householdOwner = (slug: string) => `hh:${slug}`;
export const RECORD_KINDS = ["checkin", "approval", "diary", "sessions"] as const;

export interface SessionRecord {
  _id: string;
  sessionId: string;
  kind: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  /** Absent for a real family's records, which stay until they delete them. */
  expiresAt?: Date;
}

// One map per process, shared by every bundle that imports this module.
const shared = globalThis as { __rtSessions?: Map<string, SessionRecord> };
shared.__rtSessions ??= new Map();
const memory = shared.__rtSessions;

// When the database doesn't answer, sessions live in memory for a minute instead of every
// request waiting on another connection attempt. The first failure is logged, minus credentials.
let downUntil = 0;
let warned = false;

async function collection(kind: string) {
  if (!process.env.MONGODB_URI || Date.now() < downUntil) return null;
  try {
    const { getDb, col } = await import("@roundtrip/agent/db");
    const db = await getDb();
    const name =
      kind === "checkin" ? "checkins" : kind === "approval" ? "approvals" : kind === "diary" ? "diary" : "sessions";
    return col<SessionRecord>(db, name as never);
  } catch (e) {
    downUntil = Date.now() + 60_000;
    if (!warned) {
      warned = true;
      const why = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      console.warn(`Session store unavailable, using memory: ${why.replace(/\/\/[^@\s]*@/g, "//***@").slice(0, 400)}`);
    }
    return null;
  }
}

export async function saveRecord(kind: string, id: string, payload: Record<string, unknown>): Promise<SessionRecord> {
  const { id: sid, keep } = await owner();
  const now = new Date();
  const record: SessionRecord = {
    _id: `${sid}:${kind}:${id}`,
    sessionId: sid,
    kind,
    payload,
    createdAt: now,
    ...(keep ? {} : { expiresAt: new Date(now.getTime() + DAY_MS) }),
  };
  const c = await collection(kind).catch(() => null);
  if (c) await c.replaceOne({ _id: record._id }, record, { upsert: true });
  else memory.set(record._id, record);
  return record;
}

export async function listRecords(kind: string): Promise<SessionRecord[]> {
  const { id: sid } = await owner();
  const c = await collection(kind).catch(() => null);
  if (c) return c.find({ sessionId: sid, kind }).sort({ createdAt: 1 }).toArray();
  return [...memory.values()].filter((r) => r.sessionId === sid && r.kind === kind);
}

export async function removeRecord(kind: string, id: string): Promise<void> {
  const { id: sid } = await owner();
  const c = await collection(kind).catch(() => null);
  if (c) await c.deleteOne({ _id: `${sid}:${kind}:${id}` });
  else memory.delete(`${sid}:${kind}:${id}`);
}

/** Every record one owner has, of every kind (a family's export). */
export async function ownedRecords(ownerId: string): Promise<SessionRecord[]> {
  const out: SessionRecord[] = [];
  for (const kind of RECORD_KINDS) {
    const c = await collection(kind).catch(() => null);
    if (c) out.push(...(await c.find({ sessionId: ownerId }).toArray()));
  }
  out.push(...[...memory.values()].filter((r) => r.sessionId === ownerId));
  return out;
}

/** Removes every record one owner has, of every kind (deleting a household). */
export async function removeOwned(ownerId: string): Promise<void> {
  for (const kind of RECORD_KINDS) {
    const c = await collection(kind).catch(() => null);
    if (c) await c.deleteMany({ sessionId: ownerId });
  }
  for (const [id, r] of memory) if (r.sessionId === ownerId) memory.delete(id);
}
