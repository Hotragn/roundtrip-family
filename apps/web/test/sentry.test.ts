import type { ErrorEvent, Event } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";
import { sentryOptions } from "../sentry.server";

describe("what reaches Sentry", () => {
  const opts = sentryOptions();

  it("drops the request's body, headers, cookies, query and the user, and scrubs names and contacts", () => {
    const event = {
      message: "Sarala's alert to parent@example.com failed, call +1 510 555 0100",
      request: {
        url: "https://roundtrip-web.onrender.com/plan/api/replan/fremont-demo?who=Sarala",
        method: "POST",
        data: '{"note":"private"}',
        headers: { cookie: "rt_session=abc" },
        cookies: { rt_session: "abc" },
      },
      user: { ip_address: "203.0.113.9" },
      breadcrumbs: [{ message: "Venkat opened the diary" }],
      exception: { values: [{ type: "Error", value: "No week for Kamala" }] },
    } as unknown as ErrorEvent;
    const out = opts.beforeSend(event);
    expect(out.request).toEqual({
      url: "https://roundtrip-web.onrender.com/plan/api/replan/fremont-demo",
      method: "POST",
    });
    expect(out.user).toBeUndefined();
    expect(out.breadcrumbs).toBeUndefined();
    const text = JSON.stringify(out);
    for (const s of ["Sarala", "Venkat", "Kamala", "parent@example.com", "555 0100", "private", "abc"])
      expect(text).not.toContain(s);
  });

  it("strips query strings and the Cloudflare account from span URLs", () => {
    const event = {
      type: "transaction",
      contexts: { trace: { data: { "http.query": "lat=37.5&lng=-121.9" } } },
      spans: [
        {
          description: "POST https://api.cloudflare.com/client/v4/accounts/0123abcd/ai/v1/chat/completions",
          data: { "url.full": "https://api.open-meteo.com/v1/forecast?latitude=37.55&longitude=-121.98" },
        },
      ],
    } as unknown as Event;
    const out = opts.beforeSendTransaction(event);
    const text = JSON.stringify(out);
    expect(text).not.toContain("0123abcd");
    expect(text).not.toContain("latitude");
    expect(text).not.toContain("lat=");
    expect(out.spans?.[0]?.description).toBe(
      "POST https://api.cloudflare.com/client/v4/accounts/{account}/ai/v1/chat/completions",
    );
  });

  it("samples every live re-plan, a tenth of the rest, and never the keep-awake health check", () => {
    expect(opts.tracesSampler({ name: "POST /plan/api/replan/[household]" })).toBe(1);
    expect(opts.tracesSampler({ name: "GET /parents" })).toBe(0.1);
    expect(opts.tracesSampler({ name: "GET /api/health" })).toBe(0);
  });

  it("sends whole transactions, so the scrubber above runs on them", () => {
    // With span streaming, the SDK's default, beforeSendTransaction is skipped.
    expect(opts.traceLifecycle).toBe("static");
  });
});
