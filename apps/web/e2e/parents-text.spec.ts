import { expect, type Page, test } from "@playwright/test";
import te from "../messages/te.json";
import { ready } from "./ready";

/**
 * Telugu text, tap targets and reflow on every parents' app screen, at normal size and with the
 * page scaled to 200%.
 *
 * How 200% is emulated: `zoom: 2` on the html element at a 375 x 812 phone viewport. Chrome on
 * Android applies the phone's font size setting as page zoom, which lays the page out at half the
 * width with everything twice as large; CSS zoom on the root gives the same layout. The fixes use
 * intrinsic sizing and container queries, so they hold under real page zoom too.
 *
 * What fails:
 * - Clipped or colliding glyphs. Each akshara's ink (its real glyph bounds from canvas
 *   measureText, placed on the baseline the browser laid out) must stay inside every ancestor
 *   that clips overflow, and must not overlap the ink of text on another line. That catches
 *   vowel signs and below-base conjuncts cut off by overflow, and line heights too tight for
 *   Telugu.
 * - Telugu cut short with an ellipsis or a line clamp.
 * - Horizontal page scroll, and content left hidden under the fixed bottom bar.
 * - Any button, link or control smaller than 56 x 56 CSS px (docs/brand.md asks 56 for the
 *   parents' app, above WCAG's 44), or overlapping another, or hidden under the bottom bar when
 *   it has keyboard focus. Checked at normal size; at 200% everything is twice as large.
 */
const PARENT_PAGES = [
  { key: "fremont-mother", path: "/parents/fremont-demo/p_sarala" },
  { key: "fremont-father", path: "/parents/fremont-demo/p_venkat" },
  { key: "munich-mother", path: "/parents/munich-demo/p_kamala" },
  { key: "munich-father", path: "/parents/munich-demo/p_raghu" },
];
const VIEWS = ["today", "directions", "driver", "practice", "lost", "how", "diary", "book", "friend", "join"];
const SCALES = [1, 2];
/** docs/brand.md, Layout: tap targets at least 56 px. WCAG 2.5.5 asks 44 and 2.5.8 asks 24. */
const MIN_TARGET = 56;

test.use({ viewport: { width: 375, height: 812 } });

