/**
 * Plans the ten demo weeks with the Mastra planner on Gemma and saves each plan to
 * data/demo/plans/<id>.json. Live mode records every model call, so the route-to-humans test
 * can replay them in CI. Needs the ranker service (cd ranker && uv run python serve.py).
 * Run: pnpm --filter @roundtrip/scripts exec tsx plan-weeks.ts [weekId ...]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnv, repoRoot } from "@roundtrip/core/server-env";

await loadEnv();
const { DEMO_WEEKS } = await import("../agent/src/planner/weeks");
const { planWeek } = await import("../agent/src/planner/index");

const only = process.argv.slice(2);
const OUT = join(repoRoot(), "data/demo/plans");
mkdirSync(OUT, { recursive: true });

for (const week of DEMO_WEEKS.filter((w) => only.length === 0 || only.includes(w.id))) {
  const ctx = await week.build("live");
  const plan = await planWeek(ctx);
  writeFileSync(
    join(OUT, `${week.id}.json`),
    `${JSON.stringify({ demoWeek: week.id, label: week.label, weekSource: week.provenance, ...plan }, null, 1)}\n`,
  );
  console.log(`\n## ${week.label} (${week.provenance}) — ${plan.suggestions.length} suggestions, ${plan.stats.ms} ms`);
  console.log(`note: ${plan.note}`);
  for (const s of plan.suggestions) {
    console.log(
      `- [L${s.ladderLevel}] ${s.candidate.title} | ${s.role} | ${s.slot.day} ${Math.floor(s.slot.depart / 60)}:${String(s.slot.depart % 60).padStart(2, "0")}${s.slot.withAdultChild ? " with you" : ""} | score ${s.score.combined.toFixed(2)} | ${s.chips.map((c) => c.label).join("; ")}`,
    );
    console.log(`    ${s.reasonText}`);
  }
  if (plan.rejected.length) console.log("rejected:", plan.rejected);
  console.log(
    `model calls ${plan.stats.modelCalls} (cached ${plan.stats.cachedModelCalls}, fallbacks ${plan.stats.fallbacks}, failed attempts ${plan.stats.retries}); tools: ${plan.stats.toolCalls.map((t) => t.tool).join(", ")}`,
  );
}
