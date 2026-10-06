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
        "group relative overflow-hidden rounded-card bg-surface shadow-raised ring-1 transition-[box-shadow,translate] duration-200 hover:-translate-y-0.5 hover:shadow-overlay",
        approved ? "ring-ink/70" : "ring-line",
        (isDragging || dragging) && "z-20 shadow-overlay",
      )}
    >
      <button type="button" onClick={onOpen} className="block w-full text-left" aria-label={`Open ${item.title}`}>
        <div className="relative">
          <PlacePhoto
            url={item.photo?.url}
            width={480}
            height={270}
            category={item.category}
            className="aspect-[16/9] w-full"
          />
          {/* The time and, once approved, a badge sit on the photo, like a printed ticket. */}
          <span className="absolute bottom-2 left-2 rounded-chip bg-white/92 px-2 py-1 text-[13px] font-semibold tabular-nums text-[#1F2A44] shadow-raised">
            {hhmm(item.depart)} to {hhmm(item.back)}
          </span>
          {approved ? (
            <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-chip bg-[#1F2A44] px-2 py-1 text-[13px] font-semibold text-white shadow-raised">
              <Check aria-hidden="true" className="size-3.5 stroke-[2.5]" />
              Approved
            </span>
          ) : null}
        </div>
        <div className="space-y-2.5 px-4 pt-3 pb-3">
          <p className="truncate text-[14px] text-text-muted">For {who === "Both" ? "both of them" : who}</p>
          <h3 lang={lang} className="line-clamp-2 hyphens-auto text-base font-semibold leading-snug">
            {item.title}
          </h3>
          <div className="space-y-1">
            <TravelLines legs={legSummaries(item)} width={180} label={tripLine(item)} />
            <p className="text-[14px] text-text-muted">{tripLine(item)}</p>
          </div>
          <LadderBadge level={item.ladderLevel} label={item.ladderLabel} size="sm" />
          <ReasonChips chips={item.chips.filter((c) => c.direction === "for").slice(0, 1)} size="sm" />
        </div>
      </button>
      <div className="flex items-center gap-1.5 border-t border-line px-2 py-2">
        {approved ? (
          <>
            <span className="flex-1 truncate px-1 text-[13px] text-text-muted">On their phone</span>
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
