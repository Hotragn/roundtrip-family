import path from "node:path";
import { loadEnvConfig } from "@next/env";
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
    "/*": ["../../data/persona/**/*", "../../data/demo/**/*.json"],
  },
  transpilePackages: ["@roundtrip/core", "@roundtrip/agent"],
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.googleusercontent.com" },
      { protocol: "https", hostname: "**.gstatic.com" },
    ],
  },
};

export default nextConfig;
