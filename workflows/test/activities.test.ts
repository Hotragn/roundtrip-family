import { emailPrivacyProblems } from "@roundtrip/agent/email";
import { describe, expect, it } from "vitest";
import { createActivities } from "../src/activities";
import type { ProposalState } from "../src/contract";
import { dayLabel, nextMonday, weekLabel, zonedInstant } from "../src/demo-week";
import { memoryMailer, memoryRecords } from "./helpers";

/**
 * The activities against the saved demo plans (synthetic families, places from live searches),
 * with a mailer that keeps emails in memory. No Temporal needed.
 */

// Sunday 11 October 2026, 18:00 in Fremont: the weekly plan's start time.
const SUNDAY_EVENING = new Date("2026-10-12T01:00:00.000Z");

function setup(now = SUNDAY_EVENING) {
  const mail = memoryMailer();
  const rec = memoryRecords();
  const acts = createActivities({
    mailer: mail.mailer,
    records: rec.records,
    siteUrl: "https://roundtrip-web.onrender.com",
    now: () => now,
  });
  return { acts, mail, rec };
}

const numbered = (ps: Awaited<ReturnType<ReturnType<typeof setup>["acts"]["planWeek"]>>["proposals"]) =>
  ps.map((p, i): ProposalState => ({ ...p, n: i + 1, status: "pending" }));

describe("dates and times", () => {
  it("places local times correctly on both sides of a daylight saving change", () => {
    // Los Angeles: PDT (UTC-7) until 1 November 2026, then PST (UTC-8).
    expect(zonedInstant("2026-10-12", 8 * 60 + 30, "America/Los_Angeles").toISOString()).toBe(
      "2026-10-12T15:30:00.000Z",
    );
    expect(zonedInstant("2026-11-02", 8 * 60 + 30, "America/Los_Angeles").toISOString()).toBe(
      "2026-11-02T16:30:00.000Z",
    );
    // Munich: CEST (UTC+2) until 25 October 2026, then CET (UTC+1).
    expect(zonedInstant("2026-10-13", 9 * 60 + 45, "Europe/Berlin").toISOString()).toBe("2026-10-13T07:45:00.000Z");
    expect(zonedInstant("2026-10-27", 9 * 60 + 45, "Europe/Berlin").toISOString()).toBe("2026-10-27T08:45:00.000Z");
  });

  it("plans the coming week from Sunday evening", () => {
    expect(nextMonday(SUNDAY_EVENING, "America/Los_Angeles")).toBe("2026-10-12");
    expect(nextMonday(new Date("2026-10-07T12:00:00Z"), "Europe/Berlin")).toBe("2026-10-12");
    expect(weekLabel("2026-10-12")).toBe("12 to 18 October 2026");
    expect(weekLabel("2026-09-28")).toBe("28 September to 4 October 2026");
    expect(dayLabel("2026-10-12")).toBe("Monday 12 October");
  });
});

describe("planWeek", () => {
  it("replays the saved Fremont plan onto the coming week, in time order, as ids and times only", async () => {
    const { acts } = setup();
    const plan = await acts.planWeek({ householdSlug: "fremont-demo" });
    expect(plan.weekKey).toBe("2026-W42");
    expect(plan.weekStart).toBe("2026-10-12");
    expect(plan.safety).toEqual({ bufferMinutes: 45, nudgeWaitMinutes: 20 });
    expect(plan.proposals.map((p) => [p.day, p.departAt])).toEqual([
      ["mon", "2026-10-12T15:30:00.000Z"],
      ["mon", "2026-10-12T16:00:00.000Z"],
      ["wed", "2026-10-14T15:30:00.000Z"],
      ["sun", "2026-10-18T17:00:00.000Z"],
    ]);
    // An hour before the first outing leaves, and the summary on Sunday at 18:00 local.
    expect(plan.replyBy).toBe("2026-10-12T14:30:00.000Z");
    expect(plan.summaryAt).toBe("2026-10-19T01:00:00.000Z");
    const first = plan.proposals[0]!;
    expect(first).toMatchObject({
      outingId: "hh_fremont:2026-W41:pl_d1f88c93",
      parentIds: ["p_sarala"],
      backAt: "2026-10-12T17:10:00.000Z",
      withAdultChild: false,
      firstRideTogether: true,
      safetyWorkflowId: "outing-safety-hh_fremont:2026-W41:pl_d1f88c93",
    });
    // What goes into workflow history has no names, places or addresses.
    expect(JSON.stringify(plan)).not.toMatch(/Sarala|Venkat|Temple|Market|Ave|Blvd|Way\b/);
  });

  it("leaves out outings whose time has already passed", async () => {
    const { acts } = setup(new Date("2026-10-12T15:45:00.000Z")); // Monday 08:45 in Fremont
    const plan = await acts.planWeek({ householdSlug: "fremont-demo", weekStart: "2026-10-12" });
    expect(plan.proposals.map((p) => p.day)).toEqual(["mon", "wed", "sun"]);
  });

  it("swaps in the planner's next option, never one already used", async () => {
    const { acts } = setup();
    const plan = await acts.planWeek({ householdSlug: "fremont-demo" });
    const temple = plan.proposals[0]!.outingId;
    const first = await acts.swapOuting({
      householdSlug: "fremont-demo",
      weekStart: plan.weekStart,
      forOutingId: temple,
      exclude: [temple],
    });
    expect(first?.outingId).toBe("hh_fremont:2026-W41:pl_d0e8e84e:mother");
    expect(first?.date).toBe("2026-10-16");
    const second = await acts.swapOuting({
      householdSlug: "fremont-demo",
      weekStart: plan.weekStart,
      forOutingId: temple,
      exclude: [temple, first!.outingId],
    });
    expect(second?.outingId).not.toBe(first?.outingId);
    expect(
      await acts.swapOuting({
        householdSlug: "fremont-demo",
        weekStart: plan.weekStart,
        forOutingId: "nope",
        exclude: [],
      }),
    ).toBeNull();
  });
});

