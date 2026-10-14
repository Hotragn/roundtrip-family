import { describe, expect, it } from "vitest";
import { checkinLine, clock24, onClock, sampleWeek } from "../lib/plan-format";

const LA = "America/Los_Angeles";

describe("dashboard times", () => {
  it("writes a listing's 12-hour departure in the dashboard's 24-hour style", () => {
    expect(clock24("8:33 AM")).toBe("08:33");
    expect(clock24("12:05 PM")).toBe("12:05");
    expect(clock24("12:10 am")).toBe("00:10");
    expect(clock24("1:40 p.m.")).toBe("13:40");
    expect(clock24("09:50")).toBe("09:50");
  });

  it("reads a moment on the household's clock, not the server's", () => {
    expect(onClock("2026-10-05T17:05:00Z", LA)).toEqual({ date: "2026-10-05", time: "10:05", minutes: 605 });
    expect(onClock("2026-10-05T09:00:00+02:00", "Europe/Berlin").time).toBe("09:00");
  });

  it("says a check-in on the outing's day as the parent being home", () => {
    expect(checkinLine("Sarala", "2026-10-05T17:05:00Z", LA, { date: "2026-10-05", depart: 510 })).toBe(
      "Sarala was home at 10:05",
    );
  });

  it("says a visitor's tap outside the sample day as what it was, never an impossible time", () => {
    // 01:13 on the outing's day, before an 08:30 outing left.
    expect(checkinLine("Sarala", "2026-10-05T08:13:00Z", LA, { date: "2026-10-05", depart: 510 })).toBe(
      "You tapped “I’m home” on Sarala’s demo phone on Mon 5 Oct at 01:13",
    );
    // A week later, on the real clock.
    expect(checkinLine("Sarala", "2026-10-13T20:05:00Z", LA, { date: "2026-10-05", depart: 510 })).toBe(
      "You tapped “I’m home” on Sarala’s demo phone on Tue 13 Oct at 13:05",
    );
  });

  it("names the demo week as a sample", () => {
    expect(sampleWeek("5 to 11 October 2026")).toBe("Sample week, 5 to 11 October 2026");
  });
});
