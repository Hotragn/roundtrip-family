/**
 * Writes cards for a JSONL file of outings with one of the app's card writers, for the
 * fine-tune evaluation. Each input line has {"id", "facts"}; each output line has the id and the
 * WrittenCard (title, body, writer, rubric, attempts), or an error. Ids already in the output are
 * skipped. Writers:
 *   gemma        GemmaCardWriter, the current writer (docs/card-style.md as its prompt)
 *   tinker-base  Qwen/Qwen3.5-4B on Tinker with the same card-style prompt, untuned
 *   tinker-lora  the trained adapter in data/demo/finetune/adapter.json, facts only
 * Tinker calls go through agent/src/tinker/client.ts (spend cap, ledger, cache by prompt).
 * Run from the repo root: pnpm exec tsx finetune/ts/write.ts <writer> <outings.jsonl> <cards.jsonl>
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { loadEnv } from "../../packages/core/src/server-env";

await loadEnv();
const { GemmaCardWriter } = await import("../../agent/src/cards/writer");
const { TinkerCardWriter } = await import("../../agent/src/cards/tinker-writer");

const [kind, input, output] = process.argv.slice(2);
if (!kind || !input || !output)
  throw new Error("Usage: tsx finetune/ts/write.ts <writer> <outings.jsonl> <cards.jsonl>");

const writer =
  kind === "gemma"
    ? new GemmaCardWriter()
    : kind === "tinker-base"
      ? new TinkerCardWriter({ model: "Qwen/Qwen3.5-4B", includeStyle: true })
      : kind === "tinker-lora"
        ? TinkerCardWriter.tuned()
        : null;
if (!writer) throw new Error(`Unknown writer ${kind}`);

const readLines = (p: string) =>
  existsSync(p)
    ? readFileSync(p, "utf8")
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l) as Record<string, unknown>)
    : [];

const done = new Set(readLines(output).map((r) => r.id as string));
const rows = readLines(input).filter((r) => !done.has(r.id as string));
let failed = 0;

async function run(row: Record<string, unknown>): Promise<void> {
  try {
    // biome-ignore lint/suspicious/noExplicitAny: outing rows come straight from JSONL
    const card = await writer!.write(row.facts as any);
    appendFileSync(output, `${JSON.stringify({ id: row.id, ...card })}\n`, "utf8");
  } catch (e) {
    failed++;
    appendFileSync(
      output,
      `${JSON.stringify({ id: row.id, error: e instanceof Error ? e.message.slice(0, 300) : "error" })}\n`,
      "utf8",
    );
  }
}

const CONCURRENCY = kind === "gemma" ? 2 : 4;
for (let i = 0; i < rows.length; i += CONCURRENCY) {
  await Promise.all(rows.slice(i, i + CONCURRENCY).map(run));
}
console.log(`${kind}: wrote ${rows.length - failed} cards, ${failed} failed.`);
