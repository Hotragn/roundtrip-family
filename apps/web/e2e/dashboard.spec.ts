import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { ready } from "./ready";

/**
 * The dashboard: WCAG 2.2 AA on every section for both households in light and dark, and the
 * week board's real flow (approve, swap for another option, move to a free day, refuse a day
 * they aren't free or a day the place is shut), kept in the visitor's own session.
 */

const SECTIONS = ["", "/their-week", "/shared", "/people", "/privacy", "/safety", "/languages", "/setup"];

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

test("no section scrolls sideways on a 320 px phone, for either household", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one run is enough; the width is set here");
  // 320 CSS px is WCAG's reflow width (1.4.10). Wide tables and the week board scroll in their
  // own boxes; the page itself never does. The widest case: a first visit (the guide shows) in
  // the fallback font, which a slow first load keeps since the fonts are optional.
  await page.addInitScript(() => localStorage.removeItem("roundtrip:guide-dismissed"));
  await page.route("**/*.woff2", (route) => route.abort());
  await page.setViewportSize({ width: 320, height: 640 });
  const wide: string[] = [];
  for (const household of ["fremont-demo", "munich-demo"]) {
    for (const s of SECTIONS) {
      await page.goto(`/plan/${household}${s}`);
      await ready(page);
      const [scroll, client] = await page.evaluate(() => [
        document.documentElement.scrollWidth,
        document.documentElement.clientWidth,
      ]);
      if (scroll > client) wide.push(`/plan/${household}${s}: ${scroll} px`);
    }
  }
  expect(wide).toEqual([]);
});

test("a first visit shows the three-step guide, and Got it keeps it closed", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "dashboard is desktop-first");
  await page.goto("/plan/fremont-demo");
  await ready(page);
  const guide = page.getByRole("region", { name: /How this works in three steps/ });
  await expect(guide).toBeVisible();
  await guide.getByRole("button", { name: "Got it" }).click();
  await expect(guide).toBeHidden();
  await page.reload();
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  await expect(page.getByRole("region", { name: /How this works in three steps/ })).toHaveCount(0);
});

// The other dashboard tests start as a returning visitor, with the guide already closed.
test.beforeEach(async ({ page }, info) => {
  if (info.title.startsWith("a first visit")) return;
  await page.addInitScript(() => {
    try {
      localStorage.setItem("roundtrip:guide-dismissed", "1");
    } catch {}
  });
});

test("approve, swap and move on the week board", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "drag and drop with a mouse");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/plan/fremont-demo", { waitUntil: "networkidle" });
  await ready(page);
  await expect(page.getByRole("heading", { name: "This week", level: 1 })).toBeVisible();
  // The header's Approved tile.
  const tally = page.locator("dt", { hasText: /^Approved$/ }).locator("xpath=following-sibling::dd");
  await expect(tally).toHaveText("3");

  // Approve the one still to decide: the ticket is already on her phone.
  const park = page.getByRole("article", { name: /^Central Park/ });
  await park.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("The ticket is on Sarala's phone now.")).toBeVisible();
  await expect(tally).toHaveText("4");

  // Take it off again, then swap it for another option on the same day.
  await park.getByRole("button", { name: "Take Central Park off their week" }).click();
  await expect(tally).toHaveText("3");
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
  await page.goto("/plan/fremont-demo", { waitUntil: "networkidle" });
  await ready(page);
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

test("only diary entries a parent shares reach Shared with you, and unsharing takes them back", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "dashboard and a phone in one session");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const shared = "గుంటూరు నుంచి వచ్చిన లక్ష్మి గారు"; // d_sarala_01, shared in the demo data
  const secret = "పద్మ అక్కకి ఫోన్ చేశాను"; // d_sarala_02, private
  const api = async () => JSON.stringify(await (await page.request.get("/plan/api/diary/fremont-demo")).json());

  await page.goto("/plan/fremont-demo/shared", { waitUntil: "networkidle" });
  await ready(page);
  await expect(page.getByText(shared, { exact: false }).first()).toBeVisible();
  await expect(page.getByText(secret, { exact: false })).toHaveCount(0);
  expect(await api()).not.toContain(secret);

  // On Sarala's phone: share the private entry, then take it back.
  const phone = await page.context().newPage();
  await phone.goto("/parents/fremont-demo/p_sarala?v=diary", { waitUntil: "networkidle" });
  const entry = phone.getByRole("listitem").filter({ hasText: secret });
  await entry.getByRole("button", { name: "పిల్లలతో పంచుకోండి" }).click();
  await expect.poll(api, { timeout: 15_000 }).toContain(secret);
  await page.reload();
  await expect(page.getByText(secret, { exact: false }).first()).toBeVisible();

  await entry.getByRole("button", { name: "పంచుకోవడం ఆపండి" }).click();
  await expect.poll(api, { timeout: 15_000 }).not.toContain(secret);

  // A new entry written on the phone stays private until shared.
  const mine = "ఈ రోజు Central Park లో బాతులను చూశాను.";
  await phone.getByRole("textbox").fill(mine);
  await phone.getByRole("button", { name: "దాచండి" }).click();
  await expect(phone.getByRole("listitem").filter({ hasText: mine })).toBeVisible();
  await page.waitForTimeout(1000);
  expect(await api()).not.toContain(mine);
  await phone.getByRole("listitem").filter({ hasText: mine }).getByRole("button", { name: "పిల్లలతో పంచుకోండి" }).click();
  await expect.poll(api, { timeout: 15_000 }).toContain(mine);
});

test("a move to a day the place is shut is refused, in Munich", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "drag and drop with a mouse");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/plan/munich-demo", { waitUntil: "networkidle" });
  await ready(page);
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
