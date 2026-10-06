import type { Household, Parent } from "@roundtrip/core";
import { loadFremontPersona, loadMunichHousehold } from "@roundtrip/core/persona";
import { describe, expect, it } from "vitest";
import { weatherBlocks } from "../src/planner/slots";

/**
 * The weather rules (docs/plan.md, "Weather"): ice, heavy snow and heat advisories are hard
 * blocks set by the household, indoors and out, for every parent; each parent's own limits
 * apply only outdoors. Tests the planner's weatherBlocks as it is. The households are the
 * synthetic demo personas; the weather is synthetic.
 */

/** weatherBlocks' last argument says whether the outing is outdoors. */
const OUTDOOR = true;
const INDOOR = false;

const fremont = loadFremontPersona();
const munich = loadMunichHousehold();
const parent = (h: { parents: Parent[] }, name: string) => h.parents.find((p) => p.firstName === name)!;
const sarala = parent(fremont, "Sarala");
const venkat = parent(fremont, "Venkat");
const kamala = parent(munich, "Kamala");
const raghu = parent(munich, "Raghu");

const pleasant = { label: "pleasant", tempC: 22, rainChance: 0.1 };
const withRules = (h: Household, rules: Partial<Household["safety"]["weather"]>): Household => ({
  ...h,
  safety: { ...h.safety, weather: { ...h.safety.weather, ...rules } },
});

describe("hard blocks", () => {
  const hard = [
    ["ice", { ...pleasant, tempC: -2, ice: true }, "ice on the roads"],
    ["heavy snow", { ...pleasant, tempC: -1, heavySnow: true }, "heavy snow"],
    ["a heat advisory", { ...pleasant, tempC: 39, heatAdvisory: true }, "a heat advisory"],
  ] as const;

  it.each(hard)("%s blocks every outing, indoors and out, for both Fremont parents", (_name, w, why) => {
    for (const p of [sarala, venkat]) {
      expect(weatherBlocks(fremont.household, p, w, INDOOR)).toBe(why);
      expect(weatherBlocks(fremont.household, p, w, OUTDOOR)).toBe(why);
    }
  });

  it.each(hard)("%s blocks in the Munich household too", (_name, w, why) => {
    for (const p of [kamala, raghu]) {
      expect(weatherBlocks(munich.household, p, w, INDOOR)).toBe(why);
      expect(weatherBlocks(munich.household, p, w, OUTDOOR)).toBe(why);
    }
  });

  it("a heat advisory blocks even a parent who handles heat well", () => {
    // Venkat is fine outdoors up to 40 °C, so 36 °C alone doesn't stop him; the advisory does.
    expect(weatherBlocks(fremont.household, venkat, { ...pleasant, tempC: 36 }, OUTDOOR)).toBeNull();
    expect(weatherBlocks(fremont.household, venkat, { ...pleasant, tempC: 36, heatAdvisory: true }, OUTDOOR)).toBe(
      "a heat advisory",
    );
  });

  it("each hard block follows the household's own setting", () => {
    const off = withRules(fremont.household, { blockIce: false, blockHeavySnow: false, blockHeatAdvisory: false });
    expect(weatherBlocks(off, sarala, { ...pleasant, ice: true }, INDOOR)).toBeNull();
    expect(weatherBlocks(off, sarala, { ...pleasant, heavySnow: true }, INDOOR)).toBeNull();
    expect(weatherBlocks(off, sarala, { ...pleasant, heatAdvisory: true }, INDOOR)).toBeNull();
    const iceOnly = withRules(fremont.household, { blockHeavySnow: false, blockHeatAdvisory: false });
    expect(weatherBlocks(iceOnly, sarala, { ...pleasant, ice: true, heavySnow: true }, INDOOR)).toBe(
      "ice on the roads",
    );
    expect(weatherBlocks(iceOnly, sarala, { ...pleasant, heavySnow: true }, INDOOR)).toBeNull();
  });

  it("the demo households keep all three hard blocks on", () => {
    for (const h of [fremont.household, munich.household]) {
      expect(h.safety.weather).toMatchObject({ blockIce: true, blockHeavySnow: true, blockHeatAdvisory: true });
    }
  });

  it("the most serious reason is the one given", () => {
    const everything = { ...pleasant, tempC: 41, rainChance: 0.9, ice: true, heavySnow: true, heatAdvisory: true };
    expect(weatherBlocks(fremont.household, venkat, everything, OUTDOOR)).toBe("ice on the roads");
    expect(weatherBlocks(fremont.household, venkat, { ...everything, ice: false }, OUTDOOR)).toBe("heavy snow");
    expect(weatherBlocks(fremont.household, venkat, { ...everything, ice: false, heavySnow: false }, OUTDOOR)).toBe(
      "a heat advisory",
    );
  });
});

