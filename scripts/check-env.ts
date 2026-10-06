/**
 * Says which keys are set, without printing any value: SET or MISSING for each name, plus a
 * format check where one is cheap (a number, an email address). Reads .env when it exists, like
 * every script here, and makes no network calls.
 * Run: pnpm check-env
 */
import { loadEnv } from "@roundtrip/core/server-env";

await loadEnv();

const KEYS: Array<{ name: string; for: string; check?: (v: string) => string | null }> = [
  { name: "CLOUDFLARE_ACCOUNT_ID", for: "Gemma 4 on Workers AI" },
  { name: "CLOUDFLARE_API_TOKEN", for: "Gemma 4 on Workers AI" },
  { name: "OPENROUTER_API_KEY", for: "Gemma 4 fallback" },
  { name: "TABPFN_TOKEN", for: "the ranker (Prior Labs API)" },
  { name: "SERPAPI_API_KEY", for: "live searches (scripts only)" },
  { name: "SERPAPI_MAX_SEARCHES", for: "the search cap", check: number },
  { name: "TINKER_API_KEY", for: "the card writer" },
  { name: "MAX_TINKER_SPEND_USD", for: "the Tinker spend cap", check: number },
  { name: "HF_TOKEN", for: "speech models and publishing the adapter" },
  { name: "MONGODB_URI", for: "sessions and the diary in Atlas (memory without it)" },
  { name: "DIARY_ENCRYPTION_KEY", for: "diary encryption (generated on Render; a dev key locally)" },
  { name: "AGENTMAIL_API_KEY", for: "email to the adult child" },
  { name: "DEMO_ALERT_EMAIL", for: "the only address email may go to", check: email },
  { name: "SENTRY_DSN", for: "errors and traces on Render" },
  { name: "RENDER_API_KEY", for: "scripts/render-deploy.ts" },
  { name: "ELEVENLABS_API_KEY", for: "optional demo clips" },
  { name: "ELEVENLABS_MAX_CHARS", for: "the ElevenLabs cap", check: number },
  { name: "DEMO_LANGUAGE", for: "the demo's parent language" },
];

function number(v: string): string | null {
  return Number.isFinite(Number(v)) ? null : "not a number";
}

function email(v: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : "not an email address, so no email is sent";
}

const width = Math.max(...KEYS.map((k) => k.name.length));
for (const k of KEYS) {
  const v = process.env[k.name]?.trim() ?? "";
  const problem = v && k.check ? k.check(v) : null;
  const status = !v ? "MISSING" : problem ? `SET (${problem})` : "SET";
  console.log(`${k.name.padEnd(width)}  ${status.padEnd(9)}  ${k.for}`);
}
