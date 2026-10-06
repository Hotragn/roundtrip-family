"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CaptureSettings, FromWorker, ToWorker } from "./protocol";
import type { Visibility } from "./sky-motion";

/**
 * The live sky on the page. It hands its canvas to a worker (sky.worker.ts) that checks for
 * WebGL and runs the three.js scene; the page keeps only time and scroll (sky-motion.tsx),
 * loaded once both the worker and the page have WebGL. When the sky is offscreen or the tab is
 * hidden, the worker stops drawing and the intro waits.
 */

declare global {
  interface Window {
    /** Set by the still-frame capture (e2e/landing.spec.ts): full resolution, no intro. */
    __roundtripSkyCapture?: CaptureSettings;
  }
}

const MAX_DPR = 1.5;

/** Gives the browser a turn to paint and answer input between loading steps. */
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// GSAP and ScrollTrigger each start up in their own task, so neither holds the page for long.
const SkyMotion = dynamic(
  async () => {
    await import("gsap");
    await nextTask();
    await import("gsap/ScrollTrigger");
    await nextTask();
    return import("./sky-motion");
  },
  { ssr: false },
);

export interface SkyLiveProps {
  /** The element whose scroll range drives the climb: the hero and the story below it. */
  region: HTMLElement | null;
  playIntro: boolean;
  /** The first frame is on the canvas. */
  onReady: () => void;
  onFail: (reason: string) => void;
}

function pageHasWebGL(): boolean {
  try {
    const gl = document.createElement("canvas").getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return Boolean(gl);
  } catch {
    return false;
  }
}

/** The flight path's color: the sky-line token, read in the light scheme the still was made in. */
function pathColor(from: Element): [number, number, number] {
  const css = getComputedStyle(from.closest("[data-scheme]") ?? document.documentElement)
    .getPropertyValue("--sky-line")
    .trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(css)?.[1] ?? "2f8ad2";
  const n = Number.parseInt(hex, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export default function SkyLive({ region, playIntro, onReady, onFail }: SkyLiveProps) {
  const host = useRef<HTMLDivElement>(null);
  const worker = useRef<Worker | null>(null);
  const [webgl, setWebgl] = useState(false);
  const [ready, setReady] = useState(false);
  const callbacks = useRef({ onReady, onFail });
  callbacks.current = { onReady, onFail };
  const capture = typeof window === "undefined" ? undefined : window.__roundtripSkyCapture;
  const visibility = useRef<Visibility>({ visible: true, listeners: new Set() });

  const send = useCallback((message: ToWorker, transfer: Transferable[] = []) => {
    worker.current?.postMessage(message, transfer);
  }, []);

  // The canvas and its worker. A fresh canvas each time: control of one moves to a worker once.
  // biome-ignore lint/correctness/useExhaustiveDependencies: one worker for the life of the page
  useEffect(() => {
    const box = host.current;
    if (!box) return;
    const canvas = document.createElement("canvas");
    canvas.className = "absolute inset-0 size-full";
    box.appendChild(canvas);
    const dpr = capture?.dpr ?? Math.min(window.devicePixelRatio || 1, MAX_DPR);
    let w: Worker;
    try {
      w = new Worker(new URL("./sky.worker.ts", import.meta.url), { type: "module", name: "sky" });
    } catch (e) {
      canvas.remove();
      callbacks.current.onFail(e instanceof Error ? e.message : String(e));
      return;
    }
    worker.current = w;
    w.onmessage = (event: MessageEvent<FromWorker>) => {
      const m = event.data;
      if (m.type === "webgl") {
        // The worker has WebGL; the page must have it too (a policy or flag can turn it off
        // here alone). By now the GPU process is up, so this check takes a few milliseconds.
        if (!pageHasWebGL()) {
          callbacks.current.onFail("no WebGL on the page");
          return;
        }
        send({ type: "go" });
        setWebgl(true);
      } else if (m.type === "ready") {
        setReady(true);
        callbacks.current.onReady();
      } else if (m.type === "still") canvas.dataset.still = "ready";
      else if (m.type === "fail") callbacks.current.onFail(m.reason);
    };
    w.onerror = (event) => callbacks.current.onFail(event.message || "worker error");
    const offscreen = canvas.transferControlToOffscreen();
    const rect = box.getBoundingClientRect();
    send(
      {
        type: "init",
        canvas: offscreen,
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
        dpr,
        intro: playIntro && !capture ? 0 : 1,
        pathColor: pathColor(box),
        capture,
      },
      [offscreen],
    );

    const resize = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      send({ type: "size", width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)), dpr });
    });
    resize.observe(box);
    let onScreen = true;
    const update = () => {
      const v = onScreen && document.visibilityState === "visible";
      visibility.current.visible = v;
      send({ type: "visible", value: v });
      for (const listener of visibility.current.listeners) listener(v);
    };
    const io = new IntersectionObserver(([entry]) => {
      onScreen = Boolean(entry?.isIntersecting);
      update();
    });
    io.observe(box);
    document.addEventListener("visibilitychange", update);
    return () => {
      resize.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", update);
      w.terminate();
      worker.current = null;
      canvas.remove();
    };
  }, []);

  return (
    <>
      <div ref={host} className="absolute inset-0" />
      {webgl ? (
        <SkyMotion
          send={send}
          ready={ready}
          region={region}
          playIntro={playIntro && !capture}
          visibility={visibility.current}
        />
      ) : null}
    </>
  );
}
