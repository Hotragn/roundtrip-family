import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrivacyViolation } from "@roundtrip/core/privacy";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  agentMail,
  demoAlertAddress,
  type EmailOuting,
  emailPrivacyProblems,
  listenForReplies,
  MONTHLY_CAP,
  planFromLabels,
  planLabels,
  planningEmail,
  planReference,
  readInboundReply,
  safetyAlertEmail,
  senderAddress,
  signalWorkflow,
  signWebhook,
  temporalHttpUrl,
  threadReplyEmail,
  validAddress,
  verifyWebhook,
  WORKFLOW,
  weeklySummaryEmail,
} from "../src/email";

/**
 * The email layer against a mocked AgentMail (no real email is ever sent from tests): only
 * DEMO_ALERT_EMAIL ever receives mail, an invalid DEMO_ALERT_EMAIL sends nothing, and emails
 * carry first names and outing details only. Households and outings are synthetic.
 */

const ALERT = "adult.child@example.com";
const KEY = "test-key-not-real";

type Call = { url: string; method: string; body: Record<string, unknown> | null; auth: string | null };

function mockAgentMail(opts: { inboxes?: Array<Record<string, string>>; status?: number[] } = {}) {
  const calls: Call[] = [];
  const statuses = [...(opts.status ?? [])];
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    const headers = new Headers(init?.headers);
    calls.push({ url, method: init?.method ?? "GET", body, auth: headers.get("authorization") });
    const status = statuses.shift() ?? 200;
    if (status !== 200) return new Response("slow down", { status, headers: { "retry-after": "0" } });
    if (url.endsWith("/inboxes?limit=50")) return Response.json({ count: 1, inboxes: opts.inboxes ?? [] });
    if (url.endsWith("/inboxes")) return Response.json({ inbox_id: "inbox-new" });
    if (url.includes("/threads/"))
      return Response.json({ labels: [], messages: [{ labels: planLabels("fremont-demo", "2026-W42") }] });
    return Response.json({ message_id: "msg-1", thread_id: "thread-1" });
  });
  vi.stubGlobal("fetch", fetch);
  return { calls, fetch };
}

const tmpDirs: string[] = [];
function tmpLedger(): string {
  const dir = mkdtempSync(join(tmpdir(), "rt-email-"));
  tmpDirs.push(dir);
  return join(dir, "agentmail.jsonl");
}
afterAll(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});

const env = (over: Record<string, string | undefined> = {}) =>
  ({ DEMO_ALERT_EMAIL: ALERT, AGENTMAIL_API_KEY: KEY, ...over }) as NodeJS.ProcessEnv;

const outings: EmailOuting[] = [
  {
    n: 1,
    dayLabel: "Monday 12 October",
    leave: "08:30",
    back: "10:10",
    place: "Karya Siddhi Hanuman Temple",
    who: ["Sarala"],
    travel: "By Bus 211, about 20 minutes each way",
    reason: "She gave her last 5 temple visits 5 of 5.",
    withAdultChild: false,
    firstRideTogether: true,
  },
  {
    n: 2,
    dayLabel: "Sunday 18 October",
    leave: "10:00",
    back: "11:42",
    place: "Irvington Farmers' Market",
    who: ["Sarala", "Venkat"],
    travel: "With you on Sunday, about 21 minutes away",
    reason: "No language needed.",
    withAdultChild: true,
    firstRideTogether: false,
  },
];

const planning = () =>
  planningEmail({
    names: "Sarala and Venkat",
    weekLabel: "12 to 18 October 2026",
    note: "No Telugu events or groups were found nearby this week.",
    outings,
    replyBy: "Monday 12 October, 07:30",
    dashboardUrl: "https://roundtrip-web.onrender.com/plan/fremont-demo",
    reference: planReference("fremont-demo", "2026-W42"),
    synthetic: true,
  });

