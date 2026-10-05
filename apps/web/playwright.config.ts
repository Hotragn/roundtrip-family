import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end, offline, accessibility and screenshot checks. Locally this drives the installed
 * Chrome (this machine is Windows on ARM64); CI uses Playwright's own Chromium.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
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
        url: baseURL,
        reuseExistingServer: true,
        timeout: 240_000,
      },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel, viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], channel } },
  ],
});
