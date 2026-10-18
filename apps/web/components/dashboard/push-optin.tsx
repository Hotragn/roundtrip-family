"use client";

import { BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * "Tell me on this computer": safety alerts as a notification from this browser, through the
 * dashboard's own service worker (public/plan-sw.js, scope /plan/). The site sends one only when
 * the VAPID keys are set; otherwise this says notifications are off and the alert still shows on
 * the dashboard and by email.
 */

type State = "loading" | "off" | "unsupported" | "ready" | "on" | "blocked" | "failed";

const b64 = (s: string) => {
  const raw = atob((s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export function PushOptIn() {
  const [state, setState] = useState<State>("loading");
  const [key, setKey] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const r = (await fetch("/plan/api/push")
        .then((x) => x.json())
        .catch(() => null)) as {
        on: boolean;
        publicKey: string | null;
      } | null;
      if (!live) return;
      if (!r?.on || !r.publicKey) return setState("off");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return setState("unsupported");
      }
      setKey(r.publicKey);
      if (Notification.permission === "denied") return setState("blocked");
      const reg = await navigator.serviceWorker.getRegistration("/plan/");
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "ready");
    })().catch(() => live && setState("failed"));
    return () => {
      live = false;
    };
  }, []);

  async function turnOn() {
    if (!key) return;
    try {
      if ((await Notification.requestPermission()) !== "granted") return setState("blocked");
      const reg = await navigator.serviceWorker.register("/plan-sw.js", { scope: "/plan/" });
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) }));
      const res = await fetch("/plan/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      setState(res.ok ? "on" : "failed");
    } catch {
      setState("failed");
    }
  }

  const note: Record<State, string> = {
    loading: "Checking this browser.",
    off: "Notifications are off on this site, because its push keys aren't set. Alerts still show at the top of the dashboard, and by email when that's set up.",
    unsupported: "This browser can't show notifications from a site. Alerts still show at the top of the dashboard.",
    ready: "Get the alert as a notification on this computer or phone, even with the dashboard closed.",
    on: "Notifications are on for this browser. A missed check-in shows here as a notification.",
    blocked: "Notifications are blocked for this site. Allow them in the browser's site settings, then try again.",
    failed: "That didn't work. Try again, or check the browser allows notifications for this site.",
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-live="polite">
      {state === "ready" || state === "failed" ? (
        <Button type="button" onClick={turnOn}>
          <BellRing aria-hidden="true" className="size-4" />
          Tell me in this browser
        </Button>
      ) : null}
      <p className="max-w-[560px] text-[15px] text-text-muted">{note[state]}</p>
    </div>
  );
}
