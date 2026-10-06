"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { deviceVoiceFor, play, stopAll, whenVoicesReady } from "@/lib/speech";
import { cn } from "@/lib/utils";

/**
 * Every screen has one. Plays the saved open-model audio when there is a file, otherwise the
 * phone's voice for that language. `fallbackSrc` is the other way round: a saved clip for phones
 * with no voice for the language, when the phone's voice can say more (a name, a number).
 * If nothing can play, the button doesn't render.
 */
export function ListenButton({
  src,
  fallbackSrc,
  text,
  lang,
  label,
  stopLabel,
  tone = "primary",
  size = "parent",
  className,
}: {
  src?: string;
  fallbackSrc?: string;
  text?: string;
  lang: string;
  label: string;
  stopLabel: string;
  tone?: "primary" | "secondary" | "quiet";
  size?: "parent" | "compact";
  className?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const [available, setAvailable] = useState(Boolean(src || fallbackSrc));
  useEffect(() => {
    if (src || fallbackSrc) return setAvailable(true);
    whenVoicesReady().then(() => setAvailable(Boolean(deviceVoiceFor(lang))));
  }, [src, fallbackSrc, lang]);
  useEffect(() => () => stopAll(), []);
  if (!available) return null;
  const onClick = async () => {
    if (playing) {
      stopAll();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    const clip = src ?? (deviceVoiceFor(lang) ? undefined : fallbackSrc);
    const how = await play({ src: clip, text, lang, onEnd: () => setPlaying(false) });
    if (how === "none") setPlaying(false);
  };
  // The label itself flips between "Listen" and "Stop", so there is no pressed state as well.
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex flex-wrap items-center justify-center gap-3 font-semibold transition-[background-color,transform] duration-150 ease-paper active:translate-y-px",
        size === "parent" ? "min-h-14 rounded-xl px-6 text-parent" : "min-h-14 rounded-lg px-4 text-[18px]",
        tone === "primary" && "bg-bus text-on-bus hover:bg-[#e6a000]",
        tone === "secondary" && "border border-line-strong bg-surface text-text hover:bg-surface-sunken",
        tone === "quiet" && "text-text hover:bg-surface-sunken",
        className,
      )}
    >
      {playing ? (
        <Pause aria-hidden="true" className="shrink-0 size-6 stroke-[1.75]" />
      ) : (
        <Play aria-hidden="true" className="shrink-0 size-6 stroke-[1.75]" />
      )}
      <span>{playing ? stopLabel : label}</span>
    </button>
  );
}
