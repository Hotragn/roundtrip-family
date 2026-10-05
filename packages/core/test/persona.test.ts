import { describe, expect, it } from "vitest";
import { loadFremontPersona, loadMunichHousehold, parseCsv } from "../src/persona";

describe("persona loader", () => {
  it("maps the Fremont persona into the schemas", () => {
    const b = loadFremontPersona();
    expect(b.household.hostCountry).toBe("US");
    expect(b.household.provenance).toBe("synthetic");
    expect(b.household.emergency.number).toBe("911");
    expect(b.parents.map((p) => p.firstName)).toEqual(["Sarala", "Venkat"]);
    expect(b.parents[0]?.readingSupport).toBe("audio_first");
    expect(b.parents[1]?.readingSupport).toBe("text_with_sign_words");
    expect(b.parents.every((p) => p.settings.useDiaryForPlanning === false)).toBe(true);
    expect(b.people.map((p) => p.label)).toEqual(["Mrs. Chen"]);
  });

  it("keeps all 24 outings, including the two they wanted but didn't go to", () => {
    const { pastOutings } = loadFremontPersona();
    expect(pastOutings).toHaveLength(24);
    const notWent = pastOutings.filter((o) => o.result?.went === false);
    expect(notWent.map((o) => o._id)).toEqual(["o_fremont_23", "o_fremont_24"]);
    expect(pastOutings.every((o) => o.provenance === "synthetic")).toBe(true);
    const fiveStar = pastOutings.filter((o) => o.result?.enjoyment === 5);
    expect(fiveStar.length).toBeGreaterThan(0);
    // The persona's notable pattern: every 5-star outing happened with the adult child.
    expect(fiveStar.every((o) => o.features.withAdultChild === true)).toBe(true);
  });

  it("never puts names in ranker features", () => {
    const { pastOutings } = loadFremontPersona();
    const text = JSON.stringify(pastOutings.map((o) => o.features));
    for (const name of ["Sarala", "Venkat", "Chen"]) expect(text).not.toContain(name);
  });

  it("loads the synthetic Germany household", () => {
    const b = loadMunichHousehold();
    expect(b.household.hostCountry).toBe("DE");
    expect(b.household.localLanguage).toBe("de");
    expect(b.household.emergency.number).toBe("112");
    expect(b.pastOutings).toHaveLength(10);
    expect(b.parents.every((p) => p.language === "te")).toBe(true);
  });

  it("parses quoted CSV fields", () => {
    const rows = parseCsv('a,b,c\n1,"x, y",3\n');
    expect(rows[0]).toEqual({ a: "1", b: "x, y", c: "3" });
  });
});
