import {
  authenticationOptions,
  registrationOptions,
  signOut,
  verifyAuthentication,
  verifyRegistration,
} from "@/lib/server/accounts";
import { take } from "@/lib/server/rate-limit";

/**
 * Passkey sign-up and sign-in (lib/server/accounts.ts): options, then the browser's answer.
 * No password and no email anywhere; nothing here is sent to an outside service.
 */
export const dynamic = "force-dynamic";

const NOPE = "That passkey didn't work here. Try again, or create a new sign-in.";

export async function POST(req: Request, { params }: { params: Promise<{ step: string }> }) {
  const { step } = await params;
  const who = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0]!.trim();
  const room = await take([{ key: `auth:${who}`, max: 30, windowMs: 15 * 60_000 }]);
  if (!room.ok)
    return Response.json({ error: `Too many tries. Wait ${room.retryInMinutes} minutes.` }, { status: 429 });
  const body = await req.json().catch(() => null);
  switch (step) {
    case "register-options":
      return Response.json(await registrationOptions());
    case "signin-options":
      return Response.json(await authenticationOptions());
    case "register":
      return (await verifyRegistration(body).catch(() => false))
        ? Response.json({ ok: true })
        : Response.json({ error: NOPE }, { status: 400 });
    case "signin":
      return (await verifyAuthentication(body).catch(() => false))
        ? Response.json({ ok: true })
        : Response.json({ error: NOPE }, { status: 400 });
    case "signout":
      await signOut();
      return Response.json({ ok: true });
    default:
      return Response.json({ error: "Unknown step" }, { status: 404 });
  }
}
