import { v } from "convex/values";
import { memberMutation, memberQuery } from "./lib/auth";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { fail } from "./lib/errors";
import { enforceRateLimit } from "./lib/rateLimits";
import {
  CATEGORIES,
  CONDITIONS,
  TOOL_DESCRIPTION_MAX,
  TOOL_NAME_MAX,
  TOOL_NAME_MIN,
  type Category,
  type Condition,
} from "./lib/constants";
import {
  BOOKING_WINDOW_DAYS,
  addDays,
  isOnLoan,
  isValidDate,
  overlaps,
  todayUtc,
} from "./lib/availability";
import { holdingLoans } from "./lib/loanQueries";
import { firstName } from "./lib/loanView";
import { cleanText } from "./lib/text";
import { declinePendingRequests } from "./lib/toolLifecycle";
import { nextShortCode } from "./lib/shortCode";

export type ToolCard = {
  _id: Id<"tools">;
  shortCode: string;
  name: string;
  category: Category;
  condition: Condition;
  description: string;
  ownerFirstName: string;
  ownerTrusted: boolean;
  availability: "available" | "on_loan";
  isMine: boolean;
  bookings: { startDate: string; endDate: string; kind: "booked" | "requested" }[];
  freeInRange: boolean | null;
};

// ---- validation -----------------------------------------------------------

function cleanName(raw: string): string {
  // Control characters out, whitespace runs to one space (lib/tool-form.ts does the same).
  const name = cleanText(raw);
  if (name.length < TOOL_NAME_MIN || name.length > TOOL_NAME_MAX) {
    fail("INVALID_INPUT", `name must be ${TOOL_NAME_MIN}-${TOOL_NAME_MAX} characters`);
  }
  return name;
}

function cleanDescription(raw: string): string {
  const description = raw.trim();
  if (description.length > TOOL_DESCRIPTION_MAX) {
    fail("INVALID_INPUT", `description must be at most ${TOOL_DESCRIPTION_MAX} characters`);
  }
  return description;
}

function cleanCategory(raw: string): Category {
  if (!(CATEGORIES as readonly string[]).includes(raw)) fail("INVALID_INPUT", "unknown category");
  return raw as Category;
}

function cleanCondition(raw: string): Condition {
  if (!(CONDITIONS as readonly string[]).includes(raw)) fail("INVALID_INPUT", "unknown condition");
  return raw as Condition;
}

// ---- projection -----------------------------------------------------------

async function loansFor(ctx: QueryCtx, toolId: Id<"tools">) {
  const [pending, approved] = await Promise.all([
    ctx.db
      .query("loans")
      .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "pending"))
      .collect(),
    holdingLoans(ctx, toolId),
  ]);
  return { pending, approved };
}

async function activeTools(ctx: QueryCtx, category?: Category) {
  const cats = category ? [category] : CATEGORIES;
  const groups = await Promise.all(
    cats.map((c) =>
      ctx.db
        .query("tools")
        .withIndex("by_status_category", (q) => q.eq("status", "active").eq("category", c))
        .collect(),
    ),
  );
  return groups.flat();
}

async function buildCards(
  ctx: QueryCtx,
  viewer: Doc<"users">,
  tools: Doc<"tools">[],
  range: { from: string; to: string } | null,
): Promise<(ToolCard & { pendingCount: number })[]> {
  const today = todayUtc();
  const windowEnd = addDays(today, BOOKING_WINDOW_DAYS - 1);
  const ownerIds = [...new Set(tools.map((t) => t.ownerId))];
  const ownerDocs = await Promise.all(ownerIds.map((id) => ctx.db.get(id)));
  const owners = new Map(ownerIds.map((id, i) => [id, ownerDocs[i]]));

  const cards = await Promise.all(
    tools.map(async (tool): Promise<ToolCard & { pendingCount: number }> => {
      const owner = owners.get(tool.ownerId) ?? null;
      const isMine = tool.ownerId === viewer._id;
      const { pending, approved } = await loansFor(ctx, tool._id);

      const bookings: ToolCard["bookings"] = [
        ...approved.map((l) => ({ ...l, kind: "booked" as const })),
        ...pending
          .filter((l) => isMine || l.borrowerId === viewer._id)
          .map((l) => ({ ...l, kind: "requested" as const })),
      ]
        .filter((l) => overlaps(l, today, windowEnd))
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
        .map((l) => ({ startDate: l.startDate, endDate: l.endDate, kind: l.kind }));

      return {
        _id: tool._id,
        shortCode: tool.shortCode,
        name: tool.name,
        category: tool.category,
        condition: tool.condition,
        description: tool.description,
        ownerFirstName: firstName(owner?.name),
        ownerTrusted: owner?.trustedLender ?? false,
        availability: isOnLoan(approved, today) ? "on_loan" : "available",
        isMine,
        bookings,
        freeInRange: range ? !approved.some((l) => overlaps(l, range.from, range.to)) : null,
        pendingCount: pending.length,
      };
    }),
  );
  return cards.sort((a, b) => a.name.localeCompare(b.name));
}

