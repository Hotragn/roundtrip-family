import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Loads the repo's .env into process.env when it exists (values never printed). Codespaces
 * and Render provide the same names as environment variables, so a missing file is fine.
 */
let loaded = false;

export function repoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = resolve(dir, "..");
  }
  return process.cwd();
}

export async function loadEnv(): Promise<void> {
  if (loaded) return;
  loaded = true;
  const file = join(repoRoot(), ".env");
  if (!existsSync(file)) return;
  const dotenv = await import("dotenv");
  dotenv.config({ path: file, quiet: true, override: false });
}

/** True when a variable is set, without exposing its value. */
export function hasEnv(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** DEMO_ALERT_EMAIL, only when it is a valid address. Email is never sent anywhere else. */
export function alertEmail(): string | null {
  const v = process.env.DEMO_ALERT_EMAIL?.trim();
  return v && EMAIL.test(v) ? v : null;
}

export function numberEnv(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}
