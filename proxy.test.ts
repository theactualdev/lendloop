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

  it.each(["/favicon.ico", "/logo.png", "/_next/static/chunk.js"])(
    "skips the middleware for %s",
    (path) => {
      expect(matcher.test(path)).toBe(false);
    },
  );
});
