"use client";

import type { DataClass, OutboundRoute } from "@roundtrip/core/privacy";
import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The live "where data goes" table: every outside service the code can reach, generated from
 * the outbound registry (packages/core/src/privacy/outbound.ts) that every call goes through.
 * TanStack Table v9 keeps the sorting; the markup is ours.
 * Docs: node_modules/@tanstack/react-table/skills/getting-started/SKILL.md
 */

export const WHEN: Record<OutboundRoute["when"], string> = {
  runtime: "While the app runs",
  build: "Only when the demo is built",
  browser: "From the browser",
};

export const DATA_CLASS: Record<DataClass, { label: string; hint: string }> = {
  public: { label: "Public", hint: "Search terms with language, interest and area, and public listings" },
  synthetic: { label: "Fictional family", hint: "The demo households and what's generated from them" },
  anonymized: { label: "Anonymized", hint: "Names, contacts, addresses, quotes and ratings removed" },
  personal: { label: "Family data", hint: "Real family data: only in the household's own database" },
};

const WHEN_ORDER: Record<OutboundRoute["when"], number> = { runtime: 0, browser: 1, build: 2 };

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
});
const helper = createColumnHelper<typeof features, OutboundRoute>();
const columns = helper.columns([
  helper.accessor("service", { header: "Service", sortFn: "alphanumeric" }),
  helper.accessor("purpose", { header: "What it's for", enableSorting: false }),
  helper.accessor("sends", { header: "What it receives", enableSorting: false }),
  helper.accessor((r) => r.accepts.join(" "), { id: "accepts", header: "Data it may carry", enableSorting: false }),
  helper.accessor((r) => WHEN_ORDER[r.when], { id: "when", header: "When" }),
]);

function Classes({ accepts }: { accepts: DataClass[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {accepts.map((c) => (
        <li
          key={c}
          title={DATA_CLASS[c].hint}
          className={cn(
            "rounded-chip border px-2 py-0.5 text-[12px] font-medium whitespace-nowrap",
            c === "personal" ? "border-ink/40 bg-ink/5 text-text" : "border-line bg-surface text-text-muted",
          )}
        >
          {DATA_CLASS[c].label}
        </li>
      ))}
    </ul>
  );
}

const FILTERS: Array<{ id: "all" | OutboundRoute["when"]; label: string }> = [
  { id: "all", label: "All" },
  { id: "runtime", label: "While the app runs" },
  { id: "browser", label: "From the browser" },
  { id: "build", label: "Build only" },
];

export function PrivacyTable({ routes }: { routes: OutboundRoute[] }) {
  const [when, setWhen] = useState<(typeof FILTERS)[number]["id"]>("all");
  const data = useMemo(() => (when === "all" ? routes : routes.filter((r) => r.when === when)), [routes, when]);
  const table = useTable({
    features,
    columns,
    data,
    initialState: { sorting: [{ id: "when", desc: false }] },
  });
  const rows = table.getRowModel().rows;

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Show services" className="flex flex-wrap gap-1 rounded-lg bg-surface-sunken p-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={when === f.id}
            onClick={() => setWhen(f.id)}
            className="rounded-md px-3 py-1.5 text-[13px] font-medium text-text-muted transition-colors hover:text-text aria-pressed:bg-surface aria-pressed:text-text aria-pressed:shadow-raised"
          >
            {f.label}
            <span className="ml-1.5 tabular-nums text-text-muted">
              {f.id === "all" ? routes.length : routes.filter((r) => r.when === f.id).length}
            </span>
          </button>
        ))}
      </div>

      {/* Wide screens: the table. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left text-[14px]">
          <caption className="sr-only">Every outside service Roundtrip can reach, and what each may receive</caption>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} className="border-b border-line-strong">
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const canSort = header.column.getCanSort();
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                      className="whitespace-nowrap px-3 py-2.5 text-[13px] font-semibold first:pl-0"
                    >
                      {canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-text"
                        >
                          <table.FlexRender header={header} />
                          {sorted === "asc" ? (
                            <ArrowUp aria-hidden="true" className="size-3.5" />
                          ) : sorted === "desc" ? (
                            <ArrowDown aria-hidden="true" className="size-3.5" />
                          ) : (
                            <ArrowUpDown aria-hidden="true" className="size-3.5 text-text-muted" />
                          )}
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row) => {
              const r = row.original;
              return (
                <tr key={row.id} className="border-b border-line align-top last:border-0">
                  <td className="w-[22%] py-3 pr-3">
                    <a
                      href={r.docs}
                      target="_blank"
                      rel="noreferrer"
                      className="group inline-flex items-start gap-1 font-semibold leading-snug hover:underline"
                    >
                      {r.service}
                      <ExternalLink aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-text-muted" />
                      <span className="sr-only"> (its documentation)</span>
                    </a>
                    <p className="mt-1 break-all font-mono text-[12px] text-text-muted">{r.hosts.join(", ")}</p>
                  </td>
                  <td className="w-[20%] px-3 py-3 leading-snug">{r.purpose}</td>
                  <td className="w-[28%] px-3 py-3 leading-snug text-text-muted">{r.sends}</td>
                  <td className="w-[18%] px-3 py-3">
                    <Classes accepts={r.accepts} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-[13px]">{WHEN[r.when]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Phones: one card per service, in the same order. */}
      <ul className="space-y-3 md:hidden">
        {rows.map((row) => {
          const r = row.original;
          return (
            <li key={row.id} className="space-y-2 rounded-card p-4 ring-1 ring-line">
              <div className="flex items-start justify-between gap-3">
                <a
                  href={r.docs}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold leading-snug hover:underline"
                >
                  {r.service}
                </a>
                <span className="shrink-0 text-[12px] text-text-muted">{WHEN[r.when]}</span>
              </div>
              <p className="text-[14px] leading-snug">{r.purpose}</p>
              <p className="text-[14px] leading-snug text-text-muted">{r.sends}</p>
              <Classes accepts={r.accepts} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
