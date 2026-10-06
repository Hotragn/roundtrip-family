/**
 * Runs the Gemma judge (agent/src/cards/judge.ts) over a JSONL file of tasks, for the
 * fine-tune's quality gate and evaluation. Each input line is
 *   {"id", "task": "card", "facts", "card": {"title", "body"}} or
 *   {"id", "task": "pair", "facts", "a": {...}, "b": {...}}.
 * Each result line repeats the id with the verdict, or an error. Ids already in the output are
 * skipped, so a run resumes where it stopped. Gemma calls go through the repo's Gemma helper:
 * cached by prompt, within Cloudflare's daily neurons, with the OpenRouter fallback.
 * With --judge=kimi, pair tasks go to Kimi-K2.6 on Tinker instead (a third model family, for pairs
 * where one card is Gemma's own), through agent/src/tinker/client.ts with its spend cap and cache.
 * Run from the repo root: pnpm exec tsx finetune/ts/judge.ts <tasks.jsonl> <results.jsonl> [--judge=kimi]
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { loadEnv } from "../../packages/core/src/server-env";

await loadEnv();
const { judgeCard, judgePair, judgePairOnTinker } = await import("../../agent/src/cards/judge");
const { gemma } = await import("../../agent/src/gemma");
const { Tinker } = await import("../../agent/src/tinker/client");

const [input, output, flag] = process.argv.slice(2);
const kimi = flag === "--judge=kimi" ? new Tinker() : null;
if (!input || !output) throw new Error("Usage: tsx finetune/ts/judge.ts <tasks.jsonl> <results.jsonl>");

const readLines = (p: string) =>
  existsSync(p)
    ? readFileSync(p, "utf8")
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l) as Record<string, unknown>)
    : [];

const done = new Set(readLines(output).map((r) => r.id as string));
const tasks = readLines(input).filter((t) => !done.has(t.id as string));
const g = gemma();
let failed = 0;

async function run(t: Record<string, unknown>): Promise<void> {
  // biome-ignore lint/suspicious/noExplicitAny: task rows come straight from JSONL
  const task = t as any;
  try {
    const verdict =
      task.task === "pair"
        ? kimi
          ? await judgePairOnTinker(task.facts, task.a, task.b, kimi)
          : await judgePair(task.facts, task.a, task.b, g)
        : await judgeCard(task.facts, task.card, g);
    appendFileSync(output, `${JSON.stringify({ id: task.id, ...verdict })}\n`, "utf8");
  } catch (e) {
    failed++;
    appendFileSync(
      output,
      `${JSON.stringify({ id: task.id, error: e instanceof Error ? e.message.slice(0, 300) : "error" })}\n`,
      "utf8",
    );
  }
}

const CONCURRENCY = 4;
for (let i = 0; i < tasks.length; i += CONCURRENCY) {
  await Promise.all(tasks.slice(i, i + CONCURRENCY).map(run));
}
console.log(
  `Judged ${tasks.length} tasks (${failed} failed): ${g.counters.live} live Gemma calls, ${g.counters.cached} cached, ${g.counters.fallbacks} fallbacks.`,
);
