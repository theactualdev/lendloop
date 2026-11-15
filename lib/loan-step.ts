import type { LoanView } from "@/convex/lib/loanView";
import { latestActivity } from "@/lib/activity";
import { daysInclusive, shortDay, weekdayDay } from "@/lib/dates";
import { neighborName } from "@/lib/names";

/** Days past `endDate` as of `today`; zero when it is not late. */
export function daysLate(endDate: string, today: string): number {
  return endDate < today ? daysInclusive(endDate, today) - 1 : 0;
}

/**
 * The borrower's next step on a request, in plain words (My requests).
 * `lenderFirstName` is LoanView.counterpartFirstName from api.loans.myRequests.
 */
export function requestStep(
  loan: Pick<LoanView, "status" | "startDate" | "endDate" | "overdue"> & Partial<Pick<LoanView, "activity">>,
  lenderFirstName: string,
  today: string,
): string {
  const lender = neighborName(lenderFirstName, { article: "a" });
  const Lender = neighborName(lenderFirstName, { article: "a", capitalize: true });
  switch (loan.status) {
    case "pending":
      return `Waiting for ${lender} to answer`;
    case "approved":
      if (loan.overdue) return `This was due back ${shortDay(loan.endDate)}. Return it to ${lender}.`;
      if (loan.startDate > today) {
        return `Pick it up from ${lender} on ${weekdayDay(loan.startDate)}. You can cancel until then.`;
      }
      return `You have it until ${shortDay(loan.endDate)}. Return it to ${lender}.`;
    case "declined":
      return `${Lender} declined this request.`;
    case "cancelled":
      return cancelledStep(loan.activity ?? [], Lender);
    case "returned":
      return `Returned to ${lender}.`;
    case "expired":
      return "The dates passed before it was answered.";
  }
}

/**
 * A cancelled loan is either the borrower's own cancel or the lender withdrawing an
 * approval. The email activity says which; with no usable activity the copy stays neutral.
 */
function cancelledStep(activity: readonly { kind: string; at: number; detail?: string }[], Lender: string): string {
  const latest = latestActivity(activity.filter((e) => e.kind === "notification_sent"));
  if (latest?.detail === "request_cancelled") return "You cancelled this.";
  if (latest?.detail === "approval_withdrawn") return `${Lender} withdrew approval.`;
  return "Cancelled. The activity below shows who.";
}
