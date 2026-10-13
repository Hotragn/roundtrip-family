import type { Parent } from "@roundtrip/core";
import { describe, expect, it } from "vitest";
import type { Candidate } from "../src/planner/candidates";
import { joinCard } from "../src/planner/join";

const temple = { category: "temple", kind: "place" } as Candidate;
const parent = (other: Parent["otherLanguages"]) => ({ language: "te", otherLanguages: other }) as Parent;

describe("help joining card", () => {
  it("names the languages in the Telugu line, as the card does for strangers", () => {
    const c = joinCard(temple, parent([{ code: "hi", level: "speaks" }] as Parent["otherLanguages"]), "en");
    expect(c.local).toBe("I would like to volunteer. I speak Telugu and Hindi.");
    expect(c.meaning).toBe("నేను స్వచ్ఛందంగా సేవ చేయాలనుకుంటున్నాను. నాకు తెలుగు, హిందీ వచ్చు.");
    expect(joinCard(temple, parent([]), "de").meaning).toContain("నాకు తెలుగు వచ్చు.");
  });
});
