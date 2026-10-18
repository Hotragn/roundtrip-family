"use client";

import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Passkey sign-up and sign-in. The browser and the device do the work (a fingerprint, a face or
 * the screen lock); this page only passes the server's challenge and the answer along.
 * Docs: https://simplewebauthn.dev/docs/packages/browser
 */
async function post(path: string, body?: unknown) {
  const res = await fetch(`/api/auth/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "That didn't go through. Try again.");
  return json;
}

export function PasskeyButtons() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(kind: "register" | "signin") {
    setError(null);
    setBusy(true);
    try {
      const optionsJSON = await post(`${kind}-options`);
      const answer =
        kind === "register" ? await startRegistration({ optionsJSON }) : await startAuthentication({ optionsJSON });
      await post(kind, answer);
      window.location.assign("/account");
    } catch (e) {
      setError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "The passkey step was closed. Press the button again when you're ready."
          : e instanceof Error
            ? e.message
            : "That didn't go through. Try again.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="primary" disabled={busy} onClick={() => void run("register")}>
          Create our sign-in
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void run("signin")}>
          Sign in with a passkey
        </Button>
      </div>
      <p className="text-sm text-text-muted">
        By creating a sign-in you agree to the{" "}
        <Link className="underline underline-offset-4" href="/terms">
          terms
        </Link>{" "}
        and the{" "}
        <Link className="underline underline-offset-4" href="/privacy-policy">
          privacy policy
        </Link>
        .
      </p>
      <p role="alert" className="min-h-6 text-sm font-semibold text-text">
        {error}
      </p>
    </div>
  );
}

export function SignOutButton() {
  return (
    <Button
      type="button"
      variant="quiet"
      onClick={async () => {
        await post("signout");
        window.location.assign("/account");
      }}
    >
      Sign out
    </Button>
  );
}
