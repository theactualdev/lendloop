import { v } from "convex/values";
import { internal } from "./_generated/api";
import { adminMutation, adminQuery } from "./lib/auth";
import type { Doc, Id } from "./_generated/dataModel";
import { fail } from "./lib/errors";
import { buildLoanView, type LoanView } from "./lib/loanView";
import { declinePendingRequests } from "./lib/toolLifecycle";

const REASON_MAX = 280;
const FEED_LIMIT = 50;
const STALE_PENDING_MS = 2 * 60 * 60 * 1000;

export type AdminLoanView = LoanView & {
  lenderName: string;
  borrowerName: string;
  lastEmail: { kind: string; at: number; failed: boolean } | null;
};

const loanStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("cancelled"),
  v.literal("returned"),
);

export const removeListing = adminMutation({
  args: { toolId: v.id("tools"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const reason = args.reason?.trim();
    if (reason !== undefined && reason.length > REASON_MAX) {
      fail("INVALID_INPUT", `reason must be at most ${REASON_MAX} characters`);
    }
    const tool = await ctx.db.get(args.toolId);
    if (!tool || tool.status === "removed") fail("NOT_FOUND");
    const now = Date.now();
    // Approved loans are deliberately left intact.
    await ctx.db.patch(tool._id, {
      status: "removed",
      removedAt: now,
      removedBy: ctx.viewer._id,
      ...(reason ? { removedReason: reason } : {}),
    });
    await declinePendingRequests(ctx, tool._id, now);
  },
});

export const setTrustedLender = adminMutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) fail("NOT_FOUND");
    await ctx.db.patch(user._id, { trustedLender: args.trusted });
  },
});

export const allLoans = adminQuery({
  args: { status: v.optional(loanStatus) },
  handler: async (ctx, { status }): Promise<AdminLoanView[]> => {
    const loans = status
      ? await ctx.db
          .query("loans")
          .withIndex("by_status_end", (q) => q.eq("status", status))
          .order("desc")
          .collect()
      : await ctx.db.query("loans").order("desc").collect();
    const ids = [...new Set(loans.flatMap((l) => [l.lenderId, l.borrowerId]))];
    const docs = await Promise.all(ids.map((id) => ctx.db.get(id)));
    const names = new Map<Id<"users">, string>(ids.map((id, i) => [id, docs[i]?.name ?? ""]));
    return Promise.all(
      loans.map(async (loan) => {
        const view = await buildLoanView(ctx, loan, "lender");
        const last = view.activity[view.activity.length - 1];
        return {
          ...view,
          lenderName: names.get(loan.lenderId) ?? "",
          borrowerName: names.get(loan.borrowerId) ?? "",
          lastEmail: last ? { kind: last.kind, at: last.at, failed: last.kind === "reminder_failed" } : null,
        };
      }),
    );
  },
});

export const lenders = adminQuery({
  args: {},
  handler: async (ctx) => {
    const tools = await ctx.db.query("tools").collect();
    const ownerIds = [...new Set(tools.map((t) => t.ownerId))];
    const rows = await Promise.all(
      ownerIds.map(async (userId) => {
        const [user, loans] = await Promise.all([
          ctx.db.get(userId),
          ctx.db
            .query("loans")
            .withIndex("by_lender", (q) => q.eq("lenderId", userId))
            .collect(),
        ]);
        if (!user) return null;
        return {
          userId,
          name: user.name,
          trustedLender: user.trustedLender,
          timesLent: loans.filter((l) => l.status === "approved" || l.status === "returned").length,
        };
      }),
    );
    return rows
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export type FailedDelivery = Pick<
  Doc<"outbox">,
  "_id" | "_creationTime" | "eventId" | "loanId" | "type" | "status" | "attempts" | "lastError"
>;

export const automationHealth = adminQuery({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    failedDeliveries: FailedDelivery[];
    stalePending: FailedDelivery[];
    workflowFailures: Doc<"automationFailures">[];
  }> => {
    const staleBefore = Date.now() - STALE_PENDING_MS;
    const [failed, stale, workflowFailures] = await Promise.all([
      ctx.db
        .query("outbox")
        .withIndex("by_status", (q) => q.eq("status", "failed"))
        .order("desc")
        .take(FEED_LIMIT),
      ctx.db
        .query("outbox")
        .withIndex("by_status", (q) => q.eq("status", "pending"))
        .order("desc")
        .filter((q) => q.lt(q.field("_creationTime"), staleBefore))
        .take(FEED_LIMIT),
      ctx.db.query("automationFailures").order("desc").take(FEED_LIMIT),
    ]);
    // Projection without payload: the payload holds the recipient email, and admin
    // views carry names, never emails.
    const project = (r: Doc<"outbox">): FailedDelivery => ({
      _id: r._id,
      _creationTime: r._creationTime,
      eventId: r.eventId,
      loanId: r.loanId,
      type: r.type,
      status: r.status,
      attempts: r.attempts,
      lastError: r.lastError,
    });
    return {
      failedDeliveries: failed.map(project),
      stalePending: stale.map(project),
      workflowFailures,
    };
  },
});

export const retryDelivery = adminMutation({
  args: { outboxId: v.id("outbox") },
  handler: async (ctx, { outboxId }) => {
    const row = await ctx.db.get(outboxId);
    if (!row) fail("NOT_FOUND");
    if (row.status !== "failed") fail("INVALID_TRANSITION");
    await ctx.db.patch(outboxId, { status: "pending", attempts: 0, lastError: undefined });
    await ctx.scheduler.runAfter(0, internal.automation.outbox.deliver, { outboxId });
  },
});
