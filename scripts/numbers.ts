/**
 * The numbers in docs/numbers.md that come from the build's own logs and outputs, printed as
 * Markdown tables. Reads only files in the repo (no network, no keys): the Gemma call log, the
 * recorded TabPFN responses, the SerpApi log, the saved plans and weeks, and the clip manifest.
 * Everything it reads is synthetic or from live search; nothing about a real family.
 * Run: pnpm --filter @roundtrip/scripts exec tsx numbers.ts
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@roundtrip/core/server-env";

const ROOT = repoRoot();
const read = <T>(p: string): T => JSON.parse(readFileSync(join(ROOT, p), "utf8")) as T;
const lines = (p: string) =>
  readFileSync(join(ROOT, p), "utf8")
    .split("\n")
    .filter((l) => l.trim());

function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 0) return Number.NaN;
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
}
const n = (x: number) => (Number.isFinite(x) ? Math.round(x).toLocaleString("en-US") : "-");
const pct = (a: number, b: number) => (b === 0 ? "-" : `${((100 * a) / b).toFixed(1)}%`);
function table(head: string[], rows: Array<Array<string | number>>): string {
  return [
    `| ${head.join(" | ")} |`,
    `|${head.map(() => "---").join("|")}|`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}

// Gemma: every call through agent/src/gemma, from data/demo/usage/gemma-calls.jsonl.
interface Call {
  service: string;
  purpose: string;
  latencyMs: number;
  cached: boolean;
  attempts: number;
  ok: boolean;
  promptTokens: number | null;
  completionTokens: number | null;
}
const calls = lines("data/demo/usage/gemma-calls.jsonl").map((l) => JSON.parse(l) as Call);
const group = (p: string) =>
  p
    .replace(/:retry$/, "")
    .replace(/:\d+$/, "")
    .replace(/^model-check.*/, "model-check");
const live = calls.filter((c) => !c.cached);
const answered = live.filter((c) => c.ok);
const byGroup = new Map<string, Call[]>();
for (const c of answered) byGroup.set(group(c.purpose), [...(byGroup.get(group(c.purpose)) ?? []), c]);
console.log("## Gemma calls\n");
console.log(
  table(
    ["Purpose", "Answered live", "Median ms", "90th percentile ms", "Median prompt tokens", "Median answer tokens"],
    [...byGroup.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([k, v]) => [
        k,
        v.length,
        n(
          quantile(
            v.map((c) => c.latencyMs),
            0.5,
          ),
        ),
        n(
          quantile(
            v.map((c) => c.latencyMs),
            0.9,
          ),
        ),
        n(
          quantile(
            v.flatMap((c) => (c.promptTokens == null ? [] : [c.promptTokens])),
            0.5,
          ),
        ),
        n(
          quantile(
            v.flatMap((c) => (c.completionTokens == null ? [] : [c.completionTokens])),
            0.5,
          ),
        ),
      ]),
  ),
);
const failed = live.filter((c) => !c.ok);
const failedOutsideCheck = failed.filter((c) => group(c.purpose) !== "model-check");
const retried = answered.filter((c) => c.attempts > 1);
const fellBack = answered.filter((c) => c.service !== "cloudflare");
console.log(
  `\n${answered.length} live answers and ${calls.length - live.length} answers from the cache. ` +
    `${failed.length} failed attempts (${failedOutsideCheck.length} outside the model check: ${[
      ...new Set(failedOutsideCheck.map((c) => `${c.service} ${"error" in c ? (c as { error?: string }).error : ""}`)),
    ].join(", ")}). ` +
    `Answers that needed a retry: ${retried.length} (${pct(retried.length, answered.length)}). ` +
    `Answers from a fallback host: ${fellBack.length} (${pct(fellBack.length, answered.length)}).\n`,
);

