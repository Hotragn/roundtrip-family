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
  // Styles arrive inside the HTML: no render-blocking request on a slow phone connection, and
  // the parents' page cached for offline carries its own styles.
  // Docs: node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/inlineCss.md
  experimental: { inlineCss: true },
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
