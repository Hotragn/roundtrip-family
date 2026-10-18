import { beforeEach, describe, expect, it, vi } from "vitest";

// The hosted safety timer, in memory (no MONGODB_URI), plus the atomic claim it sends MongoDB.
// Nothing here reaches the network: push and email are mocks.
vi.mock("server-only", () => ({}));
vi.mock("../lib/server/temporal", () => ({ temporalOn: () => Boolean(process.env.TEMPORAL_ADDRESS) }));

const BOARD = {
  household: {
    slug: "fremont-demo",
    timezone: "America/Los_Angeles",
    emergency: { number: "911", covers: "Police, fire and ambulance", source: "https://www.911.gov/" },
    secondaryEmergency: null,
  },
  parents: [
    { id: "p_sarala", firstName: "Sarala", role: "mother" },
    { id: "p_venkat", firstName: "Venkat", role: "father" },
  ],
  items: [
    {
      id: "temple",
      title: "Sri Venkateswara Temple",
      address: "1 Secret Street, Fremont",
      parentIds: ["p_sarala"],
      day: "mon",
      depart: 8 * 60 + 30,
      back: 10 * 60 + 10,
      withAdultChild: false,
      legs: [],
      travelMinutes: 25,
    },
  ],
  alternatives: {},
};
vi.mock("../lib/plan-board", () => ({ isHousehold: () => true, loadBoard: () => BOARD }));

const {
  buildTimer,
  claim,
  nextOccurrence,
  resetMemoryTimers,
  scheduleTimer,
  stopTimers,
  testSeconds,
  tick,
  timersFor,
} = await import("../lib/server/safety-timers");
const { alertPush, deliverAlert } = await import("../lib/server/safety-alert");
const { allowedEndpoint, pushToSession } = await import("../lib/server/push");

const NOW = new Date("2026-10-19T17:00:00Z");
const timer = (over: Partial<Parameters<typeof buildTimer>[0]> = {}) =>
  buildTimer({
    sessionId: "s1",
    board: BOARD as never,
    slotId: "temple",
    item: BOARD.items[0] as never,
    expectedBack: NOW,
    buffers: { bufferMinutes: 30, nudgeWaitMinutes: 15 },
    now: NOW,
    ...over,
  });
const at = (min: number) => new Date(NOW.getTime() + min * 60_000);

beforeEach(() => {
  delete process.env.MONGODB_URI;
  resetMemoryTimers();
});

