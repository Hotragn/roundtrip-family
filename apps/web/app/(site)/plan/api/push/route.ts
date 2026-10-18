import { z } from "zod";
import { allowedEndpoint, saveSubscription, vapid } from "@/lib/server/push";
import { sessionId } from "@/lib/server/session";

/**
 * Safety alerts as browser notifications: whether they're on (the VAPID keys are set) with the
 * public key the browser subscribes with, and saving this browser's subscription to the session.
 */
export const dynamic = "force-dynamic";

const Subscription = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
});

export function GET() {
  const keys = vapid();
  return Response.json({ on: Boolean(keys), publicKey: keys?.publicKey ?? null });
}

export async function POST(req: Request) {
  if (!vapid()) return Response.json({ error: "Notifications are off on this site." }, { status: 503 });
  const parsed = Subscription.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !allowedEndpoint(parsed.data.endpoint)) {
    return Response.json({ error: "This browser's notification service isn't one we send to." }, { status: 400 });
  }
  await saveSubscription(await sessionId(), parsed.data);
  return Response.json({ ok: true });
}
