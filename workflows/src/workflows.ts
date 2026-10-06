import type { EmailReplySignal } from "@roundtrip/agent/email";
import {
  ActivityFailure,
  ApplicationFailure,
  condition,
  continueAsNew,
  log,
  ParentClosePolicy,
  proxyActivities,
  setHandler,
  sleep,
  startChild,
} from "@temporalio/workflow";
import type { Activities } from "./activities";
import {
  type ApproveSignal,
  approveSignal,
  emailReplySignal,
  type HowWasItSignal,
  homeSignal,
  howWasItSignal,
  type OutingSafetyInput,
  type OutingSafetyResult,
  type ProposalState,
  rodeSignal,
  type SafetyOutcome,
  type SafetyStage,
  safetyStateQuery,
  type TrialRunInput,
  type TrialRunResult,
  type WeekPlanInput,
  type WeekPlanResult,
  weekStateQuery,
} from "./contract";
import { applyResolution, type Choice, choiceFromReply, numbersWith, resolveChoice, toChoice } from "./decisions";

/**
 * Roundtrip's durable workflows (docs/plan.md, "Temporal: weekly plan and safety timers").
 * Mastra decides; Temporal remembers and waits.
 *
 * - weekPlan: plans the week, emails the plan, waits for an answer from the dashboard or a
 *   reply, sets up the approved outings (a safety timer for each one they make on their own, a
 *   first ride together for each new route), sends the summary on Sunday evening, then plans
 *   the next week as a new run of the same workflow.
 * - outingSafety: waits for "I'm home" until the expected return plus the household's buffer,
 *   then records a nudge for the phone, waits nudgeWaitMinutes more, then emails the alert.
 * - trialRun: books the first ride together on a new route for the weekend and records it,
 *   then marks the route solo-ready once the ride is confirmed.
 *
 * Docs: docs.temporal.io/develop/typescript (timers, message passing, child workflows,
 * continue-as-new). Workflow code is deterministic: time comes from the workflow clock, and
 * everything that touches files, email or the network is an activity.
 */

const acts = proxyActivities<Activities>({
  startToCloseTimeout: "1 minute",
  retry: { initialInterval: "2 seconds", maximumAttempts: 5 },
});

/** Email activities retry less, so a slow send can't turn into several emails. */
const mail = proxyActivities<Activities>({
  startToCloseTimeout: "1 minute",
  retry: { initialInterval: "5 seconds", maximumAttempts: 3 },
});

const HOUR = 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();
const ASK_AGAIN = "Which outings should go ahead?";

/** Waits until `fn()` is true or the deadline passes, on a durable timer. True if `fn()` won. */
async function waitUntil(deadlineMs: number, fn: () => boolean, summary: string): Promise<boolean> {
  if (fn()) return true;
  const ms = deadlineMs - Date.now();
  if (ms <= 0) return false;
  return condition(fn, ms, { summary });
}

type Answer = { kind: "dashboard"; signal: ApproveSignal } | { kind: "email"; signal: EmailReplySignal };

