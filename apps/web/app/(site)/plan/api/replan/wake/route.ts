import { rankerAwake } from "@roundtrip/agent/ranker";
import { after } from "next/server";

/**
 * Wakes the ranker service. On Render's free plan it sleeps after 15 idle minutes and takes half a
 * minute or more to start, so the dashboard calls this when "Plan the coming week" comes into
 * view, and the planner's TabPFN calls find it awake. It asks the ranker's /health and sends no
 * data. At most one wake every five minutes, so page views can't keep the ranker up.
 * With ?wait=1, the first step of "Plan it now", it answers once the ranker is up (or after 90
 * seconds), so the panel can say what it's waiting for.
 * Docs: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md
 */
export const dynamic = "force-dynamic";

const EVERY_MS = 5 * 60 * 1000;
let lastWake = 0;
let lastAwake = 0;

export async function GET(req: Request) {
  const now = Date.now();
  if (new URL(req.url).searchParams.get("wait") === "1") {
    lastWake = now;
    // Up less than five minutes ago means still up: it sleeps after 15 idle minutes.
    const awake = now - lastAwake < EVERY_MS || (await rankerAwake(process.env, 90_000));
    if (awake && now - lastAwake >= EVERY_MS) lastAwake = Date.now();
    return Response.json({ awake }, { status: awake ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  }
  if (process.env.RANKER_URL && now - lastWake > EVERY_MS) {
    lastWake = now;
    after(async () => {
      // The re-plan itself still waits for the ranker if this didn't reach it.
      if (await rankerAwake(process.env, 90_000)) lastAwake = Date.now();
    });
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
