import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * The durability eval (evals/durability.test.ts) on its own: it needs a Temporal dev server and
 * a real worker, so `pnpm test` leaves it out. In the Codespace:
 * DURABILITY=1 pnpm --filter @roundtrip/workflows durability
 */
export default defineConfig({
  root: fileURLToPath(new URL("..", import.meta.url)),
  test: {
    environment: "node",
    include: ["evals/durability.test.ts"],
    testTimeout: 240_000,
    hookTimeout: 120_000,
    reporters: ["verbose"],
  },
});
