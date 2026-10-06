import { describe, expect, it } from "vitest";
import { comingWeek } from "../src/planner/live-week";

describe("the coming week", () => {
  it("is next Monday to Sunday in the household's time zone", () => {
    // Monday 5 October 2026, 10:00 in Fremont: the coming week starts on the 12th.
    expect(comingWeek(new Date("2026-10-05T17:00:00Z"), "America/Los_Angeles")).toMatchObject({
      monday: "2026-10-12",
      sunday: "2026-10-18",
      key: "2026-W42",
      month: 10,
    });
    // Sunday evening in Munich: the coming week is the one starting the next day.
    expect(comingWeek(new Date("2026-10-11T20:00:00Z"), "Europe/Berlin").monday).toBe("2026-10-12");
    // Late Sunday in Fremont is Monday in UTC; the household's own date decides.
    expect(comingWeek(new Date("2026-10-12T05:00:00Z"), "America/Los_Angeles").monday).toBe("2026-10-12");
  });

  it("crosses months and years", () => {
    expect(comingWeek(new Date("2026-12-30T12:00:00Z"), "Europe/Berlin")).toMatchObject({
      monday: "2027-01-04",
      key: "2027-W01",
    });
  });
});