export async function weekPlan(input: WeekPlanInput): Promise<WeekPlanResult> {
  const started = Date.now();
  const answers: Answer[] = [];
  const faces: HowWasItSignal[] = [];
  let decided = false;
  let weekKey = "";
  let proposals: ProposalState[] = [];
  // Handlers first, so an answer or a query that arrives while the week is being planned waits.
  // Signals come from outside the workflow: anything that isn't an object is dropped here.
  const isObject = (x: unknown): x is object => typeof x === "object" && x !== null;
  setHandler(approveSignal, (signal) => {
    if (isObject(signal)) answers.push({ kind: "dashboard", signal });
  });
  setHandler(emailReplySignal, (signal) => {
    if (isObject(signal)) answers.push({ kind: "email", signal });
  });
  setHandler(howWasItSignal, (signal) => {
    if (isObject(signal) && typeof signal.outingId === "string" && ["good", "okay", "not_good"].includes(signal.face)) {
      faces.push(signal);
    }
  });
  setHandler(weekStateQuery, () => ({ weekKey, decided, proposals }));

  // Activities get the workflow clock, so a replay or a skewed worker clock plans the same week.
  const plan = await acts.planWeek({
    householdSlug: input.householdSlug,
    weekStart: input.weekStart,
    now: iso(started),
  });
  const slug = plan.householdSlug;
  weekKey = plan.weekKey;
  proposals = plan.proposals.map((p, i) => ({ ...p, n: i + 1, status: "pending" }));

  const result: WeekPlanResult = {
    weekKey: plan.weekKey,
    approved: [],
    skipped: [],
    timedOut: false,
    safety: [],
    missed: [],
    trialRuns: [],
    outcomes: {},
  };

  if (proposals.length) {
    await mail.sendPlanningEmail({
      householdSlug: slug,
      weekStart: plan.weekStart,
      replyBy: plan.replyBy,
      proposals,
      update: null,
    });
    const deadline =
      input.approvalTimeoutMs === undefined ? Date.parse(plan.replyBy) : started + input.approvalTimeoutMs;

    while (proposals.some((p) => p.status === "pending")) {
      if (!(await waitUntil(deadline, () => answers.length > 0, "Wait for the week's answer"))) {
        result.timedOut = true;
        break;
      }
      const answer = answers.shift()!;
      const email = answer.kind === "email" ? answer.signal : null;
      let choice: Choice;
      if (answer.kind === "dashboard") {
        const s = answer.signal;
        // A dashboard still showing last week's plan doesn't change this one.
        if (s.weekKey && s.weekKey !== plan.weekKey) continue;
        // The dashboard's own swaps first, so its approvals can name the outings chosen instead.
        for (const [from, to] of Object.entries(isObject(s.swapTo) ? s.swapTo : {})) {
          const current = proposals.find((p) => p.status === "pending" && p.outingId === from);
          if (!current || typeof to !== "string") continue;
          const forOutingId = current.swappedFrom?.[0] ?? current.outingId;
          const next = await acts.chosenAlternative({
            householdSlug: slug,
            weekStart: plan.weekStart,
            forOutingId,
            outingId: to,
          });
          if (next) {
            proposals = proposals.map((p) =>
              p.n === current.n
                ? { ...next, n: p.n, status: "pending", swappedFrom: [...(p.swappedFrom ?? []), p.outingId] }
                : p,
            );
          } else log.warn("Dashboard swap not applied", { from });
        }
        choice = toChoice(s);
      } else if (email) {
        // Signals come from outside: a reply with no message to answer, or no parsed answer, is dropped
        // or asked about again, never allowed to fail the workflow task.
        if (typeof email.messageId !== "string" || !email.messageId) continue;
        if (email.weekKey && email.weekKey !== plan.weekKey) {
          await mail.replyInThread({ householdSlug: slug, messageId: email.messageId, reply: { kind: "old_week" } });
          continue;
        }
        const parsed = email.parsed;
        if (!parsed || typeof parsed !== "object" || parsed.kind !== "decision") {
          const why = parsed?.kind === "unclear" && typeof parsed.why === "string" ? parsed.why : ASK_AGAIN;
          await mail.replyInThread({
            householdSlug: slug,
            messageId: email.messageId,
            reply: { kind: "ask_again", why },
          });
          continue;
        }
        choice = choiceFromReply(parsed);
      } else continue;

      const resolution = resolveChoice(proposals, choice);
      if (!resolution.ok) {
        if (email) {
          await mail.replyInThread({
            householdSlug: slug,
            messageId: email.messageId,
            reply: { kind: "ask_again", why: resolution.why },
          });
        } else log.warn("Dashboard answer not applied", { why: resolution.why });
        continue;
      }
      proposals = applyResolution(proposals, resolution);

      const noOtherOption: number[] = [];
      for (const n of resolution.swap) {
        const current = proposals.find((p) => p.n === n)!;
        const exclude = proposals.flatMap((p) => [p.outingId, ...(p.swappedFrom ?? [])]);
        const next = await acts.swapOuting({
          householdSlug: slug,
          weekStart: plan.weekStart,
          // The planner's options are listed under the outing first proposed in this place.
          forOutingId: current.swappedFrom?.[0] ?? current.outingId,
          exclude,
        });
        if (!next) {
          noOtherOption.push(n);
          continue;
        }
        proposals = proposals.map((p) =>
          p.n === n
            ? { ...next, n, status: "pending", swappedFrom: [...(current.swappedFrom ?? []), current.outingId] }
            : p,
        );
      }

      const waiting = numbersWith(proposals, "pending");
      if (waiting.length) {
        await mail.sendPlanningEmail({
          householdSlug: slug,
          weekStart: plan.weekStart,
          replyBy: plan.replyBy,
          proposals,
          update: { waiting, noOtherOption },
          inReplyTo: email?.messageId,
        });
      } else if (email) {
        await mail.replyInThread({
          householdSlug: slug,
          messageId: email.messageId,
          reply: {
            kind: "confirmed",
            approved: numbersWith(proposals, "approved"),
            skipped: numbersWith(proposals, "skipped"),
          },
        });
      }
    }

    // Anything still waiting at the deadline is not set up.
    proposals = proposals.map((p) => (p.status === "pending" ? { ...p, status: "skipped" } : p));
    decided = true;
    result.approved = proposals.filter((p) => p.status === "approved").map((p) => p.outingId);
    result.skipped = proposals.filter((p) => p.status === "skipped").map((p) => p.outingId);
    await acts.recordApprovals({
      householdSlug: slug,
      weekKey: plan.weekKey,
      approved: result.approved,
      skipped: result.skipped,
      timedOut: result.timedOut,
    });

    for (const p of proposals.filter((x) => x.status === "approved")) {
      // The evening before (14 hours ahead of leaving), unless that has already passed.
      const remindAt = Date.parse(p.departAt) - REMIND_BEFORE_MS;
      if (remindAt > Date.now()) {
        await startOnce(() =>
          startChild(outingReminder, {
            // WORKFLOW.outingReminder in agent/src/email/ids.ts; the workflow bundle can't import it.
            workflowId: `outing-reminder-${p.outingId}`,
            args: [
              {
                householdSlug: slug,
                outingId: p.outingId,
                parentIds: p.parentIds,
                departAt: p.departAt,
                backAt: p.backAt,
                remindAt,
              },
            ],
            parentClosePolicy: ParentClosePolicy.ABANDON,
          }),
        );
      }
      const bufferMs = plan.safety.bufferMinutes * 60_000;
      if (!p.withAdultChild) {
        if (Date.parse(p.backAt) + bufferMs <= Date.now()) result.missed.push(p.outingId);
        else {
          const args: OutingSafetyInput = {
            householdSlug: slug,
            outingId: p.outingId,
            parentIds: p.parentIds,
            expectedReturn: p.backAt,
            bufferMs,
            nudgeWaitMs: plan.safety.nudgeWaitMinutes * 60_000,
          };
          const child = await startOnce(() =>
            startChild(outingSafety, {
              workflowId: p.safetyWorkflowId,
              args: [args],
              // The timer outlives this week's run, which continues as new on Sunday.
              parentClosePolicy: ParentClosePolicy.ABANDON,
            }),
          );
          if (child) {
            result.safety.push(p.safetyWorkflowId);
            void child.result().then(
              (r) => {
                result.outcomes[p.outingId] = { outcome: r.outcome, homeAt: r.homeAt };
              },
              () => {},
            );
          }
        }
      }
      if (p.firstRideTogether) {
        const child = await startOnce(() =>
          startChild(trialRun, {
            workflowId: p.trialRunWorkflowId,
            args: [{ householdSlug: slug, outingId: p.outingId }],
            parentClosePolicy: ParentClosePolicy.ABANDON,
          }),
        );
        if (child) result.trialRuns.push(p.trialRunWorkflowId);
      }
    }
  }

  // Until Sunday evening: answer late replies, collect "How was it?" faces.
  const summaryAt = input.summaryAfterMs === undefined ? Date.parse(plan.summaryAt) : started + input.summaryAfterMs;
  while (await waitUntil(summaryAt, () => answers.length > 0, "Wait for the end of the week")) {
    const answer = answers.shift()!;
    if (answer.kind !== "email" || typeof answer.signal.messageId !== "string" || !answer.signal.messageId) continue;
    await mail.replyInThread({
      householdSlug: slug,
      messageId: answer.signal.messageId,
      reply:
        answer.signal.weekKey && answer.signal.weekKey !== plan.weekKey
          ? { kind: "old_week" }
          : { kind: "already_set", approved: numbersWith(proposals, "approved") },
    });
  }

  if (result.approved.length) {
    await mail.sendWeeklySummary({
      householdSlug: slug,
      weekStart: plan.weekStart,
      items: proposals
        .filter((p) => p.status === "approved")
        .map((p) => ({
          outingId: p.outingId,
          date: p.date,
          withAdultChild: p.withAdultChild,
          outcome: result.outcomes[p.outingId] ?? null,
          faces: faces.filter((f) => f.outingId === p.outingId).map((f) => ({ parentId: f.parentId, face: f.face })),
        })),
    });
  }

  if (!input.once) {
    // Every Sunday at 6 pm: the next week is planned in a fresh run with the same workflow id.
    // Docs: docs.temporal.io/develop/typescript/continue-as-new
    await continueAsNew<typeof weekPlan>({ householdSlug: slug });
  }
  return result;
}

