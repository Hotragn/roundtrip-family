"use client";

import { format } from "date-fns";
import { te } from "date-fns/locale";
import { Lock, Share2, Trash2 } from "lucide-react";
import { Mark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

/**
 * DiaryEntry and MemoryBookPage (docs/brand.md, Components). An entry is clearly marked private
 * or shared, plays its recording, and carries the parent's own share and delete controls. The
 * book page sets their words exactly as written on paper, ready to print.
 */

export interface DiaryEntryView {
  id: string;
  createdAt: string;
  text?: string;
  photo?: string;
  /** An object URL for a recording made on the phone, or a saved clip's URL. */
  audioSrc?: string;
  feelingWords: string[];
  shared: boolean;
}

export function DiaryEntryCard({
  entry,
  labels,
  onShare,
  onDelete,
}: {
  entry: DiaryEntryView;
  labels: { shared: string; private: string; share: string; unshare: string; delete: string };
  onShare: () => void;
  onDelete: () => void;
}) {
  const e = entry;
  return (
    <li className="rounded-card bg-surface p-4 ring-1 ring-line">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[16px] text-text-muted" lang="te">
          {format(new Date(e.createdAt), "d MMMM, HH:mm", { locale: te })}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[15px] font-medium",
            e.shared ? "bg-sky-line/12 text-sky-text" : "bg-surface-sunken text-text-muted",
          )}
          lang="te"
        >
          {e.shared ? <Share2 aria-hidden="true" className="size-4" /> : <Lock aria-hidden="true" className="size-4" />}
          {e.shared ? labels.shared : labels.private}
        </span>
      </div>
      {e.text ? (
        <p className="mt-2 text-parent" lang="te">
          {e.text}
        </p>
      ) : null}
      {e.audioSrc ? <audio controls src={e.audioSrc} className="mt-2 w-full" /> : null}
      {e.photo ? (
        // biome-ignore lint/performance/noImgElement: a local photo from the diary
        <img src={e.photo} alt="" className="mt-2 max-h-48 rounded-lg object-cover" />
      ) : null}
      {e.feelingWords.length ? (
        <p className="mt-2 text-[18px] text-text-muted" lang="te">
          {e.feelingWords.join(" · ")}
        </p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onShare}
          className="min-h-12 flex-1 rounded-lg border border-line-strong text-[17px] font-medium"
          lang="te"
        >
          {e.shared ? labels.unshare : labels.share}
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={labels.delete}
          className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-line-strong px-4 text-[17px] font-medium"
          lang="te"
        >
          <Trash2 aria-hidden="true" className="size-5" />
          {labels.delete}
        </button>
      </div>
    </li>
  );
}

export interface BookItem {
  id: string;
  /** "d MMMM" style date line, already in Telugu. */
  date: string;
  title?: string;
  text?: string;
  photo?: string;
  feelingWords?: string[];
}

export function MemoryBookPage({ items, label, empty }: { items: BookItem[]; label: string; empty: string }) {
  return (
    <section
      aria-label={label}
      className="rounded-card bg-[#fffdf9] p-6 shadow-raised ring-1 ring-line print:mt-0 print:shadow-none print:ring-0"
    >
      {items.length === 0 ? (
        <p className="text-parent text-text-muted" lang="te">
          {empty}
        </p>
      ) : (
        <div className="space-y-8" lang="te">
          {items.map((it) => (
            <article key={it.id} className="break-inside-avoid">
              <p className="text-[16px] text-text-muted">{it.date}</p>
              {it.title ? <h2 className="text-[26px] font-semibold">{it.title}</h2> : null}
              {it.text ? <p className="mt-1 text-[22px] leading-[1.7]">{it.text}</p> : null}
              {it.photo ? (
                // biome-ignore lint/performance/noImgElement: the parent's own photo
                <img src={it.photo} alt="" className="mt-2 max-h-72 rounded-md object-cover" />
              ) : null}
              {it.feelingWords?.length ? (
                <p className="mt-1 text-[18px] text-text-muted">{it.feelingWords.join(" · ")}</p>
              ) : null}
            </article>
          ))}
          <footer className="flex justify-end pt-4">
            <Mark size={20} title={null} />
          </footer>
        </div>
      )}
    </section>
  );
}
