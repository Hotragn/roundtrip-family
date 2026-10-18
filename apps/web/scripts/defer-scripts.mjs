import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Prerendered pages start Next's scripts just after the first paint instead of before it. The
 * page is already complete HTML, so nothing visible waits for them; hydration moves by a frame,
 * and the first paint no longer shares the connection with about 250 KB of JavaScript (most of
 * a slow phone's Lighthouse time, docs/numbers.md). The scripts are async already, so their
 * order doesn't change. React 19 finds them again by `script[async][src]` when it hydrates.
 */
const CHUNK = /<script src="(\/_next\/static\/chunks\/[^"]+\.js)"((?: id="[^"]*")?) async=""><\/script>/g;
const PRELOAD = /<link rel="preload" as="script" fetchPriority="low" href="\/_next\/static\/chunks\/[^"]+\.js"\/>/g;
// After the browser reports the first contentful paint; straight away in a hidden tab, which never
// paints, and after 2 s at most if the paint is never reported.
const LOADER = `<script>(function(){var d=0;function go(){if(d)return;d=1;document.querySelectorAll("script[data-defer-src]").forEach(function(o){var s=document.createElement("script");s.src=o.getAttribute("data-defer-src");s.setAttribute("async","");if(o.id)s.id=o.id;o.replaceWith(s)})}try{new PerformanceObserver(function(l){if(l.getEntriesByName("first-contentful-paint").length)setTimeout(go,0)}).observe({type:"paint",buffered:true})}catch(e){go()}if(document.visibilityState!=="visible")go();setTimeout(go,2000)})()</script>`;

export function deferScripts(html) {
  if (html.includes("data-defer-src")) return html;
  const out = html.replace(PRELOAD, "").replace(CHUNK, '<script data-defer-src="$1"$2></script>');
  return out === html ? html : out.replace("</body>", `${LOADER}</body>`);
}

/**
 * The script policy for prerendered pages, as a meta tag (docs/decisions.md). A per-request
 * nonce can't go into HTML made at build time, so each page allows its own inline scripts by
 * their sha256 (Next's page data, the loader above, the guide and early-tap scripts) and
 * scripts from this site; nothing else runs. Every page route is prerendered, so this covers
 * every HTML page; the response header (next.config.ts) adds frame-ancestors, which a meta tag
 * can't carry. Styles allow 'unsafe-inline': the server HTML carries style attributes (React's
 * style prop, Next's font variables), and a style can't run code. MapLibre starts its workers
 * from blob URLs; map tiles come from OpenFreeMap; place photos from the image hosts in
 * next.config.ts (packages/core/src/privacy/outbound.ts lists the browser's hosts).
 */
export const POLICY = [
  "default-src 'self'",
  "script-src 'self' HASHES",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.googleusercontent.com https://*.gstatic.com https://streetviewpixels-pa.googleapis.com https://serpapi.com",
  "font-src 'self'",
  "connect-src 'self' https://tiles.openfreemap.org",
  "media-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const INLINE = /<script(?![^>]*\ssrc=)(?:\s[^>]*)?>([\s\S]*?)<\/script>/g;
const META = /<meta http-equiv="Content-Security-Policy" content="[^"]*"\/>/;

/** Adds (or refreshes) the page's policy just after its charset, before any script. */
export function addPolicy(html) {
  const bare = html.replace(META, "");
  const hashes = new Set();
  for (const [, body] of bare.matchAll(INLINE)) {
    if (body) hashes.add(`'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`);
  }
  const meta = `<meta http-equiv="Content-Security-Policy" content="${POLICY.replace("HASHES", [...hashes].join(" "))}"/>`;
  const at = bare.indexOf('<meta charSet="utf-8"/>');
  if (at < 0) return bare.replace("<head>", `<head>${meta}`);
  const end = at + '<meta charSet="utf-8"/>'.length;
  return bare.slice(0, end) + meta + bare.slice(end);
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith(".html")) writeFileSync(p, addPolicy(deferScripts(readFileSync(p, "utf8"))));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const web = join(import.meta.dirname, "..");
  walk(join(web, ".next/server/app"));
  walk(join(web, ".next/standalone/apps/web/.next/server/app"));
  console.log("Prerendered pages start their scripts after the first paint and carry their script policy.");
}
