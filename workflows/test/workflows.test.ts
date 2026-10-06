import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { agentMail, parseReply, WORKFLOW } from "@roundtrip/agent/email";
import type { TestWorkflowEnvironment } from "@temporalio/testing";
import type { WorkflowBundleWithSourceMap } from "@temporalio/worker";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { type Activities, createActivities } from "../src/activities";
import {
  approveSignal,
  emailReplySignal,
  homeSignal,
  howWasItSignal,
  type OutingSafetyInput,
  rodeSignal,
  safetyStateQuery,
  type WeekPlanInput,
  weekStateQuery,
} from "../src/contract";
import { nextMonday } from "../src/demo-week";
import type { outingSafety, trialRun, weekPlan } from "../src/workflows";
import { loadTemporalTesting, memoryMailer, memoryRecords } from "./helpers";

/**
 * weekPlan, outingSafety and trialRun on Temporal's time-skipping test server
 * (docs.temporal.io/develop/typescript/testing-suite): a week of timers runs in seconds. The
 * activities are the real ones, over the saved demo plans (synthetic families), with email kept
 * in memory. Skips where Temporal's native core can't load; CI runs it on Linux.
 */

const temporal = await loadTemporalTesting();
const MIN = 60_000;
const HOUR = 60 * MIN;

const TEMPLE = "hh_fremont:2026-W41:pl_d1f88c93"; // Sarala, Monday 08:30 to 10:10, by bus, new route
const MARKET = "hh_fremont:2026-W41:pl_366cab34"; // Venkat, Monday 09:00 to 10:18, a walk, new route
const PARK = "hh_fremont:2026-W41:pl_7836967d"; // Sarala, Wednesday 08:30 to 10:28, by bus, new route
const FARMERS = "hh_fremont:2026-W41:pl_d98ae06a"; // both, Sunday with the adult child

