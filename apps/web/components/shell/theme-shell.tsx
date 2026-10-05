import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PageTheme = "sky" | "rail" | "sea" | "road" | "home";

/**
 * Sets a page's theme (docs/brand.md, Page themes). The theme picks the accent tokens; the
 * landscape itself is passed in as `backdrop` (a scene, a baked band, or nothing for road).
 */
export function ThemeShell({
  theme,
  backdrop,
  children,
  className,
}: {
  theme: PageTheme;
  backdrop?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div data-theme={theme} className={cn("relative min-h-dvh bg-paper text-text", className)}>
      {backdrop ? (
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-0">
          {backdrop}
        </div>
      ) : null}
      <div className="relative">{children}</div>
    </div>
  );
}
