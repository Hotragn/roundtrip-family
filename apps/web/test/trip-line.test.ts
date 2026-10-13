import { describe, expect, it } from "vitest";
import { tripLine } from "../lib/plan-format";
import type { BoardItem } from "../lib/plan-types";

describe("the card's trip line", () => {
  it("uses the route's door-to-door total, the same number the ticket shows", () => {
    const item = {
      withAdultChild: false,
      travelMinutes: 20,
      legs: [
        { mode: "walk", minutes: 3, line: null },
        { mode: "bus", minutes: 9, line: { name: "211" } },
        { mode: "walk", minutes: 7, line: null },
      ],
    } as unknown as BoardItem;
    expect(tripLine(item)).toBe("Bus 211 · 20 min");
  });
});
