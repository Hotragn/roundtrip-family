import { pathToFileURL } from "node:url";
import { assertOutbound } from "@roundtrip/core/privacy";
import { loadEnv } from "@roundtrip/core/server-env";
import { SIGNAL } from "./ids";
import { type InboundReply, readInboundReply, toSignal } from "./inbound";
import type { Mailer } from "./index";
import { signalWorkflow } from "./signals";

/**
 * Approve by reply in the Codespace: listens on AgentMail's WebSocket for replies to the
 * planning email and passes each one to the weekPlan workflow as a signal. On Render the same
 * events arrive by webhook (apps/web/app/api/email/webhook).
 *
 * Connection, per docs.agentmail.to/websockets and docs.agentmail.to/api-reference/websockets:
 * wss://ws.agentmail.to/v0 with the API key as the api_key query parameter, then a
 * {"type":"subscribe","inbox_ids":[...],"event_types":["message.received"]} message; the server
 * answers "subscribed", then sends {"type":"event","event_type":"message.received",...}.
 * Spam, blocked and unauthenticated mail are left out unless asked for, and this never asks.
 *
 * Run in the Codespace: pnpm --filter @roundtrip/agent exec tsx src/email/listen.ts
 */

export const AGENTMAIL_WS = "wss://ws.agentmail.to/v0";

interface SocketLike {
  send(data: string): void;
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}
type SocketCtor = new (url: string) => SocketLike;

export interface ListenOptions {
  onReply: (reply: InboundReply) => Promise<void>;
  /** Finds the one inbox and reads threads (agentMail()). */
  mailbox: { ensureInbox(): Promise<string>; thread: Mailer["thread"] };
  /** DEMO_ALERT_EMAIL after the strict check. Without it no reply can be accepted. */
  alertAddress: string | null;
  apiKey: string | undefined;
  WebSocketImpl?: SocketCtor;
  log?: (line: string) => void;
  /** Reconnect after the connection drops (on by default), backing off up to 30 seconds. */
  reconnect?: boolean;
}

export interface Listener {
  close(): void;
}

export async function listenForReplies(opts: ListenOptions): Promise<Listener | null> {
  const log = opts.log ?? ((line: string) => console.info(`email listener: ${line}`));
  if (!opts.alertAddress) {
    log("DEMO_ALERT_EMAIL is not a valid address, so no reply could be accepted. Not listening.");
    return null;
  }
  const apiKey = opts.apiKey?.trim();
  if (!apiKey) {
    log("AGENTMAIL_API_KEY is not set. Not listening.");
    return null;
  }
  const WS = opts.WebSocketImpl ?? (globalThis as { WebSocket?: SocketCtor }).WebSocket;
  if (!WS) throw new Error("This Node has no WebSocket client; use Node 22 or later.");
  assertOutbound("agentmail", "anonymized", AGENTMAIL_WS);
  const inboxId = await opts.mailbox.ensureInbox();
  const alertAddress = opts.alertAddress;
  const seen = new Set<string>();
  let closed = false;
  let attempt = 0;
  let socket: SocketLike | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const handle = async (raw: unknown) => {
    const text = typeof raw === "string" ? raw : Buffer.from(raw as ArrayBuffer).toString("utf8");
    let msg: { type?: string; event_id?: string; name?: string; message?: unknown };
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (msg.type === "subscribed") return log("subscribed to replies.");
    if (msg.type === "error") return log(`AgentMail reported ${msg.name ?? "an error"}.`);
    if (msg.type !== "event" || !msg.event_id || seen.has(msg.event_id)) return;
    seen.add(msg.event_id);
    if (seen.size > 500) seen.delete(seen.values().next().value as string);
    const r = await readInboundReply(msg, { alertAddress, thread: (id) => opts.mailbox.thread(id) });
    if (!r.ok) return log(`ignored a message: ${r.why}.`);
    await opts.onReply(r.reply);
  };

  const connect = () => {
    // The key travels only in the connection URL, which is never logged.
    const ws = new WS(`${AGENTMAIL_WS}?api_key=${encodeURIComponent(apiKey)}`);
    socket = ws;
    ws.onopen = () => {
      attempt = 0;
      ws.send(JSON.stringify({ type: "subscribe", inbox_ids: [inboxId], event_types: ["message.received"] }));
    };
    ws.onmessage = (ev) => {
      handle(ev.data).catch((e) => log(`a reply failed: ${(e as Error).message}`));
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      if (closed || opts.reconnect === false) return;
      const wait = Math.min(30_000, 1000 * 2 ** attempt);
      attempt += 1;
      log(`connection closed; reconnecting in ${Math.round(wait / 1000)} s.`);
      timer = setTimeout(connect, wait);
    };
  };
  connect();
  return {
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      socket?.close();
    },
  };
}

async function main() {
  await loadEnv();
  const { agentMail, demoAlertAddress } = await import("./index");
  const listener = await listenForReplies({
    mailbox: agentMail(),
    alertAddress: demoAlertAddress(),
    apiKey: process.env.AGENTMAIL_API_KEY,
    onReply: async (r) => {
      const result = await signalWorkflow(r.workflowId, SIGNAL.emailReply, toSignal(r));
      console.info(`email listener: passed a reply to ${r.workflowId} (${result}).`);
    },
  });
  if (!listener) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
