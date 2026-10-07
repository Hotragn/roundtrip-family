import type { Page } from "@playwright/test";

/**
 * Pages start their scripts after the first paint (scripts/defer-scripts.mjs), so a test that
 * clicks or measures JavaScript-driven layout waits for Next's client to start, then two frames
 * for the first effects to run.
 */
export async function ready(page: Page) {
  await page.waitForFunction(() => "next" in window);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}
