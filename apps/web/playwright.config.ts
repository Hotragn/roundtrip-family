import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end, offline, accessibility and screenshot checks. Locally this drives the installed
 * Chrome (this machine is Windows on ARM64); CI uses Playwright's own Chromium.
 */
// CI runs the standalone production server bound to 127.0.0.1 (GitHub sets HOSTNAME to the runner name).
const baseURL = process.env.E2E_BASE_URL ?? (process.env.CI ? "http://127.0.0.1:3000" : "http://localhost:3000");
const channel = process.env.CI ? undefined : "chrome";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["json", { outputFile: "test-results/e2e.json" }]] : [["list"]],
  use: { baseURL, channel, trace: "retain-on-failure" },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: process.env.CI ? "pnpm start" : "pnpm dev",
        env: process.env.CI ? { HOSTNAME: "127.0.0.1", PORT: "3000" } : {},
        url: baseURL,
        reuseExistingServer: true,
        timeout: 240_000,
      },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel, viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], channel } },
  ],
});
