"use client";

import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { lazy, Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { DAY_NAMES, dayAvailability, hhmm, moveProblem, shortDate, whoFor, whoShort } from "@/lib/plan-format";
import type { BoardItem, PlanBoard } from "@/lib/plan-types";
import { cn } from "@/lib/utils";
import { SuggestionCard } from "./suggestion-card";
import { type EffectiveItem, useEffectiveItems, useOverlay } from "./use-overlay";

// The sheet (and its dialog library) loads once the page is idle, so it never competes with the board.
const loadSheet = () => import("./item-sheet");
const ItemSheet = lazy(() => loadSheet().then((m) => ({ default: m.ItemSheet })));

/** Monday to Friday each get a column; Saturday and Sunday share one, the days you can go along. */
interface Column {
  id: string;
  days: string[];
  title: string;
  note: string;
  label: string;
}

function columnsFor(board: PlanBoard): Column[] {
  const date = (d: string) => board.week.days.find((x) => x.day === d)?.date ?? "";
  const weekdays = ["mon", "tue", "wed", "thu", "fri"].map((day) => ({
    id: day,
    days: [day],
    title: shortDate(date(day)),
    note: dayAvailability(board, day),
    label: `${DAY_NAMES[day]} ${date(day)}`,
  }));
  return [
    ...weekdays,
    {
      id: "sat",
      days: ["sat", "sun"],
      title: "Weekend",
      note: `${shortDate(date("sat")).replace(/ \w+$/, "")} and ${shortDate(date("sun"))}`,
      label: "The weekend",
    },
  ];
}

function DayColumn({
  board,
  column,
  empty,
  children,
}: {
  board: PlanBoard;
  column: Column;
  empty: boolean;
  children: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: column.id });
  const weekend = column.days.includes("sat");
  const free = weekend || column.days.some((d) => board.household.aloneDays.includes(d));
  return (
    <section
      ref={setNodeRef}
      aria-label={column.label}
      className={cn(
        "flex min-h-[240px] flex-col gap-3 rounded-card p-2 transition-colors",
        !free &&
          "bg-[repeating-linear-gradient(135deg,transparent_0_12px,color-mix(in_oklab,var(--color-line)_60%,transparent)_12px_13px)]",
        isOver && free && "bg-accent-line/8 ring-2 ring-accent-line/50",
        isOver && !free && "bg-surface-sunken ring-2 ring-line-strong",
      )}
    >
      <header className="px-1">
        <h2 className="text-[16px] font-semibold">{column.title}</h2>
        <p className="text-[13px] leading-snug text-text-muted">{column.note}</p>
      </header>
      {children}
      {empty && free ? (
        <p className="rounded-card border border-dashed border-line-strong px-3 py-4 text-[14px] leading-snug text-text-muted">
          {weekend ? "Nothing planned yet. Drag an outing here to go together." : "A free day. Drag an outing here."}
        </p>
      ) : null}
    </section>
  );
}

/**
 * This week: the planner's suggestions laid out Monday to Friday, then the weekend. Approve the ones you want;
 * swap one for another real option on the same day; drag one to another free day. Changes
 * stay in your session and show on their phones straight away when a ticket exists.
 */
