import type { MetadataRoute } from "next";

export const dynamic = "force-static";

/** The installable parents' app, scoped to /parents (developer.mozilla.org/docs/Web/Manifest). */
export function GET() {
  const manifest: MetadataRoute.Manifest = {
    id: "/parents",
    name: "Roundtrip",
    short_name: "Roundtrip",
    description: "Today's outing, directions, the driver card, phrases and a private diary.",
    start_url: "/parents",
    scope: "/parents",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#1f2a44",
    lang: "te",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(manifest), { headers: { "Content-Type": "application/manifest+json" } });
}
