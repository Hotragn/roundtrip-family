import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { OutingFeatures } from "@roundtrip/core";
import { type DataClass, outboundFetch } from "@roundtrip/core/privacy";
import { repoRoot } from "@roundtrip/core/server-env";
import { hashKey } from "../gemma/store";
import { span } from "../observability/trace";

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
  const attributes = { "roundtrip.past_rows": past.length, "roundtrip.candidates": candidates.length };
  return span("rank with TabPFN", "ranker.tabpfn", attributes, () => rankLive(env, body, file, opts.dataClass));
}

/** The ranker didn't answer or failed twice. The dashboard tells the visitor to try again in a minute. */
export class RankerUnavailable extends Error {
  override name = "RankerUnavailable";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isLocal = (url: string) => url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost");
const send = (url: string, init: RequestInit, dataClass: DataClass) =>
  isLocal(url) ? fetch(url, init) : outboundFetch("ranker", dataClass, url, init);

/**
 * Waits until the ranker answers /health. On Render's free plan it sleeps after 15 idle minutes
 * and takes 30 to 60 seconds to start, and while it starts Render may answer with an error
 * instead of holding the request, so this asks again every few seconds until the budget runs out.
 * Sends no data. With no RANKER_URL (a local ranker, or tests) there's nothing to wake.
 */
export async function rankerAwake(env: NodeJS.ProcessEnv = process.env, budgetMs = 90_000): Promise<boolean> {
  if (!env.RANKER_URL) return true;
  const url = `${env.RANKER_URL.replace(/\/$/, "")}/health`;
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    try {
      const left = deadline - Date.now();
      const res = await send(
        url,
        { signal: AbortSignal.timeout(Math.max(1_000, Math.min(30_000, left))) },
        "synthetic",
      );
      if (res.ok) return true;
    } catch {}
    await sleep(Math.min(3_000, Math.max(0, deadline - Date.now())));
  }
  return false;
}

/**
 * POSTs one ranking, trying once more after a short pause if the ranker errs or times out:
 * a ranker that has just woken, or a busy Prior Labs API behind it, often fails once and then
 * answers. A request the ranker refuses (4xx other than 429) isn't retried.
 */
export async function postRanking(
  url: string,
  init: { headers: Record<string, string>; body: string },
  dataClass: DataClass,
  opts: { timeoutMs?: number; pauseMs?: number } = {},
): Promise<RankResponse> {
  let last = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (attempt === 2) await sleep(opts.pauseMs ?? 3_000);
    let res: Response;
    try {
      res = await send(
        url,
        { method: "POST", ...init, signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000) },
        dataClass,
      );
    } catch (e) {
      last = e instanceof Error ? `${e.name}: ${e.message.slice(0, 160)}` : String(e);
      continue;
    }
    if (res.ok) return (await res.json()) as RankResponse;
    last = `Ranker HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`;
    if (res.status < 500 && res.status !== 429) throw new Error(last);
  }
  throw new RankerUnavailable(last);
}

async function rankLive(
  env: NodeJS.ProcessEnv,
  body: Record<string, unknown>,
  file: string,
  dataClass: DataClass,
): Promise<RankResponse & { cached: boolean }> {
  const base = env.RANKER_URL ?? "http://127.0.0.1:8100";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (env.RANKER_SHARED_KEY) headers["x-ranker-key"] = env.RANKER_SHARED_KEY;
  const json = await postRanking(`${base.replace(/\/$/, "")}/rank`, { headers, body: JSON.stringify(body) }, dataClass);
  await mkdir(DIR(), { recursive: true });
  await writeFile(file, `${JSON.stringify(json)}\n`, "utf8");
  return { ...json, cached: false };
}
