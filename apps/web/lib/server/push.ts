import "server-only";
import { createHash } from "node:crypto";
import { assertOutbound } from "@roundtrip/core/privacy";
import webpush from "web-push";

/**
 * Web Push to the adult child's browser: the safety alert as a notification. Off unless the
 * VAPID keys are set (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT or Render's own
 * address as the contact). A notification carries first names, the outing's title and times
 * only, encrypted for that browser by web-push (RFC 8291). Subscriptions are kept per session,
 * like the rest of a demo visitor's data, and only for the browser push services listed in the
 * outbound registry ("webpush"), so a made-up endpoint can't turn the server into a proxy.
 * Docs: https://github.com/web-push-libs/web-push#readme, https://web.dev/articles/push-notifications-overview
 */

export interface PushSubscriptionJson {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

interface StoredSubscription extends PushSubscriptionJson {
  _id: string;
  sessionId: string;
  expiresAt: Date;
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
}

const DAY_MS = 24 * 60 * 60_000;
const memory = new Map<string, StoredSubscription>();

export function vapid(env: NodeJS.ProcessEnv = process.env) {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim() || env.RENDER_EXTERNAL_URL?.trim();
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

/** Whether an endpoint belongs to a listed browser push service. */
export function allowedEndpoint(endpoint: string): boolean {
  try {
    if (new URL(endpoint).protocol !== "https:") return false;
    assertOutbound("webpush", "synthetic", endpoint);
    return true;
  } catch {
    return false;
  }
}

async function collection() {
  if (!process.env.MONGODB_URI) return null;
  try {
    const { getDb, col } = await import("@roundtrip/agent/db");
    return col<StoredSubscription>(await getDb(), "pushSubscriptions");
  } catch {
    return null;
  }
}

export async function saveSubscription(sessionId: string, sub: PushSubscriptionJson): Promise<void> {
  const _id = `${sessionId}:${createHash("sha256").update(sub.endpoint).digest("hex").slice(0, 32)}`;
  const doc: StoredSubscription = { _id, sessionId, ...sub, expiresAt: new Date(Date.now() + DAY_MS) };
  const c = await collection();
  if (c) await c.replaceOne({ _id }, doc, { upsert: true });
  else memory.set(_id, doc);
}

async function subscriptions(sessionId: string): Promise<StoredSubscription[]> {
  const c = await collection();
  if (c) return c.find({ sessionId }).toArray();
  return [...memory.values()].filter((s) => s.sessionId === sessionId);
}

async function forget(id: string): Promise<void> {
  const c = await collection();
  if (c) await c.deleteOne({ _id: id });
  else memory.delete(id);
}

export type Send = typeof webpush.sendNotification;

/** Sends to every browser this session subscribed. Returns how many took it. */
export async function pushToSession(sessionId: string, msg: PushMessage, send: Send = webpush.sendNotification) {
  const keys = vapid();
  if (!keys) return 0;
  let delivered = 0;
  for (const s of await subscriptions(sessionId)) {
    if (!allowedEndpoint(s.endpoint)) continue;
    try {
      await send({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(msg), {
        vapidDetails: keys,
        TTL: 6 * 60 * 60,
        urgency: "high",
      });
      delivered++;
    } catch (e) {
      // 404 and 410: the browser dropped the subscription.
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await forget(s._id);
    }
  }
  return delivered;
}
