/**
 * Runs once when each server process starts. Locally, it loads the repo root's .env into the
 * process that handles requests (next.config's own load doesn't reach the dev server's workers),
 * so routes like "Plan the coming week" can reach Gemma. On Render the keys are real environment
 * variables and there is no .env, so this does nothing.
 * Docs: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { loadEnv } = await import("@roundtrip/core/server-env");
  await loadEnv();
}
