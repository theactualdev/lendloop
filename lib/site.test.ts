import { describe, expect, test } from "vitest";
import { AUTHOR, jsonLd, OG_IMAGE, pageMetadata, PUBLIC_PAGES, siteUrl, structuredData } from "./site";

describe("siteUrl", () => {
  test("is the Vercel production address when deployed", () => {
    expect(siteUrl({ VERCEL_PROJECT_PRODUCTION_URL: "lendloop.example.app" })).toBe(
      "https://lendloop.example.app",
    );
  });

  test("falls back to the local server", () => {
    expect(siteUrl({})).toBe("http://localhost:3000");
  });
});

describe("pageMetadata", () => {
  // Next merges metadata one level deep, so a page that set only some Open Graph
  // fields would inherit the home page's og:url. Each page gets the whole object.
  test("gives a page its own canonical, og:url and full Open Graph", () => {
    const meta = pageMetadata({
      title: "Privacy policy · LendLoop",
      description: "What is stored.",
      path: "/privacy",
    });
    expect(meta.title).toEqual({ absolute: "Privacy policy · LendLoop" });
    expect(meta.description).toBe("What is stored.");
    expect(meta.alternates?.canonical).toBe("/privacy");
    expect(meta.openGraph).toMatchObject({
      type: "website",
      siteName: "LendLoop",
      url: "/privacy",
      title: "Privacy policy · LendLoop",
      description: "What is stored.",
    });
  });

  // A page's own openGraph object replaces the one carrying the root
  // opengraph-image, so without this the privacy page shared with no picture.
  test("keeps the preview image on every page", () => {
    const meta = pageMetadata({ title: "t", description: "d", path: "/privacy" });
    const image = { url: "/opengraph-image", width: 1200, height: 630, alt: OG_IMAGE.alt };
    expect(meta.openGraph?.images).toEqual([expect.objectContaining(image)]);
    expect(meta.twitter).toMatchObject({ card: "summary_large_image", images: [expect.objectContaining(image)] });
  });
});

describe("PUBLIC_PAGES", () => {
  test("lists the home and privacy pages with real dates", () => {
    expect(PUBLIC_PAGES.map((page) => page.path)).toEqual(["/", "/privacy"]);
    for (const page of PUBLIC_PAGES) expect(page.lastModified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("structuredData", () => {
  const graph = (structuredData("https://x.app") as { "@graph": Record<string, unknown>[] })["@graph"];
  const node = (type: string) => graph.find((n) => n["@type"] === type);

  test("names the site LendLoop at its home URL", () => {
    expect(node("WebSite")).toMatchObject({ name: "LendLoop", url: "https://x.app/" });
  });

  test("uses the 180 px home-screen icon as the logo", () => {
    expect(node("Organization")).toMatchObject({ name: "LendLoop", logo: "https://x.app/apple-icon" });
  });

  test("describes a free web app credited to its author", () => {
    expect(node("WebApplication")).toMatchObject({
      name: "LendLoop",
      offers: { "@type": "Offer", price: "0" },
      creator: { "@type": "Person", name: AUTHOR.name },
    });
  });

  test("claims no ratings", () => {
    expect(JSON.stringify(graph)).not.toContain("Rating");
  });
});

describe("jsonLd", () => {
  test("escapes < so the script can't be closed early", () => {
    const out = jsonLd({ text: "</script><b>" });
    expect(out).not.toContain("<");
    expect(JSON.parse(out)).toEqual({ text: "</script><b>" });
  });
});
