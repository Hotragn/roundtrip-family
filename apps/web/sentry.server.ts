import { scrubPersonal } from "@roundtrip/core/privacy";
import type { ErrorEvent, Event } from "@sentry/nextjs";

/**
 * What reaches Sentry: errors and span timings from the server, scrubbed. No request bodies,
 * headers, cookies or query strings, no user or IP, no breadcrumbs; messages lose anything that
 * looks like an email or a phone number, and the demo families' first names. Only on Render
 * (production with SENTRY_DSN), so nothing is sent from development or tests.
 * Docs: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/,
 * https://docs.sentry.io/platforms/javascript/configuration/filtering/
 */

const NAMES = ["Sarala", "Venkat", "Kamala", "Raghu"];

function clean<T extends Event>(event: T): T {
  if (event.request) {
    const url = event.request.url ? event.request.url.split("?")[0] : undefined;
    event.request = { url, method: event.request.method };
  }
  delete event.user;
  delete event.breadcrumbs;
  if (event.message) event.message = scrubPersonal(event.message, NAMES);
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = scrubPersonal(ex.value, NAMES);
  }
  return event;
}

export function sentryOptions() {
  return {
    dsn: process.env.SENTRY_DSN,
    environment: "demo",
    sendDefaultPii: false,
    // A free plan: enough to see where time goes in a planner run without filling the quota.
    tracesSampleRate: 0.2,
    beforeSend: (e: ErrorEvent) => clean(e),
    beforeSendTransaction: <T extends Event>(e: T) => clean(e),
  };
}

export const sentryEnabled = () => process.env.NODE_ENV === "production" && Boolean(process.env.SENTRY_DSN);

/** Runs `fn` inside a Sentry span when Sentry is on, with numbers only as attributes. */
export async function traced<T>(
  name: string,
  fn: () => Promise<T>,
  attributes: (result: T) => Record<string, number | string> = () => ({}),
): Promise<T> {
  if (!sentryEnabled()) return fn();
  const Sentry = await import("@sentry/nextjs");
  return Sentry.startSpan({ name, op: "planner" }, async (span) => {
    const result = await fn();
    span.setAttributes(attributes(result));
    return result;
  });
}
