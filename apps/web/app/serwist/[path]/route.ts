import { createSerwistRoute } from "@serwist/turbopack";

// Serves the built service worker at /serwist/sw.js (serwist.pages.dev/docs/next/turbo).
// The page registers it with scope /parents; the response allows that scope.
export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: "app/sw.ts",
  useNativeEsbuild: true,
  // Precache only what the parents' app shows; its scripts are cached from the page itself.
  // Files globbed from public/ come out as "brand/x.svg", so give them their site path.
  globPatterns: ["brand/*.svg", "icons/icon-192.png"],
  globDirectory: "public",
  modifyURLPrefix: { "": "/" },
});
