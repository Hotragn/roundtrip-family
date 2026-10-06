"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical, Shuffle, Undo2 } from "lucide-react";
import { TravelLines } from "@/components/travel/travel-line";
import { Button } from "@/components/ui/button";
import { hhmm, legSummaries, tripLine } from "@/lib/plan-format";
import { cn } from "@/lib/utils";
import { PlacePhoto } from "./place-photo";
import { LadderBadge, ReasonChips } from "./reason";
import type { EffectiveItem } from "./use-overlay";

/**
 * One suggestion on the week board: when, where, who, how they get there, how close to their
 * language it is, and the strongest reason. Approve is the card's one main action.
 */
export function SuggestionCard({
  item,
  who,
  lang,
  onOpen,
  onApprove,
  onUnapprove,
  onSwap,
  swapCount,
  dragging,
}: {
  item: EffectiveItem;
  /** "Sarala", or "Both" when it's for the two of them. */
  who: string;
  /** The local language, so long place names hyphenate the way that language does. */
  lang: string;
  onOpen: () => void;
  onApprove: () => void;
  onUnapprove: () => void;
  onSwap: () => void;
  swapCount: number;
  dragging?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.slotId,
    data: { item },
  });
  const approved = item.status === "approved";
  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      aria-label={`${item.title}, ${hhmm(item.depart)}, ${who}`}
      className={cn(
        "group relative overflow-hidden rounded-card bg-surface shadow-raised ring-1 transition-shadow",
        approved ? "ring-ink/70" : "ring-line",
        (isDragging || dragging) && "z-20 shadow-overlay",
      )}
    >
      <button type="button" onClick={onOpen} className="block w-full text-left" aria-label={`Open ${item.title}`}>
        <PlacePhoto
          url={item.photo?.url}
          width={480}
          height={270}
          category={item.category}
          className="aspect-[16/9] w-full"
        />
        <div className="space-y-2 px-3 pb-2 pt-2.5">
          <p className="flex items-baseline justify-between gap-2 text-[13px] text-text-muted">
            <span className="font-semibold tabular-nums text-text">
              {hhmm(item.depart)} to {hhmm(item.back)}
            </span>
            <span className="truncate">{who}</span>
          </p>
          <h3 lang={lang} className="line-clamp-2 hyphens-auto text-base font-semibold leading-snug">
            {item.title}
          </h3>
          <div className="space-y-1">
            <TravelLines legs={legSummaries(item)} width={180} label={tripLine(item)} />
            <p className="text-[13px] text-text-muted">{tripLine(item)}</p>
          </div>
          <LadderBadge level={item.ladderLevel} label={item.ladderLabel} size="sm" />
          <ReasonChips chips={item.chips.filter((c) => c.direction === "for").slice(0, 1)} size="sm" />
        </div>
      </button>
      <div className="flex items-center gap-1.5 border-t border-line px-2 py-2">
        {approved ? (
          <>
            <span className="inline-flex flex-1 items-center gap-1.5 px-1 text-[13px] font-semibold">
              <Check aria-hidden="true" className="size-4 stroke-[2.25]" />
              Approved
            </span>
            <Button variant="quiet" size="sm" onClick={onUnapprove} aria-label={`Take ${item.title} off their week`}>
              <Undo2 aria-hidden="true" className="size-4" />
            </Button>
          </>
        ) : (
          <>
            <Button variant="primary" size="sm" className="flex-1" onClick={onApprove}>
              Approve
            </Button>
            {swapCount > 0 ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={onSwap}
                aria-label={`Swap ${item.title} for another option`}
              >
                <Shuffle aria-hidden="true" className="size-4" />
              </Button>
            ) : null}
          </>
        )}
        <span
          {...listeners}
          {...attributes}
          aria-label={`Move ${item.title} to another day`}
          className="ml-auto inline-flex size-8 cursor-grab touch-none items-center justify-center rounded-md text-text-muted hover:bg-surface-sunken active:cursor-grabbing"
        >
          <GripVertical aria-hidden="true" className="size-4" />
        </span>
      </div>
    </article>
  );
}
