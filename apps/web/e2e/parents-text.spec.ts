import { expect, type Page, test } from "@playwright/test";
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
        if (fixedRoot(el) || !(el instanceof HTMLElement)) continue;
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
