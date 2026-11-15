import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
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

const DELETE_CAP = 500;

/**
 * Removes a member and everything they own, on request (README, "Deleting a
 * member's data on request"). Internal: run from the CLI or the dashboard, never
 * the client. Deletes the user, their tools, every loan on those tools or that
 * they borrowed, and those loans' outbox rows and activity events. A demo member
 * has a handful of rows, so one transaction is fine; any set over 500 throws
 * INVALID_INPUT rather than half-deleting. automationFailures hold no member data.
 */
export const deleteMember = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (!user) fail("NOT_FOUND");

    const capped = <T>(rows: T[]): T[] => {
      if (rows.length > DELETE_CAP) fail("INVALID_INPUT");
      return rows;
    };
    const tools = capped(
      await ctx.db.query("tools").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).take(DELETE_CAP + 1),
    );
    const loans = new Map<string, Id<"loans">>();
    for (const tool of tools) {
      const onTool = capped(
        await ctx.db.query("loans").withIndex("by_tool_status", (q) => q.eq("toolId", tool._id)).take(DELETE_CAP + 1),
      );
      for (const l of onTool) loans.set(l._id, l._id);
    }
    const borrowed = capped(
      await ctx.db.query("loans").withIndex("by_borrower", (q) => q.eq("borrowerId", user._id)).take(DELETE_CAP + 1),
    );
    for (const l of borrowed) loans.set(l._id, l._id);
    if (loans.size > DELETE_CAP) fail("INVALID_INPUT");

    let outbox = 0;
    let events = 0;
    const outboxRows = [];
    const eventRows = [];
    for (const loanId of loans.values()) {
      outboxRows.push(
        ...capped(await ctx.db.query("outbox").withIndex("by_loan", (q) => q.eq("loanId", loanId)).take(DELETE_CAP + 1)),
      );
      eventRows.push(
        ...capped(
          await ctx.db.query("automationEvents").withIndex("by_loan", (q) => q.eq("loanId", loanId)).take(DELETE_CAP + 1),
        ),
      );
    }
    if (outboxRows.length > DELETE_CAP || eventRows.length > DELETE_CAP) fail("INVALID_INPUT");
    for (const r of outboxRows) {
      await ctx.db.delete(r._id);
      outbox++;
    }
    for (const r of eventRows) {
      await ctx.db.delete(r._id);
      events++;
    }
    for (const id of loans.values()) await ctx.db.delete(id);
    for (const t of tools) await ctx.db.delete(t._id);
    await ctx.db.delete(user._id);
    return { tools: tools.length, loans: loans.size, outbox, events };
  },
});
