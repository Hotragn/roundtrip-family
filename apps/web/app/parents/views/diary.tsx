"use client";

import { format } from "date-fns";
import { te } from "date-fns/locale";
import { Camera, Lock, Mic, Phone, Share2, Square, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { FeelingChips } from "@/components/parents/cards";
import { getKv, queue, setKv } from "@/lib/parents-store";
import { cn } from "@/lib/utils";
import { useParents } from "../context";
import { useRecorder } from "./care";

/**
 * నా డైరీ: each parent's private space. Entries live on the phone first, private by default;
 * the parent can share, unshare or delete any of them. The app doesn't analyze or score them.
 */

export interface LocalEntry {
  id: string;
  parentId: string;
  createdAt: string;
  kind: "voice" | "text" | "photo";
  text?: string;
  photo?: string;
  audio?: Blob;
  feelingWords: string[];
  shared: boolean;
  synced: boolean;
}

const key = (parentId: string) => `diary:${parentId}`;

export function feelingList(words: Array<{ feeling: string; words: string[] }>): string[] {
  return words
    .flatMap((g) => g.words.slice(0, g.feeling === "happy" ? 2 : g.feeling === "worried" ? 2 : 1))
    .map((w) => w.split(" (")[0]!);
}

export function DiaryView() {
  const { parent, t, week, go } = useParents();
  const [entries, setEntries] = useState<LocalEntry[]>([]);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [feelings, setFeelings] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const { state, blob, start, stop } = useRecorder(120_000);

  useEffect(() => {
    getKv<LocalEntry[]>(key(parent.id)).then((e) => setEntries(e ?? []));
  }, [parent.id]);

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
    await queue({
      id: `diary:${entry.id}`,
      kind: "diary",
      createdAt: entry.createdAt,
      payload: { action: "save", entryId: entry.id, parentId: parent.id },
    });
    setText("");
    setPhoto(null);
    setFeelings([]);
    setStatus(t("Diary.saved"));
  };

  const toggleShare = async (id: string) => {
    const next = entries.map((e) => (e.id === id ? { ...e, shared: !e.shared } : e));
    await persist(next);
    const e = next.find((x) => x.id === id)!;
    await queue({
      id: `diary:${id}:share:${Date.now()}`,
      kind: "diary",
      createdAt: new Date().toISOString(),
      payload: { action: e.shared ? "share" : "unshare", entryId: id, parentId: parent.id },
    });
  };

  const remove = async (id: string) => {
    await persist(entries.filter((e) => e.id !== id));
    await queue({
      id: `diary:${id}:delete`,
      kind: "diary",
      createdAt: new Date().toISOString(),
      payload: { action: "delete", entryId: id, parentId: parent.id },
    });
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
          className="min-h-12 rounded-lg border border-line-strong bg-surface px-4 text-[18px] font-medium"
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
          aria-pressed={state === "recording"}
          className={cn(
            "flex min-h-20 w-full items-center justify-center gap-3 rounded-xl text-parent font-semibold",
            state === "recording" ? "bg-ink text-white" : "bg-bus text-on-bus",
          )}
          lang="te"
        >
          {state === "recording" ? (
            <Square aria-hidden="true" className="size-7" />
          ) : (
            <Mic aria-hidden="true" className="size-8 stroke-[1.75]" />
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
        <label
          className="flex min-h-14 cursor-pointer items-center justify-center gap-3 rounded-xl border border-line-strong text-parent font-medium"
          lang="te"
        >
          <Camera aria-hidden="true" className="size-6 stroke-[1.75]" />
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
          <p className="mb-2 text-[17px] text-text-muted" lang="te">
            {t("Diary.feeling")}
          </p>
          <FeelingChips
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
        {status ? (
          <p role="status" className="text-[18px] text-home-green-text" lang="te">
            {status}
          </p>
        ) : null}
      </div>

      <a
        href={`tel:${week.household.contact.phone.replace(/[^\d+]/g, "")}`}
        className="mt-4 flex min-h-14 items-center justify-center gap-3 rounded-xl border border-line-strong bg-surface text-parent font-medium"
        lang="te"
      >
        <Phone aria-hidden="true" className="size-6 stroke-[1.75]" />
        {t("Diary.callChild")}
      </a>

      <ul className="mt-6 space-y-3">
        {entries.length === 0 ? (
          <li className="text-parent text-text-muted" lang="te">
            {t("Diary.empty")}
          </li>
        ) : null}
        {entries.map((e) => (
          <li key={e.id} className="rounded-card bg-surface p-4 ring-1 ring-line">
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
                {e.shared ? (
                  <Share2 aria-hidden="true" className="size-4" />
                ) : (
                  <Lock aria-hidden="true" className="size-4" />
                )}
                {e.shared ? t("Diary.shared") : t("Diary.private")}
              </span>
            </div>
            {e.text ? (
              <p className="mt-2 text-parent" lang="te">
                {e.text}
              </p>
            ) : null}
            {e.audio ? <audio controls src={URL.createObjectURL(e.audio)} className="mt-2 w-full" /> : null}
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
                onClick={() => toggleShare(e.id)}
                className="min-h-12 flex-1 rounded-lg border border-line-strong text-[17px] font-medium"
                lang="te"
              >
                {e.shared ? t("Diary.unshare") : t("Diary.share")}
              </button>
              <button
                type="button"
                onClick={() => remove(e.id)}
                aria-label={t("Diary.delete")}
                className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-line-strong px-4 text-[17px] font-medium"
                lang="te"
              >
                <Trash2 aria-hidden="true" className="size-5" />
                {t("Diary.delete")}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
