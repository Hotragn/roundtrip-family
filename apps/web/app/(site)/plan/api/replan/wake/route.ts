import { outboundFetch } from "@roundtrip/core/privacy";
import { after } from "next/server";

/**
 * Wakes the ranker service. On Render's free plan it sleeps after 15 idle minutes and takes about
 * half a minute to start, so the dashboard calls this when "Plan the coming week" comes into view,
 * and the planner's TabPFN calls find it awake. It asks the ranker's /health and sends no data.
 * At most one wake every five minutes, so page views can't keep the ranker up.
 * Docs: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md
 */
export const dynamic = "force-dynamic";

const EVERY_MS = 5 * 60 * 1000;
let lastWake = 0;

export function GET() {
  const base = process.env.RANKER_URL;
  const now = Date.now();
  if (base && now - lastWake > EVERY_MS) {
    lastWake = now;
    after(async () => {
      try {
        await outboundFetch("ranker", "synthetic", `${base.replace(/\/$/, "")}/health`, {
          signal: AbortSignal.timeout(90_000),
        });
      } catch {
        // The re-plan itself still waits for the ranker if this didn't reach it.
      }
    });
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
