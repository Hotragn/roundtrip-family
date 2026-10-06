import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, openSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readInboundReply, SIGNAL, signalWorkflow, toSignal, WORKFLOW } from "@roundtrip/agent/email";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type Client = Awaited<ReturnType<typeof import("../workflows/src/client")["connectClient"]>>;

/**
 * Durability: the safety alert still fires on time after the worker is killed mid-wait
 * (docs/plan.md, "The demo moment"). A Temporal dev server keeps its state in a file; a real
 * worker runs as a child process; outingSafety starts with timers in seconds; the worker is
 * killed with SIGKILL after the nudge, while it waits for the alert; a new worker starts; the
 * alert must fire within a small tolerance of when it was due. Then the web app's own path is
 * checked on the same server: an "I'm home" check-in and an approve reply, as AgentMail would
 * deliver it, reach the workflows over Temporal's HTTP API. Email goes to a file, never out.
 * The outings are the synthetic Fremont persona's.
 *
 * Runs only with DURABILITY=1, in the Codespace (Linux x64; Temporal's native worker has no
 * Windows ARM64 build): DURABILITY=1 pnpm --filter @roundtrip/workflows durability
 * The output, with timestamps, is saved to docs/durability-run.txt.
 * Docs: docs.temporal.io/cli/server (start-dev --db-filename, --http-port),
 * docs.temporal.io/develop/typescript
 */

const RUN = process.env.DURABILITY === "1";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TEMPLE = "hh_fremont:2026-W41:pl_d1f88c93"; // Sarala's temple trip, by bus
const PARK = "hh_fremont:2026-W41:pl_7836967d"; // Sarala's walk in Central Park, by bus
const PORT = Number(process.env.DURABILITY_PORT ?? 7299);
const HTTP_PORT = PORT - 1;
const ALERT = "adult.child@example.com";

/** Seconds: expected home at +5, nudge due 5 later, alert due 30 after that. */
const RETURN_S = 5;
const BUFFER_S = 5;
const NUDGE_WAIT_S = 30;
/**
 * Kill the worker 4 s after the nudge is due, start the next one 6 s later. The kill comes more
 * than 10 s before the alert: a worker killed with SIGKILL leaves its sticky task queue behind,
 * and a workflow task sent there can wait up to stickyQueueScheduleToStartTimeout (10 s by
 * default) before another worker takes it, so this run measures the timer, not that timeout
 * (docs/research/temporal.md).
 */
const KILL_AT_S = RETURN_S + BUFFER_S + 4;
const RESTART_AT_S = KILL_AT_S + 6;
const TOLERANCE_MS = 2000;

