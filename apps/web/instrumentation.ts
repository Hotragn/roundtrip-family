import type { Instrumentation } from "next";

/**
 * Runs once when each server process starts.
 * - Locally, it loads the repo root's .env into the process that handles requests (next.config's
 *   own load doesn't reach the dev server's workers), so routes like "Plan the coming week" can
 *   reach Gemma. On Render the keys are real environment variables and there is no .env.
 * - On Render, it starts Sentry for server errors and planner timings, scrubbed
 *   (sentry.server.ts). Nothing runs in the browser.
 * Docs: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { loadEnv } = await import("@roundtrip/core/server-env");
  await loadEnv();
  const { sentryEnabled, sentryOptions } = await import("@/sentry.server");
  if (sentryEnabled()) {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init(sentryOptions());
  }
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production" || !process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
};
