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

  const protectedList = async () => {
    const source = (await import("node:fs")).readFileSync(new URL("./proxy.ts", import.meta.url), "utf8");
    return source.match(/createRouteMatcher\(\[([\s\S]*?)\]\)/)?.[1] ?? "";
  };

  it("protects only the member routes", async () => {
    const list = await protectedList();
    expect(list).not.toContain("privacy");
    expect(list).not.toMatch(/"\/\(/);
  });

  // The routes appear twice in proxy.ts: a route added to isProtectedRoute but
  // not to the matcher would never reach auth.protect().
  it("runs the middleware on every protected route", async () => {
    const prefixes = [...(await protectedList()).matchAll(/"(\/[a-z-]+)\(\.\*\)"/g)].map((m) => m[1]);
    expect(prefixes.length).toBeGreaterThan(0);
    for (const prefix of prefixes) expect(runs(prefix), prefix).toBe(true);
  });

  it.each(["/favicon.ico", "/logo.png", "/_next/static/chunk.js"])(
    "skips the middleware for %s",
    (path) => {
      expect(runs(path)).toBe(false);
    },
  );
});
