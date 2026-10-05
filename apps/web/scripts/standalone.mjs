import { cpSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

/**
 * Next.js standalone output leaves out the static files and public/; copy them next to the
 * server so `node .next/standalone/apps/web/server.js` serves the whole site (Render runs this).
 * Docs: node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md
 */
const web = join(import.meta.dirname, "..");
const target = join(web, ".next/standalone/apps/web");
if (!existsSync(target)) {
  console.error("No standalone output. Run next build first.");
  process.exit(1);
}
for (const [from, to] of [
  [join(web, ".next/static"), join(target, ".next/static")],
  [join(web, "public"), join(target, "public")],
]) {
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
}
console.log("Standalone server ready: node apps/web/.next/standalone/apps/web/server.js");
