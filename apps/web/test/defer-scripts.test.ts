import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { addPolicy, deferScripts } from "../scripts/defer-scripts.mjs";

describe("starting Next's scripts after the first paint", () => {
  const page =
    '<head><link rel="preload" as="script" fetchPriority="low" href="/_next/static/chunks/a.js"/>' +
    '<script src="/_next/static/chunks/b.js" async=""></script>' +
    '<script src="/_next/static/chunks/a.js" id="_R_" async=""></script>' +
    '<script src="/_next/static/chunks/p.js" noModule=""></script></head><body><p>Hi</p></body>';

  it("holds every chunk until after the paint, keeps ids, and adds the loader once", () => {
    const out = deferScripts(page);
    expect(out).not.toContain('<script src="/_next/static/chunks/b.js"');
    expect(out).not.toContain('rel="preload" as="script"');
    expect(out).toContain('<script data-defer-src="/_next/static/chunks/a.js" id="_R_"></script>');
    expect(out).toContain('noModule=""');
    expect(out.match(/PerformanceObserver/g)).toHaveLength(1);
    expect(deferScripts(out)).toBe(out);
  });

  it("leaves a page without chunks alone", () => {
    expect(deferScripts("<body></body>")).toBe("<body></body>");
  });
});

describe("the script policy on prerendered pages", () => {
  const sha = (s: string) => `'sha256-${createHash("sha256").update(s).digest("base64")}'`;
  const page =
    '<html><head><meta charSet="utf-8"/><script src="/_next/static/chunks/a.js" async=""></script></head>' +
    '<body><script>self.__next_f.push([1,"x"])</script><script id="g">try{hide()}catch(e){}</script></body></html>';

  it("allows exactly the page's inline scripts, before any script runs", () => {
    const out: string = addPolicy(deferScripts(page));
    const policy = out.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"\/>/)?.[1] ?? "";
    const scriptSrc = policy.split("; ").find((d) => d.startsWith("script-src")) ?? "";
    const hashes = scriptSrc.split(" ").filter((t) => t.startsWith("'sha256-"));
    const inline = [...out.matchAll(/<script(?![^>]*\ssrc=)(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
      .map((m) => m[1]!)
      .filter(Boolean);
    expect(inline).toHaveLength(3); // page data, the hide script, the loader
    expect(hashes.sort()).toEqual(inline.map(sha).sort());
    expect(scriptSrc).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
    expect(out.indexOf("Content-Security-Policy")).toBeLessThan(out.indexOf("<script"));
    expect(policy).toContain("worker-src 'self' blob:");
    expect(policy).toContain("object-src 'none'");
  });

  it("recomputes instead of stacking on a second run", () => {
    const once = addPolicy(deferScripts(page));
    expect(addPolicy(once)).toBe(once);
    expect(once.match(/Content-Security-Policy/g)).toHaveLength(1);
  });
});
