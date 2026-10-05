import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@roundtrip/core/server-env";
import { describe, expect, it } from "vitest";
import { type CardInput, checkCard } from "../src/cards/rubric";

const { cases } = JSON.parse(readFileSync(join(repoRoot(), "evals/fixtures/rubric-cases.json"), "utf8")) as {
  cases: Array<{ id: string; card: string; input: CardInput; expect: { passed: boolean; failureIncludes?: string } }>;
};

describe("card rubric (shared cases with the Python gate)", () => {
  it.each(cases.map((c) => [c.id, c]))("%s", (_id, c) => {
    const r = checkCard(c.card, c.input);
    expect(r.passed, r.failures.join("; ")).toBe(c.expect.passed);
    if (c.expect.failureIncludes) expect(r.failures.some((f) => f.includes(c.expect.failureIncludes!))).toBe(true);
  });
});
