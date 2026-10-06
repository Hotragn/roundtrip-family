import type { Readiness } from "@roundtrip/core";
import { cn } from "@/lib/utils";

/** What each language can do, in words: shown on Languages and in setup (LanguageReadiness in docs/brand.md). */
export const READINESS: Record<Readiness, string> = {
  ready: "Ready",
  fallback: "General model",
  needs_tuning: "Needs tuning",
  unavailable: "Not available",
};

export function ReadinessChip({ status, children }: { status: Readiness | "phone"; children?: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-chip border px-2 text-[13px] font-medium whitespace-nowrap",
        status === "ready"
          ? "border-line-strong bg-surface text-text"
          : "border-line bg-surface-sunken text-text-muted",
      )}
    >
      {children ?? (status === "phone" ? "On the phone" : READINESS[status])}
    </span>
  );
}
