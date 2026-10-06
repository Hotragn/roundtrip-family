/**
 * Names shared by the email layer, the web app and the Temporal workflows in workflows/. This
 * file has no imports, so every side can use it; workflows/test checks that the workflow
 * definitions use the same signal names.
 */

export const WORKFLOW = {
  /**
   * One weekPlan per household. Each week is a new run of the same workflow id (continue-as-new
   * every Sunday evening), so the dashboard and email replies always reach the current week.
   */
  weekPlan: (householdSlug: string) => `week-plan-${householdSlug}`,
  /** One safety timer per outing; the phone's "I'm home" check-in signals it by outing id. */
  outingSafety: (outingId: string) => `outing-safety-${outingId}`,
  /** The first ride together on a new route. */
  trialRun: (outingId: string) => `trial-run-${outingId}`,
};

export const SIGNAL = {
  /** The dashboard's approve, skip and swap. */
  approve: "approve",
  /** A reply to the planning email, already parsed. */
  emailReply: "emailReply",
  /** The face a parent picked for "How was it?". */
  howWasIt: "howWasIt",
  /** "I'm home" from the phone. */
  home: "home",
  /** The adult child confirms the first ride together happened. */
  rode: "rode",
} as const;

export const TASK_QUEUE = "roundtrip";

const PLAN_PREFIX = "week-plan-";

/** Labels on every planning email, so a reply finds its week again. */
export function planLabels(householdSlug: string, weekKey: string): string[] {
  return ["roundtrip", WORKFLOW.weekPlan(householdSlug), `week-${weekKey.toLowerCase()}`];
}

/** The weekPlan workflow and the week a set of labels points to. */
export function planFromLabels(labels: string[]): { workflowId: string; weekKey: string | null } | null {
  const workflowId = labels.find((l) => l.startsWith(PLAN_PREFIX) && /^[a-z0-9-]+$/.test(l));
  if (!workflowId) return null;
  const week = labels.map((l) => /^week-(\d{4})-w(\d{2})$/i.exec(l)).find(Boolean);
  return { workflowId, weekKey: week ? `${week[1]}-W${week[2]}` : null };
}

/** The reference line at the foot of each planning email, a fallback when labels are missing. */
export function planReference(householdSlug: string, weekKey: string): string {
  return `Roundtrip reference: ${WORKFLOW.weekPlan(householdSlug)}, week ${weekKey}`;
}

export function planFromReference(text: string): { workflowId: string; weekKey: string | null } | null {
  const m = /Roundtrip reference: (week-plan-[a-z0-9-]+)(?:, week (\d{4}-W\d{2}))?/.exec(text);
  return m ? { workflowId: m[1]!, weekKey: m[2] ?? null } : null;
}
