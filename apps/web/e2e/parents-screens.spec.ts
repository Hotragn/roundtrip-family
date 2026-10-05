import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Screenshots of every parents' app screen for review against docs/brand.md, saved to
 * docs/screenshots/. Run: pnpm --filter @roundtrip/web exec playwright test e2e/parents-screens.spec.ts --project=mobile
 */
const OUT = join(__dirname, "../../../docs/screenshots");
mkdirSync(OUT, { recursive: true });

// 1.5x keeps text crisp enough for review and the files small enough for the repo.
test.use({ deviceScaleFactor: 1.5 });

const PARENT_PAGES = [
  { key: "fremont-mother", path: "/parents/fremont-demo/p_sarala" },
  { key: "fremont-father", path: "/parents/fremont-demo/p_venkat" },
  { key: "munich-mother", path: "/parents/munich-demo/p_kamala" },
] as const;

const views = ["today", "directions", "driver", "practice", "lost", "how", "diary", "book", "friend", "join"] as const;

for (const who of PARENT_PAGES) {
  test(`parents' app screens: ${who.key}`, async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "phone screens only");
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const v of views) {
      await page.goto(`${who.path}${v === "today" ? "" : `?v=${v}`}`);
      await expect(page.locator(`main[data-view="${v}"]`)).toBeVisible();
      // Lazy images below the fold load for the full-page shot; each gets at most 8 s.
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
          [...document.images].map((img) => {
            img.loading = "eager";
            if (img.complete) return null;
            return new Promise((r) => {
              img.addEventListener("load", r, { once: true });
              img.addEventListener("error", r, { once: true });
              setTimeout(r, 8000);
            });
          }),
        );
      });
      if ((await page.locator("main").innerText()).trim().length === 0) continue;
      await page.screenshot({ path: join(OUT, `parents-${who.key}-${v}.jpg`), fullPage: true, type: "jpeg", quality: 85 });
    }
  });
}

test("parents' start screen", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "phone screens only");
  await page.goto("/parents?v=start");
  await expect(page.getByRole("button", { name: /Sarala/ })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(OUT, "parents-start.jpg"), fullPage: true, type: "jpeg", quality: 85 });
});
