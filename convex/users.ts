import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { memberMutation } from "./lib/auth";
import { NO_EMAIL_CLAIM, fail } from "./lib/errors";
import { enforceRateLimit } from "./lib/rateLimits";
import { cleanDisplayName } from "./lib/text";

// Rows written by an older build stored this placeholder; it is not a real name.
const LEGACY_PLACEHOLDER = "Neighbour";

export const ensureUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) fail("UNAUTHENTICATED");
    if (!identity.email) fail("UNAUTHENTICATED", NO_EMAIL_CLAIM);
    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    // A token without a usable name claim must not clear a name the member already set.
    // The claim gets the same cleaning and 60-character cap as setMyName.
    const kept = existing?.name === LEGACY_PLACEHOLDER ? "" : existing?.name;
    const name = cleanDisplayName(identity.name ?? identity.givenName ?? "") || kept || "";
    if (existing) {
      await ctx.db.patch(existing._id, { name, email: identity.email });
      return existing._id;
    }
    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      name,
      email: identity.email,
      role: "user",
      trustedLender: false,
    });
  },
});

export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) return null;
    return {
      _id: user._id,
      name: user.name,
      role: user.role,
      trustedLender: user.trustedLender,
    };
  },
});

export const setRole = internalMutation({
  args: { email: v.string(), role: v.union(v.literal("admin"), v.literal("user")) },
  handler: async (ctx, { email, role }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (!user) fail("NOT_FOUND");
    await ctx.db.patch(user._id, { role });
  },
});

/**
 * The caller sets their own display name. Touches only the caller's row and
 * only `name`, so it cannot change role, trustedLender, email or anyone else.
 * Cleaned like ensureUser's claim (cleanDisplayName): cut to 60 characters, and
 * an empty result is INVALID_INPUT.
 */
export const setMyName = memberMutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const name = cleanDisplayName(args.name);
    if (name.length === 0) fail("INVALID_INPUT");
    await enforceRateLimit(ctx, "users.setMyName", ctx.viewer._id);
    await ctx.db.patch(ctx.viewer._id, { name });
  },
});
