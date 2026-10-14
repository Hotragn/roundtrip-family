"use client";

import { format } from "date-fns";
import { te } from "date-fns/locale";
import { Lock, Pause, Play, Share2, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
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
  labels: {
    shared: string;
    private: string;
    share: string;
    unshare: string;
    delete: string;
    /** Asked after the first tap on delete, so one shaky tap never erases an entry. */
    confirmDelete: string;
    keep: string;
    /** The recording's play button ("Listen") and, while it plays, its pause button ("Stop"). */
    recording?: string;
    stopRecording?: string;
  };
  onShare: () => void;
  onDelete: () => void;
}) {
  const e = entry;
  const [confirming, setConfirming] = useState(false);
  return (
    <li className="rounded-card bg-surface p-4 ring-1 ring-line">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[16px] text-text-muted" lang="te">
          {format(new Date(e.createdAt), "d MMMM, HH:mm", { locale: te })}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[15px] font-semibold",
            e.shared ? "bg-sky-line/12 text-sky-text" : "bg-surface-sunken text-text-muted",
          )}
          lang="te"
        >
          {e.shared ? (
            <Share2 aria-hidden="true" className="shrink-0 size-4" />
          ) : (
            <Lock aria-hidden="true" className="shrink-0 size-4" />
          )}
          {e.shared ? labels.shared : labels.private}
        </span>
      </div>
      {e.text ? (
        <p className="mt-2 text-parent" lang="te">
          {e.text}
        </p>
      ) : null}
      {e.audioSrc ? (
        <Recording src={e.audioSrc} label={labels.recording ?? "Listen"} stop={labels.stopRecording ?? "Stop"} />
      ) : null}
      {e.photo ? (
        // biome-ignore lint/performance/noImgElement: a local photo from the diary
        <img src={e.photo} alt="" className="mt-2 max-h-48 rounded-lg object-cover" />
      ) : null}
      {e.feelingWords.length ? (
        <p className="mt-2 text-[18px] text-text-muted" lang="te">
          {e.feelingWords.join(" · ")}
        </p>
      ) : null}
      {confirming ? (
        <div className="mt-3 rounded-lg bg-surface-sunken p-3" role="group" aria-label={labels.confirmDelete} lang="te">
          <p className="text-[18px] font-semibold">{labels.confirmDelete}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="min-h-14 flex-1 basis-32 rounded-lg bg-ink px-3 text-[17px] font-semibold text-white"
            >
              {labels.keep}
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="flex min-h-14 flex-1 basis-32 items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-[17px] font-semibold"
            >
              <Trash2 aria-hidden="true" className="shrink-0 size-5" />
              {labels.delete}
            </button>
          </div>
        </div>
      ) : null}
      <div className={cn("mt-3 flex flex-wrap gap-2", confirming && "hidden")}>
        <button
          type="button"
          onClick={onShare}
          className="min-h-14 flex-1 basis-40 rounded-lg border border-line-strong px-3 text-[17px] font-semibold"
          lang="te"
        >
          {e.shared ? labels.unshare : labels.share}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="flex min-h-14 grow items-center justify-center gap-2 rounded-lg border border-line-strong px-4 text-[17px] font-semibold"
          lang="te"
        >
          <Trash2 aria-hidden="true" className="shrink-0 size-5" />
          {labels.delete}
        </button>
      </div>
    </li>
  );
}

/**
 * One large play and pause button instead of the browser's small player, like the dashboard's
 * Listen: the entry is the parent's own, so it needs no scrubbing. The label flips with the state.
 */
function Recording({ src, label, stop }: { src: string; label: string; stop: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const Icon = playing ? Pause : Play;
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => (playing ? ref.current?.pause() : void ref.current?.play().catch(() => setPlaying(false)))}
        className="inline-flex min-h-14 items-center gap-3 rounded-full bg-surface-sunken py-1.5 pr-6 pl-1.5 text-parent font-semibold transition-colors hover:bg-line"
        lang="te"
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-ink text-white">
          <Icon aria-hidden="true" className="size-6 fill-current" />
        </span>
        {playing ? stop : label}
      </button>
      <audio
        ref={ref}
        preload="none"
        src={src}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
    </div>
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