describe.skipIf(!temporal.testing)("workflows on the time-skipping test server", () => {
  let env: TestWorkflowEnvironment;
  let bundle: WorkflowBundleWithSourceMap;

  beforeAll(async () => {
    bundle = await temporal.worker!.bundleWorkflowCode({
      workflowsPath: fileURLToPath(new URL("../src/workflows.ts", import.meta.url)),
    });
  }, 300_000);

  // A test server for each test. weekPlan abandons its children on purpose (a first ride can
  // wait for next weekend), and on a shared server a child whose worker has stopped holds the
  // clock still for every test after it. The first start downloads the test server.
  beforeEach(async () => {
    env = await temporal.testing!.TestWorkflowEnvironment.createTimeSkipping();
  }, 300_000);

  afterEach(async () => {
    vi.unstubAllGlobals();
    await env?.teardown();
  });

  function harness(activities?: Activities) {
    const mail = memoryMailer();
    const rec = memoryRecords();
    const acts = activities ?? createActivities({ mailer: mail.mailer, records: rec.records, siteUrl: null });
    const taskQueue = `test-${randomUUID()}`;
    const run = async <T>(fn: () => Promise<T>): Promise<T> => {
      const worker = await temporal.worker!.Worker.create({
        connection: env.nativeConnection,
        taskQueue,
        workflowBundle: bundle,
        activities: acts,
      });
      return worker.runUntil(fn());
    };
    return { mail, rec, taskQueue, run };
  }

  /** Polls until `fn` is true, letting the worker run (no time skipping happens meanwhile). */
  async function until(fn: () => boolean | Promise<boolean>, what: string): Promise<void> {
    for (let i = 0; i < 200; i++) {
      if (await Promise.resolve(fn()).catch(() => false)) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`timed out waiting for ${what}`);
  }

  async function safetyInput(over: Partial<OutingSafetyInput> = {}): Promise<OutingSafetyInput> {
    const now = await env.currentTimeMs();
    return {
      householdSlug: "fremont-demo",
      outingId: TEMPLE,
      parentIds: ["p_sarala"],
      expectedReturn: new Date(now + HOUR).toISOString(),
      bufferMs: 45 * MIN,
      nudgeWaitMs: 20 * MIN,
      afterAlertMs: 0,
      ...over,
    };
  }

  const startSafety = (taskQueue: string, input: OutingSafetyInput) => {
    const workflowId = `${WORKFLOW.outingSafety(input.outingId)}-${randomUUID()}`;
    return env.client.workflow.start<typeof outingSafety>("outingSafety", { workflowId, taskQueue, args: [input] });
  };

  describe("outingSafety", () => {
    it("stops quietly when I'm home arrives in time", async () => {
      const h = harness();
      const result = await h.run(async () => {
        const handle = await startSafety(h.taskQueue, await safetyInput());
        await handle.signal(homeSignal, { parentId: "p_sarala" });
        return handle.result();
      });
      expect(result.outcome).toBe("home");
      expect(result.nudgedAt).toBeNull();
      expect(h.rec.of("nudge")).toHaveLength(0);
      expect(h.mail.of("alert")).toHaveLength(0);
    });

    it("nudges at the expected return plus the buffer, then alerts nudgeWaitMinutes later", async () => {
      const h = harness();
      const input = await safetyInput();
      const result = await h.run(async () => (await startSafety(h.taskQueue, input)).result());
      const expected = Date.parse(input.expectedReturn);
      expect(result.outcome).toBe("alerted");
      // Timers fire on the workflow clock; activities add a moment.
      expect(Date.parse(result.nudgedAt!) - (expected + 45 * MIN)).toBeLessThan(5_000);
      expect(Date.parse(result.nudgedAt!) - (expected + 45 * MIN)).toBeGreaterThanOrEqual(0);
      expect(Date.parse(result.alertedAt!) - (expected + 65 * MIN)).toBeLessThan(5_000);
      expect(Date.parse(result.alertedAt!) - (expected + 65 * MIN)).toBeGreaterThanOrEqual(0);
      expect(result.alertEmail).toBe("sent");
      expect(h.rec.of("nudge")).toEqual([expect.objectContaining({ outingId: TEMPLE, parentIds: ["p_sarala"] })]);
      const [alert] = h.mail.of("alert");
      expect(alert!.subject).toBe("Sarala isn't home yet from Karya Siddhi Hanuman Temple");
    });

    it("stands down after the nudge when I'm home arrives", async () => {
      const h = harness();
      const input = await safetyInput();
      const result = await h.run(async () => {
        const handle = await startSafety(h.taskQueue, input);
        await env.sleep(HOUR + 46 * MIN);
        await until(async () => (await handle.query(safetyStateQuery)).stage === "nudged", "the nudge");
        await handle.signal(homeSignal, {});
        return handle.result();
      });
      expect(result.outcome).toBe("home_after_nudge");
      expect(h.rec.of("nudge")).toHaveLength(1);
      expect(h.mail.of("alert")).toHaveLength(0);
    });

    it("after an alert, sends a short email when they're home", async () => {
      const h = harness();
      const input = await safetyInput({ afterAlertMs: 6 * HOUR });
      const result = await h.run(async () => {
        const handle = await startSafety(h.taskQueue, input);
        await env.sleep(HOUR + 66 * MIN);
        await until(async () => (await handle.query(safetyStateQuery)).stage === "alerted", "the alert");
        await handle.signal(homeSignal, {});
        return handle.result();
      });
      expect(result.outcome).toBe("home_after_alert");
      expect(h.mail.of("alert")).toHaveLength(1);
      expect(h.mail.of("home")[0]!.subject).toBe("Sarala is home");
    });

    it("records the alert but sends nothing while DEMO_ALERT_EMAIL is invalid", async () => {
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      const rec = memoryRecords();
      const mailer = agentMail({
        env: { DEMO_ALERT_EMAIL: "not an address", AGENTMAIL_API_KEY: "test-key" },
        ledger: null,
        log: () => {},
      });
      const h = harness(createActivities({ mailer, records: rec.records, siteUrl: null }));
      const result = await h.run(async () => (await startSafety(h.taskQueue, await safetyInput())).result());
      expect(result.outcome).toBe("alerted");
      expect(result.alertEmail).toBe("not_sent");
      expect(rec.of("alert")).toHaveLength(1);
      expect(rec.of("email_not_sent")).toEqual([
        expect.objectContaining({ email: "alert", reason: "invalid_recipient" }),
      ]);
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe("weekPlan", () => {
    async function startWeek(taskQueue: string, over: Partial<WeekPlanInput> = {}) {
      const now = new Date(await env.currentTimeMs());
      const input: WeekPlanInput = {
        householdSlug: "fremont-demo",
        weekStart: nextMonday(now, "America/Los_Angeles"),
        once: true,
        ...over,
      };
      const workflowId = `${WORKFLOW.weekPlan("fremont-demo")}-${randomUUID()}`;
      return env.client.workflow.start<typeof weekPlan>("weekPlan", { workflowId, taskQueue, args: [input] });
    }

    const reply = (text: string, messageId = `reply-${randomUUID()}`) => ({
      weekKey: null,
      messageId,
      receivedAt: new Date().toISOString(),
      parsed: parseReply(text),
    });

    it('an "approve 1 and 3" reply reaches weekPlan and sets up those outings', async () => {
      const h = harness();
      const result = await h.run(async () => {
        const handle = await startWeek(h.taskQueue);
        await until(() => h.mail.of("planning").length === 1, "the planning email");
        await handle.signal(emailReplySignal, reply("Approve 1 and 3", "msg-child-1"));
        await until(async () => (await handle.query(weekStateQuery)).decided, "the decision");
        const state = await handle.query(weekStateQuery);
        expect(state.proposals.map((p) => p.status)).toEqual(["approved", "skipped", "approved", "skipped"]);
        await handle.signal(howWasItSignal, { outingId: TEMPLE, parentId: "p_sarala", face: "good" });
        return handle.result();
      });
      expect(result.approved).toEqual([TEMPLE, PARK]);
      expect(result.skipped).toEqual([MARKET, FARMERS]);
      expect(result.timedOut).toBe(false);
      expect(result.safety).toEqual([WORKFLOW.outingSafety(TEMPLE), WORKFLOW.outingSafety(PARK)]);
      expect(result.trialRuns).toEqual([WORKFLOW.trialRun(TEMPLE), WORKFLOW.trialRun(PARK)]);
      // Nobody checked in, so both timers alerted before Sunday's summary.
      expect(result.outcomes[TEMPLE]?.outcome).toBe("alerted");
      expect(result.outcomes[PARK]?.outcome).toBe("alerted");
      expect(h.rec.of("approval")).toEqual([
        expect.objectContaining({ approved: [TEMPLE, PARK], skipped: [MARKET, FARMERS], timedOut: false }),
      ]);
      const confirm = h.mail.of("reply")[0]!;
      expect(confirm.inReplyTo).toBe("msg-child-1");
      expect(confirm.text).toContain("Approved 1 and 3. The tickets are on their phones.");
      expect(confirm.text).toContain("Skipped 2 and 4.");
      expect(h.mail.of("alert")).toHaveLength(2);
      const summary = h.mail.of("summary")[0]!;
      expect(summary.text).toContain("Karya Siddhi Hanuman Temple, Sarala");
      expect(summary.text).toContain('Sarala picked "good".');
      expect(summary.text).not.toContain("Indian Market");
    }, 60_000);

    it("asks again when a reply is unclear, then takes the clear one", async () => {
      const h = harness();
      const result = await h.run(async () => {
        const handle = await startWeek(h.taskQueue);
        await handle.signal(emailReplySignal, reply("Can we move 2 to Tuesday?", "msg-unclear"));
        await handle.signal(emailReplySignal, reply("yes"));
        return handle.result();
      });
      expect(result.approved).toEqual([TEMPLE, MARKET, PARK, FARMERS]);
      const [ask] = h.mail.of("reply");
      expect(ask!.inReplyTo).toBe("msg-unclear");
      expect(ask!.text).toContain("Which outings should go ahead?");
      // Outings with the adult child get no safety timer; the rest do.
      expect(result.safety).toHaveLength(3);
      expect(result.safety).not.toContain(WORKFLOW.outingSafety(FARMERS));
    }, 60_000);

    it("swap 2 brings the planner's next option and asks about the week again", async () => {
      const h = harness();
      const result = await h.run(async () => {
        const handle = await startWeek(h.taskQueue);
        await handle.signal(emailReplySignal, reply("swap 2", "msg-swap"));
        await until(() => h.mail.of("planning").length === 2, "the updated planning email");
        await handle.signal(emailReplySignal, reply("approve all"));
        return handle.result();
      });
      const swapped = "hh_fremont:2026-W41:pl_906a027f:father";
      expect(result.approved).toEqual([TEMPLE, swapped, PARK, FARMERS]);
      const update = h.mail.of("planning")[1]!;
      expect(update.inReplyTo).toBe("msg-swap");
      expect(update.text).toContain("Here is the week with your change.");
      expect(update.text).toContain("Sri Siddhi Vinayaka Cultural Center");
      expect(update.text).toContain("New option.");
      expect(update.text).not.toContain("Indian Market");
    }, 60_000);

    it("takes the dashboard's approve by outing id", async () => {
      const h = harness();
      const result = await h.run(async () => {
        const handle = await startWeek(h.taskQueue);
        await handle.signal(approveSignal, { approve: [PARK] });
        return handle.result();
      });
      expect(result.approved).toEqual([PARK]);
      expect(result.skipped).toEqual([TEMPLE, MARKET, FARMERS]);
      expect(h.mail.of("reply")).toHaveLength(0);
    }, 60_000);

    it("sets nothing up when no answer comes before the deadline", async () => {
      const h = harness();
      const result = await h.run(async () => (await startWeek(h.taskQueue, { approvalTimeoutMs: HOUR })).result());
      expect(result.timedOut).toBe(true);
      expect(result.approved).toEqual([]);
      expect(result.safety).toEqual([]);
      expect(h.mail.of("summary")).toHaveLength(0);
    }, 60_000);

    it("answers a late reply with what's already set", async () => {
      const h = harness();
      await h.run(async () => {
        const handle = await startWeek(h.taskQueue);
        await handle.signal(approveSignal, { approve: "all" });
        await handle.signal(emailReplySignal, reply("skip 2", "msg-late"));
        return handle.result();
      });
      const late = h.mail.of("reply").find((e) => e.inReplyTo === "msg-late")!;
      expect(late.text).toContain("This week is already set: 1, 2, 3 and 4 are on their phones.");
    }, 60_000);

    it("starts no timer for an outing whose time has passed when the answer comes", async () => {
      const h = harness();
      const result = await h.run(async () => {
        const handle = await startWeek(h.taskQueue, { approvalTimeoutMs: 7 * 24 * HOUR });
        const state = await (async () => {
          await until(async () => (await handle.query(weekStateQuery)).proposals.length > 0, "the plan");
          return handle.query(weekStateQuery);
        })();
        // Skip past Monday's two outings, then approve everything.
        const monday = Date.parse(state.proposals[1]!.backAt) + 2 * HOUR;
        await env.sleep(monday - (await env.currentTimeMs()));
        await handle.signal(approveSignal, { approve: "all" });
        return handle.result();
      });
      expect(result.missed).toEqual([TEMPLE, MARKET]);
      expect(result.safety).toEqual([WORKFLOW.outingSafety(PARK)]);
    }, 60_000);
  });

  describe("trialRun", () => {
    const start = (taskQueue: string) => {
      const workflowId = `${WORKFLOW.trialRun(TEMPLE)}-${randomUUID()}`;
      return env.client.workflow.start<typeof trialRun>("trialRun", {
        workflowId,
        taskQueue,
        args: [{ householdSlug: "fremont-demo", outingId: TEMPLE }],
      });
    };

    it("books the first ride together at the weekend and marks the route solo-ready once it's confirmed", async () => {
      const h = harness();
      const result = await h.run(async () => {
        const handle = await start(h.taskQueue);
        await until(() => h.rec.of("trial_run").length === 1, "the booking");
        await handle.signal(rodeSignal, { source: "dashboard" });
        return handle.result();
      });
      expect(result.outcome).toBe("solo_ready");
      const day = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "America/Los_Angeles" }).format(
        new Date(result.rideAt!),
      );
      expect(["Saturday", "Sunday"]).toContain(day);
      expect(h.rec.of("trial_run").map((r) => r.status)).toEqual(["scheduled", "solo_ready"]);
    }, 60_000);

    it("offers the next weekend when a ride isn't confirmed, then stops", async () => {
      const h = harness();
      const result = await h.run(async () => (await start(h.taskQueue)).result());
      expect(result.outcome).toBe("not_confirmed");
      expect(result.attempts).toBe(2);
      expect(h.rec.of("trial_run").map((r) => r.status)).toEqual([
        "scheduled",
        "not_confirmed",
        "scheduled",
        "not_confirmed",
      ]);
      const [first, , second] = h.rec.of("trial_run");
      expect(Date.parse(String(second!.rideAt)) - Date.parse(String(first!.rideAt))).toBeGreaterThanOrEqual(24 * HOUR);
    }, 60_000);
  });
});
