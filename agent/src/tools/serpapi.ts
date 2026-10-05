import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { outboundFetch } from "@roundtrip/core/privacy";
import { repoRoot } from "@roundtrip/core/server-env";
import { hashKey } from "../gemma/store";

/**
 * SerpApi with a hard search budget and a cache. Every live search counts against
 * SERPAPI_MAX_SEARCHES (persisted in data/demo/usage/serpapi.json); responses are saved as
 * fixtures under agent/fixtures/serpapi/ keyed by the request (minus the key) and the week, so
 * tests and the hosted demo replay them without searching again.
 *
 * Docs: https://serpapi.com/google-events-api, https://serpapi.com/google-maps-api,
 * https://serpapi.com/google-maps-directions-api, https://serpapi.com/search-api
 */

/**
 * "google" with an event query returns Google's events block (events_results); the dedicated
 * google_events engine answered "Unsupported" for this account on 2026-10-05.
 * Docs: https://serpapi.com/events-results
 */
export type Engine = "google" | "google_events" | "google_maps" | "google_maps_directions";

const ROUTE: Record<Engine, "serpapi.events" | "serpapi.maps" | "serpapi.directions"> = {
  google: "serpapi.events",
  google_events: "serpapi.events",
  google_maps: "serpapi.maps",
  google_maps_directions: "serpapi.directions",
};

export class SearchBudgetReached extends Error {
  constructor(used: number, cap: number) {
    super(`SerpApi budget reached: ${used} of ${cap} live searches used.`);
    this.name = "SearchBudgetReached";
  }
}

export class FixtureMissing extends Error {
  constructor(key: string) {
    super(`No saved SerpApi response for ${key.slice(0, 12)} and live search is off.`);
    this.name = "FixtureMissing";
  }
}

export interface SerpResult<T = Record<string, unknown>> {
  data: T;
  cached: boolean;
  key: string;
}

export interface SerpApiOptions {
  env?: NodeJS.ProcessEnv;
  /** "live" searches on a cache miss; "replay" never searches. */
  mode?: "live" | "replay";
  fixturesDir?: string;
  usageFile?: string;
  fetchImpl?: typeof fetch;
}

/** Search terms may contain language, interest and area only; these words would mean personal data leaked in. */
const FORBIDDEN_IN_QUERY = [/\d{3}[\s.-]?\d{3,4}/, /@/, /\b(sarala|venkat|kamala|raghu|chen|huber)\b/i];

export function assertPublicQuery(params: Record<string, string>): void {
  for (const [k, v] of Object.entries(params)) {
    if (k === "start_coords" || k === "end_coords" || k === "ll" || k === "time") continue;
    for (const re of FORBIDDEN_IN_QUERY) {
      if (re.test(v))
        throw new Error(`Search parameter ${k} looks personal; queries carry language, interest and area only.`);
    }
  }
}

export class SerpApi {
  private readonly env: NodeJS.ProcessEnv;
  private readonly mode: "live" | "replay";
  private readonly fixturesDir: string;
  private readonly usageFile: string;
  private readonly fetchImpl?: typeof fetch;

  constructor(opts: SerpApiOptions = {}) {
    this.env = opts.env ?? process.env;
    this.mode = opts.mode ?? (this.env.CI || this.env.SERPAPI_MODE === "replay" ? "replay" : "live");
    this.fixturesDir = opts.fixturesDir ?? join(repoRoot(), "agent/fixtures/serpapi");
    this.usageFile = opts.usageFile ?? join(repoRoot(), "data/demo/usage/serpapi.json");
    this.fetchImpl = opts.fetchImpl;
  }

  get cap(): number {
    const v = Number(this.env.SERPAPI_MAX_SEARCHES);
    return Number.isFinite(v) && v > 0 ? v : 0;
  }

  async used(): Promise<number> {
    try {
      return (JSON.parse(await readFile(this.usageFile, "utf8")) as { liveSearches: number }).liveSearches;
    } catch {
      return 0;
    }
  }

  private async countSearch(entry: { engine: Engine; key: string; note: string }) {
    let state: { liveSearches: number; log: Array<Record<string, unknown>> } = { liveSearches: 0, log: [] };
    try {
      state = JSON.parse(await readFile(this.usageFile, "utf8"));
    } catch {}
    state.liveSearches += 1;
    state.log.push({ ts: new Date().toISOString(), ...entry });
    await mkdir(dirname(this.usageFile), { recursive: true });
    await writeFile(this.usageFile, `${JSON.stringify(state, null, 1)}\n`, "utf8");
  }

  fixturePath(key: string): string {
    return join(this.fixturesDir, `${key}.json`);
  }

  /** `week` scopes the cache: the same query next week searches again. */
  async search<T = Record<string, unknown>>(
    engine: Engine,
    params: Record<string, string>,
    opts: { week: string; note: string },
  ): Promise<SerpResult<T>> {
    assertPublicQuery(params);
    const key = hashKey({ engine, ...params, week: opts.week });
    try {
      const saved = JSON.parse(await readFile(this.fixturePath(key), "utf8")) as { response: T };
      return { data: saved.response, cached: true, key };
    } catch {}
    if (this.mode === "replay") throw new FixtureMissing(key);
    if (!this.env.SERPAPI_API_KEY) throw new Error("SERPAPI_API_KEY is not set.");
    const used = await this.used();
    if (used >= this.cap) throw new SearchBudgetReached(used, this.cap);

    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", engine);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const display = url.toString();
    url.searchParams.set("api_key", this.env.SERPAPI_API_KEY);
    const doFetch = this.fetchImpl ?? ((u: string, i?: RequestInit) => outboundFetch(ROUTE[engine], "public", u, i));
    const res = await doFetch(url.toString(), { signal: AbortSignal.timeout(60_000) });
    // SerpApi only bills successful searches, so only those count against the budget.
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`SerpApi HTTP ${res.status}: ${detail.slice(0, 120)}`);
    }
    await this.countSearch({ engine, key, note: opts.note });
    const data = (await res.json()) as T & { search_metadata?: unknown; search_parameters?: unknown };
    // Keep the response, not the metadata, which echoes request details.
    const { search_metadata: _m, ...response } = data as Record<string, unknown>;
    await mkdir(this.fixturesDir, { recursive: true });
    await writeFile(
      this.fixturePath(key),
      `${JSON.stringify(
        {
          provenance: "live_search",
          engine,
          request: display.replace(/api_key=[^&]+/, ""),
          note: opts.note,
          week: opts.week,
          fetchedAt: new Date().toISOString(),
          response,
        },
        null,
        1,
      )}\n`,
      "utf8",
    );
    return { data: response as T, cached: false, key };
  }
}
