"use client";

import { Check } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { type LegSummary, TravelLines } from "@/components/travel/travel-line";
import { cn } from "@/lib/utils";

/**
 * The outing ticket, the app's signature: one card with the trip's travel lines across the top,
 * the place, and a perforated stub. When they tap "I'm home" the stub separates along the
 * perforation and settles stamped in home green, in about 500 ms, like real paper. Plain CSS
 * transitions, so no animation library loads with the first screen; with reduced motion the
 * global rule in app/tokens.css switches straight to the stamped state.
 */

export function Ticket({
  legs,
  linesLabel,
  leave,
  back,
  leaveLabel,
  backLabel,
  photo,
  title,
  meta,
  badges,
  stub,
  home,
  stampLabel,
}: {
  legs: LegSummary[];
  linesLabel: string;
  leave: string;
  back: string;
  leaveLabel: string;
  backLabel: string;
  /** fallback: a second address for the same photo, tried once if the first fails */
  photo: { url: string; fallback?: string; credit: string } | null;
  title: string;
  meta: string;
  badges?: ReactNode;
  stub: ReactNode;
  home: boolean;
  stampLabel: string;
}) {
  const photoEl = useRef<HTMLImageElement>(null);
  const [photoTry, setPhotoTry] = useState<0 | 1 | 2>(0);
  const hasFallback = Boolean(photo?.fallback);
  const onPhotoError = useCallback(() => setPhotoTry((n) => (n === 0 && hasFallback ? 1 : 2)), [hasFallback]);
  // An image that failed before the page woke up never fires onError, so look once.
  useEffect(() => {
    const img = photoEl.current;
    if (img?.complete && img.naturalWidth === 0) onPhotoError();
  }, [onPhotoError]);
  return (
    <article className="relative" aria-label={title}>
      <div className="relative rounded-t-ticket bg-surface shadow-raised ring-1 ring-line">
        <header className="px-5 pt-5">
          {legs.length > 0 ? <TravelLines legs={legs} width={440} label={linesLabel} /> : null}
          {/* Times on the left, the place photo on the right: the name below gets the full
                width, and Listen and Directions stay on a phone's first screen. */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <dl className="grid grid-cols-[auto_auto] items-baseline gap-x-4 gap-y-2">
              <dt className="text-[16px] text-text-muted" lang="te">
                {leaveLabel}
              </dt>
              <dd className="text-[28px] font-semibold leading-none tabular-nums">{leave}</dd>
              <dt className="text-[16px] text-text-muted" lang="te">
                {backLabel}
              </dt>
              <dd className="text-[28px] font-semibold leading-none tabular-nums">{back}</dd>
            </dl>
            {photo && photoTry < 2 ? (
              <figure className="w-24 shrink-0">
                {/* biome-ignore lint/performance/noImgElement: cached for offline use by the service worker */}
                <img
                  ref={photoEl}
                  src={photoTry === 1 && photo.fallback ? photo.fallback : photo.url}
                  onError={onPhotoError}
                  alt=""
                  width={96}
                  height={96}
                  className="size-24 rounded-card bg-surface-sunken object-cover ring-1 ring-line"
                  loading="eager"
                  fetchPriority="low"
                  decoding="async"
                />
                <figcaption className="mt-1 text-[12px] leading-tight text-text-muted" lang="en">
                  {photo.credit}
                </figcaption>
              </figure>
            ) : null}
          </div>
        </header>
        <div className="px-5 pb-5 pt-4">
          <h2 className="text-parent-title font-semibold" lang="te">
            {title}
          </h2>
          <p className="mt-1 text-[19px] text-text-muted" lang="te">
            {meta}
          </p>
          {badges ? <div className="mt-3 flex flex-wrap gap-2">{badges}</div> : null}
        </div>
      </div>

      {/* The perforation: a dashed line with a notch cut into each edge. */}
      <div aria-hidden="true" className="relative h-0">
        <div className="absolute inset-x-6 -top-px border-t-2 border-dashed border-line-strong" />
        <div className="absolute -left-3 -top-3 size-6 rounded-full bg-paper ring-1 ring-line" />
        <div className="absolute -right-3 -top-3 size-6 rounded-full bg-paper ring-1 ring-line" />
      </div>

      <div
        className={cn(
          "relative origin-[20%_0%] rounded-b-ticket bg-surface shadow-raised ring-1 ring-line transition-transform duration-500 ease-[cubic-bezier(0.2,0.7,0.2,1)]",
          home && "translate-x-1 translate-y-4 -rotate-[1.6deg] rounded-t-[10px]",
        )}
      >
        <div className={cn("flex flex-wrap items-center gap-3 px-5 py-4 transition-opacity", home && "opacity-35")}>
          {stub}
        </div>
        {home ? (
          <div
            role="status"
            className="pointer-events-none absolute inset-0 flex animate-[stamp_320ms_cubic-bezier(0.2,0.7,0.2,1)_220ms_both] items-center justify-center"
          >
            <span
              className="inline-flex items-center gap-2 rounded-lg border-[3px] border-home-green bg-surface/90 px-4 py-1.5 text-[24px] font-semibold text-home-green-text"
              lang="te"
            >
              <Check aria-hidden="true" className="shrink-0 size-6 stroke-[2.25]" />
              {stampLabel}
            </span>
          </div>
        ) : null}
      </div>
    </article>
  );
}
