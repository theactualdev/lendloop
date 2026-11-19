import { describe, expect, test } from "vitest";
import { checkHtmlPage, checkRobots, checkSitemap } from "./seo-check";

const BASE = "https://lendloop.example.app";
const head = (canonical: string, ogImage: string, extra = "") =>
  `<html><head><title>LendLoop</title><link rel="canonical" href="${canonical}"/>` +
  `<meta property="og:image" content="${ogImage}"/>${extra}</head><body></body></html>`;
const page = (over: Partial<Parameters<typeof checkHtmlPage>[0]> = {}) => ({
  url: `${BASE}/privacy`,
  status: 200,
  headers: {},
  html: head(`${BASE}/privacy`, `${BASE}/opengraph-image`),
  ...over,
});

describe("checkHtmlPage", () => {
  test("passes a page crawlers can index", () => {
    expect(checkHtmlPage(page())).toEqual([]);
  });

  test("accepts the home canonical with or without the trailing slash", () => {
    expect(checkHtmlPage(page({ url: `${BASE}/`, html: head(BASE, `${BASE}/opengraph-image`) }))).toEqual([]);
  });

  test("flags a redirect or error status", () => {
    expect(checkHtmlPage(page({ status: 307, headers: { location: "https://x.dev/handshake" } }))).toEqual([
      expect.stringContaining("307"),
    ]);
  });

  test("flags a noindex header", () => {
    expect(checkHtmlPage(page({ headers: { "x-robots-tag": "noindex" } }))).toEqual([
      expect.stringContaining("X-Robots-Tag"),
    ]);
  });

  test("flags a noindex robots meta tag", () => {
    const html = head(`${BASE}/privacy`, `${BASE}/opengraph-image`, '<meta name="robots" content="noindex, nofollow"/>');
    expect(checkHtmlPage(page({ html }))).toEqual([expect.stringContaining("robots meta")]);
  });

  test("flags a missing canonical", () => {
    const html = `<html><head><meta property="og:image" content="${BASE}/opengraph-image"/></head></html>`;
    expect(checkHtmlPage(page({ html }))).toEqual([expect.stringContaining("no canonical")]);
  });

  // Google honours rel=canonical only in <head>; Next can stream metadata into
  // the body when it waits on dynamic work.
  test("ignores a canonical and preview image outside <head>", () => {
    const html =
      `<html><head><title>LendLoop</title></head><body><link rel="canonical" href="${BASE}/privacy"/>` +
      `<meta property="og:image" content="${BASE}/opengraph-image"/></body></html>`;
    expect(checkHtmlPage(page({ html }))).toEqual([
      expect.stringContaining("no canonical"),
      expect.stringContaining("no og:image"),
    ]);
  });

  test("flags a canonical that points at another page", () => {
    expect(checkHtmlPage(page({ html: head(`${BASE}/`, `${BASE}/opengraph-image`) }))).toEqual([
      expect.stringContaining("canonical"),
    ]);
  });

  test("flags a relative or off-site preview image", () => {
    expect(checkHtmlPage(page({ html: head(`${BASE}/privacy`, "/opengraph-image") }))).toEqual([
      expect.stringContaining("og:image"),
    ]);
    expect(checkHtmlPage(page({ html: head(`${BASE}/privacy`, "http://localhost:3000/opengraph-image") }))).toEqual([
      expect.stringContaining("og:image"),
    ]);
  });
});

describe("checkRobots", () => {
  test("passes robots.txt that allows crawling and names the sitemap", () => {
    expect(checkRobots(`User-Agent: *\nAllow: /\n\nSitemap: ${BASE}/sitemap.xml\n`, BASE)).toEqual([]);
  });

  test("flags a missing sitemap line", () => {
    expect(checkRobots("User-Agent: *\nAllow: /\n", BASE)).toEqual([expect.stringContaining("Sitemap")]);
  });

  test("flags a rule that blocks the whole site", () => {
    expect(checkRobots(`User-Agent: *\nDisallow: /\nSitemap: ${BASE}/sitemap.xml`, BASE)).toEqual([
      expect.stringContaining("Disallow: /"),
    ]);
  });
});

describe("checkSitemap", () => {
  const xml = `<urlset><url><loc>${BASE}/</loc></url><url><loc>${BASE}/privacy</loc></url></urlset>`;

  test("passes a sitemap listing every public page", () => {
    expect(checkSitemap(xml, [BASE, `${BASE}/privacy`])).toEqual([]);
  });

  test("flags a public page the sitemap leaves out", () => {
    expect(checkSitemap(xml, [`${BASE}/about`])).toEqual([expect.stringContaining(`${BASE}/about`)]);
  });
});
