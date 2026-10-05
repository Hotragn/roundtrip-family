import { describe, expect, it } from "vitest";
import { runEventEval } from "./lib/events";

// Replays the recorded Gemma responses (LLM_MODE=replay in CI). Synthetic listings.
describe("event understanding", () => {
  it("gets language match right at least 85% of the time", async () => {
    const r = await runEventEval();
    expect(r.n).toBe(40);
    expect(r.accuracy.languageMatch).toBeGreaterThanOrEqual(0.85);
  }, 60_000);
});
