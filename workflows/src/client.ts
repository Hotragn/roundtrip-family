import { pathToFileURL } from "node:url";
import { parseReply, TASK_QUEUE, WORKFLOW } from "@roundtrip/agent/email";
import { assertOutbound } from "@roundtrip/core/privacy";
import { loadEnv } from "@roundtrip/core/server-env";
import { Client, Connection, WorkflowExecutionAlreadyStartedError } from "@temporalio/client";
import {
  approveSignal,
  emailReplySignal,
  homeSignal,
  type OutingSafetyInput,
  type WeekPlanInput,
  weekStateQuery,
} from "./contract";
import type { outingSafety, weekPlan } from "./workflows";

/**
 * Starting and signaling the workflows from scripts, the durability eval and the Codespace
 * demo. The web app and the email listener signal over Temporal's HTTP API instead
 * (@roundtrip/agent/email signals.ts), so they need no SDK.
 * Docs: docs.temporal.io/develop/typescript/temporal-client
 *
 * pnpm --filter @roundtrip/workflows week start fremont-demo [--once]
 * pnpm --filter @roundtrip/workflows week approve fremont-demo all | 1,3
 * pnpm --filter @roundtrip/workflows week reply fremont-demo "approve 1 and 3"
 * pnpm --filter @roundtrip/workflows week home <outing id>
 * pnpm --filter @roundtrip/workflows week state fremont-demo
 */

export function temporalAddress(env: NodeJS.ProcessEnv = process.env): string {
  const address = env.TEMPORAL_ADDRESS?.trim() || "localhost:7233";
  // The workflows talk to the dev server over gRPC on the same machine; the registry route says so.
  assertOutbound("temporal", "anonymized", `http://${address}`);
  return address;
}

export async function connectClient(env: NodeJS.ProcessEnv = process.env): Promise<Client> {
  await loadEnv();
  const connection = await Connection.connect({ address: temporalAddress(env) });
  return new Client({ connection, namespace: env.TEMPORAL_NAMESPACE?.trim() || "default" });
}

/** Starts the household's weekly plan, unless it's already running. */
export async function startWeekPlan(
  client: Client,
  input: WeekPlanInput,
  taskQueue = TASK_QUEUE,
): Promise<{ workflowId: string; started: boolean }> {
  const workflowId = WORKFLOW.weekPlan(input.householdSlug);
  try {
    await client.workflow.start<typeof weekPlan>("weekPlan", { workflowId, taskQueue, args: [input] });
    return { workflowId, started: true };
  } catch (e) {
    if (e instanceof WorkflowExecutionAlreadyStartedError) return { workflowId, started: false };
    throw e;
  }
}

export async function startOutingSafety(client: Client, input: OutingSafetyInput, taskQueue = TASK_QUEUE) {
  return client.workflow.start<typeof outingSafety>("outingSafety", {
    workflowId: WORKFLOW.outingSafety(input.outingId),
    taskQueue,
    args: [input],
  });
}

async function main(argv: string[]) {
  const [command, target, ...rest] = argv;
  if (!command || !target) {
    console.info("Usage: start <household> [--once] | approve <household> all|1,3 | reply <household> <text>");
    console.info("       home <outing id> | state <household>");
    process.exitCode = 1;
    return;
  }
  const client = await connectClient();
  if (command === "start") {
    const r = await startWeekPlan(client, { householdSlug: target, once: rest.includes("--once") });
    console.info(r.started ? `Started ${r.workflowId}.` : `${r.workflowId} is already running.`);
  } else if (command === "approve") {
    const answer = rest.join(" ").trim();
    const refs =
      answer === "all"
        ? "all"
        : answer
            .split(/[\s,]+/)
            .filter(Boolean)
            .map(Number);
    await client.workflow.getHandle(WORKFLOW.weekPlan(target)).signal(approveSignal, { approve: refs });
    console.info("Sent the approval.");
  } else if (command === "reply") {
    // The same signal a real reply makes, for demos while DEMO_ALERT_EMAIL can't receive mail.
    await client.workflow.getHandle(WORKFLOW.weekPlan(target)).signal(emailReplySignal, {
      weekKey: null,
      messageId: `cli-${Date.now()}`,
      receivedAt: new Date().toISOString(),
      parsed: parseReply(rest.join(" ")),
    });
    console.info("Sent the reply.");
  } else if (command === "home") {
    await client.workflow.getHandle(WORKFLOW.outingSafety(target)).signal(homeSignal, { at: new Date().toISOString() });
    console.info("Sent I'm home.");
  } else if (command === "state") {
    const state = await client.workflow.getHandle(WORKFLOW.weekPlan(target)).query(weekStateQuery);
    console.info(JSON.stringify(state, null, 2));
  } else {
    console.info(`Unknown command ${command}.`);
    process.exitCode = 1;
  }
  await client.connection.close();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