/** Runs in the page; returns one line per problem found. */
function audit({ minTarget, checkTargets }: { minTarget: number; checkTargets: boolean }): string[] {
  const TE = /[ఀ-౿]/;
  const problems: string[] = [];
  const name = (el: Element) => {
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    return `<${el.tagName.toLowerCase()}> "${text}"`;
  };
  const visible = (el: Element) => {
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && el.getClientRects().length > 0 && !el.closest(".sr-only");
  };
  const zoomOf = (el: Element) => (el as Element & { currentCSSZoom?: number }).currentCSSZoom ?? 1;
  const fixedRoot = (el: Element) => {
    for (let a: Element | null = el; a; a = a.parentElement) {
      if (getComputedStyle(a).position === "fixed") return a;
    }
    return null;
  };
  const clippers = (el: Element) => {
    const out: Element[] = [];
    for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowX !== "visible" || cs.overflowY !== "visible") out.push(a);
    }
    // The element itself clips its own text when it hides overflow.
    const own = getComputedStyle(el);
    if (own.overflowX !== "visible" || own.overflowY !== "visible") out.unshift(el);
    return out;
  };

  // 1. Reflow: no horizontal page scroll.
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 1)
    problems.push(`page scrolls sideways: ${de.scrollWidth} > ${de.clientWidth}`);

  // 2. Ink boxes for every grapheme cluster of visible text.
  const canvas = document.createElement("canvas").getContext("2d");
  if (!canvas) return ["no canvas"];
  type Box = {
    top: number;
    bottom: number;
    left: number;
    right: number;
    line: number;
    te: boolean;
    el: Element;
    word: string;
    root: Element | null;
  };
  const boxes: Box[] = [];
  // Grapheme clusters keep a conjunct with its vowel signs, so each box is one akshara's ink.
  const seg = new Intl.Segmenter("te", { granularity: "grapheme" });
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  const flagged = new Set<Element>();
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const el = node.parentElement;
    if (!el || !node.data.trim() || !visible(el) || el.closest("script, style, noscript")) continue;
    const cs = getComputedStyle(el);
    if (TE.test(node.data) && !flagged.has(el)) {
      for (let a: Element | null = el; a && a !== document.body; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (s.textOverflow === "ellipsis" || (s.webkitLineClamp && s.webkitLineClamp !== "none")) {
          problems.push(`Telugu cut short by ellipsis or line clamp: ${name(a)}`);
          flagged.add(el);
          break;
        }
      }
    }
    canvas.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const z = zoomOf(el);
    const root = fixedRoot(el);
    for (const s of seg.segment(node.data)) {
      const word = s.segment;
      if (!word.trim()) continue;
      range.setStart(node, s.index);
      range.setEnd(node, s.index + word.length);
      const m = canvas.measureText(word);
      const area = m.fontBoundingBoxAscent + m.fontBoundingBoxDescent;
      for (const r of range.getClientRects()) {
        if (r.width === 0 || r.height === 0) continue;
        // The rect is the font's content area; the baseline sits at the font ascent within it.
        const baseline = r.top + (r.height * m.fontBoundingBoxAscent) / area;
        boxes.push({
          top: baseline - m.actualBoundingBoxAscent * z,
          bottom: baseline + m.actualBoundingBoxDescent * z,
          left: r.left,
          right: r.right,
          line: Math.round(r.top),
          te: TE.test(word),
          el,
          word,
          root,
        });
      }
    }
  }

  // 2a. Ink cut off by an ancestor that clips overflow.
  const clipped = new Set<Element>();
  for (const b of boxes) {
    if (!b.te || clipped.has(b.el)) continue;
    for (const c of clippers(b.el)) {
      const r = c.getBoundingClientRect();
      const z = zoomOf(c);
      const top = r.top + c.clientTop * z;
      const left = r.left + c.clientLeft * z;
      const bottom = top + c.clientHeight * z;
      const right = left + c.clientWidth * z;
      if (b.top < top - 0.5 || b.bottom > bottom + 0.5 || b.left < left - 0.5 || b.right > right + 0.5) {
        problems.push(`"${b.word}" clipped by ${name(c)} (${getComputedStyle(c).overflow})`);
        clipped.add(b.el);
        break;
      }
    }
  }

  // 2b. Ink of words on different lines overlapping: the line height is too tight for Telugu.
  const collided = new Map<Element, Set<Element>>();
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i]!;
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j]!;
      if (!a.te && !b.te) continue;
      if (a.root !== b.root || a.line === b.line) continue;
      const dx = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const dy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (dx > 0.5 && dy > 0.5) {
        const seen = collided.get(a.el) ?? new Set<Element>();
        if (seen.has(b.el)) continue;
        collided.set(a.el, seen.add(b.el));
        problems.push(`"${a.word}" ${name(a.el)} touches "${b.word}" ${name(b.el)} by ${dy.toFixed(1)}px`);
      }
    }
  }

  // 3. Content hidden under the fixed bottom bar once scrolled to the end.
  const main = document.querySelector("main");
  const bar = document.querySelector("nav");
  if (main && bar && getComputedStyle(bar).position === "fixed") {
    window.scrollTo(0, de.scrollHeight);
    const hiddenBy = main.getBoundingClientRect().bottom - bar.getBoundingClientRect().top;
    if (hiddenBy > 1) problems.push(`the end of the screen stays ${hiddenBy.toFixed(0)}px under the bottom bar`);
    window.scrollTo(0, 0);
  }

  // 4. Tap targets.
  if (checkTargets) {
    const targets = [
      ...document.querySelectorAll(
        "button, a[href], select, textarea, input:not([type=hidden]):not(.sr-only), label:has(input.sr-only), [role=button], [role=radio], [role=link], [tabindex]:not([tabindex='-1']), audio[controls]",
      ),
    ].filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden");
    const rects = targets.map((el) => ({ el, r: el.getBoundingClientRect() }));
    for (const { el, r } of rects) {
      if (r.width < minTarget - 0.5 || r.height < minTarget - 0.5) {
        problems.push(`tap target ${Math.round(r.width)} x ${Math.round(r.height)}: ${name(el)}`);
      }
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!;
        const b = rects[j]!;
        // The fixed bar sits over content that scrolls under it; focus is checked below.
        if (a.el.contains(b.el) || b.el.contains(a.el) || fixedRoot(a.el) !== fixedRoot(b.el)) continue;
        const dx = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const dy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (dx > 0.5 && dy > 0.5) problems.push(`tap targets overlap: ${name(a.el)} and ${name(b.el)}`);
      }
    }
    // Keyboard focus never lands under the fixed bottom bar (WCAG 2.4.11).
    if (bar && getComputedStyle(bar).position === "fixed") {
      for (const { el } of rects) {
        // A disabled button can't take focus, so the browser never scrolls it clear of the bar.
        if (fixedRoot(el) || !(el instanceof HTMLElement) || el.matches(":disabled")) continue;
        el.focus();
        const r = el.getBoundingClientRect();
        const covered = r.bottom - bar.getBoundingClientRect().top;
        if (covered > 1) problems.push(`focused ${name(el)} is ${covered.toFixed(0)}px under the bottom bar`);
      }
      (document.activeElement as HTMLElement | null)?.blur();
      window.scrollTo(0, 0);
    }
  }
  return problems;
}

