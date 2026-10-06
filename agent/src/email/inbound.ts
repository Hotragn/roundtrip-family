import { z } from "zod";
import { planFromLabels, planFromReference } from "./ids";
import { type ParsedReply, parseReply } from "./reply";

/**
 * A reply to the planning email, as AgentMail delivers it (the message.received event, by
 * webhook on Render or WebSocket in the Codespace: docs.agentmail.to/api-reference/webhooks/events/message-received).
 * Only replies from DEMO_ALERT_EMAIL count. The week it answers comes from the planning email's
 * labels, read from the thread, or from the reference line quoted in the reply.
 */

export const MessageReceived = z.object({
  type: z.literal("event"),
  event_type: z.string(),
  event_id: z.string(),
  message: z.object({
    inbox_id: z.string(),
    thread_id: z.string(),
    message_id: z.string(),
    from: z.string(),
    labels: z.array(z.string()).default([]),
    subject: z.string().optional(),
    text: z.string().optional(),
    extracted_text: z.string().optional(),
    timestamp: z.string().optional(),
  }),
  thread: z
    .object({ labels: z.array(z.string()).default([]) })
    .partial()
    .optional(),
});
export type MessageReceived = z.infer<typeof MessageReceived>;

/** The address inside "Name <address>", lowercased. */
export function senderAddress(from: string): string | null {
  const m = /<([^<>\s]+@[^<>\s]+)>\s*$/.exec(from.trim()) ?? /^([^<>\s]+@[^<>\s]+)$/.exec(from.trim());
  return m ? m[1]!.toLowerCase() : null;
}

export interface InboundReply {
  /** The weekPlan workflow to signal. */
  workflowId: string;
  /** The week the planning email was for, when known. */
  weekKey: string | null;
  /** The reply's own message id, for answering in the same thread. */
  messageId: string;
  threadId: string;
  eventId: string;
  receivedAt: string;
  parsed: ParsedReply;
}

/** What the weekPlan workflow receives as its emailReply signal. */
export interface EmailReplySignal {
  weekKey: string | null;
  messageId: string;
  receivedAt: string;
  parsed: ParsedReply;
}

export function toSignal(r: InboundReply): EmailReplySignal {
  return { weekKey: r.weekKey, messageId: r.messageId, receivedAt: r.receivedAt, parsed: r.parsed };
}

export type InboundResult = { ok: true; reply: InboundReply } | { ok: false; why: string };

export interface InboundOptions {
  /** DEMO_ALERT_EMAIL after the strict check, or null when it isn't valid. */
  alertAddress: string | null;
  /** Reads the thread's labels when the event doesn't carry them. */
  thread?: (threadId: string) => Promise<{ labels: string[]; messages: Array<{ labels: string[] }> } | null>;
}

export async function readInboundReply(event: unknown, opts: InboundOptions): Promise<InboundResult> {
  const parsed = MessageReceived.safeParse(event);
  if (!parsed.success) return { ok: false, why: "not a message event" };
  const e = parsed.data;
  // Spam, blocked and unauthenticated mail arrive as other event types and are never read.
  if (e.event_type !== "message.received") return { ok: false, why: `ignored ${e.event_type}` };
  if (!opts.alertAddress) return { ok: false, why: "DEMO_ALERT_EMAIL is not a valid address" };
  if (senderAddress(e.message.from) !== opts.alertAddress.toLowerCase()) {
    return { ok: false, why: "not from the alert address" };
  }
  let plan = planFromLabels([...e.message.labels, ...(e.thread?.labels ?? [])]);
  if (!plan && opts.thread) {
    const t = await opts.thread(e.message.thread_id);
    if (t) plan = planFromLabels([...t.labels, ...t.messages.flatMap((m) => m.labels)]);
  }
  plan ??= planFromReference(e.message.text ?? "");
  if (!plan) return { ok: false, why: "not a reply to a planning email" };
  return {
    ok: true,
    reply: {
      workflowId: plan.workflowId,
      weekKey: plan.weekKey,
      messageId: e.message.message_id,
      threadId: e.message.thread_id,
      eventId: e.event_id,
      receivedAt: e.message.timestamp ?? new Date().toISOString(),
      // extracted_text has the quoted history removed; fall back to text (docs.agentmail.to/reply-extraction).
      parsed: parseReply(e.message.extracted_text ?? e.message.text ?? ""),
    },
  };
}
