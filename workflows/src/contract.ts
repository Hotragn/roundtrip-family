import type { EmailReplySignal, Face } from "@roundtrip/agent/email";
import { defineQuery, defineSignal } from "@temporalio/workflow";

/**
 * What the three workflows take, return and listen for. Workflow code imports only this file
 * and decisions.ts, so the bundle stays deterministic. Signal names match SIGNAL in
 * @roundtrip/agent/email (checked in test/contract.test.ts), which the web app and the email
 * listener use over Temporal's HTTP API.
 * Docs: docs.temporal.io/develop/typescript/message-passing
 */

/** One outing the week's plan proposes. Ids and times only: names and places stay in the activities. */
export interface Proposal {
  outingId: string;
  parentIds: string[];
  /** "mon" to "sun" */
  day: string;
  /** YYYY-MM-DD in the household's time zone. */
  date: string;
  /** ISO instants. */
  departAt: string;
  backAt: string;
  withAdultChild: boolean;
  firstRideTogether: boolean;
  safetyWorkflowId: string;
  trialRunWorkflowId: string;
}

export type ProposalStatus = "pending" | "approved" | "skipped";

export interface ProposalState extends Proposal {
  /** The number the planning email shows; a swapped outing keeps its number. */
  n: number;
  status: ProposalStatus;
  /** Outing ids this one replaced, oldest first. */
  swappedFrom?: string[];
}

export interface PlannedWeek {
  householdSlug: string;
  /** ISO week being planned, e.g. "2026-W42". */
  weekKey: string;
  /** Monday of that week, YYYY-MM-DD. */
  weekStart: string;
  safety: { bufferMinutes: number; nudgeWaitMinutes: number };
  proposals: Proposal[];
  /** When the answer is due, before the first outing leaves. ISO. */
  replyBy: string;
  /** Sunday 18:00 at the end of the week: the summary goes out and the next week is planned. ISO. */
  summaryAt: string;
}

export interface WeekPlanInput {
  householdSlug: string;
  /** Monday of the week to plan. Default: the next Monday in the household's time zone. */
  weekStart?: string;
  /** Overrides the approval deadline, in milliseconds from the start of the run (tests, demos). */
  approvalTimeoutMs?: number;
  /** Overrides the Sunday summary time, in milliseconds from the start of the run. */
  summaryAfterMs?: number;
  /** Plan this one week and stop, instead of continuing as new every Sunday. */
  once?: boolean;
}

export type SafetyOutcome = "home" | "home_after_nudge" | "home_after_alert" | "alerted";

export interface WeekPlanResult {
  weekKey: string;
  approved: string[];
  skipped: string[];
  /** No answer came before the deadline. */
  timedOut: boolean;
  /** Safety timers started, by workflow id. */
  safety: string[];
  /** Approved outings whose time had already passed, so no timer was started. */
  missed: string[];
  trialRuns: string[];
  /** Safety timers that finished before the summary, by outing id. */
  outcomes: Record<string, { outcome: SafetyOutcome; homeAt: string | null }>;
}

/** The dashboard's answer. Refs are proposal numbers or outing ids. */
export interface ApproveSignal {
  weekKey?: string;
  approve: "all" | Array<number | string>;
  skip?: "all" | Array<number | string>;
  swap?: Array<number | string>;
  /** The dashboard's swaps: an outing id and the planner's alternative chosen in its place. */
  swapTo?: Record<string, string>;
}

export interface HowWasItSignal {
  outingId: string;
  parentId: string;
  face: Face;
}

export interface WeekState {
  weekKey: string;
  decided: boolean;
  proposals: ProposalState[];
}

export interface OutingSafetyInput {
  householdSlug: string;
  outingId: string;
  parentIds: string[];
  /** ISO instant they're expected home. */
  expectedReturn: string;
  /** The household's bufferMinutes and nudgeWaitMinutes, in milliseconds (seconds in the durability run). */
  bufferMs: number;
  nudgeWaitMs: number;
  /** After an alert, how long to keep listening for "I'm home" (default 12 hours; 0 to stop). */
  afterAlertMs?: number;
}

export interface OutingSafetyResult {
  outingId: string;
  outcome: SafetyOutcome;
  homeAt: string | null;
  nudgedAt: string | null;
  alertedAt: string | null;
  /** Whether the alert email went out, when one was due. */
  alertEmail: "sent" | "not_sent" | null;
}

export interface HomeSignal {
  parentId?: string;
  /** When the phone recorded it. */
  at?: string;
}

export type SafetyStage = "waiting" | "nudged" | "alerted" | "home";

export interface SafetyState {
  stage: SafetyStage;
  expectedReturn: string;
  nudgeDue: string;
  alertDue: string;
  homeAt: string | null;
}

export interface TrialRunInput {
  householdSlug: string;
  outingId: string;
  /** Weekends to offer before giving up (default 2). */
  maxAttempts?: number;
  /** How long after the ride the confirmation may come (default 12 hours). */
  confirmWindowMs?: number;
}

export interface TrialRunResult {
  outingId: string;
  outcome: "solo_ready" | "not_confirmed";
  rideAt: string | null;
  attempts: number;
}

export interface RodeSignal {
  source: "dashboard" | "email";
}

export const approveSignal = defineSignal<[ApproveSignal]>("approve");
export const emailReplySignal = defineSignal<[EmailReplySignal]>("emailReply");
export const howWasItSignal = defineSignal<[HowWasItSignal]>("howWasIt");
export const homeSignal = defineSignal<[HomeSignal]>("home");
export const rodeSignal = defineSignal<[RodeSignal]>("rode");
export const weekStateQuery = defineQuery<WeekState>("weekState");
export const safetyStateQuery = defineQuery<SafetyState>("safetyState");