async function check(page: Page, scale: number) {
  await page.evaluate(async (z) => {
    document.documentElement.style.zoom = String(z);
    await document.fonts.ready;
    // A few frames: the bottom bar re-measures itself after the text grows.
    for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(r));
  }, scale);
  return page.evaluate(audit, { minTarget: MIN_TARGET, checkTargets: scale === 1 });
}

for (const who of PARENT_PAGES) {
  test(`Telugu text, tap targets and reflow: ${who.key}`, async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "phone screens");
    await page.emulateMedia({ reducedMotion: "reduce" });
    const problems: string[] = [];
    for (const scale of SCALES) {
      for (const v of VIEWS) {
        await page.goto(`${who.path}${v === "today" ? "" : `?v=${v}`}`);
        await ready(page);
        await expect(page.locator(`main[data-view="${v}"]`)).toBeVisible();
        for (const p of await check(page, scale)) problems.push(`${v} at ${scale * 100}%: ${p}`);
      }
    }
    expect(problems).toEqual([]);
  });
}

test("Telugu text, tap targets and reflow: start screen", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "phone screens");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const problems: string[] = [];
  for (const scale of SCALES) {
    await page.goto("/parents?v=start");
    await ready(page);
    await expect(page.getByRole("button", { name: /Fremont, California/ })).toBeVisible();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    for (const p of await check(page, scale)) problems.push(`start at ${scale * 100}%: ${p}`);
  }
  expect(problems).toEqual([]);
});

/** Words in the elements that split across two lines (each word's text range has one line box). A break after a hyphen is fine. */
function splitWords(selector: string): string[] {
  const out: string[] = [];
  for (const el of document.querySelectorAll(selector)) {
    const node = el.firstChild;
    if (!(node instanceof Text)) continue;
    for (const m of node.data.matchAll(/[^\s-]+/g)) {
      const r = document.createRange();
      r.setStart(node, m.index);
      r.setEnd(node, m.index + m[0].length);
      const tops = new Set([...r.getClientRects()].map((b) => Math.round(b.top)));
      if (tops.size > 1) out.push(m[0]);
    }
  }
  return out;
}

