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
// paints, and after 2 s at most if the paint is never reported. Until the paint, it adds and
// removes an invisible 1 px element every 200 ms: Chrome sometimes holds a finished first frame
// until the page changes (docs/decisions.md, 141), and this is a change that loads nothing.
const LOADER = `<script>(function(){var d=0,p=0;function go(){if(d)return;d=1;document.querySelectorAll("script[data-defer-src]").forEach(function(o){var s=document.createElement("script");s.src=o.getAttribute("data-defer-src");s.setAttribute("async","");if(o.id)s.id=o.id;o.replaceWith(s)})}function nudge(n){if(p||d||n>9)return;var e=document.createElement("i");e.style.cssText="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none";document.body.appendChild(e);setTimeout(function(){e.remove();nudge(n+1)},200)}try{new PerformanceObserver(function(l){if(l.getEntriesByName("first-contentful-paint").length){p=1;setTimeout(go,0)}}).observe({type:"paint",buffered:true})}catch(e){go()}if(document.visibilityState!=="visible")go();nudge(0);setTimeout(go,2000)})()</script>`;

export function deferScripts(html) {
  if (html.includes("data-defer-src")) return html;
  const out = html.replace(PRELOAD, "").replace(CHUNK, '<script data-defer-src="$1"$2></script>');
  return out === html ? html : out.replace("</body>", `${LOADER}</body>`);
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith(".html")) writeFileSync(p, deferScripts(readFileSync(p, "utf8")));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const web = join(import.meta.dirname, "..");
  walk(join(web, ".next/server/app"));
  walk(join(web, ".next/standalone/apps/web/.next/server/app"));
  console.log("Prerendered pages start their scripts after the first paint.");
}
