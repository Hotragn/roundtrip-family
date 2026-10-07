import { SerwistProvider } from "@serwist/turbopack/react";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { preconnect } from "react-dom";
import { TeluguProvider } from "./intl-provider";
import "./parents.css";

export const metadata: Metadata = {
  title: { absolute: "Roundtrip for parents" },
  description: "Today's ticket, directions, the driver card, phrases and a private diary. Works offline.",
  manifest: "/parents/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Roundtrip", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Hind Guntur again, preloaded here only: every parents' screen is Telugu, while the rest of the
 * site loads it only where Telugu appears (app/layout.tsx). Hind's Latin half too, for English,
 * numbers and the spaces between Telugu words. Both in the two weights the app uses, preloaded
 * and optional: each font is there for the first paint or the fallback stays, so text never
 * shifts, and Chrome holds rendering for them only briefly.
 */
const latin = localFont({
  src: [
    { path: "../fonts/hind-400-latin.woff2", weight: "400" },
    { path: "../fonts/hind-600-latin.woff2", weight: "600" },
  ],
  display: "optional",
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    },
  ],
});
const telugu = localFont({
  src: [
    { path: "../fonts/hind-guntur-400-telugu.woff2", weight: "400" },
    { path: "../fonts/hind-guntur-600-telugu.woff2", weight: "600" },
  ],
  display: "optional",
  declarations: [{ prop: "unicode-range", value: "U+0951-0952, U+0964-0965, U+0C00-0C7F, U+1CDA, U+1CF2, U+25CC" }],
});
const stack = `${latin.style.fontFamily}, ${telugu.style.fontFamily}, ui-sans-serif, system-ui, sans-serif`;
const fonts = { "--font-sans": stack, "--font-heading": stack, "--font-telugu": stack } as React.CSSProperties;

/** The parents' app: road theme, clean white, Telugu messages, offline through Serwist. */
export default function ParentsLayout({ children }: { children: React.ReactNode }) {
  // Place photos come from Google's image server: open the connection while the page loads.
  preconnect("https://lh3.googleusercontent.com");
  return (
    // Always the light palette: parents read it outdoors in daylight (docs/decisions.md).
    // A word wider than the screen (large text on a small phone) breaks between aksharas
    // instead of pushing the page sideways; conjuncts stay whole.
    <div
      data-theme="road"
      data-scheme="light"
      lang="te"
      style={fonts}
      className="min-h-dvh bg-paper font-sans text-parent [overflow-wrap:anywhere]"
    >
      <TeluguProvider>
        {/* No reload when the phone comes back online: that would cut off a recording, and the
            outbox sends what waited. The page warms its own cache once, so view changes don't
            ask the network for the page again. */}
        <SerwistProvider
          swUrl="/serwist/sw.js"
          options={{ scope: "/parents", type: "classic" }}
          // In development the worker would serve stale dev chunks; offline is tested on a build.
          disable={process.env.NODE_ENV === "development"}
          reloadOnOnline={false}
          cacheOnNavigation={false}
        >
          {children}
        </SerwistProvider>
      </TeluguProvider>
    </div>
  );
}
