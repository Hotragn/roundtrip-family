import { describe, expect, it } from "vitest";
import { assertOutbound, OUTBOUND, PrivacyViolation, scrubPersonal } from "../src/privacy";

describe("outbound registry", () => {
  it("never lets personal data reach a hosted service", () => {
    for (const r of OUTBOUND) {
      if (r.id === "mongodb") continue; // the household's own database; diary is ciphertext
      expect(r.accepts, r.id).not.toContain("personal");
    }
  });

  it("rejects a data class the route doesn't accept", () => {
    expect(() => assertOutbound("serpapi.events", "synthetic")).toThrow(PrivacyViolation);
    expect(() => assertOutbound("priorlabs.tabpfn", "personal")).toThrow(PrivacyViolation);
    expect(() => assertOutbound("serpapi.events", "public")).not.toThrow();
  });

  it("rejects a host the route doesn't list", () => {
    expect(() => assertOutbound("serpapi.events", "public", "https://evil.example.com/search")).toThrow(
      PrivacyViolation,
    );
    expect(() => assertOutbound("serpapi.events", "public", "https://serpapi.com/search.json")).not.toThrow();
  });

  it("has unique ids and docs links", () => {
    const ids = OUTBOUND.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of OUTBOUND) expect(r.docs).toMatch(/^https:\/\//);
  });
});

describe("scrubPersonal", () => {
  it("removes names, phone numbers and emails", () => {
    const out = scrubPersonal("Sarala, call +1 510 555 0142 or mail me@example.com. Venkat is coming.", [
      "Sarala",
      "Venkat",
    ]);
    expect(out).not.toMatch(/Sarala|Venkat|555|example\.com/);
  });

  it("keeps venue and bus names", () => {
    const out = scrubPersonal("Take Bus 210 to Fremont Main Library.", ["Sarala"]);
    expect(out).toBe("Take Bus 210 to Fremont Main Library.");
  });

  it("matches whole words in Telugu text", () => {
    const out = scrubPersonal("సరళ అమ్మా, ఈ రోజు Fremont Main Library కి వెళ్దాం.", ["సరళ"]);
    expect(out).not.toContain("సరళ");
    expect(out).toContain("Fremont Main Library");
  });
});
