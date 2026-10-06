import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

/**
 * The landing page: accessibility in both color schemes, the still-image fallbacks (reduced
 * motion and no WebGL load no three.js at all), and screenshots for review against
 * docs/brand.md. Run: npx playwright test e2e/landing.spec.ts
 *
 * The still frame and the social card are made from the live scene by an opt-in test:
 * CAPTURE_SKY=1 npx playwright test e2e/landing.spec.ts -g "still frame" --project=desktop
 */
const SHOTS = join(__dirname, "../../../docs/screenshots");
const THREE_SIGNATURE = /THREE\.WebGLRenderer|WebGLRenderer\(|three\.module|WebGL3DRenderTarget/;

async function violations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  return results.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.nodes
        .map((n) => n.target.join(" "))
        .slice(0, 3)
        .join(", ")}`,
  );
}

/** Every script the page and its workers load, with its body, to look for three.js in it. */
function collectScripts(page: Page) {
  const scripts: Array<Promise<{ url: string; body: string }>> = [];
  page.context().on("response", (r) => {
    if (r.request().resourceType() === "script" || /\.js(\?|#|$)/.test(r.url()))
      scripts.push(
        r
          .text()
          .then((body) => ({ url: r.url(), body }))
          .catch(() => ({ url: r.url(), body: "" })),
      );
  });
  return async () => Promise.all(scripts);
}

const sky = (page: Page) => page.locator("[data-sky]");

/** The part of sharp's API the capture uses; sharp lives in the scripts package, not here. */
interface SharpImage {
  resize(width: number, height?: number, options?: { kernel?: string }): SharpImage;
  webp(options: { quality: number; effort?: number; smartSubsample?: boolean }): SharpImage;
  png(options?: { compressionLevel?: number; adaptiveFiltering?: boolean }): SharpImage;
  toFile(path: string): Promise<unknown>;
  toBuffer(): Promise<Buffer>;
}

for (const scheme of ["light", "dark"] as const) {
  test(`the landing page has no WCAG AA violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Weekdays out, safely home." })).toBeVisible();
    await expect(sky(page)).toHaveAttribute("data-sky", /ready|still/, { timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    expect(await violations(page), scheme).toEqual([]);
  });
}

test("with reduced motion the still is the whole sky, and three.js never loads", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const scripts = collectScripts(page);
  await page.goto("/", { waitUntil: "load" });
  await expect(sky(page)).toHaveAttribute("data-sky", "still");
  const still = page.locator('img[src*="/art/sky-still"]');
  await expect(still).toBeVisible();
  expect(await still.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  // Give an idle-time loader every chance to run before checking.
  await page.waitForTimeout(3000);
  await expect(page.locator("canvas")).toHaveCount(0);
  // three.js runs in the sky's worker: no worker, no three.js.
  expect(page.workers()).toHaveLength(0);
  for (const s of await scripts()) expect(s.body, `${s.url} has no three.js`).not.toMatch(THREE_SIGNATURE);
});

test("without WebGL the still shows and nothing fails", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    // biome-ignore lint/suspicious/noExplicitAny: the overloads of getContext don't narrow here
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: any[]) {
      if (/webgl/i.test(type)) return null;
      return original.call(this, type, ...rest);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const scripts = collectScripts(page);
  await page.goto("/", { waitUntil: "load" });
  await expect(sky(page)).toHaveAttribute("data-sky", "still");
  await expect(page.locator('img[src*="/art/sky-still"]')).toBeVisible();
  await page.waitForTimeout(3000);
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "See a week" }).first()).toBeVisible();
  expect(errors).toEqual([]);
  for (const s of await scripts()) expect(s.body, `${s.url} has no three.js`).not.toMatch(THREE_SIGNATURE);
});

test("the live sky fades in over the still and holds", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one device is enough");
  await page.goto("/");
  await expect(sky(page)).toHaveAttribute("data-sky", "ready", { timeout: 45_000 });
  await expect(page.locator("[data-sky] canvas")).toBeVisible();
  // The scene draws from a worker, off the page's main thread.
  expect(page.workers().length).toBeGreaterThan(0);
});