function toCard(card: ToolCard & { pendingCount: number }): ToolCard {
  const { pendingCount, ...rest } = card;
  void pendingCount;
  return rest;
}

// ---- queries --------------------------------------------------------------

/** Signed-out safe: name and category only, no owner details. */
export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const today = todayUtc();
    const tools = await activeTools(ctx);
    const rows: { name: string; category: Category }[] = [];
    for (const tool of tools) {
      const approved = await holdingLoans(ctx, tool._id);
      if (isOnLoan(approved, today)) continue;
      rows.push({ name: tool.name, category: tool.category });
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const list = memberQuery({
  args: {
    category: v.optional(v.string()),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ToolCard[]> => {
    const category = args.category === undefined ? undefined : cleanCategory(args.category);
    let range: { from: string; to: string } | null = null;
    if (args.from !== undefined || args.to !== undefined) {
      const { from, to } = args;
      if (from === undefined || to === undefined || !isValidDate(from) || !isValidDate(to) || from > to) {
        fail("INVALID_RANGE");
      }
      range = { from, to };
    }
    const cards = await buildCards(ctx, ctx.viewer, await activeTools(ctx, category), range);
    return cards.map(toCard);
  },
});

export const myListings = memberQuery({
  args: {},
  handler: async (ctx) => {
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", ctx.viewer._id))
      .collect();
    return buildCards(ctx, ctx.viewer, tools.filter((t) => t.status === "active"), null);
  },
});

// ---- mutations ------------------------------------------------------------

async function ownedActiveTool(ctx: MutationCtx, viewer: Doc<"users">, toolId: Id<"tools">) {
  const tool = await ctx.db.get(toolId);
  if (!tool || tool.status !== "active") fail("NOT_FOUND");
  if (tool.ownerId !== viewer._id) fail("FORBIDDEN");
  return tool;
}

export const create = memberMutation({
  args: {
    name: v.string(),
    category: v.string(),
    condition: v.string(),
    description: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"tools">> => {
    const name = cleanName(args.name);
    const category = cleanCategory(args.category);
    const condition = cleanCondition(args.condition);
    const description = cleanDescription(args.description);
    await enforceRateLimit(ctx, "tools.create", ctx.viewer._id);
    return ctx.db.insert("tools", {
      ownerId: ctx.viewer._id,
      name,
      category,
      condition,
      description,
      shortCode: await nextShortCode(ctx, category),
      status: "active",
    });
  },
});

export const update = memberMutation({
  args: {
    toolId: v.id("tools"),
    name: v.optional(v.string()),
    category: v.optional(v.string()),
    condition: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ownedActiveTool(ctx, ctx.viewer, args.toolId);
    const patch: Partial<Pick<Doc<"tools">, "name" | "category" | "condition" | "description">> = {};
    if (args.name !== undefined) patch.name = cleanName(args.name);
    if (args.category !== undefined) patch.category = cleanCategory(args.category);
    if (args.condition !== undefined) patch.condition = cleanCondition(args.condition);
    if (args.description !== undefined) patch.description = cleanDescription(args.description);
    await ctx.db.patch(args.toolId, patch);
  },
});

export const remove = memberMutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, args) => {
    await ownedActiveTool(ctx, ctx.viewer, args.toolId);
    if ((await holdingLoans(ctx, args.toolId)).length > 0) fail("TOOL_ON_LOAN");
    const now = Date.now();
    await ctx.db.patch(args.toolId, {
      status: "removed",
      removedAt: now,
      removedBy: ctx.viewer._id,
    });
    await declinePendingRequests(ctx, args.toolId, now);
  },
});
