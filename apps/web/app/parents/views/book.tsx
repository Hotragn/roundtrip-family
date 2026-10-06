"use client";

import { format } from "date-fns";
import { te } from "date-fns/locale";
import { Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { MemoryBookPage } from "@/components/parents/diary";
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
/**
 * The start of a diary entry, cut between grapheme clusters: cutting by UTF-16 units can split
 * a conjunct or drop a vowel sign, leaving a broken akshara or a dangling virama.
 */
function firstClusters(text: string, n: number): string {
  const clusters = [...new Intl.Segmenter("te", { granularity: "grapheme" }).segment(text)];
  return clusters.length <= n
    ? text
    : `${clusters
        .slice(0, n)
        .map((c) => c.segment)
        .join("")}…`;
}

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
            ...outings.map((o) => ({ id: o.id, label: o.venue, lang: week.household.localLanguage, sub: o.date })),
            ...entries.map((e) => ({
              id: e.id,
              label: e.text ? firstClusters(e.text, 40) : e.kind,
              lang: "te",
              sub: e.createdAt.slice(0, 10),
            })),
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
                <span lang={item.lang}>{item.label}</span>
                <span className="text-[15px] text-text-muted">{item.sub}</span>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={picked.length === 0}
          className="mt-5 flex flex-wrap min-h-14 w-full items-center justify-center gap-3 rounded-xl bg-ink text-parent font-semibold text-white disabled:opacity-50"
          lang="te"
        >
          <Printer aria-hidden="true" className="shrink-0 size-6" />
          {t("Book.print")}
        </button>
      </div>

      <div className="mt-8">
        <MemoryBookPage
          label={t("Book.title")}
          empty={t("Book.empty")}
          items={[
            ...chosenOutings.map((o) => ({
              id: o.id,
              date: format(new Date(`${o.date}T12:00:00`), "EEEE, d MMMM", { locale: te }),
              title: o.cards.find((c) => c.parentId === parent.id)?.title ?? o.venue,
            })),
            ...chosenEntries.map((e) => ({
              id: e.id,
              date: format(new Date(e.createdAt), "d MMMM", { locale: te }),
              text: e.text,
              photo: e.photo,
              feelingWords: e.feelingWords,
            })),
          ]}
        />
      </div>
    </div>
  );
}
