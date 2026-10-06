"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/shell/panel";
import { Button } from "@/components/ui/button";
import type { PersonView, PlaceView } from "@/lib/family";
import { cn } from "@/lib/utils";

/**
 * People and places: what Roundtrip remembers, each with a way to forget it. People show the
 * exact sentence the planner hears about them, which never includes a name.
 */

export function howItWent(avg: number | null): string {
  if (avg === null) return "Not rated";
  if (avg >= 4.5) return "Loved it";
  if (avg >= 3.5) return "Liked it";
  if (avg >= 2.5) return "It was okay";
  return "Didn't enjoy it";
}

const AGAIN = { yes: "Would go again", no: "Not again", maybe: "Maybe again" } as const;

function useForgotten(household: string) {
  const qc = useQueryClient();
  const key = ["memory", household];
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const res = await fetch(`/plan/api/memory/${household}`);
      return res.ok ? ((await res.json()) as { forgotten: string[] }).forgotten : [];
    },
    initialData: [] as string[],
  });
  const change = useMutation({
    mutationFn: async ({ action, id }: { action: "forget" | "restore"; id: string }) => {
      const res = await fetch(`/plan/api/memory/${household}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      if (!res.ok) throw new Error("That change didn't save. Try once more.");
      return ((await res.json()) as { forgotten: string[] }).forgotten;
    },
    onMutate: async ({ action, id }) => {
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<string[]>(key) ?? [];
      qc.setQueryData<string[]>(key, action === "forget" ? [...before, id] : before.filter((x) => x !== id));
      return { before };
    },
    onError: (e, _v, ctx) => {
      if (ctx) qc.setQueryData(key, ctx.before);
      toast("Not changed", { description: e instanceof Error ? e.message : undefined });
    },
    onSuccess: (list) => qc.setQueryData(key, list),
  });
  return { forgotten: new Set(query.data), change: change.mutate };
}

export function PeopleList({ household, people }: { household: string; people: PersonView[] }) {
  const { forgotten, change } = useForgotten(household);
  if (people.length === 0) {
    return <p className="text-[15px] text-text-muted">No one yet. People they meet on outings show up here.</p>;
  }
  return (
    // One person spans the row, so the page doesn't show an empty half.
    <ul className={cn("grid gap-4", people.length > 1 && "md:grid-cols-2")}>
      {people.map((p) => {
        const id = `person:${p.id}`;
        const gone = forgotten.has(id);
        return (
          <li key={p.id}>
            <Panel className={cn("h-full space-y-3 p-5", gone && "bg-surface-sunken/60")}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[20px] font-semibold leading-tight">{p.label}</h3>
                  <p className="text-[14px] text-text-muted">
                    {p.relation}
                    {p.whereMet ? `, met ${p.whereMet.charAt(0).toLowerCase()}${p.whereMet.slice(1)}` : ""}
                  </p>
                </div>
                {gone ? (
                  <Button variant="secondary" size="sm" onClick={() => change({ action: "restore", id })}>
                    <Undo2 aria-hidden="true" className="size-4" />
                    Remember again
                  </Button>
                ) : (
                  <Button variant="quiet" size="sm" onClick={() => change({ action: "forget", id })}>
                    Forget
                  </Button>
                )}
              </div>
              {gone ? (
                <p className="text-[15px]">
                  Forgotten. The planner won&rsquo;t hear about {p.label} again, and no outing will suggest bringing
                  them along.
                </p>
              ) : (
                <>
                  <p className="text-[15px]">
                    Speaks {p.languageName}. {p.knows.join(" and ")} {p.knows.length > 1 ? "know" : "knows"} them.
                  </p>
                  <div className="space-y-1.5">
                    <p className="text-[13px] font-medium text-text-muted">Words they share</p>
                    <ul className="flex flex-wrap gap-1.5">
                      {p.sharedWords.map((w) => (
                        <li key={w} className="rounded-chip bg-surface-sunken px-2.5 py-1 text-[13px]">
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {p.notes ? <p className="text-[15px] leading-relaxed">{p.notes}</p> : null}
                  <div className="space-y-1 border-t border-line pt-3">
                    <p className="text-[13px] font-medium text-text-muted">What the planner is told</p>
                    <p className="text-[14px] leading-relaxed">&ldquo;{p.plannerSees}&rdquo;</p>
                  </div>
                </>
              )}
            </Panel>
          </li>
        );
      })}
    </ul>
  );
}

function Dots({ avg }: { avg: number | null }) {
  if (avg === null) return null;
  const full = Math.round(avg);
  return (
    <span aria-hidden="true" className="inline-flex gap-0.5 align-middle">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={cn("size-1.5 rounded-full", i <= full ? "bg-ink" : "bg-line-strong")} />
      ))}
    </span>
  );
}

export function PlacesList({ household, places }: { household: string; places: PlaceView[] }) {
  const { forgotten, change } = useForgotten(household);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left text-[14px]">
        <caption className="sr-only">Places they have been, how each went, and whether they would go again</caption>
        <thead>
          <tr className="border-b border-line-strong text-[13px]">
            <th scope="col" className="py-2.5 pr-3 font-semibold">
              Place
            </th>
            <th scope="col" className="px-3 py-2.5 font-semibold">
              How it went
            </th>
            <th scope="col" className="px-3 py-2.5 font-semibold">
              Visits
            </th>
            <th scope="col" className="px-3 py-2.5 font-semibold">
              Who went
            </th>
            <th scope="col" className="py-2.5 pl-3">
              <span className="sr-only">Forget</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {places.map((p) => {
            const id = `place:${p.id}`;
            const gone = forgotten.has(id);
            return (
              <tr key={p.id} className={cn("border-b border-line align-top last:border-0", gone && "text-text-muted")}>
                <td className="py-3 pr-3">
                  <p className={cn("font-semibold leading-snug", gone && "line-through decoration-1")}>{p.name}</p>
                  <p className="text-[13px] text-text-muted">{p.kind}</p>
                  {!gone && p.notes.length ? (
                    <p className="mt-1 max-w-[42ch] text-[13px] leading-snug text-text-muted">{p.notes.join(". ")}</p>
                  ) : null}
                </td>
                <td className="px-3 py-3">
                  {gone ? (
                    "Forgotten"
                  ) : (
                    <>
                      <p className="flex items-center gap-2 font-medium">
                        {howItWent(p.average)} <Dots avg={p.average} />
                      </p>
                      <p className="text-[13px] text-text-muted">
                        {p.average !== null ? `${p.average.toFixed(1)} of 5` : ""}
                        {p.wouldRepeat ? ` · ${AGAIN[p.wouldRepeat]}` : ""}
                      </p>
                    </>
                  )}
                </td>
                <td className="px-3 py-3 tabular-nums">{p.visits}</td>
                <td className="px-3 py-3">
                  <p>{p.who.join(" and ")}</p>
                  <p className="text-[13px] text-text-muted">
                    {p.withYou && p.onTheirOwn
                      ? `${p.withYou} with you, ${p.onTheirOwn} on their own`
                      : p.withYou
                        ? "With you"
                        : "On their own"}
                  </p>
                </td>
                <td className="py-3 pl-3 text-right">
                  {gone ? (
                    <Button variant="quiet" size="sm" onClick={() => change({ action: "restore", id })}>
                      Undo
                    </Button>
                  ) : (
                    <Button
                      variant="quiet"
                      size="sm"
                      aria-label={`Forget ${p.name}`}
                      onClick={() => change({ action: "forget", id })}
                    >
                      Forget
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
