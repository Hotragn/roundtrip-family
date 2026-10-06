import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

/**
 * WCAG 2.2 AA checks with axe on every parents' app screen, for a parent from each household,
 * in light and dark mode (the parents' app keeps its light palette; this proves text stays
 * readable either way).
 */
const PARENT_PAGES = [
  { key: "fremont-mother", path: "/parents/fremont-demo/p_sarala" },
  { key: "fremont-father", path: "/parents/fremont-demo/p_venkat" },
  { key: "munich-mother", path: "/parents/munich-demo/p_kamala" },
];
const VIEWS = ["today", "directions", "driver", "practice", "lost", "how", "diary", "book", "friend", "join"];

async function violations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  return results.violations.map(
    (x) =>
      `${x.id} (${x.impact}): ${x.nodes
        .map((n) => n.target.join(" "))
        .slice(0, 3)
        .join(", ")}`,
  );
}

for (const scheme of ["light", "dark"] as const) {
  for (const who of PARENT_PAGES) {
    test(`parents' app has no WCAG AA violations: ${who.key} (${scheme})`, async ({ page }, info) => {
      test.skip(info.project.name !== "mobile", "phone screens");
      // Ten full axe scans in one test: more than the default 90 s on a slow machine.
      test.setTimeout(180_000);
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: scheme });
      for (const v of VIEWS) {
        await page.goto(`${who.path}${v === "today" ? "" : `?v=${v}`}`);
        await expect(page.locator(`main[data-view="${v}"]`)).toBeVisible();
        expect(await violations(page), `${who.key} ${v} ${scheme}`).toEqual([]);
      }
    });
  }

  test(`the start screen has no WCAG AA violations (${scheme})`, async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "phone screens");
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: scheme });
    await page.goto("/parents?v=start");
    await expect(page.getByRole("button", { name: /Fremont, California/ })).toBeVisible();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    expect(await violations(page)).toEqual([]);
  });
}
