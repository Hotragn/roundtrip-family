import { assertOutbound } from "@roundtrip/core/privacy";
import { describe, expect, it } from "vitest";
import { awakeHours } from "../lib/server/keep-awake";

describe("the hours the demo stays awake", () => {
  it("is awake from 06:00 to 02:00 New York time, in summer and winter", () => {
    // 10 October is EDT (UTC-4), 10 January is EST (UTC-5).
    expect(awakeHours(new Date("2026-10-10T10:00:00Z"))).toBe(true); // 06:00 EDT
    expect(awakeHours(new Date("2026-10-11T05:59:00Z"))).toBe(true); // 01:59 EDT
    expect(awakeHours(new Date("2026-10-11T06:00:00Z"))).toBe(false); // 02:00 EDT
    expect(awakeHours(new Date("2026-10-10T09:59:00Z"))).toBe(false); // 05:59 EDT
    expect(awakeHours(new Date("2027-01-10T10:30:00Z"))).toBe(false); // 05:30 EST
    expect(awakeHours(new Date("2027-01-10T11:00:00Z"))).toBe(true); // 06:00 EST
  });

  it("is asleep 4 hours a day, so a 31-day month stays within the free plan", () => {
    let awake = 0;
    for (let h = 0; h < 24; h++) if (awakeHours(new Date(Date.UTC(2026, 9, 10, h, 30)))) awake++;
    expect(awake).toBe(20);
    expect(awake * 31).toBeLessThan(750 - 100);
  });

  it("may call the live site's health check, and nothing else, through the privacy guard", () => {
    // The ping swallows errors, so a wrong route id would fail silently in production.
    expect(() =>
      assertOutbound("self.health", "public", "https://roundtrip-web.onrender.com/api/health"),
    ).not.toThrow();
    expect(() => assertOutbound("self.health", "public", "https://example.org/api/health")).toThrow();
  });
});
