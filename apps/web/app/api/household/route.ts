import { COUNTRIES } from "@roundtrip/core";
import { currentAccount, saveHousehold } from "@/lib/server/accounts";
import { SetupForm } from "@/lib/setup-schema";

/**
 * A signed-in family saves its own household from the setup wizard: first names, languages,
 * the nearest stop and one contact number, never an address. Kept in this app's database only.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const account = await currentAccount();
  if (!account) return Response.json({ error: "Sign in first." }, { status: 401 });
  const parsed = SetupForm.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "Check the highlighted answers and save again." }, { status: 400 });
  if (!(parsed.data.hostCountry in COUNTRIES))
    return Response.json({ error: "Pick a country from the list." }, { status: 400 });
  const h = await saveHousehold(account, parsed.data);
  return Response.json({ ok: true, href: `/plan/${h._id}` });
}
