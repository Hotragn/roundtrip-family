import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type DataClass, outboundFetch } from "@roundtrip/core/privacy";
import { repoRoot } from "@roundtrip/core/server-env";

/**
 * Email to the adult child through one AgentMail inbox: the planning email, safety alerts, the
 * weekly summary, and replies in the planning email's thread.
 *
 * Rules (CLAUDE.md): email goes only to DEMO_ALERT_EMAIL, and only when it passes a strict
 * address check; otherwise nothing is sent and the skip is logged, without the value. Every
 * email is checked for a phone number, a street address or an email address before it leaves.
 * Live sends are counted in data/demo/usage/agentmail.jsonl and capped each month, well inside
 * the free tier (3 inboxes, 3,000 emails a month: docs.agentmail.to/knowledge-base/rate-limits).
 *
 * AgentMail's REST API over fetch, through the privacy guard's "agentmail" route:
 * - base URL and bearer auth: docs.agentmail.to/api-reference, docs.agentmail.to/quickstart
 * - list and create inboxes (client_id makes create idempotent):
 *   docs.agentmail.to/api-reference/inboxes/list, docs.agentmail.to/api-reference/inboxes/create
 * - send and reply: docs.agentmail.to/api-reference/inboxes/messages/send,
 *   docs.agentmail.to/api-reference/inboxes/messages/reply
 * - threads, for the labels a reply's thread carries: docs.agentmail.to/api-reference/inboxes/threads/get
 * - labels on send: docs.agentmail.to/labels
 */

export * from "./ids";
export * from "./inbound";
export { type ListenOptions, listenForReplies } from "./listen";
export * from "./reply";
export * from "./signals";
export * from "./templates";
export * from "./webhook";

export const AGENTMAIL_API = "https://api.agentmail.to/v0";
/** The one inbox, found again by this client id or its display name. */
export const INBOX_CLIENT_ID = "roundtrip-family";
export const INBOX_NAME = "Roundtrip";
export const MONTHLY_CAP = 300;

const LOCAL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const LABEL = /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

/**
 * One plain address or nothing: no display name, no second recipient, no spaces, line breaks or
 * angle brackets, a dotted domain with a letter-only top level.
 */
export function validAddress(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v || v.length > 254) return null;
  const at = v.indexOf("@");
  if (at < 1 || at !== v.lastIndexOf("@")) return null;
  const local = v.slice(0, at);
  const domain = v.slice(at + 1);
  if (local.length > 64 || !LOCAL.test(local)) return null;
  const labels = domain.split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l))) return null;
  if (!/^[A-Za-z]{2,63}$/.test(labels.at(-1)!)) return null;
  return v;
}

/** DEMO_ALERT_EMAIL when it passes the strict check. Never logged. */
export function demoAlertAddress(env: NodeJS.ProcessEnv = process.env): string | null {
  return validAddress(env.DEMO_ALERT_EMAIL);
}

