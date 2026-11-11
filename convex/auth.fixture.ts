// Test-only functions exercising the RBAC wrappers. The double dot keeps the
// Convex bundler from deploying this file; tests register it by hand.
import { adminQuery, memberQuery } from "./lib/auth";

export const memberProbe = memberQuery({
  args: {},
  handler: async (ctx) => ctx.viewer.email,
});

export const adminProbe = adminQuery({
  args: {},
  handler: async () => "ok",
});
