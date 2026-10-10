"use client";

import { Smartphone } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Opens a parent's phone (the parents' app) for this household, to see what they see. */
export function ParentPhones({
  household,
  parents,
}: {
  household: string;
  parents: Array<{ id: string; firstName: string }>;
}) {
  return (
    <Popover>
      <PopoverTrigger className="inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-md border border-line-strong bg-surface px-3 text-sm font-semibold text-text transition-colors hover:bg-surface-sunken">
        <Smartphone aria-hidden="true" className="size-4 stroke-[1.75]" />
        Their phones
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 rounded-card border-line bg-surface p-2 shadow-overlay">
        <p className="px-2 pb-2 pt-1 text-[13px] text-text-muted">Opens their app as it looks on their phone today.</p>
        <ul>
          {parents.map((p) => (
            <li key={p.id}>
              <a
                href={`/parents/${household}/${p.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-md px-2 py-2 text-[15px] font-medium hover:bg-surface-sunken"
              >
                {p.firstName}&rsquo;s phone
                <span className="text-[13px] font-normal text-text-muted">Opens in a new tab</span>
              </a>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
