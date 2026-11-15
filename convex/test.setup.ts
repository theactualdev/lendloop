/// <reference types="vite/client" />
// Test helpers shared by every Convex test. The double dot in the name keeps the
// Convex bundler from treating this file as a function entry point.
import { convexTest, type TestConvex } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

// The docs pattern "./**/!(*.*.*)*.*s" matches nothing under this Vite version, so
// use an include plus a negated pattern: every single-dot .js/.ts file, no
// *.test.ts, *.setup.ts or .d.ts.
export const modules = import.meta.glob(["./**/*.*s", "!./**/*.*.*s"]);

/**
 * convexTest with the rate-limiter component registered, as its README describes.
 * Every Convex test builds its instance here, so a function that spends a limit
 * works under test exactly as it does deployed.
 */
export function newTest(mods: Record<string, () => Promise<unknown>> = modules) {
  const t = convexTest(schema, mods as typeof modules);
  rateLimiterTest.register(t);
  return t;
}

export async function asUser(
  t: TestConvex<typeof schema>,
  { name, email, role = "user" }: { name: string; email: string; role?: "admin" | "user" },
) {
  const tokenIdentifier = `https://test.issuer|${email}`;
  const userId: Id<"users"> = await t.run((ctx) =>
    ctx.db.insert("users", { tokenIdentifier, name, email, role, trustedLender: false }),
  );
  const client = t.withIdentity({ tokenIdentifier, name, email, subject: email });
  return Object.assign(client, { userId });
}
