import { describe, expect, it } from "vitest";
import { GLOSS } from "../app/parents/gloss";
import { fitTitle } from "../lib/week";
import te from "../messages/te.json";

const message = (key: string) =>
  key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], te);

describe("English hints for demo visitors", () => {
  it("each hint belongs to a Telugu message", () => {
    const missing = Object.keys(GLOSS).filter((k) => typeof message(k) !== "string");
    expect(missing).toEqual([]);
  });

  it("hints are plain English: no em dashes, no Telugu", () => {
    for (const v of Object.values(GLOSS)) expect(v).not.toMatch(/[—ఀ-౿]/);
  });
});

describe("the ticket title", () => {
  it("shrinks to its longest Latin word, so a name never splits", () => {
    expect(fitTitle("Münchner Stadtbibliothek Neuperlach కి")).toBe("min(var(--text-parent-title), calc(100cqi / 9.0))");
    // Hyphens are places to break; Telugu words wrap between aksharas.
    expect(fitTitle("Indian-Grocery-Store München కి")).toContain("/ 4.2)");
    expect(fitTitle("గుడికి")).toContain("/ 0.6)");
  });
});
