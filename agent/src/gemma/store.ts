import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { repoRoot } from "@roundtrip/core/server-env";

export interface CachedResponse {
  body: unknown;
  provider: string;
  model: string;
  createdAt: string;
}

/** Response cache keyed by a hash of the prompt. The file cache under data/demo is the recording CI replays. */
export interface LlmCache {
  get(key: string): Promise<CachedResponse | null>;
  set(key: string, value: CachedResponse): Promise<void>;
}

export class FileCache implements LlmCache {
  constructor(private readonly dir = join(repoRoot(), "data/demo/llm-cache")) {}
  private path(key: string) {
    return join(this.dir, key.slice(0, 2), `${key}.json`);
  }
  async get(key: string): Promise<CachedResponse | null> {
    try {
      return JSON.parse(await readFile(this.path(key), "utf8")) as CachedResponse;
    } catch {
      return null;
    }
  }
  async set(key: string, value: CachedResponse): Promise<void> {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, `${JSON.stringify(value, null, 1)}\n`, "utf8");
  }
}

export class MemoryCache implements LlmCache {
  readonly map = new Map<string, CachedResponse>();
  async get(key: string) {
    return this.map.get(key) ?? null;
  }
  async set(key: string, value: CachedResponse) {
    this.map.set(key, value);
  }
}

export interface CallLog {
  ts: string;
  service: string;
  model: string;
  purpose: string;
  promptTokens: number | null;
  completionTokens: number | null;
  neurons: number | null;
  latencyMs: number;
  cached: boolean;
  attempts: number;
  ok: boolean;
  error?: string;
}

/** Daily neuron counter and a call log, for the free-tier budget and docs/costs.md. */
export interface UsageStore {
  neuronsOn(day: string): Promise<number>;
  addNeurons(day: string, neurons: number): Promise<void>;
  log(entry: CallLog): Promise<void>;
}

export class FileUsageStore implements UsageStore {
  constructor(private readonly dir = join(repoRoot(), "data/demo/usage")) {}
  private async readDays(): Promise<Record<string, number>> {
    try {
      return JSON.parse(await readFile(join(this.dir, "neurons-by-day.json"), "utf8")) as Record<string, number>;
    } catch {
      return {};
    }
  }
  async neuronsOn(day: string) {
    return (await this.readDays())[day] ?? 0;
  }
  async addNeurons(day: string, neurons: number) {
    const days = await this.readDays();
    days[day] = Math.round(((days[day] ?? 0) + neurons) * 100) / 100;
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, "neurons-by-day.json"), `${JSON.stringify(days, null, 2)}\n`, "utf8");
  }
  async log(entry: CallLog) {
    await mkdir(this.dir, { recursive: true });
    await appendFile(join(this.dir, "gemma-calls.jsonl"), `${JSON.stringify(entry)}\n`, "utf8");
  }
}

export class MemoryUsageStore implements UsageStore {
  readonly days = new Map<string, number>();
  readonly calls: CallLog[] = [];
  async neuronsOn(day: string) {
    return this.days.get(day) ?? 0;
  }
  async addNeurons(day: string, neurons: number) {
    this.days.set(day, (this.days.get(day) ?? 0) + neurons);
  }
  async log(entry: CallLog) {
    this.calls.push(entry);
  }
}

/** Stable JSON: object keys sorted, so equal requests hash equally. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

export function hashKey(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

export function utcDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}
