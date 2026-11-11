import { customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { fail } from "./errors";

async function getViewer(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) fail("UNAUTHENTICATED");
  const viewer = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!viewer) fail("UNAUTHENTICATED", "user not provisioned");
  return viewer;
}

async function getAdmin(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  const viewer = await getViewer(ctx);
  if (viewer.role !== "admin") fail("FORBIDDEN");
  return viewer;
}

export const memberQuery = customQuery(query, {
  args: {},
  input: async (ctx) => ({ ctx: { viewer: await getViewer(ctx) }, args: {} }),
});

export const memberMutation = customMutation(mutation, {
  args: {},
  input: async (ctx) => ({ ctx: { viewer: await getViewer(ctx) }, args: {} }),
});

export const adminQuery = customQuery(query, {
  args: {},
  input: async (ctx) => ({ ctx: { viewer: await getAdmin(ctx) }, args: {} }),
});

export const adminMutation = customMutation(mutation, {
  args: {},
  input: async (ctx) => ({ ctx: { viewer: await getAdmin(ctx) }, args: {} }),
});
