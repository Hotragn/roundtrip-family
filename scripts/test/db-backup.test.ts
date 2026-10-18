import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BSON } from "@roundtrip/agent/db";
import { afterAll, describe, expect, it } from "vitest";
import { type BackupDb, dumpDb, restoreDb } from "../db-backup";

// A dump and a restore through a fake database: every document comes back with its types.
const dir = mkdtempSync(join(tmpdir(), "rt-backup-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function fakeDb(data: Record<string, Record<string, unknown>[]>): BackupDb & { data: typeof data } {
  return {
    data,
    listCollections: () => ({
      toArray: async () => [
        ...Object.keys(data).map((name) => ({ name })),
        { name: "system.views" },
        { name: "v", type: "view" },
      ],
    }),
    collection: (name) => ({
      async *find() {
        yield* data[name] ?? [];
      },
      async bulkWrite(ops) {
        data[name] ??= [];
        for (const op of ops as Array<{
          replaceOne: { filter: { _id: unknown }; replacement: Record<string, unknown> };
        }>) {
          const rows = data[name]!;
          const i = rows.findIndex(
            (r) => BSON.EJSON.stringify(r._id) === BSON.EJSON.stringify(op.replaceOne.filter._id),
          );
          if (i >= 0) rows[i] = op.replaceOne.replacement;
          else rows.push(op.replaceOne.replacement);
        }
        return {};
      },
    }),
  };
}

describe("the database backup", () => {
  it("restores every document with its dates, ids and binary data", async () => {
    const id = new BSON.ObjectId();
    const source = fakeDb({
      households: [{ _id: "fremont-demo", label: "Fremont" }],
      safety_timers: [{ _id: id, alertAt: new Date("2026-10-19T17:45:00Z"), state: "waiting" }],
      diary_entries: Array.from({ length: 7 }, (_, i) => ({
        _id: `e${i}`,
        cipher: new BSON.Binary(Buffer.from([i, 1, 2])),
      })),
    });
    const file = join(dir, "dump.jsonl.gz");
    expect(await dumpDb(source, file)).toEqual({ diary_entries: 7, households: 1, safety_timers: 1 });

    const target = fakeDb({
      households: [
        { _id: "fremont-demo", label: "old" },
        { _id: "other", label: "kept" },
      ],
    });
    expect(await restoreDb(target, file, 3)).toEqual({ diary_entries: 7, households: 1, safety_timers: 1 });
    expect(target.data.households).toEqual([
      { _id: "fremont-demo", label: "Fremont" },
      { _id: "other", label: "kept" },
    ]);
    const timer = target.data.safety_timers![0]!;
    expect(timer._id).toBeInstanceOf(BSON.ObjectId);
    expect(String(timer._id)).toBe(String(id));
    expect(timer.alertAt).toEqual(new Date("2026-10-19T17:45:00Z"));
    expect([...(target.data.diary_entries![6]!.cipher as InstanceType<typeof BSON.Binary>).buffer]).toEqual([6, 1, 2]);
  });
});
