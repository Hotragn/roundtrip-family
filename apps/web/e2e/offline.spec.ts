import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import te from "../messages/te.json";

/**
 * The parents' app with no connection. The test starts the production server itself, visits
 * once "on home Wi-Fi", then stops the server and turns the network off: every screen must
 * still open from the phone, and an "I'm home" tapped offline must reach the family once the
 * phone is back online. Needs `pnpm build` first (the service worker is built with the app).
 */
const SERVER = join(__dirname, "../.next/standalone/apps/web/server.js");
const PORT = 3101;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const PARENT = "/parents/fremont-demo/p_sarala";

async function startServer(): Promise<ChildProcess> {
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(PORT), HOSTNAME: "127.0.0.1", NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("The server did not start in 60 s")), 60_000);
    child.stdout?.on("data", (d) => {
      if (/Ready|started server|Local:/i.test(String(d))) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once("exit", (code) => reject(new Error(`The server exited with ${code}`)));
  });
  return child;
}

async function stop(child: ChildProcess | null) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill();
  await once(child, "exit");
}

const cacheCounts = (page: Page) =>
  page.evaluate(async () => {
    const count = async (name: string) =>
      (await caches.has(name)) ? (await (await caches.open(name)).keys()).length : 0;
    return {
      page: await count("parents-page"),
      scripts: await count("next-static"),
      photos: await count("photos"),
      week: await count("parents-week"),
    };
  });

const queuedCheckins = (page: Page) =>
  page.evaluate(async () => {
    const req = indexedDB.open("roundtrip-parents");
    const db = await new Promise<IDBDatabase>((r) => {
      req.onsuccess = () => r(req.result);
    });
    const all = db.transaction("outbox").objectStore("outbox").getAll();
    return new Promise<number>((r) => {
      all.onsuccess = () => r(all.result.filter((i: { kind: string }) => i.kind === "checkin").length);
    });
  });

const SCREENS: Array<{ view: string; text: string }> = [
  { view: "", text: te.Parents.greetingMother },
  { view: "directions", text: te.Directions.title },
  { view: "driver", text: "Please tell me when we reach:" },
  { view: "practice", text: te.Practice.title },
  { view: "lost", text: "Please help me." },
  { view: "how", text: te.How.title },
  { view: "diary", text: te.Diary.title },
  { view: "book", text: te.Book.title },
  { view: "friend", text: te.Friend.title },
  { view: "join", text: te.Join.title },
];

