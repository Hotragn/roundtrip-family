"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The themed scroll indicators (docs/brand.md, Scroll indicators). On a precise pointer the
 * track replaces the visible scrollbar: the handle shows where you are, can be dragged, and a
 * click on the track jumps there. Touch screens keep native scrolling with a thin progress line.
 * Both are decorative (aria-hidden): wheel, keys and touch scroll natively as always. Handles
 * move by transform only, read straight from the scroll position, so nothing eases.
 *
 * Rail: the baked track down the right edge with a train nose as the handle. Sea: a slim
 * waterline along the bottom with a ferry riding it. Sky: a fine dotted flight path along the
 * top with the aircraft.
 */
export type TrackTheme = "sky" | "rail" | "sea";

interface Art {
  vertical: boolean;
  /** Track thickness and handle size in CSS pixels. */
  thickness: number;
  handle: { src: string; w: number; h: number };
  track?: { src: string; tile: [number, number] };
}

const ART: Record<TrackTheme, Art> = {
  rail: {
    vertical: true,
    thickness: 24,
    handle: { src: "/art/train-front@2x.webp", w: 24, h: 69 },
    track: { src: "/art/rail-track@2x.webp", tile: [24, 32] },
  },
  sea: {
    vertical: false,
    thickness: 7,
    handle: { src: "/art/ferry@2x.webp", w: 64, h: 20 },
    track: { src: "/art/water-strip@2x.webp", tile: [112, 7] },
  },
  sky: {
    vertical: false,
    thickness: 2,
    handle: { src: "/art/aircraft@2x.webp", w: 72, h: 20 },
  },
};

const ACCENT: Record<TrackTheme, string> = {
  rail: "bg-rail-line",
  sea: "bg-sea-line",
  sky: "bg-sky-line",
};

/** The page's scroll position as 0 to 1, pushed to subscribers once a frame (no re-render per frame). */
function useScrollProgress() {
  const [scrollable, setScrollable] = useState(false);
  const listeners = useRef(new Set<(p: number) => void>());
  const last = useRef(0);
  const subscribe = useRef((fn: (p: number) => void) => {
    listeners.current.add(fn);
    fn(last.current);
    return () => {
      listeners.current.delete(fn);
    };
  }).current;
  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setScrollable(max > 8);
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      last.current = p;
      for (const fn of listeners.current) fn(p);
    };
    const queue = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    // Content that grows after load (images, a sheet's list) changes the page height.
    const ro = new ResizeObserver(queue);
    ro.observe(document.body);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
      ro.disconnect();
    };
  }, []);
  return { scrollable, subscribe };
}

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function ScrollTrack({ theme }: { theme: TrackTheme }) {
  const art = ART[theme];
  const { scrollable, subscribe } = useScrollProgress();
  const trackRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);

  // The themed track stands in for the scrollbar while it's on the page.
  useEffect(() => {
    document.documentElement.dataset.scrollTrack = art.vertical ? "edge" : "line";
    return () => {
      delete document.documentElement.dataset.scrollTrack;
    };
  }, [art.vertical]);

  useEffect(() => {
    if (!scrollable) return;
    const place = (p: number) => {
      const track = trackRef.current;
      const handle = handleRef.current;
      if (!track || !handle) return;
      const room = art.vertical ? track.clientHeight - art.handle.h : track.clientWidth - art.handle.w;
      const at = Math.round(p * Math.max(0, room));
      handle.style.transform = art.vertical ? `translate3d(0, ${at}px, 0)` : `translate3d(${at}px, 0, 0)`;
    };
    return subscribe(place);
  }, [art, scrollable, subscribe]);

  function scrollToPointer(clientX: number, clientY: number, grabOffset: number, smooth: boolean) {
    const track = trackRef.current;
    if (!track) return;
    const box = track.getBoundingClientRect();
    const size = art.vertical ? art.handle.h : art.handle.w;
    const room = (art.vertical ? box.height : box.width) - size;
    const pos = (art.vertical ? clientY - box.top : clientX - box.left) - grabOffset;
    const p = room > 0 ? Math.min(1, Math.max(0, pos / room)) : 0;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: p * max, behavior: smooth && !reducedMotion() ? "smooth" : "instant" });
  }

  function onHandleDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const box = handle.getBoundingClientRect();
    const grab = art.vertical ? e.clientY - box.top : e.clientX - box.left;
    const move = (ev: PointerEvent) => scrollToPointer(ev.clientX, ev.clientY, grab, false);
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  }

  function onTrackDown(e: React.PointerEvent<HTMLDivElement>) {
    const size = art.vertical ? art.handle.h : art.handle.w;
    scrollToPointer(e.clientX, e.clientY, size / 2, true);
  }

  if (!scrollable) return null;
  return (
    <div
      aria-hidden="true"
      data-scroll-indicator=""
      className={cn(
        "fixed z-30 hidden select-none pointer-fine:block print:hidden",
        art.vertical && "inset-y-2 right-1.5",
        theme === "sky" && "inset-x-3 top-1.5",
        // The waterline is a slim dock along the bottom, so the ferry never sits over text.
        theme === "sea" &&
          "inset-x-0 bottom-0 bg-paper/95 px-3 pb-1.5 pt-1 shadow-[0_-1px_0_var(--color-line)] backdrop-blur-sm",
      )}
      style={art.vertical ? { width: art.thickness } : { height: art.handle.h + (theme === "sea" ? 10 : 0) }}
    >
      <div
        ref={trackRef}
        onPointerDown={onTrackDown}
        className={cn("relative h-full w-full cursor-pointer", art.vertical ? "" : "flex items-end")}
      >
        {art.track ? (
          <div
            className={cn(
              "absolute opacity-90",
              art.vertical ? "inset-0 rounded-[3px]" : "inset-x-0 bottom-0 rounded-full",
            )}
            style={{
              backgroundImage: `url(${art.track.src})`,
              backgroundSize: `${art.track.tile[0]}px ${art.track.tile[1]}px`,
              backgroundRepeat: art.vertical ? "repeat-y" : "repeat-x",
              ...(art.vertical ? {} : { height: art.thickness }),
            }}
          />
        ) : (
          // The flight path: a fine dotted line in the sky accent.
          <div className="absolute inset-x-0 top-1/2 h-0 border-t-2 border-dotted border-sky-line/70" />
        )}
        <div
          ref={handleRef}
          onPointerDown={onHandleDown}
          className={cn(
            "absolute left-0 top-0 cursor-grab touch-none active:cursor-grabbing",
            theme === "sea" && "bottom-[2px] top-auto",
          )}
          style={{ width: art.handle.w, height: art.handle.h, willChange: "transform" }}
        >
          {/* biome-ignore lint/performance/noImgElement: a small baked sprite, already at its display size */}
          <img
            src={art.handle.src}
            alt=""
            draggable={false}
            // Hidden on touch screens, so it isn't fetched there.
            loading="lazy"
            width={art.handle.w}
            height={art.handle.h}
            className="pointer-events-none size-full drop-shadow-[0_1px_1.5px_rgb(31_42_68/0.35)]"
          />
        </div>
      </div>
    </div>
  );
}