const PHONE = /\+?\d[\d\s().-]{6,}\d/g;
const STREET =
  /\b\d{1,6}[A-Za-z]?\s+(?:[A-Z][\w'.-]*\s+){0,4}(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Way|Ln|Lane|Ct|Court|Pl|Place|Pkwy|Parkway|Hwy|Highway|Ter|Terrace|Cir|Circle)\b\.?/;
const STREET_DE = /\b[A-ZÄÖÜ][\wäöüß-]*(?:straße|strasse|str\.|weg|platz|allee|gasse|ring)\s+\d{1,4}[a-z]?\b/;
const EMAIL = /[^\s@<>"]+@[^\s@<>"]+\.[A-Za-z]{2,}/;

/** What an email must never carry: a phone number, a street address or an email address. */
export function emailPrivacyProblems(text: string): string[] {
  const plain = text.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ");
  const problems: string[] = [];
  const phones = [...plain.matchAll(PHONE)].filter((m) => m[0].replace(/\D/g, "").length >= 7);
  if (phones.length) problems.push("a phone number");
  if (STREET.test(plain) || STREET_DE.test(plain)) problems.push("a street address");
  if (EMAIL.test(plain)) problems.push("an email address");
  return problems;
}

export type EmailKind = "planning" | "reminder" | "alert" | "home" | "summary" | "reply";

export interface OutgoingEmail {
  kind: EmailKind;
  subject: string;
  text: string;
  html: string;
  labels?: string[];
  /** The data class of what the email carries, for the privacy guard. Demo households are synthetic. */
  dataClass: DataClass;
}

export type SendResult =
  | { sent: true; via: "agentmail" | "file"; messageId: string; threadId: string }
  | { sent: false; reason: "invalid_recipient" | "no_api_key" | "privacy" | "monthly_cap" | "error"; detail?: string };

export interface ThreadInfo {
  labels: string[];
  messages: Array<{ labels: string[]; text?: string }>;
}

/** What the workflows need from email. Tests and the durability run swap in a mock or a file. */
export interface Mailer {
  send(email: OutgoingEmail): Promise<SendResult>;
  /** A reply in the thread of `messageId`, to DEMO_ALERT_EMAIL only. */
  reply(messageId: string, email: Omit<OutgoingEmail, "subject">): Promise<SendResult>;
  thread(threadId: string): Promise<ThreadInfo | null>;
}

export interface AgentMailOptions {
  env?: NodeJS.ProcessEnv;
  log?: (line: string) => void;
  /** Where live sends are counted; null turns counting off. */
  ledger?: string | null;
  monthlyCap?: number;
  now?: () => Date;
}

const defaultLog = (line: string) => console.info(`email: ${line}`);

class AgentMailError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The live mailer: AgentMail's API, one inbox, DEMO_ALERT_EMAIL only. */
export function agentMail(opts: AgentMailOptions = {}): Mailer & { ensureInbox(): Promise<string> } {
  const env = opts.env ?? process.env;
  const log = opts.log ?? defaultLog;
  const ledger = opts.ledger === undefined ? join(repoRoot(), "data/demo/usage/agentmail.jsonl") : opts.ledger;
  const cap = opts.monthlyCap ?? MONTHLY_CAP;
  const now = opts.now ?? (() => new Date());
  let inboxId: string | null = env.AGENTMAIL_INBOX_ID?.trim() || null;

  async function call<T>(method: string, path: string, dataClass: DataClass, body?: unknown): Promise<T> {
    const key = env.AGENTMAIL_API_KEY?.trim();
    if (!key) throw new AgentMailError(0, "AGENTMAIL_API_KEY is not set");
    for (let attempt = 0; ; attempt++) {
      const res = await outboundFetch("agentmail", dataClass, `${AGENTMAIL_API}${path}`, {
        method,
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.ok) return (await res.json()) as T;
      // 429 comes with Retry-After, usually 1 second (docs.agentmail.to/knowledge-base/rate-limits).
      if ((res.status === 429 || res.status >= 500) && attempt < 2) {
        const wait = Math.min(Number(res.headers.get("retry-after")) || 2 ** attempt, 5);
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      throw new AgentMailError(
        res.status,
        `AgentMail answered ${res.status} for ${method} ${path.split("?")[0]}: ${detail}`,
      );
    }
  }

  async function ensureInbox(): Promise<string> {
    if (inboxId) return inboxId;
    const list = await call<{ inboxes: Array<{ inbox_id: string; client_id?: string; display_name?: string }> }>(
      "GET",
      "/inboxes?limit=50",
      "anonymized",
    );
    const found =
      list.inboxes.find((i) => i.client_id === INBOX_CLIENT_ID) ??
      list.inboxes.find((i) => i.display_name === INBOX_NAME);
    if (found) {
      inboxId = found.inbox_id;
      return inboxId;
    }
    const created = await call<{ inbox_id: string }>("POST", "/inboxes", "anonymized", {
      client_id: INBOX_CLIENT_ID,
      display_name: INBOX_NAME,
    });
    inboxId = created.inbox_id;
    log("created the Roundtrip inbox");
    return inboxId;
  }

  function sentThisMonth(): number {
    if (!ledger || !existsSync(ledger)) return 0;
    const month = now().toISOString().slice(0, 7);
    return readFileSync(ledger, "utf8")
      .split("\n")
      .filter((l) => l.includes(`"at":"${month}`)).length;
  }

  function count(kind: EmailKind): void {
    if (!ledger) return;
    mkdirSync(dirname(ledger), { recursive: true });
    appendFileSync(
      ledger,
      `${JSON.stringify({ at: now().toISOString(), service: "agentmail", kind, units: 1, costUsd: 0 })}\n`,
    );
  }

  /** The checks every email passes before any network call. */
  function precheck(email: Omit<OutgoingEmail, "subject"> & { subject?: string }): SendResult | string {
    const to = demoAlertAddress(env);
    if (!to) {
      log(`DEMO_ALERT_EMAIL is not a valid address, so the ${email.kind} email was not sent.`);
      return { sent: false, reason: "invalid_recipient" };
    }
    const problems = emailPrivacyProblems(`${email.subject ?? ""}\n${email.text}\n${email.html}`);
    if (problems.length) {
      log(`the ${email.kind} email was not sent: it contained ${problems.join(" and ")}.`);
      return { sent: false, reason: "privacy", detail: problems.join(", ") };
    }
    if (!env.AGENTMAIL_API_KEY?.trim()) {
      log(`AGENTMAIL_API_KEY is not set, so the ${email.kind} email was not sent.`);
      return { sent: false, reason: "no_api_key" };
    }
    if (sentThisMonth() >= cap) {
      log(`${cap} emails were already sent this month, so the ${email.kind} email was not sent.`);
      return { sent: false, reason: "monthly_cap" };
    }
    return to;
  }

  return {
    ensureInbox,
    async send(email) {
      const to = precheck(email);
      if (typeof to !== "string") return to;
      try {
        const inbox = await ensureInbox();
        const r = await call<{ message_id: string; thread_id: string }>(
          "POST",
          `/inboxes/${encodeURIComponent(inbox)}/messages/send`,
          email.dataClass,
          { to, subject: email.subject, text: email.text, html: email.html, labels: email.labels ?? [] },
        );
        count(email.kind);
        log(`sent the ${email.kind} email.`);
        return { sent: true, via: "agentmail", messageId: r.message_id, threadId: r.thread_id };
      } catch (e) {
        log(`the ${email.kind} email failed: ${(e as Error).message}`);
        return { sent: false, reason: "error", detail: (e as Error).message };
      }
    },
    async reply(messageId, email) {
      const to = precheck(email);
      if (typeof to !== "string") return to;
      try {
        const inbox = await ensureInbox();
        const r = await call<{ message_id: string; thread_id: string }>(
          "POST",
          `/inboxes/${encodeURIComponent(inbox)}/messages/${encodeURIComponent(messageId)}/reply`,
          email.dataClass,
          // `to` is set so a reply can only ever reach DEMO_ALERT_EMAIL.
          { to, text: email.text, html: email.html, labels: email.labels ?? [] },
        );
        count(email.kind);
        log(`sent a reply in the planning thread.`);
        return { sent: true, via: "agentmail", messageId: r.message_id, threadId: r.thread_id };
      } catch (e) {
        log(`the reply failed: ${(e as Error).message}`);
        return { sent: false, reason: "error", detail: (e as Error).message };
      }
    },
    async thread(threadId) {
      try {
        const inbox = await ensureInbox();
        const t = await call<{ labels?: string[]; messages?: Array<{ labels?: string[]; text?: string }> }>(
          "GET",
          `/inboxes/${encodeURIComponent(inbox)}/threads/${encodeURIComponent(threadId)}`,
          "anonymized",
        );
        return {
          labels: t.labels ?? [],
          messages: (t.messages ?? []).map((m) => ({ labels: m.labels ?? [], text: m.text })),
        };
      } catch (e) {
        log(`couldn't read the thread: ${(e as Error).message}`);
        return null;
      }
    },
  };
}

/**
 * A mailer that writes each email to a JSON-lines file and sends nothing: for the durability
 * run and local demos. The same privacy check applies.
 */
export function fileMailer(path: string, log: (line: string) => void = defaultLog): Mailer {
  let n = 0;
  const write = (kind: EmailKind, subject: string, email: Omit<OutgoingEmail, "subject">, inReplyTo?: string) => {
    const problems = emailPrivacyProblems(`${subject}\n${email.text}\n${email.html}`);
    if (problems.length) {
      log(`the ${kind} email was not written: it contained ${problems.join(" and ")}.`);
      return { sent: false as const, reason: "privacy" as const, detail: problems.join(", ") };
    }
    mkdirSync(dirname(path), { recursive: true });
    n += 1;
    const messageId = `file-${process.pid}-${n}`;
    appendFileSync(
      path,
      `${JSON.stringify({ at: new Date().toISOString(), kind, subject, text: email.text, labels: email.labels ?? [], messageId, inReplyTo })}\n`,
    );
    return { sent: true as const, via: "file" as const, messageId, threadId: inReplyTo ?? messageId };
  };
  return {
    async send(email) {
      return write(email.kind, email.subject, email);
    },
    async reply(messageId, email) {
      return write(email.kind, "", email, messageId);
    },
    async thread() {
      return null;
    },
  };
}
