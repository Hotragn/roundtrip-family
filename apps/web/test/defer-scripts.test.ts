import { describe, expect, it } from "vitest";
import { deferScripts } from "../scripts/defer-scripts.mjs";

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
