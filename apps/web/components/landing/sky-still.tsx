import type { CSSProperties } from "react";

/**
 * The still frame of the landing sky: the end of the intro, captured from the live scene
 * (e2e/landing.spec.ts, "capture the still frame"). It is the page's largest paint, so it is a
 * plain image in the server HTML, fetched first. Tall phone screens get their own framing.
 *
 * Chrome does not count an image that covers the whole viewport as the largest paint (it reads
 * it as a background), so the image stops one pixel short of the top. The colors behind it are
 * the still's own top edge, sampled from the frames, so that pixel reads as more sky.
 */
const EDGE = {
  "--still-edge-start": "rgb(162 218 249)",
  "--still-edge-end": "rgb(209 241 253)",
} as CSSProperties;

export function SkyStill() {
  return (
    <div
      className="absolute inset-0 bg-[linear-gradient(90deg,var(--still-edge-start),var(--still-edge-end))]"
      style={EDGE}
    >
      <picture>
        <source
          media="(max-aspect-ratio: 3/4) and (max-width: 640px)"
          srcSet="/art/sky-still-phone.webp 800w"
          sizes="100vw"
          type="image/webp"
        />
        <source srcSet="/art/sky-still.webp 1600w, /art/sky-still@2x.webp 3200w" sizes="100vw" type="image/webp" />
        <img
          src="/art/sky-still.webp"
          alt=""
          width={1600}
          height={900}
          fetchPriority="high"
          loading="eager"
          decoding="sync"
          className="absolute inset-x-0 top-px bottom-0 h-[calc(100%-1px)] w-full object-cover object-[64%_50%]"
        />
      </picture>
    </div>
  );
}
