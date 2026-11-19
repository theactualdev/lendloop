import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, siteUrl } from "@/lib/site";

/** The public pages, with the date their content last changed (not the build date). */
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map(({ path, lastModified }) => ({
    url: new URL(path, siteUrl()).href,
    lastModified,
  }));
}
