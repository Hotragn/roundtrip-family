import { writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { agentMail, fileMailer, TASK_QUEUE } from "@roundtrip/agent/email";
import { loadEnv } from "@roundtrip/core/server-env";
import { bundleWorkflowCode, NativeConnection, Worker } from "@temporalio/worker";
import { type ActivityDeps, createActivities } from "./activities";
import { temporalAddress } from "./client";
import { defaultRecordsPath, fileRecords } from "./records";

/**
 * The Temporal worker. Runs in the Codespace (Linux x64), next to the dev server started with
 * `temporal server start-dev --db-filename temporal-dev.db --http-port 7243`; Temporal's native
 * core has no build for this repo's Windows ARM64 machine.
 * Docs: docs.temporal.io/develop/typescript/core-application (workers).
 *
 * Environment:
 * - TEMPORAL_ADDRESS (default localhost:7233), TEMPORAL_NAMESPACE (default "default")
 * - ROUNDTRIP_TASK_QUEUE (default "roundtrip")
 * - ROUNDTRIP_EMAIL_SINK: write emails to this JSON-lines file instead of sending them
 * - ROUNDTRIP_RECORDS: where nudges, alerts and approvals are recorded
 * - ROUNDTRIP_WORKFLOW_BUNDLE: a prebuilt workflow bundle (bundleWorkflowCode), for fast restarts
 * - ROUNDTRIP_SITE_URL: the dashboard, for links in emails
 *
 * Run: pnpm --filter @roundtrip/workflows worker
 */

export const WORKFLOWS_PATH = fileURLToPath(new URL("./workflows.ts", import.meta.url));

export function activityDeps(env: NodeJS.ProcessEnv = process.env): ActivityDeps {
  const sink = env.ROUNDTRIP_EMAIL_SINK?.trim();
  return {
    mailer: sink ? fileMailer(sink) : agentMail({ env }),
    records: fileRecords(env.ROUNDTRIP_RECORDS?.trim() || defaultRecordsPath()),
    siteUrl: env.ROUNDTRIP_SITE_URL?.trim() || env.NEXT_PUBLIC_SITE_URL?.trim() || "https://roundtrip-web.onrender.com",
  };
}

/** Bundles the workflow code once, so a restarted worker is ready in about a second. */
export async function writeWorkflowBundle(path: string): Promise<string> {
  const { code } = await bundleWorkflowCode({ workflowsPath: WORKFLOWS_PATH });
  writeFileSync(path, code);
  return path;
}

export async function runWorker(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  await loadEnv();
  const connection = await NativeConnection.connect({ address: temporalAddress(env) });
  const taskQueue = env.ROUNDTRIP_TASK_QUEUE?.trim() || TASK_QUEUE;
  const bundle = env.ROUNDTRIP_WORKFLOW_BUNDLE?.trim();
  const worker = await Worker.create({
    connection,
    namespace: env.TEMPORAL_NAMESPACE?.trim() || "default",
    taskQueue,
    ...(bundle ? { workflowBundle: { codePath: bundle } } : { workflowsPath: WORKFLOWS_PATH }),
    activities: createActivities(activityDeps(env)),
  });
  console.info(`worker ready on task queue ${taskQueue} (pid ${process.pid})`);
  await worker.run();
  await connection.close();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runWorker().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
