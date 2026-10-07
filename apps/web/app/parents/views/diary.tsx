"use client";

import { Camera, Lock, Mic, Phone, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { FeelingChips } from "@/components/parents/cards";
import { DiaryEntryCard } from "@/components/parents/diary";
import type { DiarySeed } from "@/lib/diary-types";
import { flushOutbox, getKv, queue, setKv } from "@/lib/parents-store";
import { cn } from "@/lib/utils";
import { useParents } from "../context";
import { useRecorder } from "./care";

/**
 * నా డైరీ: each parent's private space. Entries live on the phone first, private by default;
 * the parent can share, unshare or delete any of them. The app doesn't analyze or score them.
 * Back on home Wi-Fi, each change goes to the family's server, which encrypts it with this
 * parent's key; only shared entries are ever shown to their child.
 */

export interface LocalEntry {
  id: string;
  parentId: string;
  createdAt: string;
  kind: "voice" | "text" | "photo";
  text?: string;
  photo?: string;
  audio?: Blob;
  /** A saved clip for the demo's synthetic entries. */
  audioUrl?: string;
  feelingWords: string[];
  outingId?: string;
  shared: boolean;
  inMemoryBook?: boolean;
  synced: boolean;
}

const key = (parentId: string) => `diary:${parentId}`;
const seededKey = (parentId: string) => `diary-seeded:${parentId}`;

/** The phone's entries, starting with this parent's synthetic demo entries the first time. */
export async function loadEntries(parentId: string, seeds: DiarySeed[]): Promise<LocalEntry[]> {
  const entries = (await getKv<LocalEntry[]>(key(parentId))) ?? [];
  if (await getKv<boolean>(seededKey(parentId))) return entries;
  const have = new Set(entries.map((e) => e.id));
  const merged = [
    ...entries,
    ...seeds
      .filter((s) => !have.has(s.id))
      .map((s) => ({
        id: s.id,
        parentId: s.parentId,
        createdAt: s.createdAt,
        kind: s.kind,
        text: s.text,
        audioUrl: s.audioUrl,
        feelingWords: s.feelingWords,
        outingId: s.outingId,
        shared: s.shared,
        inMemoryBook: s.inMemoryBook,
        synced: true,
      })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  await setKv(key(parentId), merged);
  await setKv(seededKey(parentId), true);
  return merged;
}

/** Queue one entry's latest state (or its deletion) for the family's server. */
export async function syncEntry(household: string, parentId: string, entryId: string, action: "save" | "delete") {
  await queue({
    id: `diary:${entryId}:${action === "delete" ? "delete" : "save"}`,
    kind: "diary",
    createdAt: new Date().toISOString(),
    payload: { action, household, parentId, entryId },
  });
  void flushOutbox();
}

export function feelingList(words: Array<{ feeling: string; words: string[] }>): string[] {
  return words
    .flatMap((g) => g.words.slice(0, g.feeling === "happy" ? 2 : g.feeling === "worried" ? 2 : 1))
    .map((w) => w.split(" (")[0]!);
}

export function DiaryView() {
  const { parent, t, week, go, diarySeeds } = useParents();
  const [entries, setEntries] = useState<LocalEntry[]>([]);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [feelings, setFeelings] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const { state, blob, start, stop } = useRecorder(120_000);

  useEffect(() => {
    loadEntries(parent.id, diarySeeds).then(setEntries);
  }, [parent.id, diarySeeds]);

  const persist = async (next: LocalEntry[]) => {
    setEntries(next);
    await setKv(key(parent.id), next);
  };

  const save = async () => {
    if (!text.trim() && !blob && !photo) return;
    const entry: LocalEntry = {
      id: `d_${Date.now().toString(36)}`,
      parentId: parent.id,
      createdAt: new Date().toISOString(),
      kind: blob ? "voice" : photo ? "photo" : "text",
      text: text.trim() || undefined,
      photo: photo ?? undefined,
      audio: blob ?? undefined,
      feelingWords: feelings,
      shared: false,
      synced: false,
    };
    await persist([entry, ...entries]);
    await syncEntry(week.household.slug, parent.id, entry.id, "save");
    setText("");
    setPhoto(null);
    setFeelings([]);
    setStatus(t("Diary.saved"));
  };

  const toggleShare = async (id: string) => {
    const next = entries.map((e) => (e.id === id ? { ...e, shared: !e.shared } : e));
    await persist(next);
    await syncEntry(week.household.slug, parent.id, id, "save");
  };

  const remove = async (id: string) => {
    await persist(entries.filter((e) => e.id !== id));
    await syncEntry(week.household.slug, parent.id, id, "delete");
    setStatus(t("Diary.deleted"));
  };

  const onPhoto = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result));
    reader.readAsDataURL(file);
  };

  return (
    <div data-theme="home" className="-mx-5 -mt-4 min-h-[calc(100dvh-80px)] bg-paper px-5 pt-4 pb-6">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-[34px] font-semibold" lang="te">
          {t("Diary.title")}
        </h1>
        <button
          type="button"
          onClick={() => go("book")}
          className="min-h-14 rounded-lg border border-line-strong bg-surface px-4 text-[18px] font-semibold"
          lang="te"
        >
          {t("Diary.book")}
        </button>
      </div>
      <p className="mt-2 flex items-center gap-2 text-[18px] text-text-muted" lang="te">
        <Lock aria-hidden="true" className="size-5 shrink-0 stroke-[1.75]" />
        {t("Diary.privateNote")}
      </p>

      <div className="mt-5 space-y-4 rounded-ticket bg-surface p-5 shadow-raised ring-1 ring-line">
        <button
          type="button"
          onClick={state === "recording" ? stop : start}
          className={cn(
            "flex flex-wrap min-h-20 w-full items-center justify-center gap-3 rounded-xl text-parent font-semibold",
            state === "recording" ? "bg-ink text-white" : "bg-bus text-on-bus",
          )}
          lang="te"
        >
          {state === "recording" ? (
            <Square aria-hidden="true" className="shrink-0 size-7" />
          ) : (
            <Mic aria-hidden="true" className="shrink-0 size-8 stroke-[1.75]" />
          )}
          {state === "recording" ? t("Diary.recording") : t("Diary.record")}
        </button>
        <label className="block">
          <span className="text-[17px] text-text-muted" lang="te">
            {t("Diary.write")}
          </span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            lang="te"
            className="mt-1 w-full rounded-lg border border-input bg-surface p-3 text-parent"
          />
        </label>
        {/* The file input is visually hidden, so the label shows its keyboard focus. */}
        <label
          className="flex flex-wrap min-h-14 cursor-pointer items-center justify-center gap-3 rounded-xl border border-line-strong text-parent font-semibold has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus"
          lang="te"
        >
          <Camera aria-hidden="true" className="shrink-0 size-6 stroke-[1.75]" />
          {t("Diary.photo")}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => onPhoto(e.target.files?.[0])}
          />
        </label>
        {photo ? (
          // biome-ignore lint/performance/noImgElement: a local photo the parent just took
          <img src={photo} alt="" className="max-h-56 w-full rounded-lg object-cover" />
        ) : null}
        <div>
          <p id="feeling-q" className="mb-2 text-[17px] text-text-muted" lang="te">
            {t("Diary.feeling")}
          </p>
          <FeelingChips
            labelledBy="feeling-q"
            words={feelingList(week.feelingWords)}
            selected={feelings}
            onToggle={(w) => setFeelings((f) => (f.includes(w) ? f.filter((x) => x !== w) : [...f, w]))}
          />
        </div>
        <button
          type="button"
          onClick={save}
          className="flex min-h-14 w-full items-center justify-center rounded-xl bg-ink text-parent font-semibold text-white"
          lang="te"
        >
          {t("Diary.save")}
        </button>
        {/* Always in the page, so "saved" and "deleted" are announced when they appear. */}
        <div role="status">
          {status ? (
            <p className="text-[18px] text-home-green-text" lang="te">
              {status}
            </p>
          ) : null}
        </div>
      </div>

      <a
        href={`tel:${week.household.contact.phone.replace(/[^\d+]/g, "")}`}
        className="mt-4 flex flex-wrap min-h-14 items-center justify-center gap-3 rounded-xl border border-line-strong bg-surface text-parent font-semibold"
        lang="te"
      >
        <Phone aria-hidden="true" className="shrink-0 size-6 stroke-[1.75]" />
        {t("Diary.callChild")}
      </a>

      <ul className="mt-6 space-y-3">
        {entries.length === 0 ? (
          <li className="text-parent text-text-muted" lang="te">
            {t("Diary.empty")}
          </li>
        ) : null}
        {entries.map((e) => (
          <DiaryEntryCard
            key={e.id}
            entry={{
              id: e.id,
              createdAt: e.createdAt,
              text: e.text,
              photo: e.photo,
              audioSrc: e.audio ? URL.createObjectURL(e.audio) : e.audioUrl,
              feelingWords: e.feelingWords,
              shared: e.shared,
            }}
            labels={{
              shared: t("Diary.shared"),
              private: t("Diary.private"),
              share: t("Diary.share"),
              unshare: t("Diary.unshare"),
              delete: t("Diary.delete"),
              recording: t("Parents.listen"),
            }}
            onShare={() => void toggleShare(e.id)}
            onDelete={() => void remove(e.id)}
          />
        ))}
      </ul>
    </div>
  );
}
