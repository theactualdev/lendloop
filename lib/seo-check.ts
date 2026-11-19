/*
 * Checks for what a crawler gets from the public pages, used by
 * scripts/check-seo.mjs against a running site. Each returns a list of problems
 * (empty when fine). No imports, so the script can load it with Node's type
 * stripping.
 */

export type PageResponse = {
  url: string;
  status: number;
  /** Lower-case header names. */
  headers: Record<string, string>;
  html: string;
};

/** Same URL, ignoring the trailing slash a bare origin may or may not carry. */
const sameUrl = (a: string, b: string) => new URL(a).href === new URL(b).href;

const tag = (html: string, pattern: RegExp) => html.match(pattern)?.[0];
const attr = (element: string | undefined, name: string) =>
  element?.match(new RegExp(`${name}="([^"]*)"`))?.[1]?.replace(/&amp;/g, "&");

export function checkHtmlPage({ url, status, headers, html }: PageResponse): string[] {
  if (status !== 200) {
    const location = headers.location ? ` to ${headers.location}` : "";
    return [`${url}: status ${status}${location}, expected 200`];
  }
  const problems: string[] = [];
  if (/noindex/i.test(headers["x-robots-tag"] ?? "")) {
    problems.push(`${url}: X-Robots-Tag says ${headers["x-robots-tag"]}`);
  }
  const robots = attr(tag(html, /<meta[^>]+name="robots"[^>]*>/), "content");
  if (robots && /noindex/i.test(robots)) problems.push(`${url}: robots meta says ${robots}`);

  const canonical = attr(tag(html, /<link[^>]+rel="canonical"[^>]*>/), "href");
  if (!canonical) problems.push(`${url}: no canonical link`);
  else if (!URL.canParse(canonical) || !sameUrl(canonical, url)) {
    problems.push(`${url}: canonical is ${canonical}`);
  }

  const image = attr(tag(html, /<meta[^>]+property="og:image"[^>]*>/), "content");
  if (!image) problems.push(`${url}: no og:image`);
  else if (!URL.canParse(image) || new URL(image).origin !== new URL(url).origin) {
    problems.push(`${url}: og:image ${image} is not an absolute URL on this site`);
  }
  return problems;
}

export function checkRobots(text: string, base: string): string[] {
  const problems: string[] = [];
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const sitemap = new URL("/sitemap.xml", base).href;
  if (!lines.some((line) => /^sitemap:/i.test(line) && line.slice(8).trim() === sitemap)) {
    problems.push(`robots.txt: no "Sitemap: ${sitemap}" line`);
  }
  if (lines.some((line) => /^disallow:\s*\/$/i.test(line))) {
    problems.push('robots.txt: "Disallow: /" blocks the whole site');
  }
  return problems;
}

export function checkSitemap(xml: string, urls: string[]): string[] {
  const listed = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim());
  return urls
    .filter((url) => !listed.some((loc) => URL.canParse(loc) && sameUrl(loc, url)))
    .map((url) => `sitemap.xml: ${url} is missing`);
}
