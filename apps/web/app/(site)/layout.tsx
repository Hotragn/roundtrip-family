import localFont from "next/font/local";
import "../globals.css";

/**
 * The landing, the dashboard and the style guide share the full stylesheet, and preload Hind for
 * their mostly Latin text. The root layout declares Hind without preloading, so the parents'
 * screens, which are Telugu, don't fetch Latin weights before their first paint.
 */
const hind = localFont({
  src: [
    { path: "../fonts/hind-400-latin.woff2", weight: "400" },
    { path: "../fonts/hind-500-latin.woff2", weight: "500" },
    { path: "../fonts/hind-600-latin.woff2", weight: "600" },
    { path: "../fonts/hind-700-latin.woff2", weight: "700" },
  ],
  display: "swap",
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    },
  ],
});
const stack = `${hind.style.fontFamily}, var(--font-hind-guntur), ui-sans-serif, system-ui, sans-serif`;
const fonts = { "--font-sans": stack, "--font-heading": stack, "--font-telugu": stack } as React.CSSProperties;

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={fonts} className="contents">
      {children}
    </div>
  );
}
