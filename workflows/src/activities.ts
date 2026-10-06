import {
  type EmailOuting,
  type Face,
  homeNoticeEmail,
  type Mailer,
  names,
  planLabels,
  planningEmail,
  planReference,
  reminderEmail,
  type SendResult,
  type SummaryItem,
  safetyAlertEmail,
  type ThreadReply,
  threadReplyEmail,
  weeklySummaryEmail,
} from "@roundtrip/agent/email";
import type { DataClass } from "@roundtrip/core/privacy";
import type { PlannedWeek, Proposal, ProposalState, SafetyOutcome } from "./contract";
import {
  addDays,
  clock,
  DAYS,
  dayLabel,
  findChoice,
  loadSaved,
  localParts,
  nextAlternative,
  nextMonday,
  oneLineReason,
  proposalFor,
  type Saved,
  type SavedChoice,
  travelLine,
  weekKeyOf,
  weekLabel,
  zonedInstant,
} from "./demo-week";
import type { RecordStore } from "./records";

/**
 * The activities: everything the workflows do that touches files, email or the clock outside
 * the workflow. Built from their dependencies, so tests pass a mocked mailer and the durability
 * run a file sink. Workflow history gets ids, times and send results only; first names and
 * places are read here, from the saved demo data, when an email is written.
 * Docs: docs.temporal.io/develop/typescript/core-application (activities).
 */

export interface ActivityDeps {
  mailer: Mailer;
  records: RecordStore;
  /** The dashboard's base URL, for the button in emails; null leaves it out. */
  siteUrl: string | null;
  now?: () => Date;
  /** Repo root, for data/demo/. */
  root?: string;
}

export interface EmailOutcome {
  sent: boolean;
  reason: string | null;
}

export interface SummaryInput {
  outingId: string;
  date: string;
  withAdultChild: boolean;
  outcome: { outcome: SafetyOutcome; homeAt: string | null } | null;
  faces: Array<{ parentId: string; face: Face }>;
}

const HOUR = 60 * 60 * 1000;

