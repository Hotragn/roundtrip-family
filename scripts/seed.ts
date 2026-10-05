/**
 * Loads both synthetic demo households into MongoDB Atlas and creates the indexes.
 * Run: pnpm seed
 */
import { LANGUAGES } from "@roundtrip/core";
import { loadDemoHouseholds } from "@roundtrip/core/persona";
import { loadEnv } from "@roundtrip/core/server-env";

await loadEnv();
const { closeDb, col, ensureIndexes, getDb, upsertBundle } = await import("@roundtrip/agent/db");

const db = await getDb();
const indexes = await ensureIndexes(db);
console.log("Vector index:", indexes.vectorIndex, indexes.detail ?? "");

for (const bundle of loadDemoHouseholds()) {
  const counts = await upsertBundle(db, bundle);
  console.log(`${bundle.household.slug} (synthetic):`, counts);
}

await col<{ _id: string }>(db, "languages").bulkWrite(
  LANGUAGES.map((l) => ({ replaceOne: { filter: { _id: l._id }, replacement: l, upsert: true } })) as never,
);
console.log("languages:", LANGUAGES.length);

const totals = Object.fromEntries(
  await Promise.all(
    (["households", "parents", "people", "outings", "languages"] as const).map(async (n) => [
      n,
      await col(db, n).countDocuments(),
    ]),
  ),
);
console.log("In Atlas now:", totals);
await closeDb();
