import { expect, type Page, test } from "@playwright/test";
import { ready } from "./ready";

/**
 * The script policy (scripts/defer-scripts.mjs) blocks nothing the site needs: every page,
 * the outing sheet's map (blob workers, OpenFreeMap tiles), every parents' screen and an
 * offline reload from the service worker report no policy violation, and every page carries
 * its policy. Needs a production build: the policy is added after `next build`.
 */

const PAGES = [
  "/",
  "/plan",
  "/parents",
  "/parents?v=start",
  ...["fremont-demo", "munich-demo"].flatMap((h) =>
    ["", "/their-week", "/shared", "/people", "/privacy", "/safety", "/languages", "/setup"].map(
      (s) => `/plan/${h}${s}`,
    ),
  ),
  "/no-such-page",
];
const PARENTS = ["/parents/fremont-demo/p_sarala", "/parents/fremont-demo/p_venkat", "/parents/munich-demo/p_kamala"];
const VIEWS = ["directions", "driver", "practice", "lost", "how", "diary", "book", "friend", "join"];

/** Collects violation events (from page start) and the console's refusals. */
async function watch(page: Page) {
  const seen: string[] = [];
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  page.on("console", (m) => {
    if (/CSP violation|Content Security Policy|Refused to/i.test(m.text())) seen.push(`${page.url()}: ${m.text()}`);
  });
  return seen;
}

async function hasPolicy(page: Page) {
  const content = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(content, page.url()).toContain("script-src 'self' 'sha256-");
}

test("every page runs with its script policy and no violations", async ({ page }) => {
  const seen = await watch(page);
  await page.addInitScript(() => {
    try {
      localStorage.setItem("roundtrip:guide-dismissed", "1");
    } catch {}
  });
  for (const path of PAGES) {
    await page.goto(path);
    await ready(page);
    await hasPolicy(page);
    // Let scroll-driven art and lazy screens start.
    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(400);
  }
  expect(seen).toEqual([]);
});

test("the first-visit guide's early script runs under the policy", async ({ page }) => {
  const seen = await watch(page);
  await page.goto("/plan/fremont-demo");
  await ready(page);
  await expect(page.getByRole("region", { name: /How this works in three steps/ })).toBeVisible();
  expect(seen).toEqual([]);
});

test("the outing sheet's map loads its workers and tiles", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "dashboard is desktop-first");
  const seen = await watch(page);
  await page.goto("/plan/fremont-demo", { waitUntil: "networkidle" });
  await ready(page);
  await page
    .getByRole("button", { name: /^Swap .* for another option/ })
    .first()
    .click();
  await expect(page.getByRole("dialog").locator(".maplibregl-map")).toBeVisible();
  await page.waitForTimeout(3000);
  expect(seen).toEqual([]);
});

test("every parents' screen, and an offline reload, run under the policy", async ({ page, context }, info) => {
  test.skip(info.project.name !== "mobile", "phone screens");
  const seen = await watch(page);
  for (const path of PARENTS) {
    await page.goto(path);
    await ready(page);
    await hasPolicy(page);
    for (const v of VIEWS) {
      await page.goto(`${path}?v=${v}`);
      await expect(page.locator(`main[data-view="${v}"]`)).toBeVisible();
    }
  }
  await page.goto(PARENTS[0]!);
  await ready(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await ready(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("main[data-view]")).toBeVisible();
  await hasPolicy(page);
  await context.setOffline(false);
  expect(seen).toEqual([]);
});