export function createActivities(deps: ActivityDeps) {
  const now = deps.now ?? (() => new Date());
  const cache = new Map<string, Saved>();
  const saved = (slug: string): Saved => {
    let s = cache.get(slug);
    if (!s) {
      s = loadSaved(slug, deps.root);
      cache.set(slug, s);
    }
    return s;
  };
  const tz = (s: Saved) => s.week.household.timezone;
  // Demo households are synthetic; a real family's first names would be personal data, which
  // the privacy guard refuses for every hosted route.
  const dataClass = (s: Saved): DataClass => (s.week.provenance === "synthetic" ? "synthetic" : "personal");
  const firstNames = (s: Saved, ids: string[]) =>
    ids.map((id) => s.week.parents.find((p) => p.id === id)?.firstName).filter((x): x is string => Boolean(x));
  const dashboard = (slug: string) => (deps.siteUrl ? `${deps.siteUrl.replace(/\/+$/, "")}/plan/${slug}` : null);
  const choice = (s: Saved, outingId: string): SavedChoice => {
    const c = findChoice(s, outingId);
    if (!c) throw new Error(`Outing ${outingId} is not in the saved plan for ${s.slug}.`);
    return c;
  };
  /** "Monday 12 October, 07:30" for an instant, in the household's time zone. */
  const when = (s: Saved, iso: string) => {
    const l = localParts(new Date(iso), tz(s));
    return { day: dayLabel(l.date), time: clock(l.minutes) };
  };
  const outcome = async (kind: string, r: SendResult, ids: Record<string, unknown>): Promise<EmailOutcome> => {
    if (r.sent) return { sent: true, reason: null };
    await deps.records.add("email_not_sent", { email: kind, reason: r.reason, ...ids });
    return { sent: false, reason: r.reason };
  };
  const emailOuting = (s: Saved, p: ProposalState, update: boolean): EmailOuting => {
    const c = choice(s, p.outingId);
    return {
      n: p.n,
      dayLabel: dayLabel(p.date),
      leave: clock(c.depart),
      back: clock(c.back),
      place: c.place,
      who: firstNames(s, p.parentIds),
      travel: travelLine(c),
      reason: oneLineReason(c),
      withAdultChild: c.withAdultChild,
      firstRideTogether: c.firstRideTogether,
      state: !update ? undefined : p.status === "pending" ? (p.swappedFrom?.length ? "new" : "pending") : p.status,
    };
  };

  return {
    /** Replays the saved plan onto the week being planned: outings still ahead, in time order. */
    async planWeek(input: { householdSlug: string; weekStart?: string; now?: string }): Promise<PlannedWeek> {
      const s = saved(input.householdSlug);
      const at = input.now ? new Date(input.now) : now();
      const weekStart = input.weekStart ?? nextMonday(at, tz(s));
      const nowMs = at.getTime();
      const proposals: Proposal[] = s.week.outings
        .map((o) => proposalFor(choice(s, o.id), weekStart, tz(s)))
        .filter((p) => Date.parse(p.departAt) > nowMs)
        .sort((a, b) => a.departAt.localeCompare(b.departAt));
      const first = proposals[0] ? Date.parse(proposals[0].departAt) : nowMs + HOUR;
      return {
        householdSlug: s.slug,
        weekKey: weekKeyOf(weekStart),
        weekStart,
        safety: {
          bufferMinutes: s.household.safety.bufferMinutes,
          nudgeWaitMinutes: s.household.safety.nudgeWaitMinutes,
        },
        proposals,
        // An hour before the first outing leaves, and never sooner than an hour from now.
        replyBy: new Date(Math.max(first - HOUR, nowMs + HOUR)).toISOString(),
        summaryAt: zonedInstant(addDays(weekStart, 6), 18 * 60, tz(s)).toISOString(),
      };
    },

    /** The planner's next option in place of an outing, on the same week. */
    /** The alternative the dashboard picked for an outing, if it's one of the planner's options for it. */
    async chosenAlternative(input: {
      householdSlug: string;
      weekStart: string;
      forOutingId: string;
      outingId: string;
    }): Promise<Proposal | null> {
      const s = saved(input.householdSlug);
      if (!(s.plan.alternatives?.[input.forOutingId] ?? []).some((a) => a.id === input.outingId)) return null;
      const c = findChoice(s, input.outingId);
      return c ? proposalFor(c, input.weekStart, tz(s)) : null;
    },

    async swapOuting(input: {
      householdSlug: string;
      weekStart: string;
      forOutingId: string;
      exclude: string[];
    }): Promise<Proposal | null> {
      const s = saved(input.householdSlug);
      const next = nextAlternative(s, input.forOutingId, input.exclude);
      return next ? proposalFor(next, input.weekStart, tz(s)) : null;
    },

    async sendPlanningEmail(input: {
      householdSlug: string;
      weekStart: string;
      replyBy: string;
      proposals: ProposalState[];
      update: { waiting: number[]; noOtherOption: number[] } | null;
      inReplyTo?: string;
    }): Promise<EmailOutcome> {
      const s = saved(input.householdSlug);
      const weekKey = weekKeyOf(input.weekStart);
      const due = when(s, input.replyBy);
      const email = planningEmail({
        names: names(s.week.parents.map((p) => p.firstName)),
        weekLabel: weekLabel(input.weekStart),
        note: s.week.planNote,
        outings: input.proposals.map((p) => emailOuting(s, p, Boolean(input.update))),
        replyBy: `${due.day}, ${due.time}`,
        dashboardUrl: dashboard(s.slug),
        reference: planReference(s.slug, weekKey),
        synthetic: s.week.provenance === "synthetic",
        update: input.update ?? undefined,
      });
      const message = {
        kind: "planning" as const,
        text: email.text,
        html: email.html,
        labels: planLabels(s.slug, weekKey),
        dataClass: dataClass(s),
      };
      const r = input.inReplyTo
        ? await deps.mailer.reply(input.inReplyTo, message)
        : await deps.mailer.send({ ...message, subject: email.subject });
      return outcome("planning", r, { householdSlug: s.slug, weekKey });
    },

    /** A short answer in the planning thread: ask again, confirm, or say the week is set. */
    async replyInThread(input: {
      householdSlug: string;
      messageId: string;
      reply: ThreadReply;
    }): Promise<EmailOutcome> {
      const s = saved(input.householdSlug);
      const email = threadReplyEmail(input.reply, dashboard(s.slug));
      const r = await deps.mailer.reply(input.messageId, {
        kind: "reply",
        text: email.text,
        html: email.html,
        labels: ["roundtrip"],
        dataClass: dataClass(s),
      });
      return outcome("reply", r, { householdSlug: s.slug, reply: input.reply.kind });
    },

    async recordApprovals(input: {
      householdSlug: string;
      weekKey: string;
      approved: string[];
      skipped: string[];
      timedOut: boolean;
    }): Promise<void> {
      await deps.records.add("approval", input);
    },

    /** The phone's nudge: "Are you home?" after the expected return plus the buffer. */
    async recordNudge(input: {
      householdSlug: string;
      outingId: string;
      parentIds: string[];
      dueAt: string;
    }): Promise<{ at: string }> {
      return deps.records.add("nudge", input);
    },

    async sendSafetyAlert(input: {
      householdSlug: string;
      outingId: string;
      parentIds: string[];
      expectedReturn: string;
      nudgedAt: string | null;
      dueAt: string;
    }): Promise<EmailOutcome & { at: string }> {
      const s = saved(input.householdSlug);
      const c = choice(s, input.outingId);
      const { at } = await deps.records.add("alert", {
        householdSlug: s.slug,
        outingId: input.outingId,
        expectedReturn: input.expectedReturn,
        dueAt: input.dueAt,
      });
      const back = localParts(new Date(input.expectedReturn), tz(s));
      const who = firstNames(s, input.parentIds);
      const roles = input.parentIds.map((id) => s.week.parents.find((p) => p.id === id)?.role);
      const email = safetyAlertEmail({
        who,
        pronoun: roles.length === 1 ? (roles[0] === "father" ? "he" : "she") : "they",
        place: c.place,
        dayLabel: dayLabel(back.date),
        // The trip keeps its planned length, so the leaving time matches the expected return.
        leave: clock(Math.max(0, back.minutes - (c.back - c.depart))),
        back: clock(back.minutes),
        travel: travelLine(c) || "the planned way",
        nudgedAt: input.nudgedAt ? when(s, input.nudgedAt).time : when(s, input.dueAt).time,
        emergency: [s.week.household.emergency, s.week.household.secondaryEmergency].filter(
          (x): x is { number: string; covers: string } => Boolean(x),
        ),
        dashboardUrl: dashboard(s.slug),
        synthetic: s.week.provenance === "synthetic",
      });
      const r = await deps.mailer.send({
        kind: "alert",
        subject: email.subject,
        text: email.text,
        html: email.html,
        labels: ["roundtrip", "safety-alert"],
        dataClass: dataClass(s),
      });
      return { ...(await outcome("alert", r, { householdSlug: s.slug, outingId: input.outingId })), at };
    },

    /** The evening before an approved outing: who goes where tomorrow. */
    async sendReminder(input: {
      householdSlug: string;
      outingId: string;
      parentIds: string[];
      departAt: string;
      backAt: string;
    }): Promise<EmailOutcome> {
      const s = saved(input.householdSlug);
      const c = choice(s, input.outingId);
      const leave = when(s, input.departAt);
      const email = reminderEmail({
        who: firstNames(s, input.parentIds),
        place: c.place,
        dayLabel: dayLabel(localParts(new Date(input.departAt), tz(s)).date),
        leave: leave.time,
        back: when(s, input.backAt).time,
        synthetic: s.week.provenance === "synthetic",
      });
      const r = await deps.mailer.send({
        kind: "reminder",
        subject: email.subject,
        text: email.text,
        html: email.html,
        labels: ["roundtrip", "reminder"],
        dataClass: dataClass(s),
      });
      return outcome("reminder", r, { householdSlug: s.slug, outingId: input.outingId });
    },

    /** "Sarala is home", after an alert. */
    async sendHomeNotice(input: {
      householdSlug: string;
      outingId: string;
      parentIds: string[];
      homeAt: string;
    }): Promise<EmailOutcome> {
      const s = saved(input.householdSlug);
      const c = choice(s, input.outingId);
      await deps.records.add("home_after_alert", {
        householdSlug: s.slug,
        outingId: input.outingId,
        homeAt: input.homeAt,
      });
      const email = homeNoticeEmail({
        who: firstNames(s, input.parentIds),
        place: c.place,
        homeAt: when(s, input.homeAt).time,
        synthetic: s.week.provenance === "synthetic",
      });
      const r = await deps.mailer.send({
        kind: "home",
        subject: email.subject,
        text: email.text,
        html: email.html,
        labels: ["roundtrip", "safety-alert"],
        dataClass: dataClass(s),
      });
      return outcome("home", r, { householdSlug: s.slug, outingId: input.outingId });
    },

    /**
     * The first ride together: the household's next weekend day (trialRunDays) at least an hour
     * away, at the outing's own time when that's between 09:00 and 16:00, otherwise 10:00, for
     * the length of the planned trip. Null when the household has no weekend days for it.
     */
    async planFirstRide(input: {
      householdSlug: string;
      outingId: string;
      now?: string;
    }): Promise<{ rideAt: string; backAt: string; date: string } | null> {
      const s = saved(input.householdSlug);
      const c = choice(s, input.outingId);
      const depart = c.depart >= 9 * 60 && c.depart <= 16 * 60 ? c.depart : 10 * 60;
      const length = Math.max(30, c.back - c.depart);
      const at = input.now ? new Date(input.now) : now();
      const today = localParts(at, tz(s)).date;
      for (let i = 0; i < 14; i++) {
        const date = addDays(today, i);
        const day = DAYS[(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7]!;
        if (!s.household.trialRunDays.includes(day as "sat" | "sun")) continue;
        const rideAt = zonedInstant(date, depart, tz(s));
        if (rideAt.getTime() < at.getTime() + HOUR) continue;
        return { rideAt: rideAt.toISOString(), backAt: zonedInstant(date, depart + length, tz(s)).toISOString(), date };
      }
      return null;
    },

    async recordTrialRun(input: {
      householdSlug: string;
      outingId: string;
      status: "scheduled" | "solo_ready" | "not_confirmed";
      rideAt: string | null;
      attempt: number;
    }): Promise<void> {
      await deps.records.add("trial_run", input);
    },

    /** Sunday evening: what they went to and the faces they picked. */
    async sendWeeklySummary(input: {
      householdSlug: string;
      weekStart: string;
      items: SummaryInput[];
    }): Promise<EmailOutcome> {
      const s = saved(input.householdSlug);
      const items: SummaryItem[] = input.items.map((i) => {
        const c = choice(s, i.outingId);
        return {
          dayLabel: dayLabel(i.date),
          place: c.place,
          who: firstNames(s, c.parentIds),
          outcome: i.withAdultChild ? "with_you" : (i.outcome?.outcome ?? "no_check_in"),
          homeAt: i.outcome?.homeAt ? when(s, i.outcome.homeAt).time : undefined,
          faces: i.faces.flatMap((f) => {
            const who = firstNames(s, [f.parentId])[0];
            return who ? [{ who, face: f.face }] : [];
          }),
        };
      });
      const email = weeklySummaryEmail({
        names: names(s.week.parents.map((p) => p.firstName)),
        weekLabel: weekLabel(input.weekStart),
        items,
        dashboardUrl: dashboard(s.slug),
        synthetic: s.week.provenance === "synthetic",
      });
      await deps.records.add("summary", {
        householdSlug: s.slug,
        weekKey: weekKeyOf(input.weekStart),
        outings: items.length,
      });
      const r = await deps.mailer.send({
        kind: "summary",
        subject: email.subject,
        text: email.text,
        html: email.html,
        labels: ["roundtrip", "weekly-summary"],
        dataClass: dataClass(s),
      });
      return outcome("summary", r, { householdSlug: s.slug });
    },
  };
}

export type Activities = ReturnType<typeof createActivities>;
