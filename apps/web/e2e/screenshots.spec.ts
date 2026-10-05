import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "@playwright/test";

/**
 * Full-page screenshots of every screen in both color schemes, saved to docs/screenshots/ for
 * review against docs/brand.md. Run: pnpm --filter @roundtrip/web e2e:screens
 */
const OUT = join(__dirname, "../../../docs/screenshots");
mkdirSync(OUT, { recursive: true });

const PAGES: Array<{ name: string; path: string }> = (process.env.SCREENS ?? "design:/design")
  .split(",")
  .map((pair) => {
    const [name, path] = pair.split(":") as [string, string];
    return { name, path };
  });

for (const scheme of ["light", "dark"] as const) {
  for (const page of PAGES) {
    test(`${page.name} (${scheme})`, async ({ browser }, info) => {
      const context = await browser.newContext({
        ...info.project.use,
        colorScheme: scheme,
        reducedMotion: "reduce",
      });
      const tab = await context.newPage();
      await tab.goto(page.path, { waitUntil: "networkidle" });
      await tab.evaluate(() => document.fonts.ready);
      await tab.screenshot({
        path: join(OUT, `${page.name}-${info.project.name}-${scheme}.png`),
        fullPage: true,
      });
      await context.close();
    });
  }
}
