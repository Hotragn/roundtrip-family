import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/**
 * MapLibre GL 6 runs its tile work in a module worker, found next to its own script by
 * import.meta.url. Bundled into a Next.js chunk that file isn't there, so copy the worker and the
 * code it shares into public/maplibre/<version>/ and point MapLibre at it with setWorkerUrl().
 * Docs: https://maplibre.org/maplibre-gl-js/docs/API/functions/setWorkerUrl/
 */
const web = join(import.meta.dirname, "..");
const require = createRequire(join(web, "package.json"));
const pkg = require.resolve("maplibre-gl/package.json");
const { version } = JSON.parse(readFileSync(pkg, "utf8"));
const from = join(dirname(pkg), "dist");
const root = join(web, "public/maplibre");
const to = join(root, version);
const files = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

if (!files.every((f) => existsSync(join(to, f)))) {
  rmSync(root, { recursive: true, force: true });
  mkdirSync(to, { recursive: true });
  for (const f of files) copyFileSync(join(from, f), join(to, f));
  console.log(`MapLibre ${version} worker copied to public/maplibre/${version}/`);
}
