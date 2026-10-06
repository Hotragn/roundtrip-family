import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Server-only versions of a few shared pieces, for a page that is otherwise static.
 * components/ui/button.tsx imports Base UI's Button and lucide's icons are client components,
 * so importing either ships and hydrates their code here. These render to plain HTML and SVG.
 * The classes follow the shared Button and Chip; keep them in step.
 */

const BUTTON = [
  "inline-flex h-13 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-6 text-lg font-semibold select-none",
  "transition-[background-color,box-shadow,transform,color] duration-150 ease-paper active:translate-y-px",
].join(" ");

/** The one main action: marigold with ink text. */
export const primaryButton = cn(
  BUTTON,
  "bg-bus text-on-bus shadow-[inset_0_-1px_0_rgba(31,42,68,0.14)] hover:bg-[color-mix(in_oklab,var(--bus),var(--ink)_8%)]",
);

export const secondaryButton = cn(BUTTON, "border border-line-strong bg-surface text-text hover:bg-surface-sunken");

const ICON = "shrink-0 fill-none stroke-current stroke-[2] [stroke-linecap:round] [stroke-linejoin:round]";

export function CheckIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={cn(ICON, className)}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function LockIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={cn(ICON, "stroke-[1.75]", className)}>
      <rect x="4.5" y="11" width="15" height="10" rx="2" />
      <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
    </svg>
  );
}

/** A reason chip, as on the dashboard: "for" in sea with a plus, "against" neutral with a minus. */
export function ReasonChip({ tone, children }: { tone: "for" | "against"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-chip border px-2.5 text-xs font-medium whitespace-nowrap",
        tone === "for"
          ? "border-sea-line/35 bg-sea-line/8 text-sea-text"
          : "border-line bg-surface-sunken text-text-muted",
      )}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className={cn(ICON, "size-3.5")}>
        {tone === "for" ? <path d="M5 12h14M12 5v14" /> : <path d="M5 12h14" />}
      </svg>
      {children}
    </span>
  );
}
