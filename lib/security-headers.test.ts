import { describe, expect, it } from "vitest";
import { buildCsp, clerkFrontendHost, securityHeaders } from "./security-headers";

const key = `pk_test_${btoa("quiet-owl-12.clerk.accounts.dev$")}`;
const prod = { production: true, convexUrl: "https://happy-cat-1.convex.cloud", clerkPublishableKey: key };
const dev = { production: false, convexUrl: "http://127.0.0.1:3210", clerkPublishableKey: key };
const directive = (csp: string, name: string) =>
  csp.split("; ").find((d) => d.startsWith(`${name} `))?.slice(name.length + 1).split(" ") ?? [];

describe("clerkFrontendHost", () => {
  it("decodes the host from a publishable key", () => {
    expect(clerkFrontendHost(key)).toBe("quiet-owl-12.clerk.accounts.dev");
    expect(clerkFrontendHost(`pk_live_${btoa("clerk.example.com$")}`)).toBe("clerk.example.com");
  });
  it("is null for anything else", () => {
    expect(clerkFrontendHost(undefined)).toBeNull();
    expect(clerkFrontendHost("pk_test_!!!")).toBeNull();
    expect(clerkFrontendHost("nonsense")).toBeNull();
  });
});

describe("buildCsp", () => {
  it("locks down framing, forms, base and plugins", () => {
    const csp = buildCsp(prod);
    expect(directive(csp, "default-src")).toEqual(["'self'"]);
    expect(directive(csp, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(csp, "form-action")).toEqual(["'self'"]);
    expect(directive(csp, "base-uri")).toEqual(["'self'"]);
    expect(directive(csp, "object-src")).toEqual(["'none'"]);
  });
  it("allows Clerk, including the instance's own host, and Turnstile", () => {
    const csp = buildCsp(prod);
    for (const name of ["script-src", "connect-src", "frame-src"]) {
      expect(directive(csp, name)).toContain("https://*.clerk.accounts.dev");
      expect(directive(csp, name)).toContain("https://quiet-owl-12.clerk.accounts.dev");
    }
    expect(csp).not.toContain("clerk-telemetry.com");
    expect(directive(csp, "script-src")).toContain("https://challenges.cloudflare.com");
    expect(directive(csp, "frame-src")).toContain("https://challenges.cloudflare.com");
    expect(directive(csp, "img-src")).toEqual(["'self'", "https://img.clerk.com", "data:"]);
    expect(directive(csp, "worker-src")).toEqual(["'self'", "blob:"]);
  });
  it("allows the Convex deployment over http and websocket", () => {
    expect(directive(buildCsp(prod), "connect-src")).toEqual(
      expect.arrayContaining(["https://happy-cat-1.convex.cloud", "wss://happy-cat-1.convex.cloud", "wss://*.convex.cloud"]),
    );
    expect(directive(buildCsp(dev), "connect-src")).toEqual(
      expect.arrayContaining(["http://127.0.0.1:3210", "ws://127.0.0.1:3210"]),
    );
  });
  it("allows eval and local sockets in development only", () => {
    expect(directive(buildCsp(dev), "script-src")).toContain("'unsafe-eval'");
    expect(directive(buildCsp(prod), "script-src")).not.toContain("'unsafe-eval'");
    expect(directive(buildCsp(prod), "connect-src")).not.toContain("ws://localhost:*");
  });
  it("accepts a custom Clerk domain and ignores junk hosts", () => {
    const csp = buildCsp({ ...prod, clerkExtraHosts: "accounts.example.com bad;host" });
    expect(directive(csp, "script-src")).toContain("https://accounts.example.com");
    expect(csp).not.toContain("bad;host");
  });
  it("survives missing env", () => {
    expect(() => buildCsp({ production: true })).not.toThrow();
  });
});

describe("securityHeaders", () => {
  const names = (env: Parameters<typeof securityHeaders>[0]) => securityHeaders(env).map((h) => h.key);
  it("sets the fixed headers", () => {
    const h = Object.fromEntries(securityHeaders(prod).map((x) => [x.key, x.value]));
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["Permissions-Policy"]).toBe("camera=(), microphone=(), geolocation=()");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Content-Security-Policy"]).toContain("default-src 'self'");
  });
  it("sends HSTS in production only", () => {
    expect(names(prod)).toContain("Strict-Transport-Security");
    expect(names(dev)).not.toContain("Strict-Transport-Security");
  });
});
