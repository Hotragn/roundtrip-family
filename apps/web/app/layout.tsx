import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

/*
 * Hind for Latin text and Hind Guntur for Telugu: two members of one family by the Indian Type
 * Foundry (docs/brand.md), self-hosted through next/font. Each face declares only the characters
 * it serves, and every stack lists Hind first: Latin letters, digits and punctuation come from
 * Hind, Telugu from Hind Guntur, and no other file is ever fetched. Seven files in all. The
 * files are Google Fonts' latin and telugu subsets, under the SIL Open Font License
 * (app/fonts/OFL.txt).
 */
const hind = localFont({
  src: [
    { path: "./fonts/hind-400-latin.woff2", weight: "400" },
    { path: "./fonts/hind-500-latin.woff2", weight: "500" },
    { path: "./fonts/hind-600-latin.woff2", weight: "600" },
    { path: "./fonts/hind-700-latin.woff2", weight: "700" },
  ],
  variable: "--font-hind",
  display: "swap",
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    },
  ],
});

// Telugu uses regular, medium and semibold; bold is only ever Latin (the driver card's stop name).
const hindGuntur = localFont({
  src: [
    { path: "./fonts/hind-guntur-400-telugu.woff2", weight: "400" },
    { path: "./fonts/hind-guntur-500-telugu.woff2", weight: "500" },
    { path: "./fonts/hind-guntur-600-telugu.woff2", weight: "600" },
  ],
  variable: "--font-hind-guntur",
  display: "swap",
  declarations: [{ prop: "unicode-range", value: "U+0951-0952, U+0964-0965, U+0C00-0C7F, U+1CDA, U+1CF2, U+25CC" }],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "Roundtrip", template: "%s · Roundtrip" },
  description:
    "Weekdays out, safely home. An open-model outing planner that helps visiting parents get out each week, to real places and real people, in their own language.",
  applicationName: "Roundtrip",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfcfe" },
    { media: "(prefers-color-scheme: dark)", color: "#16203a" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${hind.variable} ${hindGuntur.variable}`}>
      <body>{children}</body>
    </html>
  );
}
