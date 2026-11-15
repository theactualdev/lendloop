import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = {
  /* config options here */
  // Inlined at build time into the compiled code, including @clerk/nextjs's server client,
  // so Clerk telemetry is off without any .env entry (the privacy page says it is).
  env: { NEXT_PUBLIC_CLERK_TELEMETRY_DISABLED: "1" },
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders({
          production: process.env.NODE_ENV === "production",
          convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL,
          clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
          clerkExtraHosts: process.env.CSP_EXTRA_CLERK_HOSTS,
        }),
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
