"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { deviceVoiceFor, play, stopAll, whenVoicesReady } from "@/lib/speech";
import { cn } from "@/lib/utils";

/**
 * Every screen has one. Plays the saved open-model audio when there is a file, otherwise the
 * phone's voice for that language. If neither exists, the button doesn't render.
 */
export function ListenButton({
  src,
  text,
  lang,
  label,
  stopLabel,
  tone = "primary",
  size = "parent",
  className,
}: {
  src?: string;
  text?: string;
  lang: string;
  label: string;
  stopLabel: string;
  tone?: "primary" | "secondary" | "quiet";
  size?: "parent" | "compact";
  className?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const [available, setAvailable] = useState(Boolean(src));
  useEffect(() => {
    if (src) return setAvailable(true);
    whenVoicesReady().then(() => setAvailable(Boolean(deviceVoiceFor(lang))));
  }, [src, lang]);
  useEffect(() => () => stopAll(), []);
  if (!available) return null;
  const onClick = async () => {
    if (playing) {
      stopAll();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    const how = await play({ src, text, lang, onEnd: () => setPlaying(false) });
    if (how === "none") setPlaying(false);
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={playing}
      className={cn(
        "inline-flex items-center justify-center gap-3 font-semibold transition-[background-color,transform] duration-150 ease-paper active:translate-y-px",
        size === "parent" ? "min-h-14 rounded-xl px-6 text-parent" : "min-h-11 rounded-lg px-4 text-[18px]",
        tone === "primary" && "bg-bus text-on-bus hover:bg-[#e6a000]",
        tone === "secondary" && "border border-line-strong bg-surface text-text hover:bg-surface-sunken",
        tone === "quiet" && "text-text hover:bg-surface-sunken",
        className,
      )}
    >
      {playing ? (
        <Pause aria-hidden="true" className="size-6 stroke-[1.75]" />
      ) : (
        <Play aria-hidden="true" className="size-6 stroke-[1.75]" />
      )}
      <span>{playing ? stopLabel : label}</span>
    </button>
  );
}
