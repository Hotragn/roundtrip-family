import { join } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * The themed scroll indicators (docs/brand.md): on a precise pointer the rail track replaces the
 * scrollbar, follows the page, can be dragged and clicked; touch screens get the progress line.
 */
const OUT = join(__dirname, "../../../docs/screenshots");

test("the rail track follows the page and scrolls it", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "precise pointer only");
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/plan/fremont-demo");
  await expect(page.locator("main h1").first()).toBeVisible();
  const track = page.locator("[aria-hidden='true'].fixed").filter({ has: page.locator("img[src*='train-front']") });
  await expect(track).toBeVisible();
  const handle = track.locator("img[src*='train-front']").locator("..");
  const max = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  expect(max).toBeGreaterThan(100);

  // Scrolling moves the handle down the track.
  const top0 = (await handle.boundingBox())!.y;
  await page.evaluate((m) => window.scrollTo(0, m), max);
  await expect.poll(async () => (await handle.boundingBox())!.y).toBeGreaterThan(top0 + 300);
  await page.screenshot({ path: join(OUT, "plan-fremont-scroll-track.jpg"), type: "jpeg", quality: 85 });

  // Dragging the handle back up scrolls the page back up.
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, 40, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(max / 4);

  // A click low on the track jumps down.
  const t = (await track.boundingBox())!;
  await page.mouse.click(t.x + t.width / 2, t.y + t.height - 20);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(max * 0.7);

  // The scrollbar is hidden while the themed track stands in for it.
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarWidth)).toBe("none");
});

test("touch screens keep native scrolling with a progress line", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "touch only");
  await page.goto("/plan/fremont-demo");
  await expect(page.locator("main h1").first()).toBeVisible();
  await expect(page.locator("img[src*='train-front']").first()).toBeHidden();
  const line = page.locator(".fixed.inset-x-0.top-0 > div");
  await expect(line).toHaveCount(1);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => line.evaluate((el) => getComputedStyle(el).transform)).not.toBe("matrix(0, 0, 0, 1, 0, 0)");
});
