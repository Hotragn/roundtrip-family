"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { ToWorker } from "./protocol";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * Time and scroll for the sky, on the page: GSAP plays the four-second climb once, and
 * ScrollTrigger keeps the camera rising as the page scrolls. Both only send numbers to the
 * worker that draws. The intro waits whenever nobody can see the sky.
 */

const INTRO_SECONDS = 4.2;

export interface Visibility {
  visible: boolean;
  listeners: Set<(visible: boolean) => void>;
}

export default function SkyMotion({
  send,
  ready,
  region,
  playIntro,
  visibility,
}: {
  send: (message: ToWorker) => void;
  /** The worker has drawn its first frame. */
  ready: boolean;
  region: HTMLElement | null;
  playIntro: boolean;
  visibility: Visibility;
}) {
  useGSAP(
    () => {
      if (!ready) return;
      const state = { intro: playIntro ? 0 : 1, climb: 0 };
      let intro: gsap.core.Tween | null = null;
      if (state.intro < 1) {
        intro = gsap.to(state, {
          intro: 1,
          duration: INTRO_SECONDS,
          ease: "none",
          paused: !visibility.visible,
          onUpdate: () => send({ type: "intro", value: state.intro }),
          onComplete: () => send({ type: "intro-done" }),
        });
      } else send({ type: "intro-done" });
      if (region) {
        gsap.to(state, {
          climb: 1,
          ease: "none",
          onUpdate: () => send({ type: "climb", value: state.climb }),
          scrollTrigger: { trigger: region, start: "top top", end: "bottom bottom", scrub: 1.1 },
        });
      }
      const onVisible = (visible: boolean) => {
        if (!intro || intro.progress() >= 1) return;
        if (visible) intro.resume();
        else intro.pause();
      };
      visibility.listeners.add(onVisible);
      return () => {
        visibility.listeners.delete(onVisible);
      };
    },
    { dependencies: [ready, region] },
  );
  return null;
}
