import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { type FamilyHousehold, phoneLink } from "@/lib/server/accounts";
import { familyWeek } from "@/lib/server/family-week";
import { PHONE_COOKIE } from "@/lib/server/session";
import { get } from "@/lib/server/store";
import { ParentsApp } from "../../../parents-app";

export const dynamic = "force-dynamic";

/**
 * A real family's parent's phone, at /parents/<household>/<parent> (proxy.ts rewrites it here).
 * It opens only on a phone that came through that parent's link (/parents/k/<token>).
 */
export default async function FamilyParent({ params }: { params: Promise<{ slug: string; parent: string }> }) {
  const { slug, parent } = await params;
  const link = await phoneLink((await cookies()).get(PHONE_COOKIE)?.value ?? "");
  if (link?.household !== slug || link.parentId !== parent) notFound();
  const h = await get<FamilyHousehold>("familyHouseholds", slug);
  if (!h) notFound();
  return <ParentsApp initial={{ household: slug, parentId: parent, week: familyWeek(h), diary: [] }} />;
}
