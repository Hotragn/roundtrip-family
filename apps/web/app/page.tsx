import type { Metadata } from "next";
import { Hero } from "@/components/landing/hero";
import { SiteFooter } from "@/components/landing/site-footer";
import { SkyBackdrop } from "@/components/landing/sky-backdrop";
import { SkyStill } from "@/components/landing/sky-still";
import { Story } from "@/components/landing/story";
import { ScrollIndicators } from "@/components/shell/scroll-track";
import { ThemeShell } from "@/components/shell/theme-shell";

export const metadata: Metadata = {
  title: { absolute: "Roundtrip: weekdays out, safely home" },
};

/**
 * The landing page, sky theme (docs/brand.md). One sky runs behind the hero and the story: a
 * still frame in the server HTML, with the live scene layered over it when the device can
 * run it. The sky stays in place while the panels scroll over it, and scrolling keeps the
 * camera climbing.
 */
export default function Home() {
  return (
    <ThemeShell theme="sky">
      {/* The flight path along the top edge with the aircraft as its handle (a progress line on
          touch screens), and back to top. The header leaves the top 40 px clear for it. */}
      <ScrollIndicators theme="sky" />
      <div id="sky-region" className="relative">
        {/* The sky holds still behind the panels until the end of the story, then scrolls away. */}
        <div aria-hidden="true" className="absolute inset-0">
          <div data-scheme="light" className="sticky top-0 h-[100lvh] overflow-hidden bg-surface-sunken">
            <SkyStill />
            <SkyBackdrop regionId="sky-region" />
          </div>
        </div>
        {/* The sky gives way to the page color under the last panel. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[45vh] bg-linear-to-b from-transparent to-paper"
        />
        <main className="relative">
          <Hero />
          <Story />
        </main>
      </div>
      <SiteFooter />
    </ThemeShell>
  );
}
