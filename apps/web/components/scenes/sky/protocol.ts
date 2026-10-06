/**
 * Messages between the page and the sky's worker. The page owns time and scroll (GSAP and
 * ScrollTrigger) and tells the worker where the camera should be; the worker owns three.js and
 * draws on an OffscreenCanvas, so nothing it does can block the page.
 */

export interface CaptureSettings {
  dpr?: number;
  steps?: number;
  cloudScale?: number;
}

export type ToWorker =
  | {
      type: "init";
      canvas: OffscreenCanvas;
      width: number;
      height: number;
      dpr: number;
      /** Where the intro starts: 0 plays it, 1 skips straight to the hold. */
      intro: number;
      /** sRGB 0..1 */
      pathColor: [number, number, number];
      capture?: CaptureSettings;
    }
  /** The page has WebGL too: load the scene. */
  | { type: "go" }
  | { type: "size"; width: number; height: number; dpr: number }
  /** Intro progress, 0 to 1, linear in time; the worker applies the easing. */
  | { type: "intro"; value: number }
  /** Climb with scrolling, 0 at the top of the page to 1 at the end of the story. */
  | { type: "climb"; value: number }
  | { type: "visible"; value: boolean }
  | { type: "intro-done" };

export type FromWorker =
  /** Hardware WebGL 2 works in the worker; it waits for "go" before loading the scene. */
  | { type: "webgl" }
  /** The first frame is on the canvas. */
  | { type: "ready" }
  /** The averaged still view is clean (used by the still-frame capture). */
  | { type: "still" }
  | { type: "fail"; reason: string };

/** What the scene reads each frame; the worker's message handler writes it. */
export interface SkyControls {
  intro: number;
  climb: number;
  visible: boolean;
  introDone: boolean;
  listeners: Set<() => void>;
}

export function createControls(intro: number): SkyControls {
  return { intro, climb: 0, visible: true, introDone: intro >= 1, listeners: new Set() };
}

export function notify(controls: SkyControls) {
  for (const listener of controls.listeners) listener();
}
