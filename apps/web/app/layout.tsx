import type { Metadata, Viewport } from "next";
import { Hind, Hind_Guntur } from "next/font/google";
import "./globals.css";

// Hind for Latin text and Hind Guntur for Telugu: two members of one family (docs/brand.md).
const hind = Hind({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hind",
  display: "swap",
});

const hindGuntur = Hind_Guntur({
  subsets: ["telugu"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hind-guntur",
  display: "swap",
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
