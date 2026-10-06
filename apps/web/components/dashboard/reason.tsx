import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Reason chips: what TabPFN's leave-one-feature-out found pushing a suggestion up (for) or down
 * (against). "For" takes the theme's accent; "against" stays neutral, never red: these are
 * trade-offs, not warnings.
 */
export function ReasonChips({
  chips,
  max,
  size = "md",
}: {
  chips: Array<{ label: string; direction: string }>;
  max?: number;
  size?: "sm" | "md";
}) {
  const shown = max ? chips.slice(0, max) : chips;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {shown.map((c) => {
        const forIt = c.direction === "for";
        return (
          <li
            key={c.label}
            className={cn(
              "inline-flex items-center gap-1 rounded-chip leading-tight",
              size === "sm" ? "px-2 py-1 text-[13px]" : "px-2.5 py-1 text-[14px]",
              forIt ? "bg-accent-line/10 text-accent-text" : "bg-surface-sunken text-text-muted",
            )}
          >
            {forIt ? (
              <Plus aria-label="For" className="size-3 shrink-0 stroke-[2.25]" />
            ) : (
              <Minus aria-label="Against" className="size-3 shrink-0 stroke-[2.25]" />
            )}
            {c.label}
          </li>
        );
      })}
    </ul>
  );
}

/** The fallback ladder level as a short, plain label: how close this is to their own language. */
export function LadderBadge({ level, label, size = "md" }: { level: number; label: string; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-chip bg-surface-sunken font-medium text-text",
        size === "sm" ? "px-2 py-1 text-[13px]" : "px-2.5 py-1 text-[14px]",
      )}
      title={`Fallback ladder level ${level} of 5`}
    >
      <span aria-hidden="true" className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={cn("h-2 w-1 rounded-full", n >= level ? "bg-accent-line" : "bg-line-strong/60")} />
        ))}
      </span>
      {label}
    </span>
  );
}