/** Starts a child once; a timer already running for the same outing is left as it is. */
async function startOnce<T>(start: () => Promise<T>): Promise<T | null> {
  try {
    return await start();
  } catch (e) {
    if ((e as Error)?.name === "WorkflowExecutionAlreadyStartedError") return null;
    throw e;
  }
}

export async function outingSafety(input: OutingSafetyInput): Promise<OutingSafetyResult> {
  let homeAt: number | null = null;
  let stage: SafetyStage = "waiting";
  const expected = Date.parse(input.expectedReturn);
  if (Number.isNaN(expected)) throw ApplicationFailure.nonRetryable("expectedReturn is not a valid time");
  const nudgeDue = expected + input.bufferMs;
  const alertDue = nudgeDue + input.nudgeWaitMs;

  setHandler(homeSignal, () => {
    homeAt ??= Date.now();
  });
  setHandler(safetyStateQuery, () => ({
    stage: homeAt === null ? stage : "home",
    expectedReturn: input.expectedReturn,
    nudgeDue: iso(nudgeDue),
    alertDue: iso(alertDue),
    homeAt: homeAt === null ? null : iso(homeAt),
  }));

  const result: OutingSafetyResult = {
    outingId: input.outingId,
    outcome: "home",
    homeAt: null,
    nudgedAt: null,
    alertedAt: null,
    alertEmail: null,
  };
  const done = (outcome: SafetyOutcome): OutingSafetyResult => ({
    ...result,
    outcome,
    homeAt: homeAt === null ? null : iso(homeAt),
  });
  const isHome = () => homeAt !== null;

  if (await waitUntil(nudgeDue, isHome, "Wait for I'm home until the expected return plus the buffer")) {
    return done("home");
  }

  stage = "nudged";
  await acts.recordNudge({
    householdSlug: input.householdSlug,
    outingId: input.outingId,
    parentIds: input.parentIds,
    dueAt: iso(nudgeDue),
  });
  result.nudgedAt = iso(Date.now());
  // The alert is due a fixed time after the nudge was due, so a late nudge doesn't delay it.
  if (await waitUntil(alertDue, isHome, "Wait for I'm home after the nudge")) return done("home_after_nudge");

  stage = "alerted";
  try {
    const sent = await mail.sendSafetyAlert({
      householdSlug: input.householdSlug,
      outingId: input.outingId,
      parentIds: input.parentIds,
      expectedReturn: input.expectedReturn,
      nudgedAt: result.nudgedAt,
      dueAt: iso(alertDue),
    });
    result.alertEmail = sent.sent ? "sent" : "not_sent";
  } catch (e) {
    if (!(e instanceof ActivityFailure)) throw e;
    log.error("The safety alert could not be sent", { outingId: input.outingId });
    result.alertEmail = "not_sent";
  }
  result.alertedAt = iso(Date.now());

  const afterAlertMs = input.afterAlertMs ?? 12 * HOUR;
  if (afterAlertMs > 0 && (await waitUntil(Date.now() + afterAlertMs, isHome, "Wait for I'm home after the alert"))) {
    await mail.sendHomeNotice({
      householdSlug: input.householdSlug,
      outingId: input.outingId,
      parentIds: input.parentIds,
      homeAt: iso(homeAt!),
    });
    return done("home_after_alert");
  }
  return done("alerted");
}

