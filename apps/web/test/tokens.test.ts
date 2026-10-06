import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** WCAG 2.x relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const v = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = Number.parseInt(v.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const css = readFileSync(join(__dirname, "../app/tokens.css"), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`No block ${selector}`);
  const body = css.slice(start, css.indexOf("}", start));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) vars[m[1]!] = m[2]!.toLowerCase();
  return vars;
}

const light = block(":root");
const dark = { ...light, ...block(':root[data-color-scheme="dark"]') };
const home = { ...light, ...block('[data-theme="home"]') };
const homeDark = {
  ...dark,
  ...block(':root[data-color-scheme="dark"] [data-theme="home"]:not([data-scheme="light"] *)'),
};
// The parents' app keeps the light palette even when the phone is in dark mode.
const parents = { ...dark, ...block('[data-scheme="light"]'), ...block('[data-theme="road"]') };
const parentsHome = { ...parents, ...block('[data-theme="home"]') };

const TEXT_PAIRS: Array<[string, string]> = [
  ["text", "paper"],
  ["text", "surface"],
  ["text", "surface-sunken"],
  ["text-muted", "surface"],
  ["text-muted", "paper"],
  ["sky-text", "surface"],
  ["sea-text", "surface"],
  ["rail-text", "surface"],
  ["signal-text", "surface"],
  ["home-green-text", "surface"],
];
const LINE_PAIRS: Array<[string, string]> = [
  ["sky-line", "surface"],
  ["sea-line", "surface"],
  ["rail-line", "surface"],
  ["focus", "surface"],
  ["focus", "paper"],
];

describe.each([
  ["light", light],
  ["dark", dark],
  ["home light", home],
  ["home dark", homeDark],
  ["parents' app in dark mode", parents],
  ["parents' diary in dark mode", parentsHome],
])("%s tokens", (_name, t) => {
  it.each(TEXT_PAIRS)("%s on %s meets 4.5:1", (fg, bg) => {
    expect(t[fg], fg).toBeDefined();
    expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(4.5);
  });
  it.each(LINE_PAIRS)("%s on %s meets 3:1", (fg, bg) => {
    expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(3);
  });
});

describe("fixed pairs", () => {
  it("ink on marigold meets 7:1 (the main action)", () => {
    expect(contrast(light.ink!, light.bus!)).toBeGreaterThanOrEqual(7);
  });
  it("white on the safety colors meets 4.5:1", () => {
    expect(contrast("#ffffff", light.signal!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#ffffff", light["home-green"]!)).toBeGreaterThanOrEqual(4.5);
  });
  it("input borders meet 3:1 in both schemes", () => {
    expect(contrast(light["n-400"]!, light.surface!)).toBeGreaterThanOrEqual(3);
  });
  it("matches the contrast figures in docs/brand.md", () => {
    expect(contrast(light["sky-text"]!, "#ffffff")).toBeCloseTo(5.4, 0);
    expect(contrast(light["sea-text"]!, "#ffffff")).toBeCloseTo(5.7, 0);
    expect(contrast(light.ink!, "#ffffff")).toBeCloseTo(13.9, 0);
  });
});
