/**
 * Privacy check: audits outbound network calls against the rules in CLAUDE.md.
 *
 * 1. Every host a source file calls must be listed in packages/core/src/privacy/outbound.ts.
 * 2. Every fetch to an absolute URL goes through outboundFetch() or follows assertOutbound().
 * 3. Network SDKs may only be imported by the files that own them.
 * 4. With --write, docs/privacy-table.md is regenerated from the registry.
 *
 * Run: pnpm privacy-check [--write]
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { OUTBOUND } from "@roundtrip/core/privacy";
import { repoRoot } from "@roundtrip/core/server-env";

const ROOT = repoRoot();
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "dist",
  ".git",
  "data",
  "docs",
  "brand",
  "test-results",
  ".venv",
  "fixtures",
  "public",
  ".downloads",
  "__pycache__",
]);
const EXTS = new Set([".ts", ".tsx", ".mjs", ".py"]);

/** Hosts that appear in code but are never called with household data. */
const NON_CALL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "www.w3.org",
  "schemas.xmlsoap.org",
  "github.com",
  "biomejs.dev",
  "ui.shadcn.com",
  "json-schema.org",
  "example.com",
  "evil.example.com",
  "gemma",
]);

/** SDKs that open network connections, and the only files allowed to import them. */
const SDK_OWNERS: Record<string, RegExp> = {
  mongodb: /^agent\/src\/db\//,
  serpapi: /^agent\/src\/tools\/serpapi/,
  agentmail: /^agent\/src\/email\//,
  "@sentry/": /^apps\/web\/(instrumentation|sentry)|^agent\/src\/observability\//,
  tabpfn_client: /^ranker\//,
  tinker: /^finetune\/|^scripts\/model-check\//,
  huggingface_hub: /^finetune\/|^speech\//,
  elevenlabs: /^speech\/|^agent\/src\/voice\//,
};

interface Finding {
  level: "ok" | "violation";
  file: string;
  line: number;
  message: string;
  fix?: string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (EXTS.has(extname(name))) out.push(p);
  }
  return out;
}

/** Blanks out comments and docstrings, keeping line numbers. */
function stripComments(src: string, py: boolean): string {
  const keepLines = (m: string) => m.replace(/[^\n]/g, " ");
  if (py) return src.replace(/("""|''')[\s\S]*?\1/g, keepLines).replace(/#[^\n]*/g, keepLines);
  return src
    .replace(/\/\*[\s\S]*?\*\//g, keepLines)
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, (m, p1) => p1 + keepLines(m.slice(p1.length)));
}

const knownHosts = OUTBOUND.flatMap((r) => r.hosts);
const isKnown = (host: string) => knownHosts.some((h) => host === h || host.endsWith(`.${h}`));

const isTest = (rel: string) =>
  /(^|\/)(test|tests|e2e)\//.test(rel) || /\.test\.tsx?$|_test\.py$|test_.*\.py$/.test(rel);

export function audit(): Finding[] {
  const findings: Finding[] = [];
  for (const file of walk(ROOT)) {
    const rel = relative(ROOT, file).replaceAll("\\", "/");
    if (rel === "scripts/privacy-check.ts") continue;
    const py = file.endsWith(".py");
    const code = stripComments(readFileSync(file, "utf8"), py);
    const lines = code.split("\n");
    lines.forEach((text, i) => {
      // Citations of documentation pages are references, not calls.
      const citation =
        /^\s*(docs|source|homepage|license|credit)\s*:/.test(text) ||
        /(docs|source|homepage|license|credit)\s*:\s*$/.test(lines[i - 1] ?? "");
      for (const m of citation ? [] : text.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,}|localhost|127\.0\.0\.1)/gi)) {
        const host = m[1]!.toLowerCase();
        if (NON_CALL_HOSTS.has(host)) continue;
        if (isKnown(host))
          findings.push({ level: "ok", file: rel, line: i + 1, message: `calls ${host} (registered)` });
        else if (!isTest(rel))
          findings.push({
            level: "violation",
            file: rel,
            line: i + 1,
            message: `calls ${host}, which isn't in the outbound registry`,
            fix: "Add a route to packages/core/src/privacy/outbound.ts with what it sends, or remove the call.",
          });
      }
      if (!py && !isTest(rel) && /\bfetch\(\s*["'`]https?:/.test(text)) {
        findings.push({
          level: "violation",
          file: rel,
          line: i + 1,
          message: "fetch to an absolute URL without the privacy guard",
          fix: "Use outboundFetch(routeId, dataClass, url) from @roundtrip/core/privacy.",
        });
      }
      for (const [sdk, owner] of Object.entries(SDK_OWNERS)) {
        const imported = py
          ? new RegExp(`^\\s*(from|import)\\s+${sdk.replace("/", "")}\\b`).test(text)
          : new RegExp(`from\\s+["']${sdk.replace("/", "\\/")}`).test(text);
        if (imported && !owner.test(rel) && !isTest(rel)) {
          findings.push({
            level: "violation",
            file: rel,
            line: i + 1,
            message: `imports ${sdk} outside its owner module`,
            fix: `Move the call into the module matching ${owner} so the privacy rules stay in one place.`,
          });
        }
      }
    });
  }
  return findings;
}

export function privacyTable(): string {
  const rows = OUTBOUND.map(
    (r) => `| ${r.service} | ${r.sends} | ${r.purpose} | ${r.accepts.join(", ")} | ${r.when} | [docs](${r.docs}) |`,
  );
  return [
    "# Where data goes",
    "",
    "Generated from `packages/core/src/privacy/outbound.ts` by `pnpm privacy-check --write`. The privacy check fails when code calls a host that isn't listed here.",
    "",
    "Data classes: **public** (search terms with only language, interest and area; public listings), **synthetic** (the fictional demo households), **anonymized** (family data with names, contacts, addresses, quotes and ratings removed), **personal** (real family data, which never leaves the family's own database and hardware).",
    "",
    "| Service | What it receives | Why | Data classes allowed | When | Source |",
    "|---|---|---|---|---|---|",
    ...rows,
    "",
    "In demo mode everything is synthetic. Diary entries are encrypted before storage in every mode, and no route carries diary content.",
    "",
  ].join("\n");
}

if (process.argv[1]?.endsWith("privacy-check.ts")) {
  const findings = audit();
  const violations = findings.filter((f) => f.level === "violation");
  const oks = findings.filter((f) => f.level === "ok");
  const byHost = new Map<string, number>();
  for (const f of oks) byHost.set(f.message, (byHost.get(f.message) ?? 0) + 1);
  for (const [msg, n] of byHost) console.log(`OK         ${msg} (${n} place${n === 1 ? "" : "s"})`);
  for (const v of violations) console.log(`VIOLATION  ${v.file}:${v.line} ${v.message}\n           fix: ${v.fix}`);
  if (process.argv.includes("--write")) {
    writeFileSync(join(ROOT, "docs/privacy-table.md"), privacyTable(), "utf8");
    console.log("Wrote docs/privacy-table.md");
  }
  console.log(`\n${violations.length} violation(s), ${oks.length} registered call site(s).`);
  process.exit(violations.length ? 1 : 0);
}
