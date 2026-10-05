import { describe, expect, it } from "vitest";
import fremont from "../../../data/demo/weeks/fremont-demo.json";
import munich from "../../../data/demo/weeks/munich-demo.json";
import { forParent, outingsFor, placePhoto, type WeekView } from "../lib/week";

const weeks = [fremont, munich] as unknown as WeekView[];

describe("place photos", () => {
  it("asks Google's image server for the ticket size as WebP", () => {
    const url = "https://lh3.googleusercontent.com/gps-cs-s/abc123=w1000-h1000-c-n";
    expect(placePhoto(url)).toBe("https://lh3.googleusercontent.com/gps-cs-s/abc123=w640-h360-c-rw-l60");
  });

  it("leaves other hosts alone", () => {
    const sv = "https://streetviewpixels-pa.googleapis.com/v1/thumbnail?panoid=x&w=400&h=200";
    expect(placePhoto(sv)).toBe(sv);
    expect(placePhoto("not a url")).toBe("not a url");
  });
});

describe("the demo weeks", () => {
  it("give each parent their approved outings in date order", () => {
    for (const w of weeks) {
      for (const p of w.parents) {
        const list = outingsFor(w, p.id);
        expect(list.length).toBeGreaterThan(0);
        expect(list.every((o) => o.status === "approved" && o.parentIds.includes(p.id))).toBe(true);
        const keys = list.map((o) => `${o.date}:${String(o.slot.depart).padStart(4, "0")}`);
        expect([...keys].sort()).toEqual(keys);
      }
    }
  });

  it("carry the household's local phrases with placeholders the phone fills in", () => {
    for (const w of weeks) {
      expect(w.household.localPhrases.myName).toContain("{name}");
      expect(w.household.localPhrases.stayingNear).toContain("{area}");
    }
  });

  it("start every route from the nearest stop, never a home address", () => {
    for (const w of weeks) {
      for (const o of w.outings) {
        const first = o.route?.legs[0];
        if (!first) continue;
        expect(JSON.stringify(first.from)).not.toMatch(/\d+ [A-Z][a-z]+ (St|Street|Ave|Avenue|Str|Straße)\b/);
      }
    }
  });
});

describe("one parent's phone", () => {
  it("carries only that parent's outings, card and people, without ranking details", () => {
    for (const w of weeks) {
      for (const p of w.parents) {
        const mine = forParent(w, p.id);
        expect(mine.outings.length).toBe(outingsFor(w, p.id).length);
        for (const o of mine.outings) {
          expect(o.parentIds).toContain(p.id);
          expect(o.cards.every((c) => c.parentId === p.id || o.cards.length === 1)).toBe(true);
          expect(o.chips).toEqual([]);
          expect(o.route?.legs.some((l) => "path" in l) ?? false).toBe(false);
        }
        expect(mine.people.every((x) => x.knownParentIds.includes(p.id))).toBe(true);
        expect(JSON.stringify(mine).length).toBeLessThan(JSON.stringify(w).length);
      }
    }
  });
});
