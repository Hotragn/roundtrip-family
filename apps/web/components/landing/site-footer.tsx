import Link from "next/link";
import { Mark } from "@/components/brand/logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-paper">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="flex items-center gap-3">
          <Mark size={32} title={null} />
          <div>
            <div className="text-base font-semibold">Roundtrip</div>
            <div className="text-sm text-text-muted">Weekdays out, safely home.</div>
          </div>
        </div>
        <nav aria-label="More" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link href="/plan" className="rounded-md text-text-muted underline-offset-4 hover:text-text hover:underline">
            Dashboard
          </Link>
          <a
            href="/parents/fremont-demo/p_sarala"
            className="rounded-md text-text-muted underline-offset-4 hover:text-text hover:underline"
          >
            Parents' app
          </a>
        </nav>
      </div>
    </footer>
  );
}
