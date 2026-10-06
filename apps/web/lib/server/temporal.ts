import "server-only";
import {
  type InboundReply,
  SIGNAL,
  type SignalResult,
  signalWorkflow,
  toSignal,
  WORKFLOW,
} from "@roundtrip/agent/email";
import { DEMO_WEEKS } from "@/lib/demo-weeks";

/**
 * The web app's link to Roundtrip's Temporal workflows (workflows/), over Temporal's HTTP API,
 * so the web app needs no Temporal SDK. Off unless TEMPORAL_ADDRESS is set: the hosted demo on
 * Render has no Temporal server and shows the recorded durability run instead (docs/plan.md).
 * Signals carry ids and times only.
 */

export function temporalOn(): boolean {
  return Boolean(process.env.TEMPORAL_ADDRESS?.trim());
}

/** "I'm home" from a phone reaches that outing's safety timer. */
export async function signalCheckin(c: {
  outingId: string;
  parentId: string;
  createdAt: string;
}): Promise<SignalResult> {
  if (!temporalOn()) return "off";
  return signalWorkflow(WORKFLOW.outingSafety(c.outingId), SIGNAL.home, { parentId: c.parentId, at: c.createdAt });
}

/** A reply to the planning email reaches that household's weekPlan. */
export async function signalEmailReply(reply: InboundReply): Promise<SignalResult> {
  if (!temporalOn()) return "off";
  return signalWorkflow(reply.workflowId, SIGNAL.emailReply, toSignal(reply));
}

/** A face picked for "How was it?" reaches the household's weekPlan, for the Sunday summary. */
export async function signalHowWasIt(r: {
  outingId: string;
  parentId: string;
  face: string | null;
}): Promise<SignalResult> {
  if (!temporalOn() || !r.face) return "off";
  const slug = Object.entries(DEMO_WEEKS).find(([, w]) => w.parents.some((p) => p.id === r.parentId))?.[0];
  if (!slug) return "off";
  return signalWorkflow(WORKFLOW.weekPlan(slug), SIGNAL.howWasIt, {
    outingId: r.outingId,
    parentId: r.parentId,
    face: r.face,
  });
}

/** The dashboard's decisions for the week reach weekPlan, in one signal (see weekAnswer). */
export async function signalWeekAnswer(
  household: string,
  answer: { approve: string[]; swapTo: Record<string, string> },
): Promise<SignalResult> {
  if (!temporalOn()) return "off";
  return signalWorkflow(WORKFLOW.weekPlan(household), SIGNAL.approve, answer);
}
