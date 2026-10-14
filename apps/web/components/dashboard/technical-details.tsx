import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { Panel } from "@/components/shell/panel";

/** "In short" for a family member, on a white panel: a few plain lines before any detail. */
export function InShort({ children }: { children: ReactNode }) {
  return (
    <Panel className="max-w-[760px] p-5 sm:p-6">
      <h2 className="text-[20px] font-semibold">In short</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed marker:text-text-muted">{children}</ul>
    </Panel>
  );
}

/** The developer-level detail, closed until asked for. A native <details>, so it works with no script. */
export function TechnicalDetails({ children }: { children: ReactNode }) {
  return (
    <details className="group space-y-8">
      <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 rounded-md text-[20px] font-semibold [&::-webkit-details-marker]:hidden">
        <ChevronDown
          aria-hidden="true"
          className="size-5 -rotate-90 stroke-[1.75] transition-transform group-open:rotate-0 motion-reduce:transition-none"
        />
        Technical details
      </summary>
      {children}
    </details>
  );
}
