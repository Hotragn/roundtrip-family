"use client";

import { format } from "date-fns";
import { te } from "date-fns/locale";
import { Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { Mark } from "@/components/brand/logo";
import { getKv, setKv } from "@/lib/parents-store";
import { cn } from "@/lib/utils";
import { useParents } from "../context";
import { type LocalEntry, loadEntries, syncEntry } from "./diary";

/**
 * The memory book: the parent chooses entries and outing tickets, and the app lays them out as
 * a printable book in their own words, exactly as written. White paper, ink, Hind Guntur.
 * Choices stay on the phone; a diary entry's place in the book travels with the entry, so a
 * shared entry the parent puts in the book shows in their child's copy too.
 */
export function BookView() {
  const { parent, outings, t, week, diarySeeds } = useParents();
  const [entries, setEntries] = useState<LocalEntry[]>([]);
  const [pickedOutings, setPickedOutings] = useState<string[]>([]);
  const outingKey = `book-outings:${parent.id}`;
  useEffect(() => {
    loadEntries(parent.id, diarySeeds).then(setEntries);
    getKv<string[]>(outingKey).then((p) => setPickedOutings(p ?? []));
  }, [parent.id, diarySeeds, outingKey]);
  const picked = [...pickedOutings, ...entries.filter((e) => e.inMemoryBook).map((e) => e.id)];
  const toggle = async (id: string) => {
    if (outings.some((o) => o.id === id)) {
      const next = pickedOutings.includes(id) ? pickedOutings.filter((x) => x !== id) : [...pickedOutings, id];
      setPickedOutings(next);
      await setKv(outingKey, next);
      return;
    }
    const next = entries.map((e) => (e.id === id ? { ...e, inMemoryBook: !e.inMemoryBook } : e));
    setEntries(next);
    await setKv(`diary:${parent.id}`, next);
    await syncEntry(week.household.slug, parent.id, id, "save");
  };
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
                onClick={() => void toggle(item.id)}
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
