"use client";

import { BookHeart, House, LifeBuoy } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * The fixed bar on every screen: I'm home, Diary, I'm lost. Home green and signal red are
 * reserved for exactly these two actions. Each target is at least 64 px tall.
 *
 * The bar grows when the phone's text is large, so it publishes its height as --parents-bar:
 * the page keeps that much room below its content, and keyboard focus scrolls clear of it.
 */
export function BottomBar({
  labels,
  onHome,
  onDiary,
  onLost,
  homeActive,
  current,
}: {
  labels: { home: string; diary: string; lost: string };
  onHome: () => void;
  onDiary: () => void;
  onLost: () => void;
  homeActive: boolean;
  current?: "diary" | "lost";
}) {
  const bar = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const root = document.documentElement;
    const ro = new ResizeObserver(() => {
      const h = Math.ceil(el.offsetHeight);
      root.style.setProperty("--parents-bar", `${h}px`);
      root.style.scrollPaddingBottom = `${h + 16}px`;
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--parents-bar");
      root.style.scrollPaddingBottom = "";
    };
  }, []);
  const base =
    "flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-center text-[17px] @max-[300px]:px-0 font-semibold transition-colors";
  return (
    <nav
      ref={bar}
      aria-label="Roundtrip"
      className="@container fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/97 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      {/* On a narrow screen (large text) the buttons take the full width, so each label
          keeps whole words. */}
      <div className="mx-auto flex max-w-[480px] gap-2 px-3 py-2 @max-[300px]:gap-0.5 @max-[300px]:px-1" lang="te">
        <button
          type="button"
          onClick={onHome}
          className={cn(base, homeActive ? "bg-home-green text-white" : "text-home-green-text hover:bg-surface-sunken")}
        >
          <House aria-hidden="true" className="shrink-0 size-6 stroke-[1.75]" />
          {labels.home}
        </button>
        <button
          type="button"
          onClick={onDiary}
          aria-current={current === "diary" ? "page" : undefined}
          className={cn(base, "text-text hover:bg-surface-sunken", current === "diary" && "bg-surface-sunken")}
        >
          <BookHeart aria-hidden="true" className="shrink-0 size-6 stroke-[1.75]" />
          {labels.diary}
        </button>
        <button
          type="button"
          onClick={onLost}
          aria-current={current === "lost" ? "page" : undefined}
          className={cn(base, "text-signal-text hover:bg-surface-sunken", current === "lost" && "bg-surface-sunken")}
        >
          <LifeBuoy aria-hidden="true" className="shrink-0 size-6 stroke-[1.75]" />
          {labels.lost}
        </button>
      </div>
    </nav>
  );
}
