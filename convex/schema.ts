import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Literal unions are spelled out so Convex infers precise types. They mirror
// CATEGORIES / CONDITIONS in lib/constants.ts.
const category = v.union(
  v.literal("power_tools"),
  v.literal("hand_tools"),
  v.literal("garden"),
  v.literal("kitchen"),
  v.literal("camping"),
  v.literal("cleaning"),
  v.literal("other"),
);
const condition = v.union(
  v.literal("like_new"),
  v.literal("good"),
  v.literal("fair"),
  v.literal("worn"),
);

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.string(),
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("user")),
    trustedLender: v.boolean(),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category,
    condition,
    description: v.string(),
    shortCode: v.string(),
    status: v.union(v.literal("active"), v.literal("removed")),
    removedAt: v.optional(v.number()),
    removedBy: v.optional(v.id("users")),
  })
    .index("by_owner", ["ownerId"])
    .index("by_status_category", ["status", "category"])
    .index("by_shortCode", ["shortCode"]),

  loans: defineTable({
    toolId: v.id("tools"),
    lenderId: v.id("users"),
    borrowerId: v.id("users"),
    startDate: v.string(),
    endDate: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("declined"),
      v.literal("cancelled"),
      v.literal("returned"),
    ),
    decidedAt: v.optional(v.number()),
    returnedAt: v.optional(v.number()),
  })
    .index("by_tool_status", ["toolId", "status"])
    .index("by_borrower", ["borrowerId"])
    .index("by_lender", ["lenderId"])
    .index("by_status_end", ["status", "endDate"]),

  outbox: defineTable({
    eventId: v.string(),
    loanId: v.id("loans"),
    type: v.string(),
    payload: v.any(),
    status: v.union(v.literal("pending"), v.literal("delivered"), v.literal("failed")),
    attempts: v.number(),
    lastError: v.optional(v.string()),
  })
    .index("by_event", ["eventId"])
    .index("by_status", ["status"]),

  automationEvents: defineTable({
    loanId: v.id("loans"),
    kind: v.union(
      v.literal("notification_sent"),
      v.literal("reminder_sent"),
      v.literal("reminder_failed"),
    ),
    idempotencyKey: v.string(),
    at: v.number(),
    detail: v.optional(v.string()),
  })
    .index("by_key", ["idempotencyKey"])
    .index("by_loan", ["loanId"]),

  automationFailures: defineTable({
    workflow: v.string(),
    executionId: v.string(),
    node: v.optional(v.string()),
    message: v.string(),
    at: v.number(),
  }).index("by_execution", ["executionId"]),
});
