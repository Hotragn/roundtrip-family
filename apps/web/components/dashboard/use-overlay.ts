"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { type BoardItem, type BoardOverlay, EMPTY_OVERLAY, type PlanBoard } from "@/lib/plan-types";

export type Change =
  | { action: "approve"; id: string }
  | { action: "unapprove"; id: string }
  | { action: "swap"; id: string; to: string }
  | { action: "unswap"; id: string }
  | { action: "move"; id: string; day: string };

const key = (household: string) => ["overlay", household] as const;

/** The visitor's changes to this week, with optimistic updates and the server's checks. */
export function useOverlay(household: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: key(household),
    queryFn: async (): Promise<BoardOverlay> => {
      const res = await fetch(`/plan/api/overlay/${household}`, { cache: "no-store" });
      return res.ok ? res.json() : EMPTY_OVERLAY;
    },
    placeholderData: EMPTY_OVERLAY,
  });
  const mutation = useMutation({
    mutationFn: async (change: Change): Promise<BoardOverlay> => {
      const res = await fetch(`/plan/api/overlay/${household}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "That change didn't go through");
      return body as BoardOverlay;
    },
    onMutate: async (change) => {
      await qc.cancelQueries({ queryKey: key(household) });
      const before = qc.getQueryData<BoardOverlay>(key(household)) ?? EMPTY_OVERLAY;
      qc.setQueryData<BoardOverlay>(key(household), apply(before, change));
      return { before };
    },
    onError: (_e, _c, ctx) => {
      if (ctx?.before) qc.setQueryData(key(household), ctx.before);
    },
    onSuccess: (data) => qc.setQueryData(key(household), data),
  });
  return { overlay: query.data ?? EMPTY_OVERLAY, change: mutation.mutateAsync, pending: mutation.isPending };
}

function apply(o: BoardOverlay, c: Change): BoardOverlay {
  const next: BoardOverlay = { status: { ...o.status }, swaps: { ...o.swaps }, moves: { ...o.moves } };
  if (c.action === "approve") next.status[c.id] = "approved";
  if (c.action === "unapprove") next.status[c.id] = "suggested";
  if (c.action === "swap") {
    next.swaps[c.id] = c.to;
    next.status[c.id] = "suggested";
  }
  if (c.action === "unswap") delete next.swaps[c.id];
  if (c.action === "move") next.moves[c.id] = c.day;
  return next;
}

export interface EffectiveItem extends BoardItem {
  /** The suggestion's id in the plan (an alternative keeps the id of the outing it replaced). */
  slotId: string;
  status: "approved" | "suggested";
  swapped: boolean;
}

/** The week as this visitor sees it: swaps applied, moves applied, approvals applied. */
export function useEffectiveItems(board: PlanBoard, overlay: BoardOverlay): EffectiveItem[] {
  return useMemo(
    () =>
      board.items.map((item) => {
        const altId = overlay.swaps[item.id];
        const alt = altId ? board.alternatives[item.id]?.find((a) => a.id === altId) : undefined;
        const base = alt ?? item;
        return {
          ...base,
          slotId: item.id,
          day: overlay.moves[item.id] ?? (alt ? alt.day : item.day),
          status: overlay.status[item.id] ?? (alt ? "suggested" : item.defaultStatus),
          swapped: Boolean(alt),
        };
      }),
    [board, overlay],
  );
}
