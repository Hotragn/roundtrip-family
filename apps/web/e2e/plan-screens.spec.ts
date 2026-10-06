import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";

/**
 * Screenshots of the dashboard for review against docs/brand.md, saved to docs/screenshots/.
 * Run: npx playwright test e2e/plan-screens.spec.ts --project=desktop
 */
const OUT = join(__dirname, "../../../docs/screenshots");
mkdirSync(OUT, { recursive: true });
test.use({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });

const SECTIONS = (process.env.PLAN_SECTIONS ?? "week").split(",");
const PATHS: Record<string, string> = {
  week: "",
  "their-week": "/their-week",
  people: "/people",
  privacy: "/privacy",
  safety: "/safety",
  languages: "/languages",
  setup: "/setup",
};

async function settle(page: Page) {
  // Fixed scroll indicators would be drawn once mid-page in a full-page capture.
  await page.addStyleTag({ content: "[data-scroll-indicator]{display:none!important}" });
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
}

for (const scheme of ["light", "dark"] as const) {
  for (const household of ["fremont-demo", "munich-demo"]) {
    for (const section of SECTIONS) {
      test(`plan ${household} ${section} (${scheme})`, async ({ page }, info) => {
        test.skip(info.project.name !== "desktop", "desktop layout");
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
        await page.goto(`/plan/${household}${PATHS[section] ?? ""}`);
        await expect(page.locator("main h1").first()).toBeVisible();
        await settle(page);
        const name = `plan-${household.replace("-demo", "")}-${section}-${scheme}`;
        await page.screenshot({ path: join(OUT, `${name}.jpg`), fullPage: true, type: "jpeg", quality: 85 });
        if (section === "setup" && scheme === "light") {
          await page.getByRole("button", { name: "Next" }).click();
          await expect(page.getByRole("heading", { name: "Your parents" })).toBeVisible();
          await settle(page);
          await page.screenshot({
            path: join(OUT, `${name.replace("-light", "")}-parents.jpg`),
            fullPage: true,
            type: "jpeg",
            quality: 85,
          });
        }
        if (section === "week" && scheme === "light") {
          await page
            .getByRole("button", { name: /^Open / })
            .first()
            .click();
          await expect(page.getByRole("dialog")).toBeVisible();
          await page.waitForTimeout(2500); // the map's tiles
          await settle(page);
          await page.screenshot({
            path: join(OUT, `${name.replace("-light", "")}-detail.jpg`),
            type: "jpeg",
            quality: 85,
          });
        }
      });
    }
  }
}
