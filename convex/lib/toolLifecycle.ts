import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { enqueueLoanEvent } from "../automation/outbox";

/** Declines every pending request on a tool and enqueues "request_declined" for each. */
export async function declinePendingRequests(
  ctx: MutationCtx,
  toolId: Id<"tools">,
  now: number,
): Promise<void> {
  const pending = await ctx.db
    .query("loans")
    .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "pending"))
    .collect();
  for (const loan of pending) {
    await ctx.db.patch(loan._id, { status: "declined", decidedAt: now });
    await enqueueLoanEvent(ctx, loan._id, "request_declined");
  }
}
