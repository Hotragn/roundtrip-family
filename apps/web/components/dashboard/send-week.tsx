"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * "Set up the week": the approvals and swaps go to weekPlan, which starts the safety timers and
 * first rides. Shown only where Temporal runs (GET /plan/api/send says so); naming outings skips
 * the rest, so it's one press when the week is ready, not one signal per click.
 */
export function SendWeek({ household }: { household: string }) {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch(`/plan/api/send/${household}`)
      .then((r) => r.json())
      .then((b: { on?: boolean }) => setOn(Boolean(b.on)))
      .catch(() => {});
  }, [household]);
  if (!on) return null;
  async function send() {
    setBusy(true);
    const res = await fetch(`/plan/api/send/${household}`, { method: "POST" }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) ?? {};
    setBusy(false);
    if (res?.ok) toast.success(`Set up: ${body.approved} outings, with their safety timers.`);
    else toast.error(body.error ?? "Temporal didn't answer. Check the worker is running, then try again.");
  }
  return (
    <Button variant="secondary" onClick={() => void send()} disabled={busy}>
      Set up the week
    </Button>
  );
}
