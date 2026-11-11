// Demo and drill data. Internal only: run with `npx convex run seed:demo`.
// Rows are inserted directly (never through the domain functions), so seeding
// queues no outbox emails.
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { addDays, todayUtc } from "./lib/availability";
import type { Category, Condition } from "./lib/constants";
import { nextShortCode } from "./lib/shortCode";

const DEMO_PREFIX = "demo|";

const NEIGHBOURS = [
  { slug: "ada", name: "Ada Okafor", trustedLender: true },
  { slug: "ben", name: "Ben Hartley", trustedLender: false },
  { slug: "cleo", name: "Cleo Marsh", trustedLender: false },
  { slug: "dev", name: "Dev Patel", trustedLender: false },
] as const;

type ToolSeed = [owner: string, name: string, category: Category, condition: Condition, description: string];
const TOOLS: ToolSeed[] = [
  ["ada", "Cordless Drill", "power_tools", "good", "18V drill with two batteries and a bit set."],
  ["ada", "Orbital Sander", "power_tools", "like_new", "Random orbit sander, dust bag included."],
  ["ada", "Claw Hammer", "hand_tools", "fair", "Classic 16oz hammer."],
  ["ben", "Spirit Level", "hand_tools", "good", "60cm level with magnetic edge."],
  ["ben", "Hedge Trimmer", "garden", "good", "Electric, 50cm blade."],
  ["ben", "Garden Fork", "garden", "worn", "Sturdy digging fork."],
  ["cleo", "Stand Mixer", "kitchen", "like_new", "Five-litre bowl, dough hook and whisk."],
  ["cleo", "Two-person Tent", "camping", "good", "Lightweight, pegs and poles included."],
  ["dev", "Steam Cleaner", "cleaning", "fair", "Handheld steam cleaner for tiles and grout."],
  ["dev", "Step Ladder", "other", "good", "Three-step aluminium ladder."],
];

async function insertUser(ctx: MutationCtx, slug: string, name: string, email: string, trusted: boolean) {
  return ctx.db.insert("users", {
    tokenIdentifier: `${DEMO_PREFIX}${slug}`,
    name,
    email,
    role: "user",
    trustedLender: trusted,
  });
}

async function insertTool(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  [, name, category, condition, description]: ToolSeed,
) {
  return ctx.db.insert("tools", {
    ownerId,
    name,
    category,
    condition,
    description,
    shortCode: await nextShortCode(ctx, category),
    status: "active",
  });
}

export const demo = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", `${DEMO_PREFIX}${NEIGHBOURS[0].slug}`))
      .first();
    if (existing) return { seeded: false };

    const users = new Map<string, Id<"users">>();
    for (const n of NEIGHBOURS) {
      users.set(n.slug, await insertUser(ctx, n.slug, n.name, `${n.slug}@example.test`, n.trustedLender));
    }
    const tools = new Map<string, Id<"tools">>();
    for (const t of TOOLS) {
      tools.set(t[1], await insertTool(ctx, users.get(t[0])!, t));
    }

    const today = todayUtc();
    const loan = (
      tool: string,
      lender: string,
      borrower: string,
      status: "pending" | "approved" | "returned",
      startDate: string,
      endDate: string,
    ) =>
      ctx.db.insert("loans", {
        toolId: tools.get(tool)!,
        lenderId: users.get(lender)!,
        borrowerId: users.get(borrower)!,
        startDate,
        endDate,
        status,
        ...(status !== "pending" ? { decidedAt: Date.now() } : {}),
        ...(status === "returned" ? { returnedAt: Date.now() } : {}),
      });
    // Approved and current, pending, and already returned.
    await loan("Cordless Drill", "ada", "ben", "approved", addDays(today, -1), addDays(today, 3));
    await loan("Hedge Trimmer", "ben", "cleo", "pending", addDays(today, 2), addDays(today, 4));
    await loan("Stand Mixer", "cleo", "ada", "returned", addDays(today, -12), addDays(today, -9));
    return { seeded: true };
  },
});

async function userByEmail(ctx: MutationCtx, email: string) {
  return ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();
}

/** An approved, unreturned loan whose end date was three days ago. Returns the loan id. */
export const overdueLoan = internalMutation({
  args: { borrowerEmail: v.optional(v.string()) },
  handler: async (ctx, { borrowerEmail }): Promise<Id<"loans">> => {
    const lender =
      (await ctx.db
        .query("users")
        .withIndex("by_token", (q) => q.eq("tokenIdentifier", `${DEMO_PREFIX}ada`))
        .first()) ?? null;
    const lenderId = lender?._id ?? (await insertUser(ctx, "ada", "Ada Okafor", "ada@example.test", true));

    const email = borrowerEmail ?? "riley@example.test";
    let borrowerId = (await userByEmail(ctx, email))?._id;
    if (!borrowerId) {
      const slug = email.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "borrower";
      borrowerId = await insertUser(ctx, `borrower-${slug}`, "Riley Reminder", email, false);
    }

    const tool: ToolSeed = ["ada", "Overdue Test Drill", "power_tools", "good", "Seeded for the reminder drill."];
    const toolId = await insertTool(ctx, lenderId, tool);
    const today = todayUtc();
    return ctx.db.insert("loans", {
      toolId,
      lenderId,
      borrowerId,
      startDate: addDays(today, -10),
      endDate: addDays(today, -3),
      status: "approved",
      decidedAt: Date.now(),
    });
  },
});
