import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * The white panel. Text never sits directly on imagery: it sits on a panel at 95% opacity or
 * more with the raised shadow, so contrast is measured against white (docs/brand.md).
 */
export function Panel({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-card bg-surface/96 shadow-raised ring-1 ring-line/70", className)} {...props} />;
}
