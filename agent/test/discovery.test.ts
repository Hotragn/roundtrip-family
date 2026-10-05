import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadFremontPersona } from "@roundtrip/core/persona";
import { describe, expect, it } from "vitest";
import { ladderQueries, levelFor } from "../src/discovery/ladder";
import { candidateFromPlace, isGoodPlace, mergeCandidates } from "../src/planner/candidates";
import { discoverCandidates } from "../src/planner/discover";
import { bozemanHousehold } from "../src/planner/weeks";
import { areaOf, searchPlaces } from "../src/tools/discovery";
import { assertPublicQuery, SearchBudgetReached, SerpApi } from "../src/tools/serpapi";

process.env.LLM_MODE ??= "replay";
const WEEK = { weekKey: "2026-W41", weekLabel: "Monday 2026-10-05 to Sunday 2026-10-11", month: 10 };

describe("search queries", () => {
  it("carry only language, interest and area", () => {
    expect(() => assertPublicQuery({ q: "Telugu events in Fremont, California" })).not.toThrow();
    expect(() => assertPublicQuery({ q: "events for Sarala in Fremont" })).toThrow(/personal/);
    expect(() => assertPublicQuery({ q: "call 510 555 0142" })).toThrow(/personal/);
  });

  it("follow the ladder, with festivals in season", () => {
    const q = ladderQueries("te", 10, "en");
    expect(q[1].map((x) => x.interest)).toContain("Bathukamma celebration");
    expect(q[2].some((x) => x.interest === "Hindu temple")).toBe(true);
    expect(ladderQueries("te", 10, "de")[4].some((x) => x.interest === "Stadtbibliothek")).toBe(true);
    expect(levelFor(2, "festival")).toBe(1);
    expect(levelFor(0, "senior_program")).toBe(4);
    expect(levelFor(0, "market")).toBe(3);
  });
});

describe("SerpApi budget", () => {
  it("refuses a live search once the cap is reached and never counts cache hits", async () => {
    const dir = mkdtempSync(join(tmpdir(), "serp-"));
    const usageFile = join(dir, "usage.json");
    writeFileSync(usageFile, JSON.stringify({ liveSearches: 2, log: [] }));
    let calls = 0;
    const serp = new SerpApi({
      env: { SERPAPI_API_KEY: "k", SERPAPI_MAX_SEARCHES: "3" } as unknown as NodeJS.ProcessEnv,
      mode: "live",
      fixturesDir: join(dir, "fx"),
      usageFile,
      fetchImpl: (async () => {
        calls++;
        return new Response(JSON.stringify({ local_results: [] }), { status: 200 });
      }) as unknown as typeof fetch,
    });
    await serp.search("google_maps", { q: "park" }, { week: "w", note: "a" });
    expect(await serp.used()).toBe(3);
    await serp.search("google_maps", { q: "park" }, { week: "w", note: "a" });
    expect(calls).toBe(1);
    await expect(serp.search("google_maps", { q: "library" }, { week: "w", note: "b" })).rejects.toBeInstanceOf(
      SearchBudgetReached,
    );
  });

  it("doesn't count failed searches", async () => {
    const dir = mkdtempSync(join(tmpdir(), "serp-"));
    const usageFile = join(dir, "usage.json");
    const serp = new SerpApi({
      env: { SERPAPI_API_KEY: "k", SERPAPI_MAX_SEARCHES: "5" } as unknown as NodeJS.ProcessEnv,
      mode: "live",
      fixturesDir: join(dir, "fx"),
      usageFile,
      fetchImpl: (async () => new Response("nope", { status: 400 })) as unknown as typeof fetch,
    });
    await expect(serp.search("google_maps", { q: "x" }, { week: "w", note: "x" })).rejects.toThrow(/HTTP 400/);
    expect(await serp.used()).toBe(0);
  });
});

describe("discovery from saved live results (offline)", () => {
  const serp = new SerpApi({ mode: "replay" });

  it("keeps real venues of the expected kind", async () => {
    const area = areaOf(loadFremontPersona().household);
    const libs = await searchPlaces(serp, { interest: "public library", area, weekKey: WEEK.weekKey });
    const good = libs.filter(isGoodPlace).map((p) => p.title);
    expect(good).toContain("Fremont Main Library");
    expect(good.some((t) => /Foundation|Administration/.test(t))).toBe(false);
    const c = candidateFromPlace(libs.find((p) => p.title === "Fremont Main Library")!, "Telugu");
    expect(c?.ladderLevel).toBe(4);
  });

  it("merges an event and a place at the same venue", () => {
    const base = {
      kind: "place" as const,
      address: "x",
      location: { lat: 1, lng: 1 },
      ladderLevel: 3 as const,
      languageMatch: 0 as const,
      category: "farmers_market",
      indoor: false,
      costUsd: 0,
      foodAvailable: true,
      languageNeeded: true,
      groupSize: "large" as const,
      description: "",
      start: null,
      end: null,
      suitsOlderAdults: true,
      provenance: "live_search" as const,
      query: "",
    };
    const merged = mergeCandidates([
      { ...base, id: "a", title: "Niles Fremont Farmer's Market", venueName: "Niles Fremont Farmer's Market" },
      {
        ...base,
        id: "b",
        kind: "event",
        location: null,
        start: "2026-10-10T09:00:00-07:00",
        title: "Niles Fremont Farmers Market",
        venueName: "Niles Fremont Farmer's Market",
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.start).not.toBeNull();
    expect(merged[0]!.location).not.toBeNull();
  });

  it("still finds two or three options in an area with no Telugu events", async () => {
    const { candidates } = await discoverCandidates(bozemanHousehold().household, { serp, ...WEEK });
    expect(candidates.some((c) => c.ladderLevel === 1)).toBe(false);
    expect(candidates.filter((c) => c.ladderLevel >= 3).length).toBeGreaterThanOrEqual(2);
  });
});
