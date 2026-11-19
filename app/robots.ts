import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/*
 * Every crawler may crawl everything. The member routes are not listed: a
 * Disallow wouldn't keep them out of results, it would only publish the route
 * map and hide their noindex. Signed-out visitors are redirected there anyway.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
