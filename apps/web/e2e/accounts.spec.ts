import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

/**
 * A real family: passkey sign-up and sign-in with Chrome's virtual authenticator (CDP
 * WebAuthn.addVirtualAuthenticator, https://chromedevtools.github.io/devtools-protocol/tot/WebAuthn/),
 * their own household, the phone link, access control, and deleting it all. WebAuthn needs a
 * domain name, so this runs on localhost even when E2E_BASE_URL says 127.0.0.1.
 */
test.skip(({ browserName }) => browserName !== "chromium", "The virtual authenticator is Chrome's");

const SETUP = {
  hostCountry: "US",
  localLanguage: "en",
  searchLocation: "Fremont, California",
  homeStop: "Mowry Ave & Fremont Blvd",
  parents: [
    {
      firstName: "Lakshmi",
      addressAs: "Amma",
      language: "te",
      readingSupport: "audio_first",
      maxWalkMinutes: 15,
      transitComfort: "with_company",
      bestStart: "09:00",
      bestEnd: "12:00",
      napStart: "",
      napEnd: "",
    },
  ],
  alone: [],
  trialRunDays: [],
  contactLabel: "Your child",
  contactPhone: "+1 510 555 0142",
  phonePlan: "wifi_only",
};

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

test("a family signs up with a passkey, sets up, signs back in and deletes everything", async ({
  page,
  browser,
  baseURL,
}, info) => {
  test.skip(info.project.name !== "desktop", "Once is enough");
  const origin = baseURL!.replace("127.0.0.1", "localhost");
  const violations: string[] = [];
  await page.addInitScript(() =>
    document.addEventListener("securitypolicyviolation", (e) => console.error(`CSP violation: ${e.violatedDirective}`)),
  );
  page.on("console", (m) => {
    if (/CSP violation|Content Security Policy|Refused to/i.test(m.text()))
      violations.push(`${page.url()}: ${m.text()}`);
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  await page.goto(`${origin}/account`);
  expect(await axe(page)).toEqual([]);
  await page.getByRole("button", { name: "Create our sign-in" }).click();
  await expect(page.getByText("You're signed in.")).toBeVisible();

  await page.getByRole("link", { name: "Set up your household" }).click();
  await expect(page.getByRole("heading", { name: "Set up your household" })).toBeVisible();
  expect(await axe(page)).toEqual([]);
  const saved = await page.request.post(`${origin}/api/household`, { data: SETUP });
  expect(saved.ok()).toBe(true);
  const { href } = (await saved.json()) as { href: string };
  expect(href).toMatch(/^\/plan\/fam-[a-f0-9]{12}$/);

  await page.goto(`${origin}${href}`);
  await expect(page.getByRole("heading", { name: "Your household" })).toBeVisible();
  expect(await axe(page)).toEqual([]);
  const link = (await page.locator("code").first().textContent())!;
  expect(link).toMatch(/\/parents\/k\/[A-Za-z0-9_-]{43}$/);
  // Reflows at 320 px without sideways scrolling.
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.setViewportSize({ width: 1280, height: 900 });

  // A visitor, and a parent's phone with its link.
  const other = await browser.newContext();
  const visitor = await other.newPage();
  expect((await visitor.goto(`${origin}${href}`))!.status()).toBe(404);
  expect((await visitor.request.get(`${origin}/api/household/${href.split("/").pop()}`)).status()).toBe(404);
  const slug = href.split("/").pop();
  expect((await visitor.goto(`${origin}/parents/${slug}/p_1`))!.status()).toBe(404);
  await visitor.goto(link.replace(/^https?:\/\/[^/]+/, origin));
  await expect(visitor).toHaveURL(new RegExp(`/parents/${slug}/p_1$`));
  await other.close();

  // Sign out, then back in with the same passkey.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in with a passkey" })).toBeVisible();
  expect((await page.goto(`${origin}${href}`))!.status()).toBe(404);
  await page.goto(`${origin}/account`);
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(page.getByRole("link", { name: "Open your household" })).toBeVisible();

  // Download, then delete.
  const download = await page.request.get(`${origin}/api/household/${slug}`);
  expect((await download.json()).household.parents[0].firstName).toBe("Lakshmi");
  await page.goto(`${origin}${href}`);
  await page.getByRole("button", { name: "Delete our household" }).click();
  await page.getByLabel("Type delete to confirm").fill("delete");
  await page.getByRole("button", { name: "Delete our household" }).click();
  await expect(page.getByRole("button", { name: "Create our sign-in" })).toBeVisible();
  expect((await page.goto(`${origin}${href}`))!.status()).toBe(404);
  expect(violations).toEqual([]);
});

test("the privacy policy and terms are reachable from the footer and accessible", async ({ page }) => {
  await page.goto("/privacy-policy");
  await expect(page.getByRole("heading", { name: "Privacy policy", level: 1 })).toBeVisible();
  await expect(page.getByText("not legal advice")).toBeVisible();
  expect(await axe(page)).toEqual([]);
  await page.getByRole("contentinfo").getByRole("link", { name: "Terms" }).click();
  await expect(page.getByRole("heading", { name: "Terms", level: 1 })).toBeVisible();
  expect(await axe(page)).toEqual([]);
});
