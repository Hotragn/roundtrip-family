import { DEMO_WEEKS } from "@/lib/demo-weeks";

/**
 * The week for a demo household (synthetic family; places and routes from live searches).
 * The start screen reads it to list the parents; each parent's own page has its week built in.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(DEMO_WEEKS).map((slug) => ({ slug }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const week = DEMO_WEEKS[slug];
  if (!week) return Response.json({ error: "No such household" }, { status: 404 });
  return Response.json(week, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=86400" } });
}