const message = (text: string) => ({
  kind: "planning" as const,
  subject: "Outings",
  text,
  html: `<p>${text}</p>`,
  dataClass: "synthetic" as const,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DEMO_ALERT_EMAIL is checked strictly", () => {
  it.each(["you@example.com", "a.b+tag@mail.example.org", "  you@example.com  "])("accepts %j", (v) => {
    expect(validAddress(v)).toBe(v.trim());
  });

  it.each([
    "",
    "not an address",
    "you@localhost",
    "you@example.c",
    "Name <you@example.com>",
    "you@example.com, other@example.com",
    "you@example.com\nBcc: other@example.com",
    "you@@example.com",
    "you@example..com",
    ".you@example.com",
    "you@-example.com",
    "you@example.123",
  ])("rejects %j", (v) => {
    expect(validAddress(v)).toBeNull();
  });

  it("reads DEMO_ALERT_EMAIL from the environment", () => {
    expect(demoAlertAddress(env())).toBe(ALERT);
    expect(demoAlertAddress(env({ DEMO_ALERT_EMAIL: "the builder" }))).toBeNull();
    expect(demoAlertAddress(env({ DEMO_ALERT_EMAIL: undefined }))).toBeNull();
  });
});

describe("sending", () => {
  it("sends nothing and logs it when DEMO_ALERT_EMAIL is invalid", async () => {
    const { fetch } = mockAgentMail();
    const lines: string[] = [];
    const mailer = agentMail({
      env: env({ DEMO_ALERT_EMAIL: "not-an-address" }),
      log: (l) => lines.push(l),
      ledger: tmpLedger(),
    });
    const e = planning();
    expect(await mailer.send({ kind: "planning", ...e, dataClass: "synthetic" })).toEqual({
      sent: false,
      reason: "invalid_recipient",
    });
    expect(
      await mailer.reply("msg-0", { kind: "reply", text: "Approved 1.", html: "", dataClass: "synthetic" }),
    ).toEqual({ sent: false, reason: "invalid_recipient" });
    expect(fetch).not.toHaveBeenCalled();
    expect(lines.join("\n")).toContain("DEMO_ALERT_EMAIL is not a valid address");
    expect(lines.join("\n")).not.toContain("not-an-address");
  });

  it("sends only to DEMO_ALERT_EMAIL, from the one Roundtrip inbox", async () => {
    const { calls } = mockAgentMail({ inboxes: [{ inbox_id: "inbox-rt", client_id: "roundtrip-family" }] });
    const ledger = tmpLedger();
    const mailer = agentMail({ env: env(), log: () => {}, ledger });
    const e = planning();
    const r = await mailer.send({
      kind: "planning",
      ...e,
      labels: planLabels("fremont-demo", "2026-W42"),
      dataClass: "synthetic",
    });
    expect(r).toEqual({ sent: true, via: "agentmail", messageId: "msg-1", threadId: "thread-1" });
    const send = calls.find((c) => c.url.endsWith("/messages/send"))!;
    expect(send.url).toBe("https://api.agentmail.to/v0/inboxes/inbox-rt/messages/send");
    expect(send.auth).toBe(`Bearer ${KEY}`);
    expect(send.body?.to).toBe(ALERT);
    expect(Object.keys(send.body ?? {}).sort()).toEqual(["html", "labels", "subject", "text", "to"]);
    // No inbox was created: the existing one was found by its client id.
    expect(calls.filter((c) => c.method === "POST" && c.url.endsWith("/inboxes"))).toHaveLength(0);
    // The usage log counts the send without the address or the content.
    const logged = readFileSync(ledger, "utf8");
    expect(logged).toContain('"service":"agentmail"');
    expect(logged).not.toContain(ALERT);
    expect(logged).not.toContain("Sarala");
  });

  it("creates the inbox once when none exists, then reuses it", async () => {
    const { calls } = mockAgentMail();
    const mailer = agentMail({ env: env(), log: () => {}, ledger: tmpLedger() });
    await mailer.send(message("Approved 1."));
    await mailer.send(message("Approved 2."));
    const created = calls.filter((c) => c.method === "POST" && c.url.endsWith("/inboxes"));
    expect(created).toHaveLength(1);
    expect(created[0]!.body).toEqual({ client_id: "roundtrip-family", display_name: "Roundtrip" });
    expect(calls.filter((c) => c.url.endsWith("/messages/send"))).toHaveLength(2);
  });

  it("replies in the thread, addressed to DEMO_ALERT_EMAIL only", async () => {
    const { calls } = mockAgentMail({ inboxes: [{ inbox_id: "inbox-rt", display_name: "Roundtrip" }] });
    const mailer = agentMail({ env: env(), log: () => {}, ledger: tmpLedger() });
    const body = threadReplyEmail({ kind: "confirmed", approved: [1, 3], skipped: [2] }, null);
    await mailer.reply("msg-from-child", { kind: "reply", ...body, dataClass: "synthetic" });
    const reply = calls.find((c) => c.url.includes("/reply"))!;
    expect(reply.url).toBe("https://api.agentmail.to/v0/inboxes/inbox-rt/messages/msg-from-child/reply");
    expect(reply.body?.to).toBe(ALERT);
    expect(reply.body?.reply_all).toBeUndefined();
    expect(String(reply.body?.text)).toContain("Approved 1 and 3. The tickets are on their phones.");
  });

  it("refuses an email with a street address, a phone number or another address in it", async () => {
    const { fetch } = mockAgentMail();
    const mailer = agentMail({ env: env(), log: () => {}, ledger: tmpLedger() });
    for (const text of [
      "Meet at 39100 Argonaut Way.",
      "They are near Fremont Blvd.",
      "Call +1 510 555 0142.",
      "Write to someone@example.org.",
      "Treffpunkt Hauptstraße 12.",
    ]) {
      const r = await mailer.send(message(text));
      if (text.includes("near Fremont Blvd")) {
        expect(r.sent).toBe(true);
        continue;
      }
      expect(r).toMatchObject({ sent: false, reason: "privacy" });
    }
    expect(fetch.mock.calls.filter(([u]) => String(u).endsWith("/messages/send"))).toHaveLength(1);
  });

  it("sends nothing without an API key, or past the monthly cap", async () => {
    const { fetch } = mockAgentMail();
    const noKey = agentMail({ env: env({ AGENTMAIL_API_KEY: undefined }), log: () => {}, ledger: tmpLedger() });
    expect(await noKey.send(message("Approved 1."))).toEqual({ sent: false, reason: "no_api_key" });
    const ledger = tmpLedger();
    const month = "2026-10";
    writeFileSync(
      ledger,
      `${JSON.stringify({ at: `${month}-01T00:00:00.000Z`, service: "agentmail" })}\n`.repeat(MONTHLY_CAP),
    );
    const capped = agentMail({ env: env(), log: () => {}, ledger, now: () => new Date(`${month}-20T10:00:00Z`) });
    expect(await capped.send(message("Approved 1."))).toEqual({ sent: false, reason: "monthly_cap" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("waits and retries once when AgentMail says 429", async () => {
    const { calls } = mockAgentMail({
      inboxes: [{ inbox_id: "inbox-rt", client_id: "roundtrip-family" }],
      status: [200, 429],
    });
    const mailer = agentMail({ env: env(), log: () => {}, ledger: tmpLedger() });
    expect((await mailer.send(message("Approved 1."))).sent).toBe(true);
    expect(calls.filter((c) => c.url.endsWith("/messages/send"))).toHaveLength(2);
  });
});

describe("what the emails say", () => {
  const telugu = /[ఀ-౿]/;

  it("the planning email lists day, time, place, who, how they get there and why, and how to answer", () => {
    const e = planning();
    expect(e.subject).toBe("Outings for Sarala and Venkat, 12 to 18 October 2026: reply to approve");
    for (const s of [
      "1. Monday 12 October, 08:30 to 10:10: Sarala",
      "Karya Siddhi Hanuman Temple",
      "By Bus 211, about 20 minutes each way",
      "She gave her last 5 temple visits 5 of 5.",
      "New route: ride it together at the weekend first.",
      "2. Sunday 18 October, 10:00 to 11:42: Sarala and Venkat",
      "No Telugu events or groups were found nearby this week.",
      "approve 1 and 3",
      "skip 2",
      "swap 2",
      "Reply by Monday 12 October, 07:30",
      "fictional demo household (synthetic)",
      "Roundtrip reference: week-plan-fremont-demo, week 2026-W42",
    ]) {
      expect(e.text).toContain(s);
    }
    expect(e.html).toContain("Open the week on the dashboard");
    expect(e.html).toContain("#F2A900");
    expect(e.html).not.toContain("<img");
    expect(e.text).not.toMatch(telugu);
    expect(emailPrivacyProblems(`${e.subject}\n${e.text}\n${e.html}`)).toEqual([]);
  });

  it("the safety alert gives the outing details and what to do, with no contact details", () => {
    const e = safetyAlertEmail({
      who: ["Sarala"],
      pronoun: "she",
      place: "Karya Siddhi Hanuman Temple",
      dayLabel: "Monday 12 October",
      leave: "08:30",
      back: "10:10",
      travel: "By Bus 211, about 20 minutes each way",
      nudgedAt: "10:55",
      emergency: [{ number: "911", covers: "Police, fire and ambulance" }],
      dashboardUrl: null,
      synthetic: true,
    });
    expect(e.subject).toBe("Sarala isn't home yet from Karya Siddhi Hanuman Temple");
    expect(e.text).toContain("Sarala hasn't tapped \"I'm home\" yet.");
    expect(e.text).toContain(
      "leaving at 08:30 (by Bus 211, about 20 minutes each way), and was expected home by 10:10",
    );
    expect(e.text).toContain("Her phone showed a reminder at 10:55");
    expect(e.text).toContain("call 911, the number for police, fire and ambulance.");
    expect(e.text).not.toMatch(/sorry|apolog/i);
    expect(emailPrivacyProblems(`${e.subject}\n${e.text}\n${e.html}`)).toEqual([]);
  });

  it("the weekly summary says what they went to and the faces they picked", () => {
    const e = weeklySummaryEmail({
      names: "Sarala and Venkat",
      weekLabel: "12 to 18 October 2026",
      items: [
        {
          dayLabel: "Monday 12 October",
          place: "Karya Siddhi Hanuman Temple",
          who: ["Sarala"],
          outcome: "home",
          homeAt: "10:05",
          faces: [{ who: "Sarala", face: "good" }],
        },
        {
          dayLabel: "Sunday 18 October",
          place: "Irvington Farmers' Market",
          who: ["Sarala", "Venkat"],
          outcome: "with_you",
          faces: [],
        },
      ],
      dashboardUrl: null,
      synthetic: true,
    });
    expect(e.subject).toBe("Sarala and Venkat's week, 12 to 18 October 2026");
    expect(e.text).toContain("Monday 12 October: Karya Siddhi Hanuman Temple, Sarala");
    expect(e.text).toContain('Home at 10:05. Sarala picked "good".');
    expect(e.text).toContain("Sunday 18 October: Irvington Farmers' Market, Sarala and Venkat");
    expect(e.text).toContain("Voice replies stay on their phones.");
    expect(emailPrivacyProblems(`${e.subject}\n${e.text}\n${e.html}`)).toEqual([]);
  });

  it("asks again in plain words when a reply is unclear", () => {
    const e = threadReplyEmail({ kind: "ask_again", why: "Which outings should go ahead?" }, null);
    expect(e.text).toContain("Which outings should go ahead?");
    expect(e.text).toContain("approve 1 and 3");
    expect(e.text).not.toMatch(/sorry|apolog|couldn't understand/i);
  });

  it("escapes HTML", () => {
    const e = planningEmail({ ...planningInput(), names: "<b>Sarala</b>" });
    expect(e.html).toContain("&lt;b&gt;Sarala&lt;/b&gt;");
    expect(e.html).not.toContain("<b>Sarala</b>");
  });
});

function planningInput() {
  return {
    names: "Sarala and Venkat",
    weekLabel: "12 to 18 October 2026",
    note: "",
    outings,
    replyBy: "Monday 12 October, 07:30",
    dashboardUrl: null,
    reference: planReference("fremont-demo", "2026-W42"),
    synthetic: true,
  };
}

const event = (over: { from?: string; labels?: string[]; text?: string; type?: string } = {}) => ({
  type: "event",
  event_type: over.type ?? "message.received",
  event_id: "evt-1",
  message: {
    inbox_id: "inbox-rt",
    thread_id: "thread-1",
    message_id: "msg-from-child",
    from: over.from ?? `Priya <${ALERT}>`,
    labels: over.labels ?? ["received"],
    subject: "Re: Outings",
    text: over.text ?? `approve 1 and 3\n\nOn Sun, Roundtrip wrote:\n> ${planReference("fremont-demo", "2026-W42")}`,
    extracted_text: over.text ?? "approve 1 and 3",
    timestamp: "2026-10-11T19:02:00.000Z",
  },
  thread: { labels: over.labels ?? [] },
});

describe("replies to the planning email", () => {
  it("reads a reply from DEMO_ALERT_EMAIL and finds its week from the labels", async () => {
    const r = await readInboundReply(event({ labels: planLabels("fremont-demo", "2026-W42") }), {
      alertAddress: ALERT,
    });
    expect(r).toEqual({
      ok: true,
      reply: {
        workflowId: "week-plan-fremont-demo",
        weekKey: "2026-W42",
        messageId: "msg-from-child",
        threadId: "thread-1",
        eventId: "evt-1",
        receivedAt: "2026-10-11T19:02:00.000Z",
        parsed: { kind: "decision", approve: [1, 3], skip: [], swap: [] },
      },
    });
  });

  it("looks the labels up in the thread, then falls back to the reference line", async () => {
    const thread = vi.fn(async () => ({ labels: [], messages: [{ labels: planLabels("munich-demo", "2026-W42") }] }));
    const viaThread = await readInboundReply(event(), { alertAddress: ALERT, thread });
    expect(viaThread.ok && viaThread.reply.workflowId).toBe("week-plan-munich-demo");
    const viaText = await readInboundReply(event(), { alertAddress: ALERT, thread: async () => null });
    expect(viaText.ok && viaText.reply.workflowId).toBe("week-plan-fremont-demo");
  });

  it("ignores mail from anyone else, other event types, and everything while DEMO_ALERT_EMAIL is invalid", async () => {
    const labels = planLabels("fremont-demo", "2026-W42");
    expect(await readInboundReply(event({ from: "stranger@example.net", labels }), { alertAddress: ALERT })).toEqual({
      ok: false,
      why: "not from the alert address",
    });
    expect(
      await readInboundReply(event({ type: "message.received.spam", labels }), { alertAddress: ALERT }),
    ).toMatchObject({
      ok: false,
    });
    expect(await readInboundReply(event({ labels }), { alertAddress: null })).toEqual({
      ok: false,
      why: "DEMO_ALERT_EMAIL is not a valid address",
    });
    expect(await readInboundReply({ type: "event" }, { alertAddress: ALERT })).toEqual({
      ok: false,
      why: "not a message event",
    });
  });

  it("parses sender addresses and plan labels", () => {
    expect(senderAddress(`Priya <${ALERT.toUpperCase()}>`)).toBe(ALERT);
    expect(senderAddress(ALERT)).toBe(ALERT);
    expect(senderAddress("Priya")).toBeNull();
    expect(planFromLabels(["unread", "week-plan-fremont-demo", "week-2026-w42"])).toEqual({
      workflowId: WORKFLOW.weekPlan("fremont-demo"),
      weekKey: "2026-W42",
    });
    expect(planFromLabels(["unread"])).toBeNull();
  });
});

describe("webhook signatures (Svix, as AgentMail signs them)", () => {
  // The example from Svix's manual verification guide.
  const secret = "whsec_plJ3nmyCDGBKInavdOK15jsl";
  const id = "msg_loFOjxBNrRLzqYUf";
  const ts = 1731705121;
  const body = '{"event_type":"ping","data":{"success":true}}';
  const headers = (sig: string, t = ts) =>
    new Headers({ "svix-id": id, "svix-timestamp": String(t), "svix-signature": sig });

  it("matches Svix's published example", () => {
    expect(signWebhook(secret, id, ts, body)).toBe("rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=");
    expect(verifyWebhook(body, headers("v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0="), secret, ts)).toEqual({
      ok: true,
      id,
    });
  });

  it("accepts any one valid signature in the list", () => {
    const sig = `v1,bm90IHRoaXMgb25l v1,${signWebhook(secret, id, ts, body)}`;
    expect(verifyWebhook(body, headers(sig), secret, ts).ok).toBe(true);
  });

  it("rejects a changed body, a wrong secret, an old timestamp and missing headers", () => {
    const sig = `v1,${signWebhook(secret, id, ts, body)}`;
    expect(verifyWebhook(`${body} `, headers(sig), secret, ts).ok).toBe(false);
    expect(verifyWebhook(body, headers(sig), "whsec_c2VjcmV0", ts).ok).toBe(false);
    expect(verifyWebhook(body, headers(sig), secret, ts + 600)).toEqual({ ok: false, why: "timestamp too old" });
    expect(verifyWebhook(body, new Headers(), secret, ts)).toEqual({ ok: false, why: "missing signature headers" });
  });
});

describe("signals over Temporal's HTTP API", () => {
  it("does nothing without TEMPORAL_ADDRESS", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(temporalHttpUrl({})).toBeNull();
    expect(await signalWorkflow("outing-safety-x", "home", {}, { env: {} })).toBe("off");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts the signal as a full json/plain payload, so empty lists stay lists", async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const outingId = "hh_fremont:2026-W41:pl_d1f88c93";
    const arg = { parsed: { kind: "decision", approve: [1, 3], skip: [], swap: [] } };
    const r = await signalWorkflow(WORKFLOW.outingSafety(outingId), "home", arg, {
      env: { TEMPORAL_ADDRESS: "localhost:7233" },
    });
    expect(r).toBe("sent");
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(
      `http://localhost:7243/api/v1/namespaces/default/workflows/${encodeURIComponent(`outing-safety-${outingId}`)}/signal/home`,
    );
    const body = JSON.parse(String(init?.body));
    expect(body.identity).toBe("roundtrip");
    const [payload] = body.input.payloads;
    expect(Buffer.from(payload.metadata.encoding, "base64").toString()).toBe("json/plain");
    expect(JSON.parse(Buffer.from(payload.data, "base64").toString())).toEqual(arg);
  });

  it("tells a missing workflow from a failure, and refuses an unregistered host", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 404 })),
    );
    expect(await signalWorkflow("w", "home", {}, { env: { TEMPORAL_ADDRESS: "127.0.0.1:7233" } })).toBe("not_found");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    expect(await signalWorkflow("w", "home", {}, { env: { TEMPORAL_ADDRESS: "localhost:7233" } })).toBe("failed");
    await expect(
      signalWorkflow(
        "w",
        "home",
        {},
        { env: { TEMPORAL_ADDRESS: "x", TEMPORAL_HTTP_URL: "https://temporal.example.net" } },
      ),
    ).rejects.toBeInstanceOf(PrivacyViolation);
  });
});

