import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

// Stub: made real in a later task (transactional outbox for n8n).
export async function enqueueLoanEvent(
  ctx: MutationCtx,
  loanId: Id<"loans">,
  type: string,
): Promise<void> {
  void ctx;
  void loanId;
  void type;
}
