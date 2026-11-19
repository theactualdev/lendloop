// Fetches the public pages the way Googlebot does (no cookies, redirects not
// followed) and fails if a crawler couldn't index them properly: a redirect or
// error, a noindex, a wrong canonical, a missing preview image, or robots.txt
// and the sitemap out of step. Run after each deploy:
//
//   npm run check:seo                                  (http://localhost:3000, after npm run build && npm run start)
//   npm run check:seo -- https://your-app.vercel.app
//
// The canonical comes from VERCEL_PROJECT_PRODUCTION_URL at build time, so check
// a deployment at its production address. Node 22.18+ loads the .ts files directly.
import { PUBLIC_PAGES } from "../lib/site.ts";
import { checkHtmlPage, checkRobots, checkSitemap } from "../lib/seo-check.ts";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/+$/, "");
const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

const get = (path, accept) =>
  fetch(base + path, { redirect: "manual", headers: { "user-agent": GOOGLEBOT, accept } });

const problems = [];

for (const { path } of PUBLIC_PAGES) {
  const response = await get(path, "text/html,application/xhtml+xml");
  problems.push(
    ...checkHtmlPage({
      url: base + path,
      status: response.status,
      headers: Object.fromEntries(response.headers),
      html: await response.text(),
    }),
  );
}

const robots = await get("/robots.txt", "text/plain");
if (robots.status !== 200) problems.push(`robots.txt: status ${robots.status}`);
else problems.push(...checkRobots(await robots.text(), base));

const sitemap = await get("/sitemap.xml", "application/xml");
if (sitemap.status !== 200) problems.push(`sitemap.xml: status ${sitemap.status}`);
else problems.push(...checkSitemap(await sitemap.text(), PUBLIC_PAGES.map(({ path }) => base + path)));

const image = await get("/opengraph-image", "image/*");
if (image.status !== 200 || !image.headers.get("content-type")?.startsWith("image/png")) {
  problems.push(`opengraph-image: status ${image.status}, ${image.headers.get("content-type")}`);
}

if (problems.length > 0) {
  console.error(`SEO check failed for ${base}:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`SEO check passed for ${base}: ${PUBLIC_PAGES.length} pages, robots.txt, sitemap and preview image.`);