export function WeekBoard({ board }: { board: PlanBoard }) {
  const { overlay, change } = useOverlay(board.household.slug);
  const items = useEffectiveItems(board, overlay);
  const [openId, setOpenId] = useState<string | null>(null);
  const [sheetUsed, setSheetUsed] = useState(false);
  if (openId !== null && !sheetUsed) setSheetUsed(true);
  useEffect(() => {
    const id = setTimeout(() => void loadSheet(), 2000);
    return () => clearTimeout(id);
  }, []);
  const open = items.find((i) => i.slotId === openId) ?? null;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const approved = items.filter((i) => i.status === "approved").length;
  const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const next = items
    .filter((i) => i.status === "approved")
    .sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || a.depart - b.depart)[0];

  async function run(label: string, fn: () => Promise<unknown>, done?: string, describe?: string) {
    try {
      await fn();
      if (done) toast(done, { description: describe });
    } catch (e) {
      toast(label, { description: e instanceof Error ? e.message : undefined });
    }
  }

  const approve = (item: EffectiveItem) => {
    const who = whoFor(item, board);
    return run(
      "Couldn't approve that",
      () => change({ action: "approve", id: item.slotId }),
      `Approved: ${item.title}, ${DAY_NAMES[item.day]}`,
      item.hasTicket
        ? `The ticket is on ${who}'s phone now.`
        : "Directions and the card are written in the next planning run.",
    );
  };
  const unapprove = (item: EffectiveItem) =>
    run(
      "Couldn't change that",
      () => change({ action: "unapprove", id: item.slotId }),
      `${item.title} is back to a suggestion`,
    );
  const swap = (item: EffectiveItem, to: BoardItem) =>
    run(
      "Couldn't swap that",
      () => change({ action: "swap", id: item.slotId, to: to.id }),
      `Swapped in ${to.title}`,
      "Approve it to put it on their week.",
    );
  const unswap = (item: EffectiveItem) =>
    run(
      "Couldn't undo the swap",
      () => change({ action: "unswap", id: item.slotId }),
      "Back to the planner's first choice",
    );

  function onDragEnd(e: DragEndEvent) {
    const item = (e.active.data.current as { item?: EffectiveItem } | undefined)?.item;
    const column = e.over?.id as string | undefined;
    if (!item || !column) return;
    if (column === "sat" && (item.day === "sat" || item.day === "sun")) return;
    // The weekend column takes a Saturday outing, or Sunday when the place is shut on Saturdays.
    const day = column === "sat" ? (["sat", "sun"].find((d) => !moveProblem(board, item, d)) ?? "sat") : column;
    if (day === item.day) return;
    const problem = moveProblem(board, item, day);
    if (problem) {
      toast(problem.title, { description: problem.description });
      return;
    }
    void run(
      "Couldn't move that",
      () => change({ action: "move", id: item.slotId, day }),
      `Moved ${item.title} to ${DAY_NAMES[day]}`,
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-[720px] space-y-1.5">
          <h1 className="text-[31px] font-semibold leading-tight">This week</h1>
          <p className="text-base text-text-muted">{board.note}</p>
        </div>
        <dl className="flex flex-wrap gap-2 max-sm:w-full">
          {[
            { label: "Approved", value: String(approved) },
            { label: "To decide", value: String(items.length - approved) },
            {
              label: "Next outing",
              value: next ? `${DAY_NAMES[next.day]?.slice(0, 3)} ${hhmm(next.depart)}` : "None yet",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="min-w-28 rounded-card bg-surface px-4 py-3 shadow-raised ring-1 ring-line max-sm:flex-1"
            >
              <dt className="text-[13px] text-text-muted">{s.label}</dt>
              <dd className="mt-0.5 text-[20px] font-semibold tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <DndContext id="week-board" sensors={sensors} onDragEnd={onDragEnd}>
        <div className="relative -mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          <div className="grid min-w-[1100px] grid-cols-6 gap-3">
            {columnsFor(board).map((column) => (
              <DayColumn
                key={column.id}
                board={board}
                column={column}
                empty={!items.some((i) => column.days.includes(i.day))}
              >
                {items
                  .filter((i) => column.days.includes(i.day))
                  .sort((a, b) => a.day.localeCompare(b.day) || a.depart - b.depart)
                  .map((item) => (
                    <SuggestionCard
                      key={item.slotId}
                      item={item}
                      who={whoShort(item, board)}
                      lang={board.household.localLanguage}
                      swapCount={(board.alternatives[item.slotId] ?? []).length}
                      onOpen={() => setOpenId(item.slotId)}
                      onApprove={() => void approve(item)}
                      onUnapprove={() => void unapprove(item)}
                      onSwap={() => setOpenId(item.slotId)}
                    />
                  ))}
              </DayColumn>
            ))}
          </div>
        </div>
      </DndContext>
      <p className="text-[14px] text-text-muted">
        Places and events come from live searches for the week of {board.week.label}. The family is fictional. Drag an
        outing to move it to another day they&rsquo;re free; open one to see the route, the reasons and their ticket.
      </p>
      {sheetUsed ? (
        <Suspense fallback={null}>
          <ItemSheet
            board={board}
            item={open}
            open={open !== null}
            onOpenChange={(o) => !o && setOpenId(null)}
            onApprove={(i) => void approve(i)}
            onUnapprove={(i) => void unapprove(i)}
            onSwap={(i, to) => void swap(i, to)}
            onUnswap={(i) => void unswap(i)}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
