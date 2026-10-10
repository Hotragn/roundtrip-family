import { outboundFetch } from "@roundtrip/core/privacy";

/**
 * Keeps the free Render instance from sleeping while people are likely to visit. Render puts a
 * free service to sleep after 15 minutes without an inbound request, and the next visitor waits
 * about 30 seconds; GitHub's scheduled pings run hours apart, so they can't prevent that. While
 * it's awake, the server asks its own public health check every 5 minutes, from 06:00 to 02:00
 * New York time. Asleep from 02:00 to 06:00, it uses at most 620 of the workspace's 750 free
 * hours a month, which leaves the rest for the ranker (docs/decisions.md). The morning wake-up
 * comes from .github/workflows/keep-awake.yml. The request carries nothing.
 */

const EVERY_MS = 5 * 60_000;

/** Whether the demo should stay awake at this moment: 06:00 to 02:00 in New York. */
export function awakeHours(at: Date): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(at),
  );
  return hour < 2 || hour >= 6;
}

export function startKeepAwake(): void {
  const base = process.env.RENDER_EXTERNAL_URL;
  if (process.env.RENDER !== "true" || !base) return;
  setInterval(() => {
    if (!awakeHours(new Date())) return;
    outboundFetch("self.health", "public", `${base}/api/health`, { signal: AbortSignal.timeout(30_000) }).catch(
      () => {},
    );
  }, EVERY_MS).unref();
}
