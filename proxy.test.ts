import { describe, expect, it } from "vitest";
import { config } from "./proxy";

// Next.js anchors matcher patterns to the whole path; a path runs the proxy if any entry matches.
const matchers = config.matcher.map((pattern) => new RegExp("^" + pattern + "$"));
const runs = (path: string) => matchers.some((matcher) => matcher.test(path));

describe("proxy matcher", () => {
  it.each(["/listings/abcjsxyz", "/admin/zip", "/board", "/requests/k17pngx", "/incoming", "/api/x"])(
    "runs the middleware for %s",
    (path) => {
      expect(runs(path)).toBe(true);
    },
  );

  // Clerk's development instance answers an HTML request that lacks its cookie
  // with a handshake redirect. Crawlers keep no cookies, so they would loop and
  // never reach the public pages, which need no server-side auth.
  it.each([
    "/",
    "/privacy",
    "/robots.txt",
    "/sitemap.xml",
    "/opengraph-image",
    "/apple-icon",
    "/icon.svg",
  ])("leaves the public path %s to crawlers", (path) => {
    expect(runs(path)).toBe(false);
  });

  it("protects only the member routes", async () => {
    const source = (await import("node:fs")).readFileSync(new URL("./proxy.ts", import.meta.url), "utf8");
    const protectedList = source.match(/createRouteMatcher\(\[([\s\S]*?)\]\)/)?.[1] ?? "";
    expect(protectedList).not.toContain("privacy");
    expect(protectedList).not.toMatch(/"\/\(/);
  });

  it.each(["/favicon.ico", "/logo.png", "/_next/static/chunk.js"])(
    "skips the middleware for %s",
    (path) => {
      expect(runs(path)).toBe(false);
    },
  );
});
