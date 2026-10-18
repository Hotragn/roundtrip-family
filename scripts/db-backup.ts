/**
 * Backs up and restores the Atlas database with the driver the app already uses, no mongodump
 * needed. A backup is gzipped Extended JSON, one document per line with its collection name,
 * so dates, ids and binary data come back as they were.
 *
 *   tsx db-backup.ts dump <file.jsonl.gz>
 *   tsx db-backup.ts restore <file.jsonl.gz> --yes
 *
 * Both read MONGODB_URI (and MONGODB_DB, default "roundtrip") and never print them. Restore
 * replaces each document by _id and leaves documents that aren't in the backup alone. The
 * nightly workflow (.github/workflows/backup.yml) encrypts the dump before it leaves the runner.
 *
 * To restore a nightly backup:
 *   1. gh run download <run id> -n roundtrip-db-backup   (or download it from the run's page)
 *   2. openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in roundtrip-db.jsonl.gz.enc  *        -out roundtrip-db.jsonl.gz -pass env:BACKUP_PASSPHRASE
 *   3. With MONGODB_URI pointing at the cluster to fill (a new one is safest, then switch Render):
 *        pnpm db:restore roundtrip-db.jsonl.gz --yes
 * Driver docs: https://www.mongodb.com/docs/drivers/node/current/
 */
import { createReadStream, createWriteStream } from "node:fs";
import { createInterface } from "node:readline";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import { BSON, closeDb, getDb } from "@roundtrip/agent/db";

/** The part of a driver Db the backup needs, so tests can pass a fake one. */
export interface BackupDb {
  listCollections(): { toArray(): Promise<Array<{ name: string; type?: string }>> };
  collection(name: string): {
    find(): AsyncIterable<Record<string, unknown>>;
    bulkWrite(ops: unknown[], opts: { ordered: boolean }): Promise<unknown>;
  };
}

export async function dumpDb(db: BackupDb, file: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const names = (await db.listCollections().toArray())
    .filter((c) => c.type !== "view" && !c.name.startsWith("system."))
    .map((c) => c.name)
    .sort();
  async function* lines() {
    for (const c of names) {
      counts[c] = 0;
      for await (const d of db.collection(c).find()) {
        counts[c]++;
        yield `${BSON.EJSON.stringify({ c, d }, { relaxed: false })}\n`;
      }
    }
  }
  await pipeline(lines, createGzip(), createWriteStream(file));
  return counts;
}

export async function restoreDb(db: BackupDb, file: string, batch = 500): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const pending = new Map<string, unknown[]>();
  const flush = async (c: string) => {
    const ops = pending.get(c);
    if (ops?.length) await db.collection(c).bulkWrite(ops, { ordered: false });
    pending.set(c, []);
  };
  const rl = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const { c, d } = BSON.EJSON.parse(line, { relaxed: false }) as { c: string; d: { _id: unknown } };
    const ops = pending.get(c) ?? [];
    ops.push({ replaceOne: { filter: { _id: d._id }, replacement: d, upsert: true } });
    pending.set(c, ops);
    counts[c] = (counts[c] ?? 0) + 1;
    if (ops.length >= batch) await flush(c);
  }
  for (const c of pending.keys()) await flush(c);
  return counts;
}

async function main() {
  const [cmd, file, flag] = process.argv.slice(2);
  if (!file || (cmd !== "dump" && cmd !== "restore")) {
    console.error("Usage: tsx db-backup.ts dump <file.jsonl.gz> | restore <file.jsonl.gz> --yes");
    process.exit(2);
  }
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set, so there's no database to use.");
    process.exit(1);
  }
  if (cmd === "restore" && flag !== "--yes") {
    console.error(
      `This writes the backup into database "${process.env.MONGODB_DB ?? "roundtrip"}". Add --yes to go ahead.`,
    );
    process.exit(2);
  }
  const db = (await getDb()) as unknown as BackupDb;
  try {
    const counts = cmd === "dump" ? await dumpDb(db, file) : await restoreDb(db, file);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(
      `${cmd === "dump" ? "Saved" : "Restored"} ${total} documents in ${Object.keys(counts).length} collections.`,
    );
    for (const [c, n] of Object.entries(counts)) console.log(`  ${c}: ${n}`);
  } finally {
    await closeDb();
  }
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("db-backup.ts")) {
  main().catch((e) => {
    // The driver's message can carry the host; never the URI's credentials.
    console.error(String(e instanceof Error ? e.message : e).replace(/\/\/[^@\s]*@/g, "//***@"));
    process.exit(1);
  });
}