/** Touch screens: a thin line across the top in the theme's accent, filling as you scroll. */
export function ProgressLine({ theme }: { theme: TrackTheme }) {
  const { scrollable, subscribe } = useScrollProgress();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!scrollable) return;
    return subscribe((p) => {
      if (ref.current) ref.current.style.transform = `scaleX(${p})`;
    });
  }, [scrollable, subscribe]);
  if (!scrollable) return null;
  return (
    <div
      aria-hidden="true"
      data-scroll-indicator=""
      className="fixed inset-x-0 top-0 z-30 h-[3px] pointer-fine:hidden print:hidden"
    >
      <div ref={ref} className={cn("h-full origin-left", ACCENT[theme])} style={{ transform: "scaleX(0)" }} />
    </div>
  );
}

const TOP_ART: Record<TrackTheme, { src: string; w: number; h: number; tilt: string }> = {
  rail: { src: "/art/train-front@2x.webp", w: 14, h: 40, tilt: "rotate-180" },
  sea: { src: "/art/ferry@2x.webp", w: 40, h: 12.5, tilt: "" },
  sky: { src: "/art/aircraft@2x.webp", w: 40, h: 11, tilt: "-rotate-[18deg]" },
};

/** Back to the top: the theme's vehicle, small, in the bottom corner, once you've scrolled a way down. */
export function BackToTop({ theme }: { theme: TrackTheme }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const check = () => setShown(window.scrollY > window.innerHeight * 0.9);
    check();
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, []);
  const art = TOP_ART[theme];
  return (
    <button
      type="button"
      aria-label="Back to top"
      title="Back to top"
      data-scroll-indicator=""
      tabIndex={shown ? 0 : -1}
      onClick={() => window.scrollTo({ top: 0, behavior: reducedMotion() ? "instant" : "smooth" })}
      className={cn(
        "fixed z-30 flex size-12 items-center justify-center rounded-full bg-surface shadow-raised ring-1 ring-line transition-opacity duration-200 hover:ring-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none print:hidden",
        theme === "rail" && "bottom-5 right-12 pointer-coarse:right-4",
        theme === "sea" && "bottom-12 right-5 pointer-coarse:bottom-5",
        theme === "sky" && "bottom-5 right-5",
        shown ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      {/* biome-ignore lint/performance/noImgElement: a small baked sprite */}
      <img
        src={art.src}
        alt=""
        width={art.w}
        height={art.h}
        className={cn("pointer-events-none", art.tilt)}
        style={{ width: art.w, height: art.h }}
      />
    </button>
  );
}

/** The track, the touch line and the back-to-top button for one theme. */
export function ScrollIndicators({ theme }: { theme: TrackTheme }) {
  return (
    <>
      <ScrollTrack theme={theme} />
      <ProgressLine theme={theme} />
      <BackToTop theme={theme} />
    </>
  );
}
