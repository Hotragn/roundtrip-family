import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies an AgentMail webhook. AgentMail signs webhooks through Svix
 * (docs.agentmail.to/webhook-verification): headers svix-id, svix-timestamp and svix-signature,
 * and a secret starting with whsec_. This follows Svix's manual verification
 * (docs.svix.com/receiving/verifying-payloads/how-manual), so the web app needs no extra
 * dependency: HMAC-SHA256 over "id.timestamp.body" with the base64-decoded secret, compared in
 * constant time against each "v1,<base64>" signature, and a timestamp within five minutes.
 * The body must be the exact raw request text.
 */

export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

type HeaderBag = Headers | Record<string, string | string[] | undefined>;

function header(h: HeaderBag, name: string): string | null {
  if (typeof (h as Headers).get === "function") return (h as Headers).get(name);
  const v = (h as Record<string, string | string[] | undefined>)[name];
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export function signWebhook(secret: string, id: string, timestamp: number, body: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
}

export type WebhookCheck = { ok: true; id: string } | { ok: false; why: string };

export function verifyWebhook(
  body: string,
  headers: HeaderBag,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): WebhookCheck {
  const id = header(headers, "svix-id") ?? header(headers, "webhook-id");
  const ts = header(headers, "svix-timestamp") ?? header(headers, "webhook-timestamp");
  const sigs = header(headers, "svix-signature") ?? header(headers, "webhook-signature");
  if (!id || !ts || !sigs) return { ok: false, why: "missing signature headers" };
  if (!/^\d+$/.test(ts)) return { ok: false, why: "bad timestamp" };
  const timestamp = Number(ts);
  if (Math.abs(nowSeconds - timestamp) > WEBHOOK_TOLERANCE_SECONDS) return { ok: false, why: "timestamp too old" };
  if (!secret.startsWith("whsec_")) return { ok: false, why: "secret is not a whsec_ secret" };
  const expected = Buffer.from(signWebhook(secret, id, timestamp, body), "base64");
  for (const part of sigs.split(" ")) {
    const [version, sig] = part.split(",", 2);
    if (version !== "v1" || !sig) continue;
    const given = Buffer.from(sig, "base64");
    if (given.length === expected.length && timingSafeEqual(given, expected)) return { ok: true, id };
  }
  return { ok: false, why: "no matching signature" };
}
