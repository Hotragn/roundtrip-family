import type { ActiveSpan, SpanStarter } from "@roundtrip/agent/observability";
import { scrubPersonal } from "@roundtrip/core/privacy";
import type { ErrorEvent, Event } from "@sentry/nextjs";

/**
 * What reaches Sentry: errors and span timings from the server, scrubbed. No request bodies,
 * headers, cookies or query strings, no user or IP, no breadcrumbs; messages lose anything that
 * looks like an email or a phone number, and the demo families' first names. Span URLs lose
 * their query strings and the Cloudflare account id. The planner's spans carry names, models
 * and counts only (agent/src/observability/trace.ts). Only on Render (production with
 * SENTRY_DSN), so nothing is sent from development or tests.
 * Docs: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/,
 * https://docs.sentry.io/platforms/javascript/configuration/filtering/,
 * https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/sampling/
 */

const NAMES = ["Sarala", "Venkat", "Kamala", "Raghu"];

function cleanUrl(text: string): string {
  return text.replace(/\?\S*/g, "").replace(/\/accounts\/[^/\s]+/g, "/accounts/{account}");
}

function cleanData(data: Record<string, unknown> | undefined): void {
  if (!data) return;
  for (const [k, v] of Object.entries(data)) {
    if (k === "http.query" || k === "url.query") delete data[k];
    else if (typeof v === "string" && /https?:\/\//.test(v)) data[k] = cleanUrl(v);
  }
}

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
  cleanData(event.contexts?.trace?.data);
  for (const span of event.spans ?? []) {
    if (span.description) span.description = cleanUrl(span.description);
    cleanData(span.data);
  }
  return event;
}

export function sentryOptions() {
  return {
    dsn: process.env.SENTRY_DSN,
    environment: "demo",
    sendDefaultPii: false,
    // A free plan: every "Plan the coming week" run (rate-limited to forty a day), a tenth of the rest.
    tracesSampler: ({ name }: { name: string }) => (name.includes("/replan/") ? 1 : 0.1),
    beforeSend: (e: ErrorEvent) => clean(e),
    beforeSendTransaction: <T extends Event>(e: T) => clean(e),
  };
}

export const sentryEnabled = () => process.env.NODE_ENV === "production" && Boolean(process.env.SENTRY_DSN);

/** Lets the agent package's planner, model and tool spans reach Sentry. */
export async function registerAgentSpans(): Promise<void> {
  const Sentry = await import("@sentry/nextjs");
  const { setSpanStarter } = await import("@roundtrip/agent/observability");
  const starter: SpanStarter = <T>(
    opts: { name: string; op: string; attributes: Record<string, string | number | boolean> },
    fn: (span: ActiveSpan) => Promise<T>,
  ) =>
    Sentry.startSpan({ name: opts.name, op: opts.op, attributes: opts.attributes }, (span) =>
      fn({ setAttributes: (a) => span.setAttributes(a) }),
    );
  setSpanStarter(starter);
}

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
