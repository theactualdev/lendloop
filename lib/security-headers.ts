/*
 * Security headers for every route (next.config.ts). Pure, so it is unit-tested.
 * The CSP follows Clerk's guidance (its scripts, frames, images and telemetry)
 * plus Convex (HTTP and websocket). Next's inline bootstrap scripts need
 * 'unsafe-inline'; a nonce-based policy would make every page dynamic, which
 * Cache Components is built to avoid. Development adds 'unsafe-eval' and local
 * websockets for Next's hot reload.
 */

export type HeaderEnv = {
  production: boolean;
  /** NEXT_PUBLIC_CONVEX_URL, e.g. http://127.0.0.1:3210 or https://x.convex.cloud */
  convexUrl?: string;
  /** NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY; its encoded host is the Clerk Frontend API. */
  clerkPublishableKey?: string;
  /** Extra hosts (space separated) for a custom Clerk domain, if the key does not give it. */
  clerkExtraHosts?: string;
};

/** The Frontend API host encoded in a publishable key ("pk_test_<base64 of host$>"), or null. */
export function clerkFrontendHost(key: string | undefined): string | null {
  const encoded = key?.split("_")[2];
  if (!encoded) return null;
  try {
    const host = atob(encoded).replace(/\$$/, "");
    return /^[a-z0-9.-]+$/i.test(host) ? host : null;
  } catch {
    return null;
  }
}

function origin(url: string | undefined): URL | null {
  try {
    return url ? new URL(url) : null;
  } catch {
    return null;
  }
}

export function buildCsp(env: HeaderEnv): string {
  const clerkHost = clerkFrontendHost(env.clerkPublishableKey);
  const clerk = [
    "https://*.clerk.accounts.dev",
    ...(clerkHost ? [`https://${clerkHost}`] : []),
    ...(env.clerkExtraHosts ?? "")
      .split(/\s+/)
      .filter((h) => /^[a-z0-9.-]+$/i.test(h))
      .map((h) => `https://${h}`),
  ];
  const convex = origin(env.convexUrl);
  const convexSockets = convex
    ? [convex.origin, `${convex.protocol === "https:" ? "wss:" : "ws:"}//${convex.host}`]
    : [];
  const dev = !env.production;

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      ...(dev ? ["'unsafe-eval'"] : []),
      ...clerk,
      "https://challenges.cloudflare.com",
    ],
    "connect-src": [
      "'self'",
      ...clerk,
      "https://clerk-telemetry.com",
      "https://*.convex.cloud",
      "wss://*.convex.cloud",
      ...convexSockets,
      ...(dev ? ["ws://localhost:*", "ws://127.0.0.1:*"] : []),
    ],
    "img-src": ["'self'", "https://img.clerk.com", "data:"],
    "worker-src": ["'self'", "blob:"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "font-src": ["'self'"],
    "frame-src": ["https://challenges.cloudflare.com", ...clerk],
    "object-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    "base-uri": ["'self'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${[...new Set(values)].join(" ")}`)
    .join("; ");
}

export function securityHeaders(env: HeaderEnv): { key: string; value: string }[] {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    { key: "X-Frame-Options", value: "DENY" },
    ...(env.production
      ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
      : []),
    { key: "Content-Security-Policy", value: buildCsp(env) },
  ];
}
