/**
 * Event understanding eval: per-field accuracy against synthetic ground truth.
 * Live (records responses): pnpm --filter @roundtrip/evals eval:events. CI replays the recordings.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnv, repoRoot } from "@roundtrip/core/server-env";

await loadEnv();
const { runEventEval, FIELDS } = await import("./lib/events");
const { UNDERSTAND_VERSION } = await import("@roundtrip/agent/understand");
const r = await runEventEval();
console.log(`Event understanding (${UNDERSTAND_VERSION}), ${r.n} synthetic listings`);
console.log("| Field | Accuracy |\n|---|---|");
for (const f of FIELDS) console.log(`| ${f} | ${(r.accuracy[f] * 100).toFixed(1)}% |`);
const misses = r.rows.filter((x) => !x.hit.languageMatch || !x.hit.suitsOlderAdults || !x.hit.indoor);
for (const m of misses)
  console.log(
    `miss ${m.id}:`,
    JSON.stringify(m.hit),
    JSON.stringify({ lm: m.out.languageMatch, older: m.out.suitsOlderAdults, indoor: m.out.indoor }),
  );
mkdirSync(join(repoRoot(), "evals/results"), { recursive: true });
writeFileSync(
  join(repoRoot(), "evals/results/event-understanding.json"),
  `${JSON.stringify({ provenance: "synthetic", version: UNDERSTAND_VERSION, n: r.n, accuracy: r.accuracy, rows: r.rows }, null, 1)}\n`,
);