describe("the emails the activities write", () => {
  it("the reminder the evening before: who, where, when; no address", async () => {
    const { acts, mail } = setup();
    const temple = (await acts.planWeek({ householdSlug: "fremont-demo" })).proposals[0]!;
    const r = await acts.sendReminder({
      householdSlug: "fremont-demo",
      outingId: temple.outingId,
      parentIds: temple.parentIds,
      departAt: temple.departAt,
      backAt: temple.backAt,
    });
    expect(r).toEqual({ sent: true, reason: null });
    const [email] = mail.of("reminder");
    expect(email!.subject).toBe("Tomorrow: Sarala to Karya Siddhi Hanuman Temple");
    expect(email!.text).toContain("Monday 12 October: leaving at 08:30, back by 10:10");
    expect(email!.text).not.toMatch(/Fremont Blvd|Mowry/);
  });

  it("the planning email: first names, day, time, place, how they get there and why; no address", async () => {
    const { acts, mail } = setup();
    const plan = await acts.planWeek({ householdSlug: "fremont-demo" });
    const r = await acts.sendPlanningEmail({
      householdSlug: "fremont-demo",
      weekStart: plan.weekStart,
      replyBy: plan.replyBy,
      proposals: numbered(plan.proposals),
      update: null,
    });
    expect(r).toEqual({ sent: true, reason: null });
    const [email] = mail.of("planning");
    expect(email!.subject).toBe("Outings for Sarala and Venkat, 12 to 18 October 2026: reply to approve");
    expect(email!.labels).toEqual(["roundtrip", "week-plan-fremont-demo", "week-2026-w42"]);
    expect(email!.dataClass).toBe("synthetic");
    for (const s of [
      "1. Monday 12 October, 08:30 to 10:10: Sarala",
      "Karya Siddhi Hanuman Temple",
      "By Bus 211, about 20 minutes each way",
      "She gave her last 5 temple visits 5 of 5.",
      "2. Monday 12 October, 09:00 to 10:18: Venkat",
      "A 14-minute walk",
      "4. Sunday 18 October, 10:00 to 11:42: Sarala and Venkat",
      "Reply by Monday 12 October, 07:30",
      "https://roundtrip-web.onrender.com/plan/fremont-demo",
      "Roundtrip reference: week-plan-fremont-demo, week 2026-W42",
    ]) {
      expect(email!.text).toContain(s);
    }
    expect(emailPrivacyProblems(`${email!.subject}\n${email!.text}\n${email!.html}`)).toEqual([]);
    expect(email!.text).not.toContain("Fremont Blvd");
    expect(email!.text).not.toContain("555");
  });

  it("the safety alert names the outing and the parent by first name, with the official emergency number", async () => {
    const { acts, mail, rec } = setup();
    const r = await acts.sendSafetyAlert({
      householdSlug: "fremont-demo",
      outingId: "hh_fremont:2026-W41:pl_d1f88c93",
      parentIds: ["p_sarala"],
      expectedReturn: "2026-10-12T17:10:00.000Z",
      nudgedAt: "2026-10-12T17:55:00.000Z",
      dueAt: "2026-10-12T18:15:00.000Z",
    });
    expect(r.sent).toBe(true);
    expect(rec.of("alert")).toHaveLength(1);
    const [email] = mail.of("alert");
    expect(email!.subject).toBe("Sarala isn't home yet from Karya Siddhi Hanuman Temple");
    expect(email!.text).toContain("She went to Karya Siddhi Hanuman Temple on Monday 12 October, leaving at 08:30");
    expect(email!.text).toContain("expected home by 10:10");
    expect(email!.text).toContain("reminder at 10:55");
    expect(email!.text).toContain("call 911");
    expect(emailPrivacyProblems(`${email!.subject}\n${email!.text}\n${email!.html}`)).toEqual([]);
  });

  it("the Munich alert gives both official numbers", async () => {
    const { acts, mail } = setup();
    await acts.sendSafetyAlert({
      householdSlug: "munich-demo",
      outingId: "hh_munich:2026-W41:pl_3cb5763e",
      parentIds: ["p_kamala"],
      expectedReturn: "2026-10-13T09:34:00.000Z",
      nudgedAt: null,
      dueAt: "2026-10-13T10:39:00.000Z",
    });
    const [email] = mail.of("alert");
    expect(email!.text).toContain("Kamala hasn't tapped");
    expect(email!.text).toContain("call 112");
    expect(email!.text).toContain("call 110");
  });

  it("the weekly summary: what they went to, and the faces they picked", async () => {
    const { acts, mail } = setup();
    await acts.sendWeeklySummary({
      householdSlug: "fremont-demo",
      weekStart: "2026-10-12",
      items: [
        {
          outingId: "hh_fremont:2026-W41:pl_d1f88c93",
          date: "2026-10-12",
          withAdultChild: false,
          outcome: { outcome: "home", homeAt: "2026-10-12T17:02:00.000Z" },
          faces: [{ parentId: "p_sarala", face: "good" }],
        },
        {
          outingId: "hh_fremont:2026-W41:pl_366cab34",
          date: "2026-10-12",
          withAdultChild: false,
          outcome: null,
          faces: [],
        },
        {
          outingId: "hh_fremont:2026-W41:pl_d98ae06a",
          date: "2026-10-18",
          withAdultChild: true,
          outcome: null,
          faces: [{ parentId: "p_venkat", face: "okay" }],
        },
      ],
    });
    const [email] = mail.of("summary");
    expect(email!.subject).toBe("Sarala and Venkat's week, 12 to 18 October 2026");
    expect(email!.text).toContain(
      'Monday 12 October: Karya Siddhi Hanuman Temple, Sarala\n   Home at 10:02. Sarala picked "good".',
    );
    expect(email!.text).toContain("Monday 12 October: Indian Market, Venkat\n   No check-in arrived.");
    expect(email!.text).toContain('With you. Venkat picked "okay".');
    expect(emailPrivacyProblems(`${email!.subject}\n${email!.text}\n${email!.html}`)).toEqual([]);
  });

  it("an email that can't go out is recorded, without its content", async () => {
    const rec = memoryRecords();
    const acts = createActivities({
      mailer: {
        send: async () => ({ sent: false, reason: "invalid_recipient" }),
        reply: async () => ({ sent: false, reason: "invalid_recipient" }),
        thread: async () => null,
      },
      records: rec.records,
      siteUrl: null,
      now: () => SUNDAY_EVENING,
    });
    const r = await acts.replyInThread({ householdSlug: "fremont-demo", messageId: "m1", reply: { kind: "old_week" } });
    expect(r).toEqual({ sent: false, reason: "invalid_recipient" });
    expect(rec.of("email_not_sent")).toEqual([
      expect.objectContaining({
        kind: "email_not_sent",
        email: "reply",
        reason: "invalid_recipient",
        reply: "old_week",
      }),
    ]);
  });
});

describe("planFirstRide", () => {
  it("books the next weekend day at the outing's time when it's a daytime trip", async () => {
    const { acts } = setup(new Date("2026-10-12T16:00:00.000Z")); // Monday 09:00 in Fremont
    const ride = await acts.planFirstRide({
      householdSlug: "fremont-demo",
      outingId: "hh_fremont:2026-W41:pl_d1f88c93",
    });
    // The temple trip leaves at 08:30, before 09:00, so the ride is at 10:00 on Saturday.
    expect(ride).toEqual({
      rideAt: "2026-10-17T17:00:00.000Z",
      backAt: "2026-10-17T18:40:00.000Z",
      date: "2026-10-17",
    });
  });
});
