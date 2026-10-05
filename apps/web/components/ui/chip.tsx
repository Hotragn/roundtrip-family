import { Minus, Plus } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Reason chips and small labels. "Against" stays neutral: signal red is reserved for "I'm lost". */
export function Chip({
  className,
  tone = "neutral",
  children,
  ...props
}: ComponentProps<"span"> & { tone?: "neutral" | "for" | "against" | "accent" }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-chip border px-2.5 text-xs font-medium whitespace-nowrap",
        tone === "neutral" && "border-line bg-surface text-text-muted",
        tone === "for" && "border-sea-line/35 bg-sea-line/8 text-sea-text",
        tone === "against" && "border-line bg-surface-sunken text-text-muted",
        tone === "accent" && "border-accent-line/40 bg-surface text-accent-text",
        className,
      )}
      {...props}
    >
      {tone === "for" ? <Plus aria-hidden="true" className="size-3.5 stroke-[2]" /> : null}
      {tone === "against" ? <Minus aria-hidden="true" className="size-3.5 stroke-[2]" /> : null}
      {children}
    </span>
  );
}