const REMIND_BEFORE_MS = 14 * HOUR;

/** One email the evening before an approved outing. */
export async function outingReminder(input: {
  householdSlug: string;
  outingId: string;
  parentIds: string[];
  departAt: string;
  backAt: string;
  remindAt: number;
}): Promise<{ sent: boolean }> {
  if (input.remindAt > Date.now()) await sleep(input.remindAt - Date.now());
  const { remindAt: _remindAt, ...rest } = input;
  return { sent: (await acts.sendReminder(rest)).sent };
}

export async function trialRun(input: TrialRunInput): Promise<TrialRunResult> {
  let rode = false;
  setHandler(rodeSignal, () => {
    rode = true;
  });
  const attempts = input.maxAttempts ?? 2;
  let rideAt: string | null = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const ride = await acts.planFirstRide({
      householdSlug: input.householdSlug,
      outingId: input.outingId,
      now: iso(Date.now()),
    });
    if (!ride) return { outingId: input.outingId, outcome: "not_confirmed", rideAt, attempts: attempt - 1 };
    rideAt = ride.rideAt;
    await acts.recordTrialRun({
      householdSlug: input.householdSlug,
      outingId: input.outingId,
      status: "scheduled",
      rideAt,
      attempt,
    });
    const confirmBy = Date.parse(ride.backAt) + (input.confirmWindowMs ?? 12 * HOUR);
    if (await waitUntil(confirmBy, () => rode, "Wait for the first ride together to be confirmed")) {
      await acts.recordTrialRun({
        householdSlug: input.householdSlug,
        outingId: input.outingId,
        status: "solo_ready",
        rideAt,
        attempt,
      });
      return { outingId: input.outingId, outcome: "solo_ready", rideAt, attempts: attempt };
    }
    await acts.recordTrialRun({
      householdSlug: input.householdSlug,
      outingId: input.outingId,
      status: "not_confirmed",
      rideAt,
      attempt,
    });
  }
  return { outingId: input.outingId, outcome: "not_confirmed", rideAt, attempts };
}
