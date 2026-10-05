"use client";

import { BookHeart, House, LifeBuoy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The fixed bar on every screen: I'm home, Diary, I'm lost. Home green and signal red are
 * reserved for exactly these two actions. Each target is at least 64 px tall.
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
  const base =
    "flex min-h-16 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[17px] font-semibold leading-tight transition-colors";
  return (
    <nav
      aria-label="Roundtrip"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/97 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="mx-auto flex max-w-[480px] gap-2 px-3 py-2" lang="te">
        <button
          type="button"
          onClick={onHome}
          className={cn(base, homeActive ? "bg-home-green text-white" : "text-home-green-text hover:bg-surface-sunken")}
        >
          <House aria-hidden="true" className="size-6 stroke-[1.75]" />
          {labels.home}
        </button>
        <button
          type="button"
          onClick={onDiary}
          aria-current={current === "diary" ? "page" : undefined}
          className={cn(base, "text-text hover:bg-surface-sunken", current === "diary" && "bg-surface-sunken")}
        >
          <BookHeart aria-hidden="true" className="size-6 stroke-[1.75]" />
          {labels.diary}
        </button>
        <button
          type="button"
          onClick={onLost}
          aria-current={current === "lost" ? "page" : undefined}
          className={cn(base, "text-signal-text hover:bg-surface-sunken", current === "lost" && "bg-surface-sunken")}
        >
          <LifeBuoy aria-hidden="true" className="size-6 stroke-[1.75]" />
          {labels.lost}
        </button>
      </div>
    </nav>
  );
}
