import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export type LoanEventType =
  | "request_created"
  | "request_approved"
  | "request_declined"
  | "request_cancelled"
  | "loan_returned";

// Stub: made real in a later task (transactional outbox for n8n).
export async function enqueueLoanEvent(
  ctx: MutationCtx,
  loanId: Id<"loans">,
  type: LoanEventType,
): Promise<void> {
  void ctx;
  void loanId;
  void type;
}