test.describe("screenshots", () => {
  test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

  for (const scheme of ["light", "dark"] as const) {
    test(`desktop (${scheme})`, async ({ page }, info) => {
      test.skip(info.project.name !== "desktop", "desktop project");
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/");
      await expect(sky(page)).toHaveAttribute("data-sky", /ready|still/, { timeout: 45_000 });
      // The climb takes about four seconds; then the view settles and stops drawing.
      await page.waitForTimeout(6000);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: join(SHOTS, `landing-desktop-${scheme}.jpg`), type: "jpeg", quality: 85 });
    });
  }

  test("mobile", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "mobile project");
    await page.goto("/");
    await expect(sky(page)).toHaveAttribute("data-sky", /ready|still/, { timeout: 45_000 });
    await page.waitForTimeout(6000);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(SHOTS, "landing-mobile.jpg"), type: "jpeg", quality: 85 });
  });
});

/**
 * Makes the still frames and the social card from the live scene, at full quality: no intro,
 * full-resolution clouds and many more steps, averaged over 16 frames. Writes
 * public/art/sky-still*.webp and app/opengraph-image.png with sharp from the scripts package.
 */
test.describe("still frame", () => {
  test.skip(!process.env.CAPTURE_SKY, "set CAPTURE_SKY=1 to remake the still frames");
  test.setTimeout(240_000);
  const art = join(__dirname, "../public/art");
  const sharp = createRequire(join(__dirname, "../../../scripts/package.json"))("sharp") as (
    input: Buffer,
  ) => SharpImage;

  async function capture(page: Page, width: number, height: number, dpr: number) {
    await page.setViewportSize({ width, height });
    await page.addInitScript((d) => {
      window.__roundtripSkyCapture = { dpr: d, steps: 160, cloudScale: 1 };
    }, dpr);
    await page.goto("/");
    await page.addStyleTag({ content: "main, header, [data-scroll-indicator] { visibility: hidden !important; }" });
    await expect(page.locator("[data-sky] canvas")).toHaveAttribute("data-still", "ready", { timeout: 120_000 });
    await page.waitForTimeout(500);
    return page.screenshot({ type: "png" });
  }

  test("capture the still frame and the social card", async ({ browser }) => {
    const shoot = async (width: number, height: number, dpr: number) => {
      const context = await browser.newContext({ deviceScaleFactor: dpr, viewport: { width, height } });
      const page = await context.newPage();
      const png = await capture(page, width, height, dpr);
      await context.close();
      return png;
    };
    const webp = (img: SharpImage, quality: number) => img.webp({ quality, effort: 6, smartSubsample: true });

    const wide = await shoot(1600, 900, 2);
    await webp(sharp(wide), 78).toFile(join(art, "sky-still@2x.webp"));
    await webp(sharp(wide).resize(1600, 900, { kernel: "lanczos3" }), 82).toFile(join(art, "sky-still.webp"));
    const tall = await shoot(400, 880, 2);
    await webp(sharp(tall).resize(800), 80).toFile(join(art, "sky-still-phone.webp"));

    // The social card: the same sky at 1200 x 630, with the logo and the headline on a white panel.
    const card = await shoot(1200, 630, 2);
    const sky = `data:image/png;base64,${(await sharp(card).resize(1200, 630).png().toBuffer()).toString("base64")}`;
    const font = readFileSync(join(__dirname, "../app/fonts/hind-600-latin.woff2")).toString("base64");
    const logo = readFileSync(join(__dirname, "../public/brand/roundtrip-logo.svg"), "utf8");
    const context = await browser.newContext({ deviceScaleFactor: 1, viewport: { width: 1200, height: 630 } });
    const page = await context.newPage();
    await page.setContent(`<!doctype html><html><head><style>
      @font-face { font-family: Hind; font-weight: 600; src: url(data:font/woff2;base64,${font}) format("woff2"); }
      html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
      body { background: #fbfcfe url(${sky}) center / cover no-repeat; font-family: Hind, sans-serif; }
      .panel { position: absolute; left: 64px; top: 64px; bottom: 64px; width: 620px; box-sizing: border-box;
        padding: 52px 56px; border-radius: 20px; background: rgba(255, 255, 255, 0.97);
        box-shadow: 0 1px 2px rgba(31, 42, 68, 0.08), 0 6px 16px rgba(31, 42, 68, 0.06);
        display: flex; flex-direction: column; justify-content: space-between; }
      .logo svg { height: 44px; width: auto; display: block; }
      h1 { margin: 0; color: #1f2a44; font-weight: 600; font-size: 72px; line-height: 1.04; letter-spacing: -0.03em; }
    </style></head><body><div class="panel"><div class="logo">${logo}</div>
      <h1>Weekdays out,<br>safely home.</h1></div></body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const og = await page.screenshot({ type: "png" });
    await context.close();
    await sharp(og)
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(join(__dirname, "../app/opengraph-image.png"));
  });
});
