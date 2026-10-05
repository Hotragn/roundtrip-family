import { describe, expect, it } from "vitest";
import { LANGUAGES, languageNameIn, speechTag } from "../src/languages";
import { loadFremontPersona, loadMunichHousehold } from "../src/persona";
import { LanguageRecord } from "../src/schema/language";

describe("languages", () => {
  it("every record matches the schema", () => {
    for (const l of LANGUAGES) expect(LanguageRecord.safeParse(l).success).toBe(true);
  });

  it("names a language the way the parent says it", () => {
    expect(languageNameIn("en", "te")).toBe("ఇంగ్లీష్");
    expect(languageNameIn("de", "te")).toBe("జర్మన్");
  });

  it("falls back to the platform's language names for languages not in the table", () => {
    const name = languageNameIn("fr", "te");
    expect(name.length).toBeGreaterThan(0);
    expect(name).not.toBe("fr");
  });

  it("builds speech tags from the household's country, or the language's own default", () => {
    expect(speechTag("en", "US")).toBe("en-US");
    expect(speechTag("de", "de")).toBe("de-DE");
    expect(speechTag("te")).toBe("te-IN");
    expect(speechTag("zh")).toBe("zh-CN");
  });
});

describe("local phrases", () => {
  it("both demo households carry their help and driver lines in the local language", () => {
    const fremont = loadFremontPersona().household.localPhrases;
    const munich = loadMunichHousehold().household.localPhrases;
    expect(fremont.myName).toContain("{name}");
    expect(fremont.stayingNear).toContain("{area}");
    expect(munich.myName).toContain("{name}");
    expect(munich.askWay).toMatch(/Weg/);
  });
});
