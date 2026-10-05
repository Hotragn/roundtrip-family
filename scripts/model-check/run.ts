/**
 * Model check (playbook Phase 3, text part): do these models work in Telugu?
 * All inputs are synthetic; scores are automated, not reviewed by native speakers.
 *
 * - 20 everyday English sentences, translated to Telugu by each system.
 * - Back-translation to English by one fixed back-translator (Gemma on Cloudflare), scored by
 *   EmbeddingGemma cosine similarity to the original.
 * - A judge from a different family than Gemma and Qwen (Kimi-K2.6 on Tinker) rates fluency and
 *   correctness from 1 to 5.
 * - 5 synthetic event listings converted to the event schema by Gemma; does the JSON validate?
 * - Telugu script integrity on every output.
 * Writes docs/model-check.md and data/demo/model-check/results.json.
 * Run: pnpm --filter @roundtrip/scripts exec tsx model-check/run.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadEnv, repoRoot } from "@roundtrip/core/server-env";
import { z } from "zod";

await loadEnv();
const { Gemma, defaultConfig, PROVIDERS, cosine, gemma } = await import("@roundtrip/agent/gemma");
const { Tinker, tinkerSpent } = await import("@roundtrip/agent/tinker");
const { checkTeluguScript } = await import("@roundtrip/agent/telugu");

const ROOT = repoRoot();
const SENTENCES = [
  "The bus comes at ten in the morning.",
  "Press the red strip after the big Safeway.",
  "Where is the bathroom?",
  "Please call this number.",
  "The library has a Telugu book shelf.",
  "Today there is a walking group in the park at nine.",
  "Come home before one o'clock for lunch and rest.",
  "The temple serves free lunch on Saturdays.",
  "Show this card to the driver.",
  "Your stop is the next one.",
  "It will be hot today, so carry water and walk in the shade.",
  "This group meets every Wednesday, and no English is needed.",
  "If you feel lost, show the help card to someone at the counter.",
  "The ticket costs two dollars and fifty cents.",
  "Mrs. Chen suggested the Asian market on Mowry Avenue.",
  "Ask the woman at the front desk how to volunteer.",
  "Tap I'm home when you are back.",
  "The ride takes twenty-five minutes with six stops.",
  "Sit near the front so you can see the screen.",
  "Bring your reading glasses for the menu.",
];

const SYSTEM_PROMPT =
  "You translate short English sentences for Telugu-speaking parents from Guntur, coastal Andhra Pradesh. " +
  "Write natural, warm, respectful Telugu with మీరు forms, the way a neighbor's daughter would speak. " +
  "Keep names of buses, streets, stores and places exactly in English letters. Reply with only the Telugu sentence.";

const gemmaCF = new Gemma({ ...defaultConfig(), providers: [PROVIDERS[0]!] });
const gemmaOR = new Gemma({
  ...defaultConfig(),
  providers: [PROVIDERS[1]!],
  cacheNamespace: "openrouter-31b",
  maxAttemptsPerProvider: 4,
  baseDelayMs: 4000,
});
const tinker = new Tinker();

interface System {
  id: string;
  label: string;
  family: string;
  translate: (s: string) => Promise<{ text: string; latencyMs: number }>;
}

const msgs = (s: string) => [
  { role: "system" as const, content: SYSTEM_PROMPT },
  { role: "user" as const, content: s },
];

const viaTinker = (model: string) => async (s: string) => {
  const r = await tinker.chat({
    model,
    messages: msgs(s),
    purpose: "model-check:translate",
    dataClass: "synthetic",
    maxTokens: 160,
    temperature: 0.2,
  });
  return { text: r.text.trim(), latencyMs: r.latencyMs };
};

const SYSTEMS: System[] = [
  {
    id: "gemma-cf",
    label: "Gemma 4 26B A4B (Cloudflare Workers AI)",
    family: "Gemma",
    translate: async (s) => {
      const r = await gemmaCF.chat({
        messages: msgs(s),
        purpose: "model-check:translate",
        dataClass: "synthetic",
        temperature: 0.2,
        maxTokens: 160,
      });
      return { text: r.text.trim(), latencyMs: r.latencyMs };
    },
  },
  {
    id: "gemma-or",
    label: "Gemma 4 31B (OpenRouter free)",
    family: "Gemma",
    translate: async (s) => {
      const r = await gemmaOR.chat({
        messages: msgs(s),
        purpose: "model-check:translate",
        dataClass: "synthetic",
        temperature: 0.2,
        maxTokens: 160,
      });
      return { text: r.text.trim(), latencyMs: r.latencyMs };
    },
  },
  { id: "qwen-4b", label: "Qwen3.5-4B base (Tinker)", family: "Qwen", translate: viaTinker("Qwen/Qwen3.5-4B") },
  {
    id: "qwen-35b",
    label: "Qwen3.6-35B-A3B (Tinker, teacher candidate)",
    family: "Qwen",
    translate: viaTinker("Qwen/Qwen3.6-35B-A3B"),
  },
  {
    id: "qwen-397b",
    label: "Qwen3.5-397B-A17B (Tinker, teacher candidate)",
    family: "Qwen",
    translate: viaTinker("Qwen/Qwen3.5-397B-A17B"),
  },
];

const Judgement = z.object({
  fluency: z.number().int().min(1).max(5),
  correctness: z.number().int().min(1).max(5),
  note: z.string().max(200),
});

async function judge(english: string, telugu: string) {
  const r = await tinker.chat({
    model: "moonshotai/Kimi-K2.6",
    purpose: "model-check:judge",
    dataClass: "synthetic",
    maxTokens: 160,
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "You are a careful native Telugu reviewer from coastal Andhra Pradesh. Rate a Telugu translation of an English sentence. " +
          "fluency: 1 (broken) to 5 (natural, warm and respectful, as a neighbor's daughter would speak to an elder). " +
          "correctness: 1 (wrong meaning) to 5 (exact meaning, nothing added or lost; names kept in English letters). " +
          'Reply with only JSON: {"fluency": n, "correctness": n, "note": "under 20 words"}',
      },
      { role: "user", content: `English: ${english}\nTelugu: ${telugu}` },
    ],
  });
  const m = r.text.match(/\{[\s\S]*\}/);
  const parsed = m ? Judgement.safeParse(JSON.parse(m[0])) : null;
  return parsed?.success ? parsed.data : null;
}

async function backTranslate(telugu: string) {
  const r = await gemmaCF.chat({
    purpose: "model-check:back-translate",
    dataClass: "synthetic",
    temperature: 0,
    maxTokens: 120,
    messages: [
      {
        role: "system",
        content: "Translate the Telugu sentence into plain English. Reply with only the English sentence.",
      },
      { role: "user", content: telugu },
    ],
  });
  return r.text.trim();
}

interface Row {
  system: string;
  english: string;
  telugu: string;
  back: string;
  similarity: number | null;
  fluency: number | null;
  correctness: number | null;
  note: string;
  script: ReturnType<typeof checkTeluguScript> | null;
  latencyMs: number | null;
  error?: string;
}

const rows: Row[] = [];
const spentBefore = await tinkerSpent();
const enEmb = await gemma().embed(SENTENCES, "synthetic");

for (const system of SYSTEMS) {
  for (const [i, english] of SENTENCES.entries()) {
    const row: Row = {
      system: system.id,
      english,
      telugu: "",
      back: "",
      similarity: null,
      fluency: null,
      correctness: null,
      note: "",
      script: null,
      latencyMs: null,
    };
    try {
      const t = await system.translate(english);
      row.telugu = t.text;
      row.latencyMs = t.latencyMs;
      row.script = checkTeluguScript(t.text);
      row.back = await backTranslate(t.text);
      const [b] = await gemma().embed([row.back], "synthetic");
      row.similarity = cosine(enEmb[i]!, b!);
      const j = await judge(english, t.text);
      if (j) {
        row.fluency = j.fluency;
        row.correctness = j.correctness;
        row.note = j.note;
      }
    } catch (e) {
      row.error = e instanceof Error ? `${e.name}: ${e.message.slice(0, 160)}` : String(e);
    }
    rows.push(row);
    process.stdout.write(`${system.id} ${i + 1}/${SENTENCES.length}${row.error ? " (error)" : ""}\r`);
  }
  console.log(`${system.id}: done`);
}

// Event listings: structured extraction with the event schema.
const LISTINGS = [
  "Bathukamma celebration by the Telugu association of the Bay Area. Saturday Oct 10, 4 pm to 8 pm, Fremont community hall. Free entry, dinner for sale.",
  "Senior center chair yoga. Tuesdays 10:00 to 11:00 am. Free for members, $3 drop-in. Indoors, all levels.",
  "Telugu movie screening with English subtitles, Saturday 7 pm, Cinemark Fremont. Tickets $14.",
  "English conversation circle for newcomers at the Fremont Main Library, Wednesdays 10:30 am. Free.",
  "Farmers market at the Irvington district, Sundays 9 am to 1 pm, outdoors. Free to visit.",
];
const EventFields = z.object({
  languageMatch: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  suitsOlderAdults: z.boolean(),
  indoor: z.boolean().nullable(),
  free: z.boolean(),
  costAmount: z.number().nullable(),
  category: z.string(),
});
const eventResults: Array<{ listing: string; ok: boolean; data?: unknown; error?: string; latencyMs?: number }> = [];
for (const listing of LISTINGS) {
  try {
    const r = await gemmaCF.chatJson({
      purpose: "model-check:event-json",
      dataClass: "synthetic",
      schema: EventFields,
      schemaName: "event_fields",
      messages: [
        {
          role: "system",
          content:
            "Extract fields from a local event listing for Telugu-speaking parents in their 60s. languageMatch: 2 if the event is in Telugu or by a Telugu group, 1 if Indian or South Asian but not Telugu, 0 otherwise. suitsOlderAdults: true unless the event is clearly unsuitable (late night, strenuous, adults-only nightlife). indoor: true, false, or null if unknown. category: one short word.",
        },
        { role: "user", content: listing },
      ],
    });
    eventResults.push({ listing, ok: true, data: r.data, latencyMs: r.latencyMs });
  } catch (e) {
    eventResults.push({ listing, ok: false, error: e instanceof Error ? e.message.slice(0, 160) : String(e) });
  }
}

const spentAfter = await tinkerSpent();
await mkdir(join(ROOT, "data/demo/model-check"), { recursive: true });
await writeFile(
  join(ROOT, "data/demo/model-check/results.json"),
  `${JSON.stringify({ provenance: "synthetic", ranAt: new Date().toISOString(), rows, eventResults, tinkerSpentUsd: spentAfter - spentBefore }, null, 1)}\n`,
  "utf8",
);

const mean = (xs: Array<number | null | undefined>) => {
  const v = xs.filter((x): x is number => typeof x === "number");
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const fmt = (x: number | null, d = 2) => (x === null ? "n/a" : x.toFixed(d));
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : null;
};

const table = SYSTEMS.map((s) => {
  const r = rows.filter((x) => x.system === s.id);
  const ok = r.filter((x) => !x.error);
  const scriptOk = ok.filter((x) => x.script?.ok).length;
  return `| ${s.label} | ${ok.length}/${r.length} | ${fmt(mean(ok.map((x) => x.similarity)), 3)} | ${fmt(mean(ok.map((x) => x.fluency)))} | ${fmt(
    mean(ok.map((x) => x.correctness)),
  )} | ${scriptOk}/${ok.length} | ${median(ok.map((x) => x.latencyMs ?? 0).filter((x) => x > 0)) ?? "n/a"} |`;
});

const examples = [1, 6, 14].map((i) => {
  const english = SENTENCES[i]!;
  const lines = SYSTEMS.map((s) => {
    const r = rows.find((x) => x.system === s.id && x.english === english);
    return `| ${s.id} | ${r?.telugu || `(${r?.error ?? "no output"})`} | ${r?.fluency ?? "n/a"} / ${r?.correctness ?? "n/a"} |`;
  });
  return [`**${english}**`, "", "| System | Telugu | Fluency / correctness |", "|---|---|---|", ...lines].join("\n");
});

const md = `# Model check

Synthetic inputs, automated scores. Nothing here was reviewed by a native speaker. Run on ${new Date().toISOString().slice(0, 10)} with \`pnpm --filter @roundtrip/scripts exec tsx model-check/run.ts\`; raw results are in \`data/demo/model-check/results.json\`.

## Telugu translation, 20 everyday sentences

Back-translation: Gemma 4 on Cloudflare translates each Telugu output back to English, and EmbeddingGemma scores its cosine similarity to the original (1.0 is identical meaning). Judge: Kimi-K2.6 on Tinker, a different family from Gemma and Qwen, rates fluency and correctness from 1 to 5.

| System | Answered | Back-translation similarity | Judge fluency | Judge correctness | Script intact | Median ms |
|---|---|---|---|---|---|---|
${table.join("\n")}

${examples.join("\n\n")}

## Event listings to JSON (Gemma 4 on Cloudflare)

${eventResults.filter((e) => e.ok).length} of ${eventResults.length} listings returned JSON that validates against the schema.

| Listing | Valid | Extracted |
|---|---|---|
${eventResults.map((e) => `| ${e.listing.slice(0, 60)}... | ${e.ok ? "yes" : "no"} | ${e.ok ? `\`${JSON.stringify(e.data)}\`` : (e.error ?? "")} |`).join("\n")}

## Cost

Tinker spend for this run: $${(spentAfter - spentBefore).toFixed(4)}. Gemma calls ran on Cloudflare's free allowance and OpenRouter's free models.

## Speech

The speech part of the model check (MMS-TTS and Indic Parler-TTS voices, IndicConformer transcription, character error rate) runs in the Codespace with milestone M5 and is reported below when it has run.
`;
await writeFile(join(ROOT, "docs/model-check.md"), md, "utf8");
console.log(md.split("## Event")[0]);
