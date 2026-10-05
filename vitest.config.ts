import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "packages/*/test/**/*.test.ts",
      "agent/test/**/*.test.ts",
      "workflows/test/**/*.test.ts",
      "evals/**/*.test.ts",
      "apps/web/test/**/*.test.{ts,tsx}",
      "scripts/test/**/*.test.ts",
    ],
    // The durability test needs a Temporal dev server; it runs with `pnpm eval:durability`.
    exclude: ["**/node_modules/**", "evals/durability.test.ts", "apps/web/e2e/**"],
    testTimeout: 20_000,
  },
});