test("large text keeps times and the driver's stop name whole", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "phone screens");
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const scale of [1.5, 2]) {
    await page.goto("/parents/fremont-demo/p_sarala");
    await ready(page);
    await check(page, scale);
    expect(await page.evaluate(splitWords, "main article dt, main article dd")).toEqual([]);
    await page.goto("/parents/fremont-demo/p_sarala?v=driver");
    await ready(page);
    await check(page, scale);
    expect(await page.evaluate(splitWords, 'main[data-view="driver"] section p.font-bold')).toEqual([]);
  }
});

test("large text keeps ticket titles, the stub's buttons and the week's place names whole", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "phone screens");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const split: string[] = [];
  for (const who of PARENT_PAGES) {
    for (const scale of [1.5, 2]) {
      await page.goto(who.path);
      await ready(page);
      await check(page, scale);
      for (const w of await page.evaluate(
        splitWords,
        "main article h2, main [data-stub] button, main li button span.font-semibold",
      ))
        split.push(`${who.key} at ${scale * 100}%: ${w}`);
    }
  }
  expect(split).toEqual([]);
});

test("Show English adds English hints for demo visitors and stays on the device", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "phone screens");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/parents/munich-demo/p_kamala");
  await ready(page);
  const toggle = page.getByRole("switch", { name: "Show English" });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText("I'm home", { exact: true })).toHaveCount(0);
  await toggle.click();
  await expect(page.getByRole("button", { name: /దారి\s*Directions/ })).toBeVisible();
  await expect(page.getByRole("navigation").getByText("I'm home", { exact: true })).toBeVisible();
  // Every screen still fits with the hints, at normal size and at 200%.
  await page.reload();
  await ready(page);
  await expect(page.getByRole("switch", { name: "Show English" })).toHaveAttribute("aria-checked", "true");
  // The strip stays on one line beside the name on a 375 px phone.
  await page.setViewportSize({ width: 375, height: 812 });
  const middles = await page.evaluate(() =>
    [document.querySelector('[role="switch"]'), document.querySelector('[role="switch"]')?.previousElementSibling].map(
      (e) => {
        const r = e?.getBoundingClientRect();
        return r ? r.top + r.height / 2 : -1;
      },
    ),
  );
  expect(Math.abs(middles[0]! - middles[1]!)).toBeLessThan(8);
  const problems: string[] = [];
  for (const scale of SCALES) {
    for (const v of VIEWS) {
      await page.goto(`/parents/munich-demo/p_kamala${v === "today" ? "" : `?v=${v}`}`);
      await ready(page);
      await expect(page.locator(`main[data-view="${v}"]`)).toBeVisible();
      for (const p of await check(page, scale)) problems.push(`${v} at ${scale * 100}%: ${p}`);
    }
  }
  expect(problems).toEqual([]);
});

test("the name chip asks before it leaves, and the setup page leads back", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "phone screens");
  await page.goto("/parents/fremont-demo/p_sarala");
  await ready(page);
  await page.getByRole("button", { name: /Sarala/ }).click();
  await expect(page.getByText(te.Parents.otherPhone)).toBeVisible();
  await page.getByRole("button", { name: te.Parents.stayMine }).click();
  await expect(page.getByText(te.Parents.otherPhone)).toHaveCount(0);
  await expect(page).toHaveURL(/\/parents\/fremont-demo\/p_sarala$/);
  await page.getByRole("button", { name: /Sarala/ }).click();
  await page.getByRole("button", { name: te.Parents.changeOwner }).click();
  await expect(page).toHaveURL(/\/parents\?v=start/);
  await expect(page.getByText(te.Parents.setupLine)).toBeVisible();
  await page.getByRole("link", { name: te.Parents.backToMine }).click();
  await expect(page).toHaveURL(/\/parents\/fremont-demo\/p_sarala$/);
});