describe("each parent's own limits, outdoors only", () => {
  it("each parent has their own heat limit", () => {
    // Sarala's limit is 38 °C, Venkat's 40 °C, Kamala's 35 °C (synthetic personas).
    const hot = { ...pleasant, tempC: 39 };
    expect(weatherBlocks(fremont.household, sarala, hot, OUTDOOR)).toBe("too hot outdoors");
    expect(weatherBlocks(fremont.household, venkat, hot, OUTDOOR)).toBeNull();
    expect(weatherBlocks(fremont.household, venkat, { ...pleasant, tempC: 41 }, OUTDOOR)).toBe("too hot outdoors");
    expect(weatherBlocks(munich.household, kamala, { ...pleasant, tempC: 36 }, OUTDOOR)).toBe("too hot outdoors");
  });

  it("cold stops the parent who avoids it, below their own comfort", () => {
    // Sarala avoids cold below 16 °C; Venkat doesn't list cold; Kamala avoids it below 12 °C.
    const cool = { ...pleasant, tempC: 12 };
    expect(weatherBlocks(fremont.household, sarala, cool, OUTDOOR)).toBe("too cold");
    expect(weatherBlocks(fremont.household, venkat, cool, OUTDOOR)).toBeNull();
    expect(weatherBlocks(fremont.household, sarala, { ...pleasant, tempC: 16 }, OUTDOOR)).toBeNull();
    expect(weatherBlocks(munich.household, kamala, cool, OUTDOOR)).toBeNull();
    expect(weatherBlocks(munich.household, kamala, { ...pleasant, tempC: 11 }, OUTDOOR)).toBe("too cold");
  });

  it("rain stops the parent who avoids it, from a 50% chance", () => {
    expect(weatherBlocks(fremont.household, venkat, { ...pleasant, rainChance: 0.5 }, OUTDOOR)).toBe("rain likely");
    expect(weatherBlocks(fremont.household, venkat, { ...pleasant, rainChance: 0.49 }, OUTDOOR)).toBeNull();
    expect(weatherBlocks(fremont.household, sarala, { ...pleasant, rainChance: 0.9 }, OUTDOOR)).toBeNull();
    expect(weatherBlocks(munich.household, kamala, { ...pleasant, rainChance: 0.7 }, OUTDOOR)).toBe("rain likely");
    expect(weatherBlocks(munich.household, raghu, { ...pleasant, rainChance: 0.7 }, OUTDOOR)).toBeNull();
  });

  it("indoors, personal limits don't apply", () => {
    const rough = { ...pleasant, tempC: 41, rainChance: 0.9 };
    for (const p of [sarala, venkat]) expect(weatherBlocks(fremont.household, p, rough, INDOOR)).toBeNull();
    expect(weatherBlocks(fremont.household, sarala, { ...pleasant, tempC: 5 }, INDOOR)).toBeNull();
    expect(weatherBlocks(munich.household, kamala, { ...pleasant, tempC: 5, rainChance: 0.9 }, INDOOR)).toBeNull();
  });

  it("a fine day blocks nobody", () => {
    for (const p of [sarala, venkat]) expect(weatherBlocks(fremont.household, p, pleasant, OUTDOOR)).toBeNull();
    for (const p of [kamala, raghu]) expect(weatherBlocks(munich.household, p, pleasant, OUTDOOR)).toBeNull();
  });
});
