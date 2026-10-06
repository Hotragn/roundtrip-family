"use client";

import { useQuery } from "@tanstack/react-query";
import { BookHeart, Lock, Mic, Pause, PenLine, Play, Printer } from "lucide-react";
import { useRef, useState } from "react";
import { Mark } from "@/components/brand/logo";
import { Panel } from "@/components/shell/panel";
import { Button } from "@/components/ui/button";
import type { SharedDiaryEntry } from "@/lib/diary-types";
import { longDate } from "@/lib/plan-format";
import type { PlanBoard } from "@/lib/plan-types";

/**
 * Shared with you: the diary entries their parents chose to share, in their own words, and the
 * memory book pages among them. Refreshes when you come back to the tab, so an entry shared on
 * a demo phone appears here. Nothing private is ever sent to this page.
 */

function useShared(household: string, initial: SharedDiaryEntry[]) {
  return useQuery({
    queryKey: ["diary", household],
    // The demo's own shared entries are in the page; this visitor's changes arrive on top.
    initialData: initial,
    initialDataUpdatedAt: 0,
    queryFn: async (): Promise<SharedDiaryEntry[]> => {
      const res = await fetch(`/plan/api/diary/${household}`, { cache: "no-store" });
      return res.ok ? ((await res.json()) as { entries: SharedDiaryEntry[] }).entries : [];
    },
    refetchOnWindowFocus: true,
    refetchInterval: 20_000,
  });
}

/** Play and pause only: the entry's words are written out above, so it needs no captions or scrubbing. */
function Recording({ src, who }: { src: string; who: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const Icon = playing ? Pause : Play;
  return (
    <>
      <button
        type="button"
        onClick={() => (playing ? ref.current?.pause() : ref.current?.play())}
        className="inline-flex min-h-11 items-center gap-2.5 rounded-full bg-surface-sunken py-1.5 pr-4 pl-1.5 text-[14px] font-semibold transition-colors hover:bg-line"
      >
        <span className="grid size-8 place-items-center rounded-full bg-text text-surface">
          <Icon aria-hidden="true" className="size-4 fill-current" />
        </span>
        {playing ? "Pause" : `Listen to ${who}`}
      </button>
      <audio
        ref={ref}
        preload="none"
        src={src}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
    </>
  );
}

const dateOf = (iso: string) => longDate(iso.slice(0, 10));

function Entry({ e, who }: { e: SharedDiaryEntry; who: string }) {
  const Icon = e.kind === "voice" ? Mic : PenLine;
  return (
    <article className="space-y-3">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="flex items-center gap-2 text-[15px] font-semibold">
          <Icon aria-hidden="true" className="size-4 stroke-[1.75] text-text-muted" />
          {who}
          <span className="font-normal text-text-muted">· {dateOf(e.createdAt)}</span>
        </p>
        {e.outingTitle ? <p className="text-[13px] text-text-muted">After {e.outingTitle}</p> : null}
      </header>
      <p lang="te" className="text-[18px] leading-[1.75]">
        {e.text}
      </p>
      {e.audioUrl ? <Recording src={e.audioUrl} who={who} /> : null}
      {e.feelingWords.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Feeling words they chose">
          {e.feelingWords.map((w) => (
            <li key={w} lang="te" className="rounded-chip bg-surface-sunken px-2.5 py-1 text-[14px]">
              {w}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export function SharedDiary({ board, initial }: { board: PlanBoard; initial: SharedDiaryEntry[] }) {
  const { data, isLoading } = useShared(board.household.slug, initial);
  const entries = data ?? [];
  const name = (id: string) => board.parents.find((p) => p.id === id)?.firstName ?? "";
  const book = entries.filter((e) => e.inMemoryBook);

  return (
    <div className="space-y-8">
      <p className="flex max-w-[760px] items-start gap-2.5 text-[15px] text-text-muted">
        <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0 stroke-[1.75]" />
        Only what they chose to share. Everything else in their diaries stays private: on their phones, and encrypted in
        your household&rsquo;s database with each parent&rsquo;s own key. It&rsquo;s never opened for this page.
      </p>

      <section aria-labelledby="entries" className="space-y-4">
        <h2 id="entries" className="text-[20px] font-semibold">
          Their entries
        </h2>
        {isLoading ? (
          <Panel className="h-40 animate-pulse p-6" aria-busy="true" />
        ) : entries.length === 0 ? (
          <Panel className="p-6">
            <p className="text-[15px]">
              Nothing shared yet. Entries stay private on their phones until they choose to share one.
            </p>
          </Panel>
        ) : (
          <ol className="space-y-4">
            {entries.map((e) => (
              <li key={e.entryId}>
                <Panel className="p-5 sm:p-6">
                  <Entry e={e} who={name(e.parentId)} />
                </Panel>
              </li>
            ))}
          </ol>
        )}
      </section>

      {book.length ? (
        <section aria-labelledby="book" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="book" className="flex items-center gap-2 text-[20px] font-semibold">
                <BookHeart aria-hidden="true" className="size-5 stroke-[1.75] text-text-muted" />
                Their memory book
              </h2>
              <p className="text-[15px] text-text-muted">
                The shared pages they chose for the book, in their own words, as written.
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <Printer aria-hidden="true" className="size-4" />
              Print these pages
            </Button>
          </div>
          {/* A paper page in both schemes: the book keeps the light palette, like the printout. */}
          <div
            data-print-book=""
            data-scheme="light"
            className="space-y-10 rounded-card bg-[#fffdf9] p-8 text-text shadow-raised ring-1 ring-line sm:p-10"
          >
            {book.map((e) => (
              <article key={e.entryId} className="break-inside-avoid space-y-2">
                <p className="text-[14px] text-text-muted">
                  {name(e.parentId)}, {dateOf(e.createdAt)}
                </p>
                <p lang="te" className="text-[21px] leading-[1.8]">
                  {e.text}
                </p>
                {e.feelingWords.length ? (
                  <p lang="te" className="text-[16px] text-text-muted">
                    {e.feelingWords.join(" · ")}
                  </p>
                ) : null}
              </article>
            ))}
            <footer className="flex justify-end">
              <Mark size={20} title={null} />
            </footer>
          </div>
        </section>
      ) : null}

      <p className="text-[13px] text-text-muted">
        The entries here are fictional, written for this demo, apart from any you write on a demo phone yourself. The
        voices are synthetic, made by open speech models.
      </p>
    </div>
  );
}
