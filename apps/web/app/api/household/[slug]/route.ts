import { currentAccount, deleteHousehold, exportHousehold, ownedHousehold } from "@/lib/server/accounts";

/**
 * A family's data rights: download everything held for the household, or delete all of it.
 * Only the account that owns the household gets past the 404.
 */
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };
const missing = () => Response.json({ error: "No such household" }, { status: 404 });

export async function GET(_req: Request, { params }: Ctx) {
  const h = await ownedHousehold(await currentAccount(), (await params).slug);
  if (!h) return missing();
  return new Response(JSON.stringify(await exportHousehold(h), null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="roundtrip-${h._id}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const h = await ownedHousehold(await currentAccount(), (await params).slug);
  if (!h) return missing();
  const body = (await req.json().catch(() => null)) as { confirm?: string } | null;
  if (body?.confirm !== "delete") return Response.json({ error: "Type delete to confirm." }, { status: 400 });
  await deleteHousehold(h);
  return Response.json({ ok: true });
}
