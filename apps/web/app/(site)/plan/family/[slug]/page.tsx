import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { FamilyDashboard } from "@/components/account/family-dashboard";
import { currentAccount, ownedHousehold } from "@/lib/server/accounts";

export const metadata: Metadata = { title: "Your household", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * A real family's dashboard, at /plan/<their household> (proxy.ts rewrites it here). Only the
 * account that owns it gets past the 404; the demo households keep their own prerendered pages.
 */
export default async function FamilyPlan({ params }: { params: Promise<{ slug: string }> }) {
  const h = await ownedHousehold(await currentAccount(), (await params).slug);
  if (!h) notFound();
  const hd = await headers();
  const origin = `${hd.get("x-forwarded-proto")?.split(",")[0] ?? "http"}://${hd.get("x-forwarded-host") ?? hd.get("host")}`;
  return <FamilyDashboard h={h} origin={process.env.WEBAUTHN_ORIGIN ?? origin} />;
}
