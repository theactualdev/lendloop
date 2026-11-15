// Test-only. The double dot keeps the Convex bundler from deploying this file,
// and the test module glob skips it too; outbox.test.ts registers it by hand.
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { enqueueLoanEvent } from "./outbox";

/**
 * Enqueues a loan event and then, if asked, throws. The rollback test needs the
 * throw to come after a real enqueue in the same transaction.
 */
export const enqueue = internalMutation({
  args: { loanId: v.id("loans"), thenThrow: v.boolean() },
  handler: async (ctx, { loanId, thenThrow }) => {
    await enqueueLoanEvent(ctx, loanId, "request_approved");
    if (thenThrow) throw new Error("fixture: throw after enqueue");
  },
});
