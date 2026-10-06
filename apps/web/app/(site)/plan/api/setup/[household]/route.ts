import { COUNTRIES } from "@roundtrip/core";
import { isHousehold } from "@/lib/plan-board";
import { listRecords, saveRecord } from "@/lib/server/session";
import { SetupForm } from "@/lib/setup-schema";

/**
 * Saving the setup wizard for a demo household. The answers stay in the visitor's session for a
 * day (lib/server/session.ts); the fictional household is never changed, and nothing here is
 * sent to an outside service.
 */

export async function GET(_req: Request, { params }: { params: Promise<{ household: string }> }) {
  const { household } = await params;
  if (!isHousehold(household)) return Response.json(null, { status: 404 });
  const saved = (await listRecords("setup")).find((r) => r.payload.household === household);
  return Response.json(saved?.payload.setup ?? null, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request, { params }: { params: Promise<{ household: string }> }) {
  const { household } = await params;
  if (!isHousehold(household)) return Response.json({ error: "No such household" }, { status: 404 });
  const parsed = SetupForm.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "Check the highlighted answers and save again." }, { status: 400 });
  if (!(parsed.data.hostCountry in COUNTRIES)) {
    return Response.json({ error: "Pick a country from the list." }, { status: 400 });
  }
  await saveRecord("setup", household, { household, setup: parsed.data });
  return Response.json({ ok: true });
}