describe("the WebSocket listener", () => {
  class FakeSocket {
    static last: FakeSocket | null = null;
    static count = 0;
    sent: string[] = [];
    onopen: ((ev: unknown) => void) | null = null;
    onmessage: ((ev: { data: unknown }) => void) | null = null;
    onclose: ((ev: unknown) => void) | null = null;
    onerror: ((ev: unknown) => void) | null = null;
    constructor(readonly url: string) {
      FakeSocket.last = this;
      FakeSocket.count += 1;
    }
    send(data: string) {
      this.sent.push(data);
    }
    close() {}
  }

  const mailbox = { ensureInbox: async () => "inbox-rt", thread: async () => null };

  it("subscribes to the inbox's received mail and passes each reply on once", async () => {
    const replies: string[] = [];
    const listener = await listenForReplies({
      mailbox,
      alertAddress: ALERT,
      apiKey: KEY,
      WebSocketImpl: FakeSocket,
      log: () => {},
      reconnect: false,
      onReply: async (r) => void replies.push(`${r.workflowId}:${r.parsed.kind}`),
    });
    const ws = FakeSocket.last!;
    expect(ws.url).toBe(`wss://ws.agentmail.to/v0?api_key=${KEY}`);
    ws.onopen?.({});
    expect(JSON.parse(ws.sent[0]!)).toEqual({
      type: "subscribe",
      inbox_ids: ["inbox-rt"],
      event_types: ["message.received"],
    });
    const labelled = JSON.stringify(event({ labels: planLabels("fremont-demo", "2026-W42") }));
    ws.onmessage?.({ data: JSON.stringify({ type: "subscribed", inbox_ids: ["inbox-rt"] }) });
    ws.onmessage?.({ data: labelled });
    ws.onmessage?.({ data: labelled });
    ws.onmessage?.({ data: JSON.stringify({ ...event({ from: "stranger@example.net" }), event_id: "evt-2" }) });
    await vi.waitFor(() => expect(replies).toEqual(["week-plan-fremont-demo:decision"]));
    listener?.close();
  });

  it("doesn't connect while DEMO_ALERT_EMAIL is invalid", async () => {
    const before = FakeSocket.count;
    const listener = await listenForReplies({
      mailbox,
      alertAddress: null,
      apiKey: KEY,
      WebSocketImpl: FakeSocket,
      log: () => {},
      onReply: async () => {},
    });
    expect(listener).toBeNull();
    expect(FakeSocket.count).toBe(before);
  });
});
