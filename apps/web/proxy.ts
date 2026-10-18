import { type NextRequest, NextResponse } from "next/server";
import { POLICY } from "./scripts/defer-scripts.mjs";

/**
 * Pages that render per request (sign-in, a family's own setup, dashboard and parents' phones)
 * get a fresh script nonce: the same policy as the prerendered pages' (scripts/defer-scripts.mjs),
 * with the nonce in place of the hashes. Next puts the nonce on its own scripts.
 * A real family's /plan/<household> and /parents/<household>/<parent> are rewritten to their
 * dynamic pages; the demo households keep their prerendered ones.
 * Docs: node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md, and
 * 01-app/03-api-reference/03-file-conventions/proxy.md
 */
const FAMILY = /^\/(plan|parents)\/(fam-[a-f0-9]{12})(\/.*)?$/;

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
  const policy = POLICY.replace("HASHES", `'nonce-${nonce}' 'strict-dynamic'${dev}`);
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const m = FAMILY.exec(request.nextUrl.pathname);
  const res = m
    ? NextResponse.rewrite(new URL(`/${m[1]}/family/${m[2]}${m[3] ?? ""}`, request.url), { request: { headers } })
    : NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", policy);
  return res;
}

export const config = {
  matcher: [
    {
      source: "/(account|account/setup|plan/fam-[a-f0-9]{12}|parents/fam-[a-f0-9]{12}/[^/]+)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
