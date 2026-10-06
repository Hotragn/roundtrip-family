import { agentMail, demoAlertAddress, readInboundReply, verifyWebhook } from "@roundtrip/agent/email";
import { after } from "next/server";
import { signalEmailReply } from "@/lib/server/temporal";

/**
 * Approve by reply on Render. AgentMail posts each email the Roundtrip inbox receives to this
 * webhook (message.received: docs.agentmail.to/webhooks-overview). The Svix signature is checked
 * against AGENTMAIL_WEBHOOK_SECRET over the raw body (docs.agentmail.to/webhook-verification);
 * then the route answers 200 at once and reads the reply after the response, as AgentMail asks.
 * Only replies from DEMO_ALERT_EMAIL to a planning email count. With TEMPORAL_ADDRESS set, the
 * parsed answer goes to that household's weekPlan workflow, which replies in the thread.
 * Next.js: route handlers read the raw body with request.text(), and after() runs work once the
 * response is sent (node_modules/next/dist/docs, route.md and after.md).
 */

/** Svix message ids already handled by this process; retries of one delivery reuse its id. */
const handled = new Set<string>();

export async function POST(req: Request) {
  const secret = process.env.AGENTMAIL_WEBHOOK_SECRET?.trim();
  if (!secret) return Response.json({ error: "Email replies aren't set up on this server." }, { status: 503 });
  const body = await req.text();
  const check = verifyWebhook(body, req.headers, secret);
  if (!check.ok) return Response.json({ error: "The signature check failed." }, { status: 401 });
  if (handled.has(check.id)) return Response.json({ ok: true });
  handled.add(check.id);
  if (handled.size > 1000) handled.delete(handled.values().next().value as string);

  let event: unknown;
  try {
    event = JSON.parse(body);
  } catch {
    return Response.json({ error: "The body is not JSON." }, { status: 400 });
  }

  after(async () => {
    const mail = agentMail();
    const r = await readInboundReply(event, { alertAddress: demoAlertAddress(), thread: (id) => mail.thread(id) });
    if (!r.ok) {
      console.info(`email webhook: ignored a message (${r.why}).`);
      return;
    }
    const result = await signalEmailReply(r.reply);
    console.info(`email webhook: passed a reply to ${r.reply.workflowId} (${result}).`);
  });
  return Response.json({ ok: true });
}
