import "server-only";
import { onClock } from "../plan-format";
import type { BoardItem, PlanBoard } from "../plan-types";
import { temporalOn } from "./temporal";

/**
 * The hosted safety timer, for where there is no Temporal (Render). When an outing is approved,
 * or a demo visitor starts a trip on a demo phone, its schedule is saved: expected back, the
 * phone's check at expected back plus the buffer, and the alert after the nudge wait. A ticker
 * started from instrumentation.ts claims due timers every minute with one atomic update each,
 * so a timer fires exactly once across restarts and instances. "I'm home" stops it. With
 * TEMPORAL_ADDRESS set, outingSafety in workflows/ does this instead and none of this runs.
 * Without MONGODB_URI (CI, local tests) timers live in memory, like lib/server/session.ts.
 * A timer holds first names, the outing's title and times only.
 */

export type TimerState = "waiting" | "nudged" | "alerted" | "home" | "off";

export interface SafetyTimer {
  _id: string;
  sessionId: string;
  household: string;
  /** The board item, for the email's details at alert time. */
  itemId: string;
  /** Ids a check-in may carry for this outing: the slot and, after a swap, the alternative. */
  outingIds: string[];
  parentIds: string[];
  who: string[];
  title: string;
  expectedBack: Date;
  nudgeAt: Date;
  alertAt: Date;
  state: TimerState;
  nudgedAt: Date | null;
  alertedAt: Date | null;
  homeAt: Date | null;
  expiresAt: Date;
}

const DAY_MS = 24 * 60 * 60_000;
const memory = new Map<string, SafetyTimer>();

/** For tests: forget the in-memory timers. */
export function resetMemoryTimers(): void {
  memory.clear();
}

let indexed: Promise<unknown> | null = null;

async function collection() {
  if (!process.env.MONGODB_URI) return null;
  try {
    const { getDb, col } = await import("@roundtrip/agent/db");
    const c = col<SafetyTimer>(await getDb(), "safetyTimers");
    indexed ??= Promise.all([
      c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      c.createIndex({ state: 1, alertAt: 1 }),
      c.createIndex({ state: 1, nudgeAt: 1 }),
      c.createIndex({ sessionId: 1, household: 1 }),
    ]).catch(() => (indexed = null));
    return c;
  } catch {
    // The session store logs the outage once; timers use memory meanwhile.
    return null;
  }
}

/** Saves a timer, or replaces one that is still waiting. One that already fired is left alone. */
export async function scheduleTimer(t: SafetyTimer): Promise<void> {
  const c = await collection();
  if (!c) {
    const old = memory.get(t._id);
    if (!old || old.state === "waiting" || old.state === "off") memory.set(t._id, t);
    return;
  }
  const r = await c.replaceOne({ _id: t._id, state: { $in: ["waiting", "off"] } }, t);
  if (r.matchedCount > 0) return;
  // Not there yet, or already fired: insert, and a duplicate key means it fired. Keep that one.
  await c.insertOne(t).catch((e: { code?: number }) => {
    if (e.code !== 11000) throw e;
  });
}

/** "I'm home" (state "home") or an unapproved outing ("off") stops this session's timer. */
export async function stopTimers(sessionId: string, outingId: string, state: "home" | "off", at = new Date()) {
  const open: TimerState[] = state === "home" ? ["waiting", "nudged", "alerted"] : ["waiting", "nudged"];
  const c = await collection();
  if (!c) {
    for (const t of memory.values()) {
      if (t.sessionId === sessionId && t.outingIds.includes(outingId) && open.includes(t.state)) {
        t.state = state;
        if (state === "home") t.homeAt = at;
      }
    }
    return;
  }
  await c.updateMany(
    { sessionId, outingIds: outingId, state: { $in: open } },
    { $set: state === "home" ? { state, homeAt: at } : { state } },
  );
}

export async function timersFor(sessionId: string, household: string): Promise<SafetyTimer[]> {
  const c = await collection();
  if (!c) return [...memory.values()].filter((t) => t.sessionId === sessionId && t.household === household);
  return c.find({ sessionId, household }).toArray();
}

/**
 * Claims one due timer for a stage, atomically: only the caller whose update matched delivers
 * it. The alert stage also takes timers whose nudge never ran (the server was asleep).
 */
