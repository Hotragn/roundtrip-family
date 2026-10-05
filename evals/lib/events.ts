import { readFileSync } from "node:fs";
import { join } from "node:path";
import { understandListing } from "@roundtrip/agent/understand";
import { repoRoot } from "@roundtrip/core/server-env";

/** Per-field accuracy of event understanding on the 40 synthetic labeled listings. */
export interface Labeled {
  id: string;
  listing: string;
  truth: {
    languageMatch: 0 | 1 | 2;
    suitsOlderAdults: boolean;
    indoor: boolean | null;
    cost: { free: boolean; amount: number | null; currency: string };
    category: string;
    start: string | null;
    end: string | null;
  };
}

export const FIELDS = [
  "languageMatch",
  "suitsOlderAdults",
  "indoor",
  "free",
  "amount",
  "category",
  "start",
  "end",
] as const;

const sameInstant = (a: string | null, b: string | null) =>
  a === null || b === null ? a === b : new Date(a).getTime() === new Date(b).getTime();

export async function runEventEval() {
  const file = JSON.parse(readFileSync(join(repoRoot(), "evals/events-labeled.json"), "utf8")) as {
    week: string;
    offset: string;
    items: Labeled[];
  };
  const rows: Array<{
    id: string;
    hit: Record<(typeof FIELDS)[number], boolean>;
    out: Awaited<ReturnType<typeof understandListing>>;
  }> = [];
  for (const item of file.items) {
    const out = await understandListing(
      item.listing,
      { week: file.week, offset: file.offset, currency: "USD" },
      { dataClass: "synthetic" },
    );
    const t = item.truth;
    const hit = {
      languageMatch: out.languageMatch === t.languageMatch,
      suitsOlderAdults: out.suitsOlderAdults === t.suitsOlderAdults,
      indoor: out.indoor === t.indoor,
      free: out.cost.free === t.cost.free,
      amount: (out.cost.amount ?? 0) === (t.cost.amount ?? 0),
      category: out.category === t.category,
      start: sameInstant(out.start, t.start),
      end: sameInstant(out.end, t.end),
    };
    rows.push({ id: item.id, hit, out });
  }
  const accuracy = Object.fromEntries(
    FIELDS.map((f) => [f, rows.filter((r) => r.hit[f]).length / rows.length]),
  ) as Record<(typeof FIELDS)[number], number>;
  return { rows, accuracy, n: rows.length };
}
