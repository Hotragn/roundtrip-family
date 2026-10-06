"use client";

import { languageNameIn, speechTag } from "@roundtrip/core/languages";
import { Frown, Meh, Mic, Smile, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LostCard } from "@/components/parents/cards";
import { flushOutbox, queue, setKv } from "@/lib/parents-store";
import { cn } from "@/lib/utils";
import { useParents } from "../context";

/** Records up to 30 seconds with the phone's microphone. The audio stays on the phone. */
export function useRecorder(maxMs = 30_000) {
  const [state, setState] = useState<"idle" | "recording" | "done" | "unavailable">("idle");
  const [blob, setBlob] = useState<Blob | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    if (rec.current && rec.current.state !== "inactive") rec.current.stop();
  };
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: BlobPart[] = [];
      const r = new MediaRecorder(stream);
      r.ondataavailable = (e) => chunks.push(e.data);
      r.onstop = () => {
        for (const track of stream.getTracks()) track.stop();
        setBlob(new Blob(chunks, { type: r.mimeType }));
        setState("done");
      };
      rec.current = r;
      r.start();
      setState("recording");
      timer.current = setTimeout(stop, maxMs);
    } catch {
      setState("unavailable");
    }
  };
  // Leaving the screen ends a recording; only refs are touched, so this runs once.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (rec.current && rec.current.state !== "inactive") rec.current.stop();
    },
    [],
  );
  return { state, blob, start, stop };
}

export function HowView() {
  const { outing, parent, t } = useParents();
  const { state, blob, start, stop } = useRecorder();
  const [face, setFace] = useState<"good" | "okay" | "not_good" | null>(null);
  const [sent, setSent] = useState<"no" | "sent" | "later">("no");
  if (!outing) return null;
  const send = async () => {
    const id = `${outing.id}:${parent.id}:reply`;
    if (blob) await setKv(`reply-audio:${id}`, blob);
    await queue({
      id,
      kind: "reply",
      createdAt: new Date().toISOString(),
      payload: { outingId: outing.id, parentId: parent.id, face, hasAudio: Boolean(blob) },
    });
    setSent((await flushOutbox()) > 0 ? "sent" : "later");
  };
  const faces = [
    { id: "good" as const, icon: Smile, label: t("How.good") },
    { id: "okay" as const, icon: Meh, label: t("How.okay") },
    { id: "not_good" as const, icon: Frown, label: t("How.notGood") },
  ];
  return (
    <div className="space-y-6">
      <h1 className="text-[34px] font-semibold" lang="te">
        {t("How.title")}
      </h1>
      <p className="text-parent text-text-muted" lang="te">
        {outing.venue}
      </p>
      {/* The label says what a tap does next ("tap to stop"), so no pressed state on top of it.
          The circle narrows with the screen when the text is very large. */}
      <button
        type="button"
        onClick={state === "recording" ? stop : start}
        className={cn(
          "mx-auto flex aspect-square w-44 max-w-full flex-col items-center justify-center gap-2 rounded-full text-[19px] font-semibold shadow-raised transition-colors",
          state === "recording" ? "bg-ink text-white" : "bg-bus text-on-bus",
        )}
        lang="te"
      >
        {state === "recording" ? (
          <Square aria-hidden="true" className="shrink-0 size-12 stroke-[1.75]" />
        ) : (
          <Mic aria-hidden="true" className="shrink-0 size-14 stroke-[1.75]" />
        )}
        <span className="px-4 text-center">{state === "recording" ? t("How.stop") : t("How.talk")}</span>
      </button>
      <div role="status">
        {state === "done" ? (
          <p className="text-center text-parent text-home-green-text" lang="te">
            {t("How.recorded")}
          </p>
        ) : null}
        {state === "unavailable" ? (
          <p className="text-center text-parent text-text-muted" lang="te">
            {t("How.noMic")}
          </p>
        ) : null}
      </div>
      {/* Toggle buttons rather than radios: each is its own tab stop, and screen readers say
          "pressed" for the chosen face. */}
      <div className="grid grid-cols-3 gap-3" role="group" aria-label={t("How.title")}>
        {faces.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={face === f.id}
            onClick={() => setFace(f.id)}
            className={cn(
              "flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border-2 text-[19px] font-semibold",
              face === f.id ? "border-ink bg-ink text-white" : "border-line-strong bg-surface",
            )}
            lang="te"
          >
            <f.icon aria-hidden="true" className="shrink-0 size-10 stroke-[1.75]" />
            {f.label}
          </button>
        ))}
      </div>
      {sent === "no" ? (
        <button
          type="button"
          onClick={send}
          disabled={!face && !blob}
          className="flex min-h-16 w-full items-center justify-center rounded-xl bg-bus px-6 text-parent font-semibold text-on-bus disabled:opacity-50"
          lang="te"
        >
          {t("How.send")}
        </button>
      ) : null}
      <div role="status">
        {sent !== "no" ? (
          <p className="rounded-card bg-surface-sunken p-5 text-parent" lang="te">
            {sent === "sent" ? t("How.sent") : t("How.later")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function LostView() {
  const { parent, t, week } = useParents();
  const h = week.household;
  return (
    <>
      <h1 className="sr-only" lang="te">
        {t("Lost.title")}
      </h1>
      <LostCard
        intro={t("Lost.show")}
        help={h.helpCardText}
        phrases={h.localPhrases}
        name={parent.firstName}
        homeArea={h.homeArea}
        phone={h.contact.phone}
        emergency={h.emergency}
        secondary={h.secondaryEmergency}
        helpAudio={h.helpCardAudio}
        localLanguage={h.localLanguage}
        speech={speechTag(h.localLanguage, h.hostCountry)}
        labels={{
          callFamily: t("Lost.callFamily"),
          emergency: t("Lost.emergency"),
          noPlan: t("Lost.noPlan"),
          play: t("Lost.playLocal", { language: languageNameIn(h.localLanguage, parent.language) }),
          stop: t("Parents.stopListening"),
        }}
      />
    </>
  );
}
