import { offersSelfAsCompany, planWeek, type WeekPlan } from "@roundtrip/agent/planner";
import { DEMO_WEEKS } from "@roundtrip/agent/weeks";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * The product's core rule: route to humans. The planner runs on ten demo weeks, replaying the
 * recorded Gemma and TabPFN calls (CI never calls them), and every suggestion must be a real
 * event or place with an address, never the app offered as company. Inputs: live search
 * results for Fremont, Munich and Bozeman, plus synthetic variants. Results are synthetic.
 */

process.env.LLM_MODE ??= "replay";
process.env.RANKER_MODE ??= "replay";
process.env.SERPAPI_MODE ??= "replay";

const plans = new Map<string, WeekPlan>();

beforeAll(async () => {
  for (const week of DEMO_WEEKS) {
    const ctx = await week.build("replay");
    plans.set(week.id, await planWeek(ctx));
  }
}, 300_000);

describe("route to humans", () => {
  it.each(DEMO_WEEKS.map((w) => [w.id]))("%s: every suggestion is a real place or event with an address", (id) => {
    const plan = plans.get(id)!;
    expect(plan.suggestions.length).toBeGreaterThanOrEqual(2);
    expect(plan.suggestions.length).toBeLessThanOrEqual(6);
    for (const s of plan.suggestions) {
      expect(s.candidate.title.length, s.id).toBeGreaterThan(0);
      expect(s.candidate.address.length, `${s.candidate.title} has an address`).toBeGreaterThan(3);
      expect(s.candidate.location, `${s.candidate.title} is on the map`).not.toBeNull();
      expect(["live_search", "synthetic"]).toContain(s.candidate.provenance);
      expect(s.ladderLevel).toBeGreaterThanOrEqual(1);
      expect(s.ladderLabel.length).toBeGreaterThan(0);
    }
  });

  it.each(DEMO_WEEKS.map((w) => [w.id]))("%s: never offers the app as company", (id) => {
    const plan = plans.get(id)!;
    expect(offersSelfAsCompany(plan.note)).toBeNull();
    for (const s of plan.suggestions) expect(offersSelfAsCompany(s.reasonText), s.reasonText).toBeNull();
  });

  it("says honestly when nothing in their language was found", () => {
    for (const id of ["bozeman", "bozeman-rain", "fremont"]) {
      const plan = plans.get(id)!;
      expect(plan.sameLanguageFound).toBe(false);
      for (const s of plan.suggestions.filter((x) => x.ladderLevel > 1))
        expect(s.reasonText).toMatch(/No Telugu events nearby this week/);
    }
  });

  it("puts a Telugu group first when one exists", () => {
    const plan = plans.get("fremont-telugu-group")!;
    expect(plan.sameLanguageFound).toBe(true);
    expect(plan.suggestions.some((s) => s.ladderLevel === 1)).toBe(true);
  });

  it("respects the weather rules", () => {
    for (const s of plans.get("fremont-heat")!.suggestions) {
      if (["tue", "wed", "thu"].includes(s.slot.day)) expect(s.candidate.indoor, s.candidate.title).not.toBe(false);
    }
    for (const s of plans.get("fremont-rain")!.suggestions.filter((x) => x.role === "father")) {
      expect(s.candidate.indoor, `${s.candidate.title} on a rainy day`).not.toBe(false);
    }
  });

  it("keeps each parent's naps and plans only for the parents who are there", () => {
    for (const plan of plans.values()) {
      for (const s of plan.suggestions) {
        // Naps run 13:00 to 15:00 (Fremont, Bozeman) or 13:30 to 15:00 (Munich).
        const overlapsNap = s.slot.depart < 15 * 60 && s.slot.back > 13 * 60;
        expect(overlapsNap, `${s.candidate.title} ${s.slot.day}`).toBe(false);
      }
    }
    expect(plans.get("fremont-mother-only")!.suggestions.every((s) => s.role !== "father")).toBe(true);
  });

  it("asks for a first ride together only on new routes", () => {
    expect(plans.get("fremont-known-routes")!.suggestions.every((s) => !s.firstRideTogether)).toBe(true);
    expect(plans.get("fremont")!.suggestions.some((s) => s.firstRideTogether)).toBe(true);
  });

  it("plans in German for the Germany household", () => {
    const plan = plans.get("munich")!;
    expect(plan.suggestions.length).toBeGreaterThanOrEqual(2);
    const join = plan.suggestions.find((s) => s.joinCard)?.joinCard;
    if (join) expect(join.local).toMatch(/Ich|möchte/);
  });
});
