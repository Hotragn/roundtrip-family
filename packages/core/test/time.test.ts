import { describe, expect, it } from "vitest";
import { COUNTRIES, formatTemperature, insideWindow, isoWeek, overlapsWindow } from "../src";

describe("time helpers", () => {
  it("computes ISO weeks", () => {
    expect(isoWeek("2026-10-05")).toBe("2026-W41");
    expect(isoWeek("2026-01-01")).toBe("2026-W01");
    expect(isoWeek("2027-01-03")).toBe("2026-W53");
  });

  it("checks time windows", () => {
    const naps = [{ start: "13:00", end: "15:00" }];
    expect(overlapsWindow(12 * 60, 13 * 60 + 30, naps)).toBe(true);
    expect(overlapsWindow(9 * 60, 12 * 60, naps)).toBe(false);
    expect(insideWindow(7 * 60, 9 * 60, [{ start: "06:30", end: "10:00" }])).toBe(true);
  });
});

describe("countries", () => {
  it("cites an official source for every emergency number", () => {
    for (const c of Object.values(COUNTRIES)) {
      expect(c.emergency.source).toMatch(/^https:\/\//);
      expect(c.emergency.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("formats temperature in the household's units", () => {
    expect(formatTemperature(30, "US")).toBe("86°F");
    expect(formatTemperature(30, "DE")).toBe("30°C");
  });
});
