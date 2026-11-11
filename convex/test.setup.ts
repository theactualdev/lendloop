/// <reference types="vite/client" />
// Test helpers shared by every Convex test. The double dot in the name keeps the
// Convex bundler from treating this file as a function entry point.
import type { TestConvex } from "convex-test";
import type { Id } from "./_generated/dataModel";
import type schema from "./schema";

// The docs pattern "./**/!(*.*.*)*.*s" matches nothing under this Vite version, so
// use an include plus a negated pattern: every single-dot .js/.ts file, no
// *.test.ts, *.setup.ts or .d.ts.
export const modules = import.meta.glob(["./**/*.*s", "!./**/*.*.*s"]);

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
