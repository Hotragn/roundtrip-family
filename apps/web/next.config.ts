import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

// The repo root holds .env (gitignored, never read by Claude Code). Codespaces and Render provide
// the same names as environment variables, so a missing file is fine.
// Docs: node_modules/next/dist/docs/01-app/02-guides/environment-variables.md
const repoRoot = path.resolve(process.cwd(), "../..");
loadEnvConfig(repoRoot);

const nextConfig: NextConfig = {
  // Standalone output keeps the Render free tier's 512 MB happy.
  // Docs: node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md
  output: "standalone",
  outputFileTracingRoot: repoRoot,
  outputFileTracingIncludes: {
    "/*": [
      "../../data/persona/**/*",
      "../../data/demo/households/**/*",
      "../../data/demo/plans/**/*",
      "../../data/demo/weeks/**/*",
    ],
  },
  transpilePackages: ["@roundtrip/core", "@roundtrip/agent"],
  poweredByHeader: false,
  // The indicator sits over the parents' bottom bar; build errors still show.
  devIndicators: false,
  // Not inlined: inlineCss put the 96 KB stylesheet into every page three times (in the HTML
  // and twice in the page data, too far apart for gzip to share). The external file is cached
  // once, by the browser and by the parents' service worker for offline (docs/decisions.md).
  // Docs: node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/inlineCss.md
  experimental: { inlineCss: false },
  // Render's free plan has no edge cache, so the browser keeps the site's art, logos, icons and
  // clips for a day and reuses them for a week while it checks for a newer copy. Hashed scripts
  // and styles already come with a year's immutable cache from Next.
  // Docs: node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/headers.md
  async headers() {
    const cache = [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }];
    // Every response: HTTPS only, no sniffing, no framing, no full URLs to other sites. The
    // microphone (diary voice notes) and location ("where am I" on a trip) stay this site's own.
    // The script policy is a meta tag in each prerendered page, with the sha256 of its inline
    // scripts (scripts/defer-scripts.mjs): a header made here can't know them. The header keeps
    // what a meta tag can't carry (frame-ancestors). API answers are data, so they get nothing.
    const security = [
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
      { key: "Permissions-Policy", value: "microphone=(self), geolocation=(self), camera=(), payment=(), usb=()" },
    ];
    return [
      { source: "/:path*", headers: security },
      ...["/api/:path*", "/plan/api/:path*", "/parents/api/:path*"].map((source) => ({
        source,
        headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" }],
      })),
      ...["/art/:path*", "/brand/:path*", "/icons/:path*", "/audio/:path*", "/maplibre/:path*"].map((source) => ({
        source,
        headers: cache,
      })),
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.googleusercontent.com" },
      { protocol: "https", hostname: "**.gstatic.com" },
      { protocol: "https", hostname: "streetviewpixels-pa.googleapis.com" },
      { protocol: "https", hostname: "serpapi.com" },
    ],
  },
};

// Serwist (offline for /parents) through its Turbopack route-handler build.
// next-intl runs without its build plugin: each layout passes its messages to NextIntlClientProvider.
// Docs: serwist.pages.dev/docs/next/turbo, next-intl.dev/docs/usage/configuration
export default withSerwist(nextConfig);
