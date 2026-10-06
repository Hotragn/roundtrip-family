import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

/**
 * The dashboard: WCAG 2.2 AA on every section for both households in light and dark, and the
 * week board's real flow (approve, swap for another option, move to a free day, refuse a day
 * they aren't free or a day the place is shut), kept in the visitor's own session.
 */

const SECTIONS = ["", "/their-week", "/people", "/privacy", "/safety", "/languages", "/setup"];

async function violations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    // MapLibre's canvas and controls are checked by its own project; the sheet keeps a text route.
    .exclude(".maplibregl-map")
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
  for (const household of ["fremont-demo", "munich-demo"]) {
    test(`dashboard has no WCAG AA violations: ${household} (${scheme})`, async ({ page }, info) => {
      test.skip(info.project.name !== "desktop", "desktop layout");
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: scheme });
      for (const s of SECTIONS) {
        await page.goto(`/plan/${household}${s}`);
        await expect(page.locator("main h1").first()).toBeVisible();
        expect(await violations(page), `${household}${s} ${scheme}`).toEqual([]);
      }
    });
  }
}

test("approve, swap and move on the week board", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "drag and drop with a mouse");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/plan/fremont-demo");
  await expect(page.getByRole("heading", { name: "This week", level: 1 })).toBeVisible();
  const tally = page.getByText(/approved ·/);
  await expect(tally).toContainText("3 approved");

  // Approve the one still to decide: the ticket is already on her phone.
  const park = page.getByRole("article", { name: /^Central Park/ });
  await park.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("The ticket is on Sarala's phone now.")).toBeVisible();
  await expect(tally).toContainText("4 approved");

  // Take it off again, then swap it for another option on the same day.
  await park.getByRole("button", { name: "Take Central Park off their week" }).click();
  await expect(tally).toContainText("3 approved");
  await park.getByRole("button", { name: "Swap Central Park for another option" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: /Other options for/ })).toBeVisible();
  const option = sheet
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: "Use this" }) })
    .first();
  const optionTitle = (await option.locator("p").first().textContent())?.trim() ?? "";
  await option.getByRole("button", { name: "Use this" }).click();
  await expect(page.getByText(`Swapped in ${optionTitle}`)).toBeVisible();
  await expect(sheet.getByRole("heading", { name: optionTitle })).toBeVisible();
  await sheet.getByRole("button", { name: /^Back to Central Park/ }).click();
  await expect(page.getByText("Back to the planner's first choice")).toBeVisible();
  await page.keyboard.press("Escape");

  // Drag the market to Tuesday: they aren't on their own then, so it stays.
  const market = page.getByRole("article", { name: /^Indian Market/ });
  const grip = market.getByRole("button", { name: "Move Indian Market to another day" });
  const tuesday = page.getByRole("region", { name: /^Tuesday/ });
  await drag(page, grip, tuesday);
  await expect(page.getByText("They aren't on their own on Tuesday")).toBeVisible();

  // Drag it to Friday, a day they're free and the market is open: it moves.
  const friday = page.getByRole("region", { name: /^Friday/ });
  await drag(page, grip, friday);
  await expect(page.getByText("Moved Indian Market to Friday")).toBeVisible();
  await expect(friday.getByRole("article", { name: /^Indian Market/ })).toBeVisible();

  // The change is the visitor's: a reload keeps it, from the session.
  await page.reload();
  await expect(
    page.getByRole("region", { name: /^Friday/ }).getByRole("article", { name: /^Indian Market/ }),
  ).toBeVisible();
});

test("an outing approved on the dashboard is on the parent's phone, on the day it was moved to", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "drag and drop with a mouse");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/plan/fremont-demo");
  const park = page.getByRole("article", { name: /^Central Park/ });
  await park.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("The ticket is on Sarala's phone now.")).toBeVisible();
  // Before: the seeded week doesn't have it on her phone.
  const phone = await page.context().newPage();
  await phone.goto("/parents/fremont-demo/p_venkat");
  await expect(phone.getByText("Central Park")).toHaveCount(0);
  await phone.goto("/parents/fremont-demo/p_sarala");
  await expect(phone.getByText("Central Park").first()).toBeVisible();
  // Move the market Venkat walks to onto Friday; his phone follows, with the day named in the card.
  await page.bringToFront();
  const market = page.getByRole("article", { name: /^Indian Market/ });
  await drag(
    page,
    market.getByRole("button", { name: "Move Indian Market to another day" }),
    page.getByRole("region", { name: /^Friday/ }),
  );
  await expect(page.getByText("Moved Indian Market to Friday")).toBeVisible();
  await phone.goto("/parents/fremont-demo/p_venkat");
  // His card for the market now names Friday (the page header still shows today, Monday).
  await expect(phone.getByText("శుక్రవారం").first()).toBeVisible();
});

test("a move to a day the place is shut is refused, in Munich", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "drag and drop with a mouse");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/plan/munich-demo");
  // The Ramersdorf library is closed on Mondays.
  const library = page.getByRole("article", { name: /^Münchner Stadtbibliothek Ramersdorf/ });
  await drag(
    page,
    library.getByRole("button", { name: /^Move Münchner Stadtbibliothek Ramersdorf/ }),
    page.getByRole("region", { name: /^Monday/ }),
  );
  await expect(
    page.getByText("Münchner Stadtbibliothek Ramersdorf is closed on Mondays.", { exact: false }),
  ).toBeVisible();
});

/** Drags sideways at the grip's height: day columns share the row's height, so the target is under it. */
async function drag(page: Page, from: ReturnType<Page["locator"]>, to: ReturnType<Page["locator"]>) {
  await from.scrollIntoViewIfNeeded();
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  const y = Math.min(Math.max(a.y + a.height / 2, b.y + 12), b.y + b.height - 12);
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  // dnd-kit starts a drag after 6 px of movement.
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, y, { steps: 12 });
  await page.mouse.up();
}
