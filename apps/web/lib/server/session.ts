import "server-only";
import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";

/**
 * Demo visitors get their own session: whatever they approve, check in or write stays in that
 * session for a day (MongoDB TTL), and the seeded demo week is never changed. Without
 * MONGODB_URI (CI, local tests) the session lives in memory.
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

export interface SessionRecord {
  _id: string;
  sessionId: string;
  kind: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  expiresAt: Date;
}

const memory = new Map<string, SessionRecord>();

async function collection(kind: string) {
  if (!process.env.MONGODB_URI) return null;
  const { getDb, col } = await import("@roundtrip/agent/db");
  const db = await getDb();
  const name =
    kind === "checkin" ? "checkins" : kind === "approval" ? "approvals" : kind === "diary" ? "diary" : "sessions";
  return col<SessionRecord>(db, name as never);
}

export async function saveRecord(kind: string, id: string, payload: Record<string, unknown>): Promise<SessionRecord> {
  const sid = await sessionId();
  const now = new Date();
  const record: SessionRecord = {
    _id: `${sid}:${kind}:${id}`,
    sessionId: sid,
    kind,
    payload,
    createdAt: now,
    expiresAt: new Date(now.getTime() + DAY_MS),
  };
  const c = await collection(kind).catch(() => null);
  if (c) await c.replaceOne({ _id: record._id }, record, { upsert: true });
  else memory.set(record._id, record);
  return record;
}

export async function listRecords(kind: string): Promise<SessionRecord[]> {
  const sid = await sessionId();
  const c = await collection(kind).catch(() => null);
  if (c) return c.find({ sessionId: sid, kind }).sort({ createdAt: 1 }).toArray();
  return [...memory.values()].filter((r) => r.sessionId === sid && r.kind === kind);
}

export async function removeRecord(kind: string, id: string): Promise<void> {
  const sid = await sessionId();
  const c = await collection(kind).catch(() => null);
  if (c) await c.deleteOne({ _id: `${sid}:${kind}:${id}` });
  else memory.delete(`${sid}:${kind}:${id}`);
}
