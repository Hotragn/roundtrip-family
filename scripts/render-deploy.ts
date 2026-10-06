/**
 * Deploys the demo to Render's free tier: the web app (Next.js standalone) and the ranker
 * (FastAPI on tabpfn-client), from the public GitHub repo. Creates each service the first time,
 * then keeps its settings in line and starts a deploy. Keys are read from .env inside this
 * process and sent only to Render; nothing here prints a value, only key names.
 *
 * Docs: https://api-docs.render.com/reference/create-service (services and env vars),
 * https://api-docs.render.com/reference/create-deploy, https://render.com/docs/free (free tier).
 * Run: pnpm --filter @roundtrip/scripts exec tsx render-deploy.ts [--no-deploy]
 */
import { outboundFetch } from "@roundtrip/core/privacy";
import { loadEnv } from "@roundtrip/core/server-env";

await loadEnv();
const KEY = process.env.RENDER_API_KEY;
if (!KEY) {
  console.error("RENDER_API_KEY is MISSING. Nothing deployed.");
  process.exit(1);
}
const API = "https://api.render.com/v1";
const REPO = "https://github.com/Hotragn/roundtrip-family";
const deploy = !process.argv.includes("--no-deploy") && !process.argv.includes("--status");
const statusOnly = process.argv.includes("--status");

async function render<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await outboundFetch("render.api", "public", `${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, Accept: "application/json", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Render ${method} ${path}: HTTP ${res.status} ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : null) as T;
}

interface Service {
  id: string;
  name: string;
  serviceDetails?: { url?: string };
}

const owners = await render<Array<{ owner: { id: string; name: string; type: string } }>>("GET", "/owners?limit=20");
const owner = owners[0]?.owner;
if (!owner) throw new Error("No Render workspace for this key.");
console.log(`Workspace: ${owner.name} (${owner.type})`);

async function find(name: string): Promise<Service | null> {
  const list = await render<Array<{ service: Service }>>("GET", `/services?name=${encodeURIComponent(name)}&limit=20`);
  return list.map((x) => x.service).find((s) => s.name === name) ?? null;
}

/** Settings copied from .env by name; a key that isn't set is skipped and reported. */
function fromEnv(keys: string[]): Array<{ key: string; value: string }> {
  return keys.flatMap((key) => {
    const value = process.env[key];
    console.log(`  ${key}: ${value ? "SET" : "MISSING (skipped)"}`);
    return value ? [{ key, value }] : [];
  });
}

async function ensure(
  name: string,
  details: Record<string, unknown>,
  rootDir: string,
  env: Array<{ key: string; value: string }>,
  generated: string[],
): Promise<Service> {
  let svc = await find(name);
  if (!svc) {
    console.log(`Creating ${name}`);
    const created = await render<{ service: Service }>("POST", "/services", {
      type: "web_service",
      name,
      ownerId: owner!.id,
      repo: REPO,
      branch: "main",
      rootDir,
      // Deploys start from this script at each milestone, so free build minutes aren't spent per push.
      autoDeployTrigger: "off",
      envVars: [...env, ...generated.map((key) => ({ key, generateValue: true }))],
      serviceDetails: details,
    });
    svc = created.service;
  } else {
    console.log(`Updating ${name}`);
    await render("PATCH", `/services/${svc.id}`, { rootDir, serviceDetails: details });
    for (const e of env) await render("PUT", `/services/${svc.id}/env-vars/${e.key}`, { value: e.value });
    // Generated values are made once and never replaced: a new diary key would orphan stored entries.
    const have = await render<Array<{ envVar: { key: string } }>>("GET", `/services/${svc.id}/env-vars?limit=100`);
    const keys = new Set(have.map((x) => x.envVar.key));
    for (const key of generated) {
      if (!keys.has(key)) await render("PUT", `/services/${svc.id}/env-vars/${key}`, { generateValue: true });
    }
  }
  return svc;
}

/** The latest deploy of each service, for `--status`. */
async function latest(svc: Service) {
  const list = await render<
    Array<{ deploy: { id: string; status: string; finishedAt?: string; commit?: { id: string } } }>
  >("GET", `/services/${svc.id}/deploys?limit=1`);
  const d = list[0]?.deploy;
  console.log(
    `${svc.name}: ${d ? `${d.status}${d.commit ? ` at ${d.commit.id.slice(0, 7)}` : ""}` : "no deploys"} ${svc.serviceDetails?.url ?? ""}`,
  );
}

if (statusOnly) {
  for (const name of ["roundtrip-ranker", "roundtrip-web"]) {
    const svc = await find(name);
    if (svc) await latest(svc);
    else console.log(`${name}: not created`);
  }
  process.exit(0);
}

console.log("Ranker settings:");
const ranker = await ensure(
  "roundtrip-ranker",
  {
    runtime: "python",
    plan: "free",
    region: "oregon",
    healthCheckPath: "/health",
    envSpecificDetails: {
      buildCommand: "pip install uv && uv sync --frozen --no-dev",
      startCommand: "uv run --no-sync uvicorn ranker.app:app --host 0.0.0.0 --port $PORT",
    },
  },
  "ranker",
  [{ key: "PYTHON_VERSION", value: "3.12.10" }, ...fromEnv(["TABPFN_TOKEN"])],
  [],
);
const rankerUrl = ranker.serviceDetails?.url ?? "https://roundtrip-ranker.onrender.com";

console.log("Web settings:");
const web = await ensure(
  "roundtrip-web",
  {
    runtime: "node",
    plan: "free",
    region: "oregon",
    healthCheckPath: "/api/health",
    envSpecificDetails: {
      // pnpm through npx (no global install needed); dev dependencies are build tools here.
      buildCommand: "npx -y pnpm@9.15.0 install --frozen-lockfile --prod=false && npx -y pnpm@9.15.0 build",
      startCommand: "node apps/web/.next/standalone/apps/web/server.js",
    },
  },
  "",
  [
    { key: "NODE_VERSION", value: "24" },
    // Render sets HOSTNAME to the container's name; the standalone server should listen everywhere.
    { key: "HOSTNAME", value: "0.0.0.0" },
    { key: "RANKER_URL", value: rankerUrl },
    // The hosted demo never spends searches: it replays the saved ones.
    { key: "SERPAPI_MODE", value: "replay" },
    ...fromEnv([
      "MONGODB_URI",
      "CLOUDFLARE_ACCOUNT_ID",
      "CLOUDFLARE_API_TOKEN",
      "OPENROUTER_API_KEY",
      "SENTRY_DSN",
      "AGENTMAIL_API_KEY",
      "DEMO_ALERT_EMAIL",
      "DEMO_LANGUAGE",
    ]),
  ],
  ["DIARY_ENCRYPTION_KEY"],
);

if (deploy) {
  for (const svc of [ranker, web]) {
    const d = await render<{ id: string; status: string } | null>("POST", `/services/${svc.id}/deploys`, {
      clearCache: "do_not_clear",
    });
    console.log(`Deploy for ${svc.name}: ${d ? `${d.status} (${d.id})` : "queued"}`);
  }
}
console.log(`Web: ${web.serviceDetails?.url ?? "(URL appears after the first deploy)"}`);
console.log(`Ranker: ${rankerUrl}`);
