import { describe, expect, it } from "vitest";
import { checkTeluguScript } from "../src/telugu";

describe("Telugu script integrity", () => {
  it("accepts clean Telugu with English names", () => {
    const r = checkTeluguScript("అమ్మా, Bus 210 పది గంటలకు వస్తుంది. Fremont Main Library దగ్గర దిగండి.");
    expect(r.ok).toBe(true);
    expect(r.teluguShare).toBeGreaterThan(0.5);
  });

  it("flags an orphan vowel sign", () => {
    // U+0C41 (vowel sign u) right after a space has no consonant to attach to.
    expect(checkTeluguScript(`బస్సు ${String.fromCharCode(0x0c41)}వస్తుంది`).orphanMarks).toBe(1);
  });

  it("flags replacement characters", () => {
    expect(checkTeluguScript(`బ${String.fromCharCode(0xfffd)}స్సు`).ok).toBe(false);
  });

  it("accepts conjuncts with a zero-width non-joiner", () => {
    expect(checkTeluguScript(`సేఫ్${String.fromCharCode(0x200c)}వే`).ok).toBe(true);
  });
});
