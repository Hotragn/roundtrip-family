"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode, useCallback, useEffect, useState } from "react";

/**
 * The live sky, layered over the still frame the server already sent. Nothing for it loads
 * when the visitor asks for reduced motion, saves data or is on a low-power device: then the
 * still is the whole picture. Otherwise, once the page has loaded and gone idle, a small
 * dynamic import starts the sky's worker. The worker checks for hardware WebGL off the main
 * thread (the first WebGL context of a visit takes a tenth of a second or more to open) and
 * only then loads three.js; without WebGL the still stays.
 */
const SkyLive = dynamic(() => import("@/components/scenes/sky/sky-live"), { ssr: false });

type SkyState = "waiting" | "loading" | "ready" | "still";

interface DeviceHints {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

/** Whether this device should try the live scene at all. Cheap, and never loads anything. */
export function canRunSkyScene(): boolean {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  const nav = navigator as Navigator & DeviceHints;
  if (nav.connection?.saveData) return false;
  if ((nav.hardwareConcurrency ?? 8) <= 4) return false;
  if (nav.deviceMemory !== undefined && nav.deviceMemory <= 4) return false;
  // The scene draws from a worker, which needs a canvas it can hand over and WebGL 2 there.
  if (typeof OffscreenCanvas === "undefined" || !("transferControlToOffscreen" in HTMLCanvasElement.prototype))
    return false;
  return typeof WebGL2RenderingContext !== "undefined";
}

const INTRO_KEY = "roundtrip:sky-intro";

function introAlreadyPlayed(): boolean {
  try {
    return window.sessionStorage.getItem(INTRO_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberIntro() {
  try {
    window.sessionStorage.setItem(INTRO_KEY, "1");
  } catch {
    // Private windows can refuse storage; the intro just plays again next time.
  }
}

class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function SkyBackdrop({ regionId }: { regionId: string }) {
  const [state, setState] = useState<SkyState>("waiting");
  const [region, setRegion] = useState<HTMLElement | null>(null);
  const [playIntro, setPlayIntro] = useState(true);

  useEffect(() => {
    if (!canRunSkyScene()) {
      setState("still");
      return;
    }
    setRegion(document.getElementById(regionId));
    // Someone who already scrolled into the story, or saw the climb this session, gets the hold.
    setPlayIntro(!introAlreadyPlayed() && window.scrollY < window.innerHeight * 0.5);
    let idle = 0;
    let timer = 0;
    const start = () => setState((s) => (s === "waiting" ? "loading" : s));
    // Safari has no requestIdleCallback; the lib types say every window does, so check the value.
    const requestIdle = window.requestIdleCallback as Window["requestIdleCallback"] | undefined;
    const whenIdle = () => {
      if (requestIdle) idle = requestIdle(start, { timeout: 2500 });
      else timer = window.setTimeout(start, 400);
    };
    if (document.readyState === "complete") whenIdle();
    else window.addEventListener("load", whenIdle, { once: true });

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => {
      if (motion.matches) setState("still");
    };
    motion.addEventListener("change", onMotion);
    return () => {
      window.removeEventListener("load", whenIdle);
      if (idle && requestIdle) window.cancelIdleCallback(idle);
      window.clearTimeout(timer);
      motion.removeEventListener("change", onMotion);
    };
  }, [regionId]);

  const onReady = useCallback(() => {
    rememberIntro();
    setState("ready");
  }, []);
  const onFail = useCallback(() => setState("still"), []);

  const mounted = state === "loading" || state === "ready";
  return (
    <div
      data-sky={state}
      className="absolute inset-0 opacity-0 transition-opacity duration-[1100ms] ease-out data-[sky=ready]:opacity-100"
    >
      {mounted ? (
        <SceneBoundary onError={onFail}>
          <SkyLive region={region} playIntro={playIntro} onReady={onReady} onFail={onFail} />
        </SceneBoundary>
      ) : null}
    </div>
  );
}