const t0 = Date.now();
function say(line: string): void {
  const now = Date.now();
  console.log(`${new Date(now).toISOString()}  +${((now - t0) / 1000).toFixed(3).padStart(7)} s  ${line}`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

/** The history event types this run produces (temporal.api.enums.v1.EventType). */
const EVENT_NAMES: Record<number, string> = {
  1: "WorkflowExecutionStarted",
  2: "WorkflowExecutionCompleted",
  5: "WorkflowTaskScheduled",
  6: "WorkflowTaskStarted",
  7: "WorkflowTaskCompleted",
  8: "WorkflowTaskTimedOut",
  9: "WorkflowTaskFailed",
  10: "ActivityTaskScheduled",
  11: "ActivityTaskStarted",
  12: "ActivityTaskCompleted",
  13: "ActivityTaskFailed",
  14: "ActivityTaskTimedOut",
  17: "TimerStarted",
  18: "TimerFired",
  26: "WorkflowExecutionSignaled",
};

interface Row {
  at: string;
  kind: string;
  [k: string]: unknown;
}
function rows(path: string): Row[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Row);
}

async function waitFor<T>(fn: () => T | null | undefined | Promise<T | null | undefined>, what: string, ms = 60_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${what}`);
}

describe.skipIf(!RUN)("durability", () => {
  const tmp = RUN ? mkdtempSync(join(tmpdir(), "rt-durability-")) : "";
  const address = `localhost:${PORT}`;
  const children: ChildProcess[] = [];
  let client: Client;
  let bundle: string;

  /** A worker as its own process: node itself, not npx, so SIGKILL reaches it. Output goes to a log. */
  function startWorker(env: NodeJS.ProcessEnv, name: string): Promise<ChildProcess> {
    const log = join(tmp, `${name.replace(/\s+/g, "-").toLowerCase()}.log`);
    const child = spawn(process.execPath, ["--import", "tsx", "workflows/src/worker.ts"], {
      cwd: ROOT,
      env,
      stdio: ["ignore", "pipe", openSync(log, "a")],
    });
    children.push(child);
    return new Promise((resolve, reject) => {
      let ready = false;
      child.stdout?.on("data", (b: Buffer) => {
        appendFileSync(log, b);
        if (!ready && b.toString().includes("worker ready")) {
          ready = true;
          say(`${name} ready (pid ${child.pid})`);
          resolve(child);
        }
      });
      child.once("exit", (code, signal) => {
        if (!ready) reject(new Error(`${name} exited (${code ?? signal}) before it was ready; see ${log}`));
      });
    });
  }

  function workerEnv(taskQueue: string): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      TEMPORAL_ADDRESS: address,
      ROUNDTRIP_TASK_QUEUE: taskQueue,
      ROUNDTRIP_EMAIL_SINK: join(tmp, `emails-${taskQueue}.jsonl`),
      ROUNDTRIP_RECORDS: join(tmp, `records-${taskQueue}.jsonl`),
      ROUNDTRIP_WORKFLOW_BUNDLE: bundle,
    };
    // No email can leave this run: the file sink is used, and the worker never sees the key.
    delete env.AGENTMAIL_API_KEY;
    return env;
  }

  beforeAll(async () => {
    const { connectClient } = await import("../workflows/src/client");
    const { writeWorkflowBundle } = await import("../workflows/src/worker");
    say("Durability run: Roundtrip's workflows on a Temporal dev server, synthetic outings, timers in seconds");
    say(`node ${process.version}, ${process.platform}-${process.arch}`);
    const cli = spawnSync("temporal", ["--version"], { encoding: "utf8" });
    say(`Temporal CLI: ${(cli.stdout || cli.stderr || "not found").trim()}`);
    // A dev server with a file database, on its own ports so nothing else in the Codespace is touched.
    const db = join(tmp, "temporal-dev.db");
    const server = spawn(
      "temporal",
      [
        "server",
        "start-dev",
        "--headless",
        "--db-filename",
        db,
        "--port",
        String(PORT),
        "--http-port",
        String(HTTP_PORT),
      ],
      { stdio: ["ignore", openSync(join(tmp, "server.log"), "a"), openSync(join(tmp, "server.log"), "a")] },
    );
    children.push(server);
    say(`Started the Temporal dev server (pid ${server.pid}) on ${address}, HTTP API on ${HTTP_PORT}, state in ${db}`);
    client = await waitFor(async () => {
      try {
        const c = await connectClient({ TEMPORAL_ADDRESS: address });
        await c.workflowService.getSystemInfo({});
        return c;
      } catch {
        return null;
      }
    }, "the dev server");
    say("Dev server is answering");
    bundle = await writeWorkflowBundle(join(tmp, "workflow-bundle.js"));
    say("Bundled the workflow code once, for quick worker starts");
  }, 120_000);

  afterAll(async () => {
    await client?.connection.close();
    for (const c of children.reverse()) if (c.exitCode === null && c.signalCode === null) c.kill("SIGTERM");
    say(`Stopped the workers and the dev server; run files in ${tmp}`);
  });

  it("the safety alert fires on time after the worker is killed mid-wait", async () => {
    const taskQueue = `durability-${t0}`;
    const env = workerEnv(taskQueue);
    const records = env.ROUNDTRIP_RECORDS!;
    const emails = env.ROUNDTRIP_EMAIL_SINK!;
    const worker1 = await startWorker(env, "Worker 1");

    const start = Date.now();
    const expectedReturn = start + RETURN_S * 1000;
    const nudgeDue = expectedReturn + BUFFER_S * 1000;
    const alertDue = nudgeDue + NUDGE_WAIT_S * 1000;
    const workflowId = `outing-safety-${TEMPLE}-durability-${t0}`;
    const handle = await client.workflow.start("outingSafety", {
      workflowId,
      taskQueue,
      args: [
        {
          householdSlug: "fremont-demo",
          outingId: TEMPLE,
          parentIds: ["p_sarala"],
          expectedReturn: new Date(expectedReturn).toISOString(),
          bufferMs: BUFFER_S * 1000,
          nudgeWaitMs: NUDGE_WAIT_S * 1000,
          afterAlertMs: 0,
        },
      ],
    });
    say(`Started outingSafety ${workflowId}`);
    say(`  expected home ${new Date(expectedReturn).toISOString()}`);
    say(`  nudge due     ${new Date(nudgeDue).toISOString()} (buffer ${BUFFER_S} s)`);
    say(`  alert due     ${new Date(alertDue).toISOString()} (nudge wait ${NUDGE_WAIT_S} s)`);

    const nudge = await waitFor(() => rows(records).find((r) => r.kind === "nudge"), "the nudge");
    say(`Nudge recorded for the phone at ${nudge.at} (${Date.parse(nudge.at) - nudgeDue} ms after it was due)`);
    say(`Workflow state before the kill: ${JSON.stringify(await handle.query("safetyState"))}`);

    await sleep(start + KILL_AT_S * 1000 - Date.now());
    const exited = new Promise<string>((r) => worker1.once("exit", (code, signal) => r(String(signal ?? code))));
    worker1.kill("SIGKILL");
    const how = await exited;
    const killedAt = Date.now();
    say(
      `Killed worker 1 with SIGKILL (exit: ${how}), ${((alertDue - killedAt) / 1000).toFixed(1)} s before the alert is due`,
    );
    const desc = await handle.describe();
    say(`With no worker running, the server still holds the workflow: status ${desc.status.name}`);

    await sleep(start + RESTART_AT_S * 1000 - Date.now());
    say("Starting worker 2");
    await startWorker(env, "Worker 2");
    const restartedAt = Date.now();

    const result = (await handle.result()) as { outcome: string; alertEmail: string | null };
    say(`Workflow finished: ${JSON.stringify(result)}`);

    const all = rows(records);
    const alert = all.find((r) => r.kind === "alert");
    expect(alert).toBeTruthy();
    const lateBy = Date.parse(alert!.at) - alertDue;
    say(`Alert recorded at ${alert!.at}`);
    const sent = rows(emails).filter((e) => e.kind === "alert");
    say(`Alert email written to the local sink (not sent): "${String(sent[0]?.subject ?? "")}"`);

    const history = await handle.fetchHistory();
    say("Workflow history (server time, seconds from the start of the run):");
    for (const e of history.events ?? []) {
      const ms = Number(e.eventTime?.seconds ?? 0) * 1000 + Math.floor(Number(e.eventTime?.nanos ?? 0) / 1e6);
      const name = EVENT_NAMES[Number(e.eventType)] ?? `event type ${String(e.eventType)}`;
      say(`  ${String(e.eventId).padStart(3)}  +${((ms - t0) / 1000).toFixed(3).padStart(7)} s  ${name}`);
    }

    say("Summary");
    say(`  expected alert ${new Date(alertDue).toISOString()}`);
    say(`  actual alert   ${alert!.at} (${lateBy >= 0 ? "+" : ""}${lateBy} ms; tolerance ${TOLERANCE_MS} ms)`);
    say(
      `  worker 1 killed (SIGKILL) ${new Date(killedAt).toISOString()}, worker 2 ready ${new Date(restartedAt).toISOString()}`,
    );
    say(`  worker down for ${((restartedAt - killedAt) / 1000).toFixed(1)} s, during the wait for the alert`);
    say(
      `  nudges recorded ${all.filter((r) => r.kind === "nudge").length}, alerts recorded ${all.filter((r) => r.kind === "alert").length}`,
    );

    expect(result.outcome).toBe("alerted");
    expect(result.alertEmail).toBe("sent");
    expect(lateBy).toBeGreaterThanOrEqual(-50);
    expect(lateBy).toBeLessThanOrEqual(TOLERANCE_MS);
    // The replayed workflow didn't nudge twice, and the alert went out once.
    expect(all.filter((r) => r.kind === "nudge")).toHaveLength(1);
    expect(all.filter((r) => r.kind === "alert")).toHaveLength(1);
    expect(sent).toHaveLength(1);
    expect(killedAt).toBeLessThan(alertDue);
    expect(restartedAt).toBeLessThan(alertDue);
  });

  it("a check-in and an approve reply reach the workflows over the HTTP API, as the web app sends them", async () => {
    const taskQueue = `http-${t0}`;
    const env = workerEnv(taskQueue);
    await startWorker(env, "Worker 3");
    // What the web app has when TEMPORAL_ADDRESS is set (apps/web/lib/server/temporal.ts).
    const web = { TEMPORAL_ADDRESS: address, TEMPORAL_HTTP_URL: `http://localhost:${HTTP_PORT}` };

    // "I'm home" from Sarala's phone, as apps/web/app/parents/api/[kind]/route.ts passes it on.
    const safetyId = `${WORKFLOW.outingSafety(PARK)}-http-${t0}`;
    const safety = await client.workflow.start("outingSafety", {
      workflowId: safetyId,
      taskQueue,
      args: [
        {
          householdSlug: "fremont-demo",
          outingId: PARK,
          parentIds: ["p_sarala"],
          expectedReturn: new Date(Date.now() + 60_000).toISOString(),
          bufferMs: 60_000,
          nudgeWaitMs: 60_000,
        },
      ],
    });
    const checkin = await signalWorkflow(
      safetyId,
      SIGNAL.home,
      { parentId: "p_sarala", at: new Date().toISOString() },
      { env: web },
    );
    say(`Check-in over the HTTP API: ${checkin}`);
    const home = (await safety.result()) as { outcome: string; homeAt: string | null };
    say(`outingSafety finished: ${home.outcome} at ${home.homeAt}`);
    expect(checkin).toBe("sent");
    expect(home.outcome).toBe("home");
    expect(await signalWorkflow(`outing-safety-not-a-real-outing-${t0}`, SIGNAL.home, {}, { env: web })).toBe(
      "not_found",
    );

    // The week's plan, then a reply to its planning email, as AgentMail's webhook delivers it.
    const weekId = `${WORKFLOW.weekPlan("fremont-demo")}-http-${t0}`;
    const week = await client.workflow.start("weekPlan", {
      workflowId: weekId,
      taskQueue,
      args: [{ householdSlug: "fremont-demo", once: true, approvalTimeoutMs: 60_000, summaryAfterMs: 20_000 }],
    });
    const planning = await waitFor(
      () => rows(env.ROUNDTRIP_EMAIL_SINK!).find((e) => e.kind === "planning"),
      "the planning email",
    );
    say(`Planning email written to the local sink: "${String(planning.subject)}"`);
    const event = {
      type: "event",
      event_type: "message.received",
      event_id: `evt-${t0}`,
      message: {
        inbox_id: "inbox-roundtrip",
        thread_id: "thread-1",
        message_id: "msg-reply-1",
        from: `Your child <${ALERT}>`,
        labels: ["received"],
        subject: `Re: ${String(planning.subject)}`,
        text: "Approve 1 and 3\n\nOn Sunday, Roundtrip wrote:\n> ...",
        extracted_text: "Approve 1 and 3",
        timestamp: new Date().toISOString(),
      },
      // The planning email's labels, as the thread carries them.
      thread: { labels: planning.labels as string[] },
    };
    const inbound = await readInboundReply(event, { alertAddress: ALERT });
    expect(inbound.ok).toBe(true);
    if (!inbound.ok) return;
    // The labels name the household's weekPlan; this run's copy has its own id.
    expect(inbound.reply.workflowId).toBe(WORKFLOW.weekPlan("fremont-demo"));
    const reply = await signalWorkflow(weekId, SIGNAL.emailReply, toSignal(inbound.reply), { env: web });
    say(`Approve reply over the HTTP API: ${reply} (${JSON.stringify(inbound.reply.parsed)})`);
    expect(reply).toBe("sent");
    const state = await waitFor(async () => {
      const s = (await week.query("weekState")) as {
        decided: boolean;
        proposals: Array<{ n: number; status: string }>;
      };
      return s.decided ? s : null;
    }, "the decision");
    say(`weekPlan now: ${state.proposals.map((p) => `${p.n} ${p.status}`).join(", ")}`);
    expect(state.proposals.map((p) => p.status)).toEqual(["approved", "skipped", "approved", "skipped"]);
    const confirm = await waitFor(
      () => rows(env.ROUNDTRIP_EMAIL_SINK!).find((e) => e.kind === "reply"),
      "the reply in the thread",
    );
    say(`Reply in the planning thread (local sink): ${JSON.stringify(String(confirm.text).split("\n")[0])}`);
    expect(String(confirm.text)).toContain("Approved 1 and 3.");
    expect(confirm.inReplyTo).toBe("msg-reply-1");
    await week.terminate("durability run done");
  });
});