export async function claim(stage: "nudge" | "alert", now: Date): Promise<SafetyTimer | null> {
  const from: TimerState[] = stage === "alert" ? ["waiting", "nudged"] : ["waiting"];
  const field = stage === "alert" ? "alertAt" : "nudgeAt";
  const next: Partial<SafetyTimer> =
    stage === "alert" ? { state: "alerted", alertedAt: now } : { state: "nudged", nudgedAt: now };
  const c = await collection();
  if (!c) {
    const t = [...memory.values()].find((x) => from.includes(x.state) && x[field] <= now);
    if (!t) return null;
    Object.assign(t, next);
    return { ...t };
  }
  return c.findOneAndUpdate(
    { state: { $in: from }, [field]: { $lte: now } },
    { $set: next },
    { returnDocument: "after", sort: { [field]: 1 } },
  );
}

export type Deliver = (t: SafetyTimer) => Promise<unknown>;

/** Fires every due alert, then every due nudge. Safe to call from any number of places at once. */
export async function tick(now: Date, deliver: Deliver): Promise<{ alerts: number; nudges: number }> {
  let alerts = 0;
  let nudges = 0;
  for (let t = await claim("alert", now); t; t = await claim("alert", now)) {
    alerts++;
    await deliver(t).catch((e) =>
      console.warn(`Safety alert delivery failed: ${e instanceof Error ? e.name : "error"}`),
    );
  }
  while (await claim("nudge", now)) nudges++;
  return { alerts, nudges };
}

/** The instant of a local date and time in a time zone, correct across daylight saving changes. */
export function zonedInstant(date: string, minutes: number, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const wall = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  let guess = wall;
  for (let i = 0; i < 3; i++) {
    const seen = onClock(new Date(guess).toISOString(), timeZone);
    const seenWall = Date.parse(`${seen.date}T00:00:00Z`) + seen.minutes * 60_000;
    if (seenWall === wall) break;
    guess += wall - seenWall;
  }
  return new Date(guess);
}

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** The next time this weekday's local clock reads `minutes`, from `now`. */
export function nextOccurrence(day: string, minutes: number, timeZone: string, now: Date): Date {
  const today = onClock(now.toISOString(), timeZone).date;
  const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const want = DAYS.indexOf(day);
  for (let add = (want - dow + 7) % 7; ; add += 7) {
    const date = new Date(Date.parse(`${today}T12:00:00Z`) + add * DAY_MS).toISOString().slice(0, 10);
    const at = zonedInstant(date, minutes, timeZone);
    if (at > now) return at;
  }
}

export interface Buffers {
  bufferMinutes: number;
  nudgeWaitMinutes: number;
}

/**
 * The test-only short timer: with SAFETY_TEST_HOOKS=1 off Render, a request may ask for the
 * check and the alert a few seconds apart, so a browser test sees a missed check-in.
 */
export function testSeconds(asked: unknown): number | null {
  if (process.env.SAFETY_TEST_HOOKS !== "1" || process.env.RENDER === "true") return null;
  return typeof asked === "number" && asked > 0 && asked <= 60 ? asked : null;
}

export function buildTimer(opts: {
  sessionId: string;
  board: PlanBoard;
  slotId: string;
  item: BoardItem;
  expectedBack: Date;
  buffers: Buffers;
  testSeconds?: number | null;
  now?: Date;
}): SafetyTimer {
  const { board, item, expectedBack, buffers } = opts;
  const now = opts.now ?? new Date();
  const test = opts.testSeconds ? opts.testSeconds * 1000 : null;
  const back = test ? now : expectedBack;
  const nudgeAt = new Date(back.getTime() + (test ?? buffers.bufferMinutes * 60_000));
  const alertAt = new Date(nudgeAt.getTime() + (test ?? buffers.nudgeWaitMinutes * 60_000));
  return {
    _id: `${opts.sessionId}:${board.household.slug}:${opts.slotId}`,
    sessionId: opts.sessionId,
    household: board.household.slug,
    itemId: item.id,
    outingIds: [...new Set([opts.slotId, item.id])],
    parentIds: item.parentIds,
    who: item.parentIds.map((id) => board.parents.find((p) => p.id === id)?.firstName ?? "").filter(Boolean),
    title: item.title,
    expectedBack: back,
    nudgeAt,
    alertAt,
    state: "waiting",
    nudgedAt: null,
    alertedAt: null,
    homeAt: null,
    expiresAt: new Date(alertAt.getTime() + DAY_MS),
  };
}

/** Hosted timers run only where Temporal doesn't. */
export function hostedTimersOn(): boolean {
  return !temporalOn();
}

let started = false;

/** Every minute, fire what's due. Started once per server process from instrumentation.ts. */
export function startSafetyTicker(deliver: Deliver, everyMs = 60_000): void {
  if (started || !hostedTimersOn()) return;
  started = true;
  setInterval(() => {
    void tick(new Date(), deliver).catch(() => {});
  }, everyMs).unref();
}