describe("the hosted safety timer", () => {
  it("checks at expected back plus the buffer and alerts after the nudge wait", () => {
    const t = timer();
    expect(t.nudgeAt).toEqual(at(30));
    expect(t.alertAt).toEqual(at(45));
    expect(t.who).toEqual(["Sarala"]);
    expect(JSON.stringify(t)).not.toContain("Secret Street");
  });

  it("nudges, then alerts, each exactly once", async () => {
    await scheduleTimer(timer());
    const deliver = vi.fn(async () => {});
    expect(await tick(at(29), deliver)).toEqual({ alerts: 0, nudges: 0 });
    expect(await tick(at(31), deliver)).toEqual({ alerts: 0, nudges: 1 });
    expect(await tick(at(46), deliver)).toEqual({ alerts: 1, nudges: 0 });
    expect(await tick(at(60), deliver)).toEqual({ alerts: 0, nudges: 0 });
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it("fires once when two tickers run at the same moment", async () => {
    await scheduleTimer(timer());
    const deliver = vi.fn(async () => {});
    await Promise.all([tick(at(50), deliver), tick(at(50), deliver), tick(at(50), deliver)]);
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it("goes straight to the alert when the server slept through the nudge", async () => {
    await scheduleTimer(timer());
    const deliver = vi.fn(async () => {});
    expect(await tick(at(120), deliver)).toEqual({ alerts: 1, nudges: 0 });
  });

  it("stops on I'm home, by the slot's id or the phone's", async () => {
    await scheduleTimer(timer());
    await stopTimers("s1", "temple", "home", at(10));
    const deliver = vi.fn(async () => {});
    await tick(at(60), deliver);
    expect(deliver).not.toHaveBeenCalled();
    expect((await timersFor("s1", "fremont-demo"))[0]?.state).toBe("home");
  });

  it("belongs to one session: another visitor's I'm home doesn't stop it", async () => {
    await scheduleTimer(timer());
    await stopTimers("s2", "temple", "home");
    expect((await timersFor("s1", "fremont-demo"))[0]?.state).toBe("waiting");
  });

  it("isn't brought back by scheduling again once it fired", async () => {
    await scheduleTimer(timer());
    await tick(at(50), async () => {});
    await scheduleTimer(timer({ now: at(50), expectedBack: at(50) }));
    expect((await timersFor("s1", "fremont-demo"))[0]?.state).toBe("alerted");
  });

  it("finds the next real Monday at 10:10 in Fremont, across the end of summer time", () => {
    // Sunday 1 November 2026 at noon UTC; clocks went back that morning, so Monday 10:10 is UTC-8.
    expect(nextOccurrence("mon", 610, "America/Los_Angeles", new Date("2026-11-01T12:00:00Z")).toISOString()).toBe(
      "2026-11-02T18:10:00.000Z",
    );
    // Monday 19 October at 17:00 UTC is 10:00 there, so today still counts.
    expect(nextOccurrence("mon", 610, "America/Los_Angeles", NOW).toISOString()).toBe("2026-10-19T17:10:00.000Z");
  });

  it("allows the short test timer only with the test hooks on and never on Render", () => {
    expect(testSeconds(2)).toBeNull();
    process.env.SAFETY_TEST_HOOKS = "1";
    expect(testSeconds(2)).toBe(2);
    expect(testSeconds(600)).toBeNull();
    process.env.RENDER = "true";
    expect(testSeconds(2)).toBeNull();
    delete process.env.RENDER;
    delete process.env.SAFETY_TEST_HOOKS;
    expect(timer({ testSeconds: 2 }).alertAt).toEqual(new Date(NOW.getTime() + 4000));
  });
});

describe("the claim MongoDB gets", () => {
  it("is one findOneAndUpdate that only matches a timer still in the earlier stage", async () => {
    process.env.MONGODB_URI = "mongodb://fake";
    const calls: unknown[][] = [];
    const fake = {
      createIndex: async () => "",
      findOneAndUpdate: async (...a: unknown[]) => {
        calls.push(a);
        return null;
      },
    };
    vi.doMock("@roundtrip/agent/db", () => ({ getDb: async () => ({}), col: () => fake }));
    await claim("alert", NOW);
    await claim("nudge", NOW);
    expect(calls[0]?.[0]).toEqual({ state: { $in: ["waiting", "nudged"] }, alertAt: { $lte: NOW } });
    expect(calls[0]?.[1]).toEqual({ $set: { state: "alerted", alertedAt: NOW } });
    expect(calls[1]?.[0]).toEqual({ state: { $in: ["waiting"] }, nudgeAt: { $lte: NOW } });
    vi.doUnmock("@roundtrip/agent/db");
  });
});

describe("the alert", () => {
  it("pushes first name, outing and time only, and emails through the mailer", async () => {
    const t = { ...timer(), nudgedAt: at(30) };
    expect(alertPush(t, "America/Los_Angeles")).toEqual({
      title: "Sarala isn't home yet",
      body: "From Sri Venkateswara Temple, expected back by 10:00. Call to check on them.",
      url: "/plan/fremont-demo/their-week",
    });
    const send = vi.fn(async () => ({ sent: true as const, via: "file" as const, messageId: "m", threadId: "t" }));
    const push = vi.fn(async () => 1);
    expect(await deliverAlert(t, { mailer: { send }, push })).toEqual({ pushed: 1, email: "sent" });
    const mail = (send.mock.calls[0] as unknown as [{ subject: string; text: string; dataClass: string }])[0];
    expect(mail.subject).toBe("Sarala isn't home yet from Sri Venkateswara Temple");
    expect(mail.text).not.toContain("Secret Street");
    expect(mail.dataClass).toBe("synthetic");
  });

  it("sends no notification without the VAPID keys", async () => {
    const send = vi.fn();
    expect(await pushToSession("s1", { title: "", body: "", url: "/plan/x" }, send as never)).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("subscribes only endpoints of the listed browser push services", () => {
    expect(allowedEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(allowedEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(true);
    expect(allowedEndpoint("https://web.push.apple.com/abc")).toBe(true);
    expect(allowedEndpoint("https://wns2-by3p.notify.windows.com/w/?token=abc")).toBe(true);
    expect(allowedEndpoint("http://fcm.googleapis.com/fcm/send/abc")).toBe(false);
    expect(allowedEndpoint("https://169.254.169.254/latest")).toBe(false);
    expect(allowedEndpoint("https://evil.example.com/fcm.googleapis.com")).toBe(false);
  });
});
