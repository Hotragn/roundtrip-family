import { z } from "zod";
import { loadMemory } from "@/lib/family";
import { isHousehold } from "@/lib/plan-board";
import { listRecords, saveRecord } from "@/lib/server/session";

/**
 * Forgetting a person or a place from what Roundtrip remembers. The demo keeps the choice in the
 * visitor's session for a day (lib/server/session.ts); the fictional household itself is never
 * changed. A forgotten person is no longer described to the planner.
 */

const Change = z.object({
  action: z.enum(["forget", "restore"]),
  id: z.string().regex(/^(person|place):[\p{L}\p{N}_-]{1,120}$/u),
});

async function forgotten(household: string): Promise<string[]> {
  return (await listRecords("memory"))
    .map((r) => r.payload as { household: string; id: string; forgotten: boolean })
    .filter((r) => r.household === household && r.forgotten)
    .map((r) => r.id);
}

export async function GET(_req: Request, { params }: { params: Promise<{ household: string }> }) {
  const { household } = await params;
  if (!isHousehold(household)) return Response.json({ forgotten: [] }, { status: 404 });
  return Response.json({ forgotten: await forgotten(household) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request, { params }: { params: Promise<{ household: string }> }) {
  const { household } = await params;
  if (!isHousehold(household)) return Response.json({ error: "No such household" }, { status: 404 });
  const parsed = Change.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid change" }, { status: 400 });
  const { action, id } = parsed.data;
  const memory = loadMemory(household);
  const [kind, key] = id.split(":") as ["person" | "place", string];
  const known = kind === "person" ? memory.people.some((p) => p.id === key) : memory.places.some((p) => p.id === key);
  if (!known) return Response.json({ error: "Not in this household's memory" }, { status: 404 });
  await saveRecord("memory", `${household}:${id}`, { household, id, forgotten: action === "forget" });
  return Response.json({ forgotten: await forgotten(household) });
}
