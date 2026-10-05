"use client";

import { format } from "date-fns";
import { te } from "date-fns/locale";
import { Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { Mark } from "@/components/brand/logo";
import { getKv } from "@/lib/parents-store";
import { cn } from "@/lib/utils";
import { useParents } from "../context";
import type { LocalEntry } from "./diary";

/**
 * The memory book: the parent chooses entries and outing tickets, and the app lays them out as
 * a printable book in their own words, exactly as written. White paper, ink, Hind Guntur.
 */
export function BookView() {
  const { parent, outings, t } = useParents();
  const [entries, setEntries] = useState<LocalEntry[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => {
    getKv<LocalEntry[]>(`diary:${parent.id}`).then((e) => setEntries(e ?? []));
  }, [parent.id]);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const chosenEntries = entries.filter((e) => picked.includes(e.id));
  const chosenOutings = outings.filter((o) => picked.includes(o.id));
  return (
    <div data-theme="home" className="-mx-5 -mt-4 bg-paper px-5 pb-8 pt-4">
      <div className="print:hidden">
        <h1 className="text-[34px] font-semibold" lang="te">
          {t("Book.title")}
        </h1>
        <p className="mt-2 text-parent text-text-muted" lang="te">
          {t("Book.pick")}
        </p>
        <ul className="mt-4 space-y-2">
          {[
            ...outings.map((o) => ({ id: o.id, label: o.venue, sub: o.date })),
            ...entries.map((e) => ({ id: e.id, label: e.text?.slice(0, 40) ?? e.kind, sub: e.createdAt.slice(0, 10) })),
          ].map((item) => (
            <li key={item.id}>
              <button
                type="button"
                aria-pressed={picked.includes(item.id)}
                onClick={() => toggle(item.id)}
                className={cn(
                  "flex min-h-14 w-full items-center justify-between rounded-xl border px-4 text-left text-[19px]",
                  picked.includes(item.id) ? "border-ink bg-surface font-semibold" : "border-line bg-surface",
                )}
                lang="te"
              >
                <span>{item.label}</span>
                <span className="text-[15px] text-text-muted">{item.sub}</span>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={picked.length === 0}
          className="mt-5 flex min-h-14 w-full items-center justify-center gap-3 rounded-xl bg-ink text-parent font-semibold text-white disabled:opacity-50"
          lang="te"
        >
          <Printer aria-hidden="true" className="size-6" />
          {t("Book.print")}
        </button>
      </div>

      <section
        aria-label={t("Book.title")}
        className="mt-8 rounded-card bg-[#fffdf9] p-6 shadow-raised ring-1 ring-line print:mt-0 print:shadow-none print:ring-0"
      >
        {picked.length === 0 ? (
          <p className="text-parent text-text-muted" lang="te">
            {t("Book.empty")}
          </p>
        ) : (
          <div className="space-y-8" lang="te">
            {chosenOutings.map((o) => (
              <article key={o.id} className="break-inside-avoid">
                <p className="text-[16px] text-text-muted">
                  {format(new Date(`${o.date}T12:00:00`), "EEEE, d MMMM", { locale: te })}
                </p>
                <h2 className="text-[26px] font-semibold">
                  {o.cards.find((c) => c.parentId === parent.id)?.title ?? o.venue}
                </h2>
              </article>
            ))}
            {chosenEntries.map((e) => (
              <article key={e.id} className="break-inside-avoid">
                <p className="text-[16px] text-text-muted">{format(new Date(e.createdAt), "d MMMM", { locale: te })}</p>
                {e.text ? <p className="mt-1 text-[22px] leading-[1.7]">{e.text}</p> : null}
                {e.photo ? (
                  // biome-ignore lint/performance/noImgElement: the parent's own photo
                  <img src={e.photo} alt="" className="mt-2 max-h-72 rounded-md object-cover" />
                ) : null}
                {e.feelingWords.length ? (
                  <p className="mt-1 text-[18px] text-text-muted">{e.feelingWords.join(" · ")}</p>
                ) : null}
              </article>
            ))}
            <footer className="flex justify-end pt-4">
              <Mark size={20} title={null} />
            </footer>
          </div>
        )}
      </section>
    </div>
  );
}
