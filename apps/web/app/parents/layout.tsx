import { SerwistProvider } from "@serwist/turbopack/react";
import type { Metadata, Viewport } from "next";
import { preconnect } from "react-dom";
import { TeluguProvider } from "./intl-provider";

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
      className="min-h-dvh bg-paper text-parent [overflow-wrap:anywhere]"
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
