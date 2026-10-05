/// <reference lib="webworker" />
import type { PrecacheEntry } from "serwist";
import {
  CacheableResponsePlugin,
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  RangeRequestsPlugin,
  Serwist,
  StaleWhileRevalidate,
} from "serwist";

/**
 * The parents' app service worker (scope /parents). The page, the week and its scripts are
 * cached when first loaded on home Wi-Fi; photos and audio are warmed through CACHE_URLS from
 * the page. Everything a parent needs during an outing then works with no connection.
 * Docs: serwist.pages.dev/docs/next/turbo, serwist.pages.dev/docs/serwist/runtime-caching
 */

declare const self: ServiceWorkerGlobalScope & { __SW_MANIFEST: (PrecacheEntry | string)[] | undefined };

const month = 60 * 60 * 24 * 30;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: { ignoreURLParametersMatching: [/^v$/, /^o$/] },
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    {
      // The start page and each parent's page. Views live in the query (?v=driver), so one
      // copy of each page, stored without the query, serves every screen. React Server
      // Component requests have their own format: skip them.
      matcher: ({ request, url }) =>
        (url.pathname === "/parents" || /^\/parents\/[a-z0-9-]+\/p_[a-z0-9_]+$/.test(url.pathname)) &&
        !url.searchParams.has("_rsc") &&
        request.headers.get("RSC") !== "1",
      handler: new NetworkFirst({
        cacheName: "parents-page",
        // On weak Wi-Fi, wait two seconds for a fresh copy before opening the saved one.
        networkTimeoutSeconds: 2,
        plugins: [
          {
            cacheKeyWillBeUsed: async ({ request }) => {
              const u = new URL(request.url);
              return `${u.origin}${u.pathname}`;
            },
            // Served as a fresh response so the phone stays on the address it asked for.
            cachedResponseWillBeUsed: async ({ cachedResponse }) =>
              cachedResponse
                ? new Response(cachedResponse.body, {
                    status: cachedResponse.status,
                    statusText: cachedResponse.statusText,
                    headers: cachedResponse.headers,
                  })
                : cachedResponse,
          },
        ],
      }),
    },
    {
      matcher: ({ url }) => url.pathname.startsWith("/parents/api/week/"),
      handler: new NetworkFirst({ cacheName: "parents-week", networkTimeoutSeconds: 3 }),
    },
    {
      matcher: ({ url }) => url.pathname.startsWith("/_next/static/"),
      handler: new CacheFirst({
        cacheName: "next-static",
        plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: month })],
      }),
    },
    {
      matcher: ({ url }) =>
        url.pathname.startsWith("/_next/image") || /\.(?:png|svg|webp|ico|woff2)$/.test(url.pathname),
      handler: new StaleWhileRevalidate({ cacheName: "assets" }),
    },
    {
      matcher: ({ url }) => url.pathname.startsWith("/demo/audio/"),
      handler: new CacheFirst({
        cacheName: "audio",
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new RangeRequestsPlugin(),
          new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: month }),
        ],
      }),
    },
    {
      // Place photos and Street View landmarks from search results.
      matcher: ({ url }) =>
        url.hostname.endsWith("googleusercontent.com") ||
        url.hostname === "streetviewpixels-pa.googleapis.com" ||
        url.hostname === "serpapi.com",
      handler: new CacheFirst({
        cacheName: "photos",
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({ maxEntries: 150, maxAgeSeconds: month }),
        ],
      }),
    },
  ],
});

serwist.addEventListeners();
