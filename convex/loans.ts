import { v } from "convex/values";
import { memberMutation, memberQuery } from "./lib/auth";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { fail } from "./lib/errors";
import { isHolding, todayUtc } from "./lib/availability";
import {
  nextStatus,
  rangesOverlap,
  validateRange,
  type LoanActor,
} from "./lib/loanRules";
import { buildLoanView, firstName, type LoanView } from "./lib/loanView";
import { enqueueLoanEvent } from "./automation/outbox";

export type IncomingLoanView = LoanView & {
  clash: { borrowerFirstName: string; until: string } | null;
};

// ---- helpers --------------------------------------------------------------

async function holdingLoans(ctx: QueryCtx, toolId: Id<"tools">): Promise<Doc<"loans">[]> {
  const approved = await ctx.db
    .query("loans")
    .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "approved"))
    .collect();
  return approved.filter(isHolding);
}

/** The borrower's pending, or approved and unreturned, loans on one tool. */
async function openLoansOf(
  ctx: QueryCtx,
  toolId: Id<"tools">,
  borrowerId: Id<"users">,
): Promise<Doc<"loans">[]> {
  const [pending, holding] = await Promise.all([
    ctx.db
      .query("loans")
      .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "pending"))
      .collect(),
    holdingLoans(ctx, toolId),
  ]);
  return [...pending, ...holding].filter((l) => l.borrowerId === borrowerId);
}

function actorFor(viewer: Doc<"users">, loan: Doc<"loans">): LoanActor {
  if (loan.lenderId === viewer._id) return "lender";
  if (loan.borrowerId === viewer._id) return "borrower";
  if (viewer.role === "admin") return "admin";
  return fail("FORBIDDEN");
}

async function loadLoan(ctx: QueryCtx, loanId: Id<"loans">): Promise<Doc<"loans">> {
  const loan = await ctx.db.get(loanId);
  if (!loan) fail("NOT_FOUND");
  return loan;
}

// ---- mutations ------------------------------------------------------------

export const request = memberMutation({
  args: { toolId: v.id("tools"), startDate: v.string(), endDate: v.string() },
  handler: async (ctx, args): Promise<Id<"loans">> => {
    const tool = await ctx.db.get(args.toolId);
    if (!tool || tool.status === "removed") fail("NOT_FOUND");
    if (tool.ownerId === ctx.viewer._id) fail("OWN_TOOL");
    const range = { startDate: args.startDate, endDate: args.endDate };
    validateRange(range, todayUtc());
    // One open ask per borrower, tool and day: a repeat would only email the lender twice.
    if ((await openLoansOf(ctx, tool._id, ctx.viewer._id)).some((l) => rangesOverlap(l, range))) {
      fail("ALREADY_REQUESTED");
    }
    const loanId = await ctx.db.insert("loans", {
      toolId: tool._id,
      lenderId: tool.ownerId,
      borrowerId: ctx.viewer._id,
      startDate: args.startDate,
      endDate: args.endDate,
      status: "pending",
    });
    await enqueueLoanEvent(ctx, loanId, "request_created");
    return loanId;
  },
});

export const approve = memberMutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const loan = await loadLoan(ctx, loanId);
    const status = nextStatus(loan.status, "approve", actorFor(ctx.viewer, loan));
    const holding = await holdingLoans(ctx, loan.toolId);
    if (holding.some((o) => o._id !== loan._id && rangesOverlap(o, loan))) {
      fail("TOOL_UNAVAILABLE");
    }
    await ctx.db.patch(loanId, { status, decidedAt: Date.now() });
    await enqueueLoanEvent(ctx, loanId, "request_approved");
  },
});

export const decline = memberMutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const loan = await loadLoan(ctx, loanId);
    const status = nextStatus(loan.status, "decline", actorFor(ctx.viewer, loan));
    await ctx.db.patch(loanId, { status, decidedAt: Date.now() });
    await enqueueLoanEvent(ctx, loanId, "request_declined");
  },
});

export const cancel = memberMutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const loan = await loadLoan(ctx, loanId);
    const status = nextStatus(loan.status, "cancel", actorFor(ctx.viewer, loan));
    await ctx.db.patch(loanId, { status, decidedAt: Date.now() });
    await enqueueLoanEvent(ctx, loanId, "request_cancelled");
  },
});

export const markReturned = memberMutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const loan = await loadLoan(ctx, loanId);
    const status = nextStatus(loan.status, "return", actorFor(ctx.viewer, loan));
    await ctx.db.patch(loanId, { status, returnedAt: Date.now() });
    await enqueueLoanEvent(ctx, loanId, "loan_returned");
  },
});

// ---- queries --------------------------------------------------------------

export const myRequests = memberQuery({
  args: {},
  handler: async (ctx): Promise<LoanView[]> => {
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", ctx.viewer._id))
      .order("desc")
      .collect();
    return Promise.all(loans.map((l) => buildLoanView(ctx, l, "borrower")));
  },
});

export const incoming = memberQuery({
  args: {},
  handler: async (ctx): Promise<IncomingLoanView[]> => {
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_lender", (q) => q.eq("lenderId", ctx.viewer._id))
      .order("desc")
      .collect();
    const holdingByTool = new Map<Id<"tools">, Doc<"loans">[]>();
    for (const toolId of new Set(loans.map((l) => l.toolId))) {
      holdingByTool.set(toolId, await holdingLoans(ctx, toolId));
    }
    return Promise.all(
      loans.map(async (loan): Promise<IncomingLoanView> => {
        const view = await buildLoanView(ctx, loan, "lender");
        let clash: IncomingLoanView["clash"] = null;
        if (loan.status === "pending") {
          const hit = (holdingByTool.get(loan.toolId) ?? [])
            .filter((o) => rangesOverlap(o, loan))
            .sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
          if (hit) {
            const borrower = await ctx.db.get(hit.borrowerId);
            clash = { borrowerFirstName: firstName(borrower?.name), until: hit.endDate };
          }
        }
        return { ...view, clash };
      }),
    );
  },
});
