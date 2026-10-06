import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { repoRoot } from "@roundtrip/core/server-env";

/**
 * What the workflows record: approvals, nudges for the phone, alerts, first rides and emails
 * that weren't sent. One JSON object per line, ids and times only. The default file is under
 * .cache/ (gitignored); ROUNDTRIP_RECORDS points elsewhere, as the durability run does.
 */

export type RecordKind =
  | "approval"
  | "nudge"
  | "alert"
  | "home_after_alert"
  | "trial_run"
  | "summary"
  | "email_not_sent";

export interface RecordStore {
  add(kind: RecordKind, data: Record<string, unknown>): Promise<{ at: string }>;
}

export function defaultRecordsPath(): string {
  return join(repoRoot(), ".cache/workflows/records.jsonl");
}

export function fileRecords(path: string, now: () => Date = () => new Date()): RecordStore {
  return {
    async add(kind, data) {
      const at = now().toISOString();
      mkdirSync(dirname(path), { recursive: true });
      appendFileSync(path, `${JSON.stringify({ ...data, at, kind })}\n`);
      return { at };
    },
  };
}