// TabPFN: each recorded ranker response holds the service's own time for the request.
const rankDir = join(ROOT, "agent/fixtures/ranker");
const ranks = readdirSync(rankDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(rankDir, f), "utf8")) as { ms?: number; usage?: { apiCalls: number } });
const ms = ranks.flatMap((r) => (typeof r.ms === "number" ? [r.ms] : []));
console.log("## TabPFN rankings (recorded by agent/src/tools/ranker.ts)\n");
console.log(
  table(
    ["Rankings", "Median ms", "90th percentile ms", "Prior Labs API calls"],
    [[ms.length, n(quantile(ms, 0.5)), n(quantile(ms, 0.9)), ranks.reduce((a, r) => a + (r.usage?.apiCalls ?? 0), 0)]],
  ),
);

// SerpApi: the live searches, by kind.
const serp = read<{ liveSearches: number; log: Array<{ engine: string; note?: string }> }>(
  "data/demo/usage/serpapi.json",
);
const kinds = new Map<string, number>();
for (const e of serp.log) if (e.engine !== "reconcile") kinds.set(e.engine, (kinds.get(e.engine) ?? 0) + 1);
console.log("\n## SerpApi\n");
console.log(
  table(
    ["Kind", "Logged requests"],
    [...kinds.entries()].map(([k, v]) => [k, v]),
  ),
);
console.log(`\nLive searches counted against the cap: ${serp.liveSearches}.\n`);

// Saved plans: which rungs of the fallback ladder each week used.
console.log("## Saved plans (data/demo/plans, synthetic families, live-search places)\n");
const planDir = join(ROOT, "data/demo/plans");
const planRows: Array<Array<string | number>> = [];
for (const f of readdirSync(planDir).filter((x) => x.endsWith(".json"))) {
  const p = JSON.parse(readFileSync(join(planDir, f), "utf8")) as {
    label?: string;
    sameLanguageFound: boolean;
    suggestions: Array<{ ladderLevel: number; firstRideTogether: boolean }>;
  };
  const levels = new Map<number, number>();
  for (const s of p.suggestions) levels.set(s.ladderLevel, (levels.get(s.ladderLevel) ?? 0) + 1);
  planRows.push([
    f.replace(/\.json$/, ""),
    p.suggestions.length,
    p.sameLanguageFound ? "yes" : "no",
    [...levels.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([l, c]) => `${c} at ${l}`)
      .join(", "),
    p.suggestions.filter((s) => s.firstRideTogether).length,
  ]);
}
console.log(
  table(["Plan", "Outings", "Same-language option found", "Ladder levels used", "First rides together"], planRows),
);

// The demo weeks' cards and clips.
console.log("\n## The demo weeks' cards\n");
const cardRows: Array<Array<string | number>> = [];
for (const slug of ["fremont-demo", "munich-demo"]) {
  const w = read<{ outings: Array<{ cards: Array<{ writer: { kind: string }; rubric: { passed: boolean } }> }> }>(
    `data/demo/weeks/${slug}.json`,
  );
  const cards = w.outings.flatMap((o) => o.cards);
  const kinds2 = new Map<string, number>();
  for (const c of cards) kinds2.set(c.writer.kind, (kinds2.get(c.writer.kind) ?? 0) + 1);
  cardRows.push([
    slug,
    cards.length,
    [...kinds2.entries()].map(([k, v]) => `${v} ${k}`).join(", "),
    cards.filter((c) => c.rubric.passed).length,
  ]);
}
console.log(table(["Week", "Cards", "Writer", "Passing the rubric"], cardRows));

const manifest = read<{ clips: Record<string, { lang: string; seconds?: number; cer?: number }> }>(
  "data/demo/audio/manifest.json",
);
const byLang = new Map<string, Array<{ seconds?: number; cer?: number }>>();
for (const c of Object.values(manifest.clips)) byLang.set(c.lang, [...(byLang.get(c.lang) ?? []), c]);
console.log("\n## Saved clips (data/demo/audio/manifest.json)\n");
console.log(
  table(
    ["Language", "Clips", "Seconds of audio", "Mean CER"],
    [...byLang.entries()].map(([l, v]) => [
      l,
      v.length,
      n(v.reduce((a, c) => a + (c.seconds ?? 0), 0)),
      (v.reduce((a, c) => a + (c.cer ?? 0), 0) / v.length).toFixed(3),
    ]),
  ),
);
