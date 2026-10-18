import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * The hosted safety timer end to end: a demo phone starts a trip, no "I'm home" comes, and the
 * dashboard raises the alert at the top and on the outing in Their week; "I'm home" clears it.
 * The server needs SAFETY_TEST_HOOKS=1 for the few-seconds test timer (never honored on Render).
 */

interface Outing {
  id: string;
  status: string;
  parentIds: string[];
  withAdultChild: boolean;
}

test("a missed check-in raises the dashboard alert, and I'm home clears it", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one layout is enough");
  await page.goto("/plan/fremont-demo/their-week");
  const week = (await (await page.request.get("/parents/api/week/fremont-demo")).json()) as {
    outings: Outing[];
    parents: Array<{ id: string; firstName: string }>;
  };
  const outing = week.outings.find((o) => o.status === "approved" && !o.withAdultChild && o.parentIds.length === 1);
  expect(outing).toBeTruthy();
  const parentId = outing!.parentIds[0]!;
  const first = week.parents.find((p) => p.id === parentId)!.firstName;

  const res = await page.request.post("/parents/api/leaving", {
    data: { id: "e2e-leaving", createdAt: new Date().toISOString(), outingId: outing!.id, parentId, testSeconds: 1 },
  });
  expect(res.ok()).toBe(true);
  const { timer } = (await res.json()) as { timer: boolean };
  test.skip(!timer, "the server runs Temporal's timers instead");

  const banner = page
    .getByRole("alert")
    .filter({ hasText: `${first} isn't home yet` })
    .first();
  await page.waitForTimeout(2500);
  await page.reload();
  await expect(banner).toBeVisible();
  await expect(page.getByRole("link", { name: "Open their week" })).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  // The alert fired once; "I'm home" from the phone clears it.
  const home = await page.request.post("/parents/api/checkin", {
    data: { id: "e2e-home", createdAt: new Date().toISOString(), outingId: outing!.id, parentId, state: "home" },
  });
  expect(home.ok()).toBe(true);
  await page.reload();
  await expect(page.getByText(`${first} isn't home yet`)).toHaveCount(0);
});
