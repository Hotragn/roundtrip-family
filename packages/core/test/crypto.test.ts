import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DiaryKeyMissing, decryptContent, encryptContent, masterKeyFromEnv } from "../src/crypto/diary";

const master = randomBytes(32);

describe("diary encryption", () => {
  it("round-trips an entry", () => {
    const content = { text: "ఈ రోజు గుడికి వెళ్ళాం. బాగుంది.", feelingWords: ["బాగుంది"] };
    const env = encryptContent(master, "p_sarala", "d1", content);
    expect(decryptContent(master, "p_sarala", "d1", env)).toEqual(content);
  });

  it("keeps the plaintext out of the stored envelope", () => {
    const env = encryptContent(master, "p_sarala", "d2", {
      text: "Mrs. Chen waved",
      feelingWords: [],
    });
    expect(JSON.stringify(env)).not.toContain("Chen");
  });

  it("refuses ciphertext moved to another parent or entry", () => {
    const env = encryptContent(master, "p_sarala", "d3", { text: "private", feelingWords: [] });
    expect(() => decryptContent(master, "p_venkat", "d3", env)).toThrow();
    expect(() => decryptContent(master, "p_sarala", "d4", env)).toThrow();
  });

  it("detects tampering", () => {
    const env = encryptContent(master, "p_sarala", "d5", { text: "private", feelingWords: [] });
    const ct = Buffer.from(env.ct, "base64");
    ct[0] = (ct[0] ?? 0) ^ 1;
    expect(() => decryptContent(master, "p_sarala", "d5", { ...env, ct: ct.toString("base64") })).toThrow();
  });

  it("uses a fresh IV for every entry", () => {
    const a = encryptContent(master, "p_sarala", "d6", { text: "same", feelingWords: [] });
    const b = encryptContent(master, "p_sarala", "d6", { text: "same", feelingWords: [] });
    expect(a.iv).not.toBe(b.iv);
  });

  it("requires a 32-byte key", () => {
    expect(() => masterKeyFromEnv({})).toThrow(DiaryKeyMissing);
    expect(() => masterKeyFromEnv({ DIARY_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") })).toThrow();
    expect(masterKeyFromEnv({ DIARY_ENCRYPTION_KEY: master.toString("base64") }).length).toBe(32);
  });
});
