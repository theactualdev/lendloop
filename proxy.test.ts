import { describe, expect, it } from "vitest";
import { config } from "./proxy";

// Next.js anchors matcher patterns to the whole path.
const matcher = new RegExp("^" + config.matcher[0] + "$");

describe("proxy matcher", () => {
  it.each(["/listings/abcjsxyz", "/admin/zip", "/board", "/requests/k17pngx"])(
    "runs the middleware for %s",
    (path) => {
      expect(matcher.test(path)).toBe(true);
    },
  );

  it("runs for /privacy and /, which proxy.ts leaves public", async () => {
    expect(matcher.test("/privacy")).toBe(true);
    expect(matcher.test("/")).toBe(true);
    const source = (await import("node:fs")).readFileSync(new URL("./proxy.ts", import.meta.url), "utf8");
    const protectedList = source.match(/createRouteMatcher\(\[([\s\S]*?)\]\)/)?.[1] ?? "";
    expect(protectedList).not.toContain("privacy");
    expect(protectedList).not.toMatch(/"\/\(/);
  });

  it.each(["/favicon.ico", "/logo.png", "/_next/static/chunk.js"])(
    "skips the middleware for %s",
    (path) => {
      expect(matcher.test(path)).toBe(false);
    },
  );
});
