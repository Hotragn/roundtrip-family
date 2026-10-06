import type { Mailer, OutgoingEmail, SendResult } from "@roundtrip/agent/email";
import type { RecordKind, RecordStore } from "../src/records";

/** A mailer that keeps every email in memory and sends nothing. */
export function memoryMailer() {
  const sent: Array<OutgoingEmail & { inReplyTo?: string; messageId: string }> = [];
  let n = 0;
  const ok = (): SendResult => ({ sent: true, via: "file", messageId: `m${++n}`, threadId: "t1" });
  const mailer: Mailer = {
    async send(email) {
      const r = ok();
      if (r.sent) sent.push({ ...email, messageId: r.messageId });
      return r;
    },
    async reply(messageId, email) {
      const r = ok();
      if (r.sent) sent.push({ ...email, subject: "", inReplyTo: messageId, messageId: r.messageId });
      return r;
    },
    async thread() {
      return null;
    },
  };
  return { mailer, sent, of: (kind: OutgoingEmail["kind"]) => sent.filter((e) => e.kind === kind) };
}

export function memoryRecords() {
  const rows: Array<{ at: string; kind: RecordKind } & Record<string, unknown>> = [];
  const records: RecordStore = {
    async add(kind, data) {
      const at = new Date().toISOString();
      rows.push({ ...data, at, kind });
      return { at };
    },
  };
  return { records, rows, of: (kind: RecordKind) => rows.filter((r) => r.kind === kind) };
}

/**
 * Temporal's worker and test server need its native core, which has no build for Windows on
 * ARM64 (this repo's development machine). Those tests skip there with this message and run
 * in CI on ubuntu-latest, where TEMPORAL_TESTS=required turns a load failure into a failure.
 */
export async function loadTemporalTesting() {
  try {
    const testing = await import("@temporalio/testing");
    const worker = await import("@temporalio/worker");
    return { testing, worker, why: null };
  } catch (e) {
    const why = (e as Error).message.split("\n")[0] ?? "unknown error";
    if (process.env.TEMPORAL_TESTS === "required") {
      throw new Error(`TEMPORAL_TESTS=required, but Temporal's native core didn't load: ${why}`);
    }
    console.warn(
      `Skipping the Temporal workflow tests: Temporal's native core doesn't load on ${process.platform}-${process.arch} (${why}). They run in CI on Linux.`,
    );
    return { testing: null, worker: null, why };
  }
}
