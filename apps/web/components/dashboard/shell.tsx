import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { ScrollIndicators } from "@/components/shell/scroll-track";
import { ThemeShell } from "@/components/shell/theme-shell";
import { cn } from "@/lib/utils";
import { DashboardNav } from "./nav";
import { ParentPhones } from "./parent-phones";
import { DashboardProviders } from "./providers";

export const HOUSEHOLD_LINKS = [
  { slug: "fremont-demo", label: "Fremont, California", people: "Sarala and Venkat" },
  { slug: "munich-demo", label: "München, Deutschland", people: "Kamala and Raghu" },
] as const;

/** The landscape behind the dashboard: the rail band, or the sea banner on privacy and safety. */
function Band({ theme }: { theme: "rail" | "sea" }) {
  const name = theme === "rail" ? "rail-band" : "sea-banner";
  return (
    <div className="relative h-[112px] overflow-hidden sm:h-[164px]">
      <picture>
        <source
          media="(max-width: 640px)"
          srcSet={`/art/${name}-phone.webp 800w, /art/${name}.webp 1600w`}
          sizes="100vw"
        />
        <img
          src={`/art/${name}.webp`}
          srcSet={`/art/${name}.webp 1600w, /art/${name}@2x.webp 3200w`}
          sizes="100vw"
          alt=""
          className="h-full w-full object-cover object-[50%_58%]"
          fetchPriority="high"
        />
      </picture>
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-paper" />
    </div>
  );
}

/**
 * The dashboard frame: the theme's landscape band, a header on a white panel (the household,
 * the week, their phones) and the section navigation. Each page picks its theme: rail for
 * planning, sea for privacy and safety, home for what they share (warm paper, no landscape and
 * native scrolling; docs/brand.md, Page themes).
 */
export function DashboardShell({
  household,
  weekLabel,
  parents,
  theme = "rail",
  children,
}: {
  household: string;
  weekLabel: string;
  parents: Array<{ id: string; firstName: string }>;
  theme?: "rail" | "sea" | "home";
  children: ReactNode;
}) {
  const current = HOUSEHOLD_LINKS.find((h) => h.slug === household) ?? HOUSEHOLD_LINKS[0];
  return (
    <ThemeShell theme={theme} backdrop={theme === "home" ? undefined : <Band theme={theme} />}>
      <DashboardProviders>
        <div
          className={cn(
            "mx-auto max-w-[1200px] px-4 sm:px-6",
            theme === "home" ? "pt-6 sm:pt-8" : "pt-[64px] sm:pt-[104px] pointer-fine:max-xl:pr-10",
          )}
        >
          <header className="rounded-card bg-surface/97 px-4 py-3 shadow-raised ring-1 ring-line/70 sm:px-6 sm:py-4">
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
              <div className="flex min-w-0 items-center gap-4 sm:gap-6">
                <Link href="/" aria-label="Roundtrip home" className="shrink-0 rounded-md">
                  <Logo height={28} />
                </Link>
                <nav aria-label="Household" className="flex min-w-0 gap-1 rounded-lg bg-surface-sunken p-1">
                  {HOUSEHOLD_LINKS.map((h) => (
                    <Link
                      key={h.slug}
                      href={`/plan/${h.slug}`}
                      aria-current={h.slug === current.slug ? "page" : undefined}
                      className="truncate rounded-md px-3 py-1.5 text-[13px] font-medium text-text-muted transition-colors hover:text-text aria-[current=page]:bg-surface aria-[current=page]:text-text aria-[current=page]:shadow-raised sm:text-sm"
                    >
                      {h.label}
                    </Link>
                  ))}
                </nav>
              </div>
              <div className="flex items-center gap-4">
                <p className="text-sm text-text-muted">
                  <span className="sr-only">Week of </span>
                  {weekLabel}
                  <span className="text-text-muted"> · {current.people} (fictional)</span>
                </p>
                <ParentPhones household={household} parents={parents} />
              </div>
            </div>
          </header>
          <DashboardNav household={household} />
          <main className="pb-24 pt-6">{children}</main>
        </div>
        {theme === "home" ? null : <ScrollIndicators theme={theme} />}
      </DashboardProviders>
    </ThemeShell>
  );
}
