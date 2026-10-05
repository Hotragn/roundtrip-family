"use client";

/**
 * Playback for Listen buttons. Saved open-model audio plays first (it's cached for offline use);
 * for the household's local language, the phone's own voice is the fallback, since every phone
 * ships English and German voices. Nothing here sends text anywhere.
 */

let current: HTMLAudioElement | null = null;

export function stopAll(): void {
  current?.pause();
  current = null;
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

export function deviceVoiceFor(lang: string): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  const base = lang.split("-")[0]!.toLowerCase();
  return (
    voices.find((v) => v.lang.toLowerCase() === lang.toLowerCase()) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(base)) ??
    null
  );
}

export async function play(opts: {
  src?: string;
  text?: string;
  lang: string;
  onEnd?: () => void;
}): Promise<"audio" | "voice" | "none"> {
  stopAll();
  if (opts.src) {
    const audio = new Audio(opts.src);
    current = audio;
    audio.addEventListener("ended", () => opts.onEnd?.(), { once: true });
    try {
      await audio.play();
      return "audio";
    } catch {
      current = null;
    }
  }
  const voice = opts.text ? deviceVoiceFor(opts.lang) : null;
  if (voice && opts.text) {
    const u = new SpeechSynthesisUtterance(opts.text);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = 0.85;
    u.onend = () => opts.onEnd?.();
    window.speechSynthesis.speak(u);
    return "voice";
  }
  opts.onEnd?.();
  return "none";
}

/** Speech voices load asynchronously in some browsers. */
export function whenVoicesReady(): Promise<void> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return Promise.resolve();
  if (window.speechSynthesis.getVoices().length > 0) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => resolve();
    window.speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 1500);
  });
}
