"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const SECTIONS = [
  { path: "", label: "This week" },
  { path: "/their-week", label: "Their week" },
  { path: "/shared", label: "Shared with you" },
  { path: "/people", label: "People and places" },
  { path: "/privacy", label: "Privacy" },
  { path: "/safety", label: "Safety" },
  { path: "/languages", label: "Languages" },
  { path: "/setup", label: "Setup" },
] as const;

/** Section tabs under the header; scrolls sideways on a phone. */
export function DashboardNav({ household }: { household: string }) {
  const pathname = usePathname();
  const base = `/plan/${household}`;
  return (
    <nav aria-label="Sections" className="-mx-4 mt-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {SECTIONS.map((s) => {
          const href = `${base}${s.path}`;
          const active = pathname === href;
          return (
            <li key={s.label}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-11 items-center px-3 text-[15px] font-medium text-text-muted transition-colors hover:text-text",
                  active &&
                    "text-text after:absolute after:inset-x-2 after:-bottom-px after:h-[3px] after:rounded-full after:bg-accent-line",
                )}
              >
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