test("the setup page paints at once, so its scripts don't wait", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "phone screens");
  // The server HTML has text, so the first paint (and with it the app's scripts) comes straight away.
  const html = await (await page.request.get("/parents")).text();
  expect(html).toContain(te.Parents.opening);
  const t0 = Date.now();
  await page.goto("/parents?v=start");
  await expect(page.getByRole("button", { name: /Fremont, California/ })).toBeVisible();
  expect(Date.now() - t0).toBeLessThan(1500);
});

test("train trips say show someone, bus trips say show the driver", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "phone screens");
  await page.goto("/parents/munich-demo/p_kamala");
  await ready(page);
  await expect(page.getByRole("button", { name: te.Parents.showSomeone })).toBeVisible();
  await expect(page.getByRole("button", { name: te.Parents.showDriver })).toHaveCount(0);
  await page.goto("/parents/munich-demo/p_kamala?v=driver");
  await expect(page.getByText(te.Driver.hintSomeone)).toBeVisible();
  await page.goto("/parents/fremont-demo/p_sarala");
  await ready(page);
  await expect(page.getByRole("button", { name: te.Parents.showDriver })).toBeVisible();
});

test("the help-joining card says who to ask in Telugu too", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "phone screens");
  await page.goto("/parents/fremont-demo/p_sarala?v=join");
  await expect(page.getByText(te.Join.askWhoTemple)).toBeVisible();
  await expect(page.getByText("Ask at the temple office.")).toBeVisible();
});

test("diary recordings play with one large button, and sharing updates the note", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "phone screens");
  await page.goto("/parents/fremont-demo/p_sarala?v=diary");
  await ready(page);
  const entries = page.locator("main li.rounded-card");
  await expect(entries.first()).toBeVisible();
  await expect(page.locator("audio[controls]")).toHaveCount(0);
  const play = page.locator("main li").getByRole("button", { name: te.Parents.listen }).first();
  await expect(play).toBeVisible();
  const box = await play.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(56);
  const share = entries.getByRole("button", { name: te.Diary.share, exact: true }).first();
  await share.click();
  await expect(page.getByRole("status").filter({ hasText: te.Diary.sharedNow })).toBeVisible();
  await entries.getByRole("button", { name: te.Diary.unshare }).first().click();
  await expect(page.getByRole("status").filter({ hasText: te.Diary.privateAgain })).toBeVisible();
});

test("a diary entry asks once before it's erased", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "phone screens");
  await page.goto("/parents/fremont-demo/p_sarala?v=diary");
  await ready(page);
  const entries = page.locator("main li.rounded-card");
  await expect(entries.first()).toBeVisible();
  const before = await entries.count();
  await entries.first().getByRole("button", { name: "చెరిపేయండి" }).click();
  await entries.first().getByRole("button", { name: "వద్దు, ఉంచండి" }).click();
  await expect(entries).toHaveCount(before);
  await entries.first().getByRole("button", { name: "చెరిపేయండి" }).click();
  await entries.first().getByRole("button", { name: "చెరిపేయండి" }).click();
  await expect(entries).toHaveCount(before - 1);
});

test("a tap on I'm home before the app's script has run still counts", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "phone screens");
  // Hold the app's scripts back, so the bar is on screen but not yet working.
  let release: () => void = () => {};
  const held = new Promise<void>((r) => {
    release = r;
  });
  await page.route("**/_next/static/chunks/**/*.js", async (route) => {
    await held;
    await route.continue();
  });
  const checkin = page.waitForRequest((r) => r.method() === "POST" && r.url().includes("/parents/api/checkin"));
  await page.goto("/parents/fremont-demo/p_sarala", { waitUntil: "commit" });
  await page.getByRole("button", { name: "ఇంటికి వచ్చాను" }).click();
  release();
  await checkin;
  await expect(page).toHaveURL(/v=how/);
});
