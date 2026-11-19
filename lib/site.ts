import type { Metadata } from "next";

/*
 * The site's identity for search engines and link previews: its address, names,
 * per-page metadata and structured data. Only a type import from next, so
 * scripts/check-seo.mjs can load this file with Node's type stripping.
 */

export const SITE_NAME = "LendLoop";
export const SITE_TITLE = "LendLoop · Borrow and lend tools with your neighbors";
export const SITE_DESCRIPTION =
  "A free neighborhood tool library: neighbors list the tools they're happy to lend, ask for the days they need one, and the owner says yes or no.";

export const PRIVACY_TITLE = "Privacy policy · LendLoop";
export const PRIVACY_DESCRIPTION =
  "What LendLoop stores, how long it keeps email details, how to get your data deleted, and which services are involved. No tracking.";

/** The link-preview image, rendered by app/opengraph-image.tsx. */
export const OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "LendLoop, a neighborhood tool library",
  type: "image/png",
};

export const AUTHOR = {
  name: "Olayinka Ayodele",
  github: "https://github.com/theactualdev",
  /** Pending from the author; links and structured data skip it while null. */
  portfolio: null as string | null,
};

/** The public pages, with the date their content last changed (for the sitemap). */
export const PUBLIC_PAGES = [
  { path: "/", lastModified: "2026-11-19" },
  { path: "/privacy", lastModified: "2026-11-16" },
];

type Env = Record<string, string | undefined>;

/**
 * The canonical origin: Vercel's production address (set on every Vercel build,
 * previews included, and pointing at production), else the local server.
 */
export function siteUrl(env: Env = process.env): string {
  const host = env.VERCEL_PROJECT_PRODUCTION_URL;
  return host ? `https://${host}` : "http://localhost:3000";
}

/**
 * A public page's metadata. Next merges metadata only one level deep, so each
 * page sets its whole Open Graph object: a partial one would inherit the home
 * page's og:url, and any page-level object drops the root opengraph-image unless
 * it names the image itself. Paths resolve against metadataBase (app/layout.tsx).
 */
export function pageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "en_US",
      url: path,
      title,
      description,
      images: [OG_IMAGE],
    },
    twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE] },
  };
}

/** The home page's JSON-LD: the site, the brand and the app. No ratings: it has none. */
export function structuredData(base: string): object {
  const home = new URL("/", base).href;
  const author = AUTHOR.portfolio ?? AUTHOR.github;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${home}#website`,
        url: home,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        inLanguage: "en",
        publisher: { "@id": `${home}#organization` },
      },
      {
        "@type": "Organization",
        "@id": `${home}#organization`,
        name: SITE_NAME,
        url: home,
        logo: new URL("/apple-icon", base).href,
      },
      {
        "@type": "WebApplication",
        "@id": `${home}#app`,
        name: SITE_NAME,
        url: home,
        description: SITE_DESCRIPTION,
        applicationCategory: "LifestyleApplication",
        operatingSystem: "Any",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        creator: {
          "@type": "Person",
          name: AUTHOR.name,
          url: author,
          sameAs: [AUTHOR.github, AUTHOR.portfolio].filter((link) => link !== null),
        },
      },
    ],
  };
}

/** JSON for a <script type="application/ld+json">, with < escaped so it can't end the script. */
export function jsonLd(data: object): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
