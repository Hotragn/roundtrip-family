"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Download all our data, and delete our household with a typed confirmation. */
export function DataRights({ household }: { household: string }) {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function del() {
    const res = await fetch(`/api/household/${household}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm: typed.trim().toLowerCase() }),
    });
    if (res.ok) return window.location.assign("/account");
    setError((await res.json().catch(() => ({}))).error ?? "Not deleted. Try again.");
  }

  return (
    <div className="space-y-4">
      <a
        href={`/api/household/${household}`}
        download
        className="inline-flex h-10 items-center rounded-md border border-line-strong bg-surface px-4 text-base font-semibold hover:bg-surface-sunken"
      >
        Download all our data
      </a>
      {confirming ? (
        <div className="space-y-3 rounded-lg border border-line-strong p-4">
          <p className="text-base">
            This removes your household, your parents' phone links, their check-ins and diary entries, and your sign-in.
            It can't be undone. Download your data first if you want a copy.
          </p>
          <label className="block text-sm font-semibold" htmlFor="confirm-delete">
            Type delete to confirm
          </label>
          <input
            id="confirm-delete"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            className="h-10 w-full max-w-[16rem] rounded-md border border-line-strong bg-surface px-3 text-base"
          />
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="secondary"
              disabled={typed.trim().toLowerCase() !== "delete"}
              onClick={() => void del()}
            >
              Delete our household
            </Button>
            <Button type="button" variant="quiet" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </div>
          <p role="alert" className="text-sm font-semibold">
            {error}
          </p>
        </div>
      ) : (
        <div>
          <Button type="button" variant="secondary" onClick={() => setConfirming(true)}>
            Delete our household
          </Button>
        </div>
      )}
    </div>
  );
}
