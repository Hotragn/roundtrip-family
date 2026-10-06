import { describe, expect, it } from "vitest";
import { weekAnswer } from "../lib/plan-format";

describe("the dashboard's answer for weekPlan", () => {
  it("approves by the outing chosen in a swap's place, and sends every swap", () => {
    const items = [{ id: "temple" }, { id: "park" }, { id: "market" }];
    const overlay = {
      status: { temple: "approved", park: "approved", market: "suggested" },
      swaps: { park: "library" },
    };
    expect(weekAnswer(items, overlay)).toEqual({ approve: ["temple", "library"], swapTo: { park: "library" } });
  });

  it("approves nothing until something is approved", () => {
    expect(weekAnswer([{ id: "a" }], { status: {}, swaps: {} }).approve).toEqual([]);
  });
});
