import { describePeriods, fitVisit, parseOpeningHours, parsePeriods } from "@roundtrip/core/hours";
import { loadFremontPersona, loadMunichHousehold } from "@roundtrip/core/persona";
import { describe, expect, it } from "vitest";
import { findSlot } from "../src/planner/slots";

// Hours strings as Google Maps lists them through SerpApi (from the saved demo searches).
describe("opening hours", () => {
  it("reads English and German listings", () => {
    expect(parsePeriods("9 AM–12 PM, 5:30–8:30 PM")).toEqual([
      [540, 720],
      [1050, 1230],
    ]);
    expect(parsePeriods("8:30–10 AM, 6–7:30 PM")).toEqual([
      [510, 600],
      [1080, 1170],
    ]);
    expect(parsePeriods("11 AM–1 PM, 7–9 PM")).toEqual([
      [660, 780],
      [1140, 1260],
    ]);
    expect(parsePeriods("04:30–10:00, 18:30–19:30")).toEqual([
      [270, 600],
      [1110, 1170],
    ]);
    expect(parsePeriods("10:00–20:00")).toEqual([[600, 1200]]);
    expect(parsePeriods("Closed")).toEqual([]);
    expect(parsePeriods("Geschlossen")).toEqual([]);
    expect(parsePeriods("Open 24 hours")).toEqual([[0, 1440]]);
    expect(parsePeriods("24 Stunden geöffnet")).toEqual([[0, 1440]]);
    // Narrow no-break spaces before AM/PM, and a close at midnight.
    expect(parsePeriods("10 AM–12 AM")).toEqual([[600, 1440]]);
    expect(parsePeriods("by appointment")).toBeNull();
  });

  it("maps weekday names to days and skips what it can't read", () => {
    const h = parseOpeningHours({ montag: "Geschlossen", sonntag: "11:00–16:30", freitag: "nach Vereinbarung" });
    expect(h).toEqual({ mon: [], sun: [[660, 990]] });
    expect(parseOpeningHours(undefined)).toBeNull();
    expect(describePeriods(h?.sun)).toBe("11:00 to 16:30");
    expect(describePeriods([[0, 1440]])).toBe("open all day");
  });

  it("fits a visit inside the hours, shortening it before closing", () => {
    const temple = parseOpeningHours({ monday: "8:30–10 AM, 6–7:30 PM" });
    expect(fitVisit(temple, "mon", 8 * 60 + 15, 90, 54)).toEqual({ ok: false, why: "opens at 08:30" });
    // Arrive 08:50: 60 minutes until ten minutes before closing.
    expect(fitVisit(temple, "mon", 8 * 60 + 50, 90, 54)).toEqual({ ok: true, stay: 60 });
    expect(fitVisit(temple, "mon", 9 * 60 + 20, 90, 54)).toEqual({ ok: false, why: "closes at 10:00" });
    // Days without listed hours aren't limited.
    expect(fitVisit(temple, "tue", 9 * 60, 90, 54)).toEqual({ ok: true, stay: 90 });
  });
});

describe("slots respect opening hours", () => {
  const fremont = loadFremontPersona();
  const sarala = fremont.parents.find((p) => !p.addressAs.includes("నాన్న"))!;

  it("arrives after the shop opens, not before", () => {
    const slot = findSlot(
      fremont.household,
      sarala,
      {
        travelMinutes: 14,
        walkingMinutes: 14,
        stayMinutes: 50,
        minStayMinutes: 30,
        outdoor: false,
        hours: parseOpeningHours({ monday: "9 AM–8:30 PM", wednesday: "9 AM–8:30 PM" }),
      },
      10,
    );
    expect(slot.ok).toBe(true);
    expect(slot.slot!.depart + 14).toBeGreaterThanOrEqual(9 * 60);
  });

  it("sends a Sunday-only temple to the weekend with the adult child", () => {
    const munich = loadMunichHousehold();
    const mother = munich.parents.find((p) => !p.addressAs.includes("నాన్న"))!;
    const days = ["montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag"];
    const hours = parseOpeningHours({
      ...Object.fromEntries(days.map((d) => [d, "Geschlossen"])),
      sonntag: "11:00–16:30",
    });
    const slot = findSlot(
      munich.household,
      mother,
      { travelMinutes: 28, walkingMinutes: 10, stayMinutes: 90, minStayMinutes: 54, outdoor: false, hours },
      10,
    );
    expect(slot.ok).toBe(true);
    expect(slot.slot).toMatchObject({ day: "sun", withAdultChild: true });
    expect(slot.slot!.depart + 28).toBeGreaterThanOrEqual(11 * 60);
    expect(slot.why).toContain("closed on Mondays");
  });
});
