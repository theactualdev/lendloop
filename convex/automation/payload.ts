import { v, type Infer } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { firstName } from "../lib/loanView";

export const loanEventType = v.union(
  v.literal("request_created"),
  v.literal("request_approved"),
  v.literal("request_declined"),
  v.literal("request_cancelled"),
  v.literal("loan_returned"),
  v.literal("approval_withdrawn"),
);

export type LoanEventType = Infer<typeof loanEventType>;

/**
 * The exact set of fields that leave Convex for n8n. Used as the outbox.payload
 * validator, so the schema itself rejects any extra field.
 */
export const notificationPayload = v.object({
  eventId: v.string(),
  type: loanEventType,
  loanId: v.id("loans"),
  recipient: v.object({ email: v.string(), firstName: v.string() }),
  tool: v.object({ name: v.string() }),
  startDate: v.string(),
  endDate: v.string(),
});

export type NotificationPayload = Infer<typeof notificationPayload>;

/** The recipient is the lender for new/cancelled requests, the borrower otherwise. */
export function recipientIsLender(type: LoanEventType): boolean {
  return type === "request_created" || type === "request_cancelled";
}

/** Builds the payload field by field (never spreads a document). */
export function buildNotificationPayload(args: {
  eventId: string;
  type: LoanEventType;
  loan: Doc<"loans">;
  tool: Doc<"tools">;
  lender: Doc<"users">;
  borrower: Doc<"users">;
}): NotificationPayload {
  const { eventId, type, loan, tool, lender, borrower } = args;
  const recipient = recipientIsLender(type) ? lender : borrower;
  return {
    eventId,
    type,
    loanId: loan._id,
    recipient: { email: recipient.email, firstName: firstName(recipient.name) },
    tool: { name: tool.name },
    startDate: loan.startDate,
    endDate: loan.endDate,
  };
}
