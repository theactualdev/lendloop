import { afterEach, describe, expect, test, vi } from "vitest";
import { loadGoogleFont } from "./og-fonts";

const CSS = `@font-face {
  font-family: 'Besley';
  font-weight: 800;
  src: url(https://fonts.gstatic.com/l/font?kit=abc) format('truetype');
}`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadGoogleFont", () => {
  test("returns null when the CSS request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(await loadGoogleFont("Besley", 800, "LendLoop")).toBeNull();
  });

  test("returns null when the CSS has no truetype source", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("/* nothing */")));
    expect(await loadGoogleFont("Besley", 800, "LendLoop")).toBeNull();
  });

  test("returns null when the font file request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(CSS))
        .mockResolvedValueOnce(new Response("gone", { status: 404 })),
    );
    expect(await loadGoogleFont("Besley", 800, "LendLoop")).toBeNull();
  });

  test("returns the font bytes for the family, weight and text asked for", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(CSS))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));
    vi.stubGlobal("fetch", fetchMock);

    const font = await loadGoogleFont("IBM Plex Mono", 600, "Tool library");

    expect(font && [...new Uint8Array(font)]).toEqual([1, 2, 3]);
    const cssUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(cssUrl.origin + cssUrl.pathname).toBe("https://fonts.googleapis.com/css2");
    expect(cssUrl.searchParams.get("family")).toBe("IBM Plex Mono:wght@600");
    expect(cssUrl.searchParams.get("text")).toBe("Tool library");
    expect(fetchMock.mock.calls[1][0]).toBe("https://fonts.gstatic.com/l/font?kit=abc");
  });
});
