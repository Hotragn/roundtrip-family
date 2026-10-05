import { loadEnv } from "@roundtrip/core/server-env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Inserts synthetic events with EmbeddingGemma vectors into Atlas and finds the most similar
 * ones. Opt-in (RUN_ATLAS=1) because it uses the live database; CI runs the in-code path in
 * similar.test.ts instead.
 */
describe.skipIf(process.env.RUN_ATLAS !== "1")("Atlas similarity (live, synthetic events)", () => {
  const areaKey = `probe-${Date.now()}`;
  const events = [
    { _id: `${areaKey}-1`, title: "Bathukamma celebration by the Telugu association" },
    { _id: `${areaKey}-2`, title: "Senior center chair yoga, Tuesday mornings" },
    { _id: `${areaKey}-3`, title: "Car wash fundraiser in the high school lot" },
    { _id: `${areaKey}-4`, title: "Telugu film screening with English subtitles" },
  ];
  let db: Awaited<ReturnType<typeof import("../src/db").getDb>>;
  let api: typeof import("../src/db");

  beforeAll(async () => {
    await loadEnv();
    api = await import("../src/db");
    const { gemma } = await import("../src/gemma");
    db = await api.getDb();
    const vectors = await gemma().embed(
      events.map((e) => e.title),
      "synthetic",
    );
    await api
      .col(db, "events")
      .insertMany(events.map((e, i) => ({ ...e, areaKey, provenance: "synthetic", embedding: vectors[i] })) as never);
  });

  afterAll(async () => {
    await api.col(db, "events").deleteMany({ areaKey });
    await api.closeDb();
  });

  it("ranks Telugu gatherings above unrelated events", async () => {
    const { gemma } = await import("../src/gemma");
    const [q] = await gemma().embed(["తెలుగు వారి పండుగ కార్యక్రమం (a Telugu festival gathering)"], "synthetic");
    const { results, method } = await api.similar(db, "events", q!, { areaKey, limit: 2 });
    console.log(`similarity method: ${method}`);
    const ids = results.map((r) => String(r.doc._id));
    expect(ids).toContain(`${areaKey}-1`);
    expect(ids).not.toContain(`${areaKey}-3`);
  });
});