test.describe("parents' app with no connection", () => {
  test.skip(!existsSync(SERVER), "needs `pnpm --filter @roundtrip/web build` first");
  let server: ChildProcess | null = null;
  test.afterEach(async () => stop(server));

  test("every screen opens offline after one visit on home Wi-Fi", async ({ page, context }, info) => {
    test.skip(info.project.name !== "mobile", "phone only");
    test.setTimeout(180_000);
    server = await startServer();

    // On home Wi-Fi: choose the phone's owner; the service worker installs and warms its caches.
    await page.goto(`${ORIGIN}/parents?v=start`);
    await page.getByRole("button", { name: /Fremont, California/ }).click();
    await page.getByRole("button", { name: new RegExp(te.Parents.mother) }).click();
    await page.waitForURL(`${ORIGIN}${PARENT}`);
    await expect(page.locator("h1")).toHaveText(te.Parents.greetingMother);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 30_000 });
    await expect
      .poll(
        async () => {
          const c = await cacheCounts(page);
          return c.page >= 2 && c.scripts >= 3;
        },
        { timeout: 45_000 },
      )
      .toBe(true);
    // Place photos come from Google's image server, which sometimes refuses automated browsers.
    // When it served them, they must open offline too.
    const photosCached = await expect
      .poll(async () => (await cacheCounts(page)).photos, { timeout: 15_000 })
      .toBeGreaterThan(0)
      .then(() => true)
      .catch(() => false);
    if (!photosCached)
      test.info().annotations.push({ type: "note", description: "Google's image server sent no photos in this run" });

    // Out of the house: no server, no network. Each screen opens fresh, as from the home screen.
    await stop(server);
    await context.setOffline(true);
    for (const s of SCREENS) {
      const tab = await context.newPage();
      await tab.goto(`${ORIGIN}${PARENT}${s.view ? `?v=${s.view}` : ""}`);
      await expect(tab.locator(`main[data-view="${s.view || "today"}"]`)).toBeVisible();
      await expect(tab.getByText(s.text).first(), `${s.view || "today"} opens offline`).toBeVisible();
      expect(await tab.evaluate(() => !navigator.onLine && Boolean(navigator.serviceWorker.controller))).toBe(true);
      await expect(tab.getByRole("status").filter({ hasText: te.Parents.offline })).toBeVisible();
      await tab.close();
    }

    // The installed app starts at /parents: offline, it still opens this parent's page.
    await page.goto(`${ORIGIN}/parents`);
    await page.waitForURL(`${ORIGIN}${PARENT}`);

    // Moving between screens with taps stays on the phone too.
    await expect(page.locator("h1")).toHaveText(te.Parents.greetingMother);
    await page.getByRole("button", { name: te.Parents.diary }).click();
    await expect(page.getByRole("heading", { name: te.Diary.title })).toBeVisible();
    await page.getByRole("button", { name: te.Parents.imLost }).click();
    await expect(page.getByText("Please help me.")).toBeVisible();
    await page.getByRole("button", { name: te.Parents.back_to_today }).click();
    await page.getByRole("button", { name: te.Parents.showDriver }).click();
    await expect(page.getByText("Please tell me when we reach:")).toBeVisible();
    await page.getByRole("button", { name: te.Parents.back_to_today }).click();

    // The ticket's photo comes from the phone's cache too.
    if (photosCached) {
      const photo = page.locator("article img").first();
      await expect(photo).toBeVisible();
      expect(await photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    }

    // "I'm home" with no connection: the stub tears, the check-in waits in the outbox.
    await page.getByRole("button", { name: te.Parents.imHome }).click();
    await expect(page.getByRole("article").getByText(te.Parents.stamp)).toBeVisible();
    expect(await queuedCheckins(page)).toBe(1);

    // Back on Wi-Fi: the outbox sends it.
    server = await startServer();
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect.poll(() => queuedCheckins(page), { timeout: 20_000 }).toBe(0);
    await expect
      .poll(() => page.evaluate(async () => (await (await fetch("/parents/api/checkin")).json()).records.length), {
        timeout: 20_000,
      })
      .toBeGreaterThan(0);
  });

  test("the parents' app ships no 3D, animation timeline or map libraries", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "phone only");
    server = await startServer();
    const scripts = new Set<string>();
    page.on("response", (r) => {
      if (r.request().resourceType() === "script" && r.url().startsWith(ORIGIN)) scripts.add(r.url());
    });
    await page.goto(`${ORIGIN}${PARENT}`);
    await expect(page.locator("h1")).toBeVisible();
    let bytes = 0;
    for (const url of scripts) {
      const body = await (await page.request.get(url)).text();
      bytes += body.length;
      expect(body, `${url} has no three.js`).not.toMatch(/THREE\.WebGLRenderer|WebGLRenderer\(|three\.module/);
      expect(body, `${url} has no MapLibre`).not.toMatch(/maplibre/i);
      expect(body, `${url} has no GSAP`).not.toMatch(/GreenSock|gsap\.com|_gsScope/);
    }
    test.info().annotations.push({
      type: "parents-js",
      description: `${scripts.size} scripts, ${Math.round(bytes / 1024)} KB uncompressed`,
    });
    console.log(`parents' app scripts: ${scripts.size} files, ${Math.round(bytes / 1024)} KB uncompressed`);
  });
});
