import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { OutingFeatures } from "@roundtrip/core";
import { type DataClass, outboundFetch } from "@roundtrip/core/privacy";
import { repoRoot } from "@roundtrip/core/server-env";
import { hashKey } from "../gemma/store";

/**
 * Client for the ranker service (ranker/, FastAPI + tabpfn-client). Requests and responses are
 * saved under agent/fixtures/ranker/, so the planner's tests replay them without the service.
 * Only feature rows with no names leave this process.
 */

export interface RankResult {
  index: number;
  pGo: number;
  enjoyment: number;
  combined: number;
  reasons: Array<{ feature: string; direction: "for" | "against"; label: string }>;
}

export interface RankResponse {
  results: RankResult[];
  usage: { apiCalls: number; cacheHits: number };
  ms: number;
}

export const RANKER_VERSION = "v3-grouped-reasons";
const DIR = () => join(repoRoot(), "agent/fixtures/ranker");

export async function rankOutings(
  past: Array<{ features: OutingFeatures; went: number; enjoyment: number | null }>,
  candidates: OutingFeatures[],
  opts: { drop?: string[]; reasons?: boolean; dataClass: DataClass; env?: NodeJS.ProcessEnv } = {
    dataClass: "synthetic",
  },
): Promise<RankResponse & { cached: boolean }> {
  const env = opts.env ?? process.env;
  const body = { past, candidates, drop: opts.drop ?? [], reasons: opts.reasons ?? true };
  // Bump RANKER_VERSION when the ranker's scoring or reason logic changes, so stale recordings aren't replayed.
  const key = hashKey({ rank: RANKER_VERSION, ...body });
  const file = join(DIR(), `${key}.json`);
  try {
    return { ...(JSON.parse(await readFile(file, "utf8")) as RankResponse), cached: true };
  } catch {}
  if (env.CI || env.RANKER_MODE === "replay") throw new Error(`No recorded ranker response ${key.slice(0, 12)}.`);
  const base = env.RANKER_URL ?? "http://127.0.0.1:8100";
  const url = `${base.replace(/\/$/, "")}/rank`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (env.RANKER_SHARED_KEY) headers["x-ranker-key"] = env.RANKER_SHARED_KEY;
  const res = await (url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost")
    ? fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(300_000) })
    : outboundFetch("ranker", opts.dataClass, url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(300_000),
      }));
  if (!res.ok) throw new Error(`Ranker HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const json = (await res.json()) as RankResponse;
  await mkdir(DIR(), { recursive: true });
  await writeFile(file, `${JSON.stringify(json)}\n`, "utf8");
  return { ...json, cached: false };
}
