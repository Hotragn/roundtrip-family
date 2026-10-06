import { SafetySettings } from "@roundtrip/core";
import { isHousehold } from "@/lib/plan-board";
import { listRecords, saveRecord } from "@/lib/server/session";

/**
 * A visitor's safety settings for a demo household: the timer buffers, daylight and the weather
 * rules. Kept in that visitor's session for a day (lib/server/session.ts); the seeded household
 * never changes. Validated with the same schema the household data uses.
 */

export async function GET(_req: Request, { params }: { params: Promise<{ household: string }> }) {
  const { household } = await params;
  if (!isHousehold(household)) return Response.json(null, { status: 404 });
  const saved = (await listRecords("safety")).find((r) => r.payload.household === household);
  return Response.json(saved ? (saved.payload.settings ?? null) : null, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request, { params }: { params: Promise<{ household: string }> }) {
  const { household } = await params;
  if (!isHousehold(household)) return Response.json({ error: "No such household" }, { status: 404 });
  const parsed = SafetySettings.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Check the highlighted settings and save again." }, { status: 400 });
  }
  await saveRecord("safety", household, { household, settings: parsed.data });
  return Response.json(parsed.data);
}
