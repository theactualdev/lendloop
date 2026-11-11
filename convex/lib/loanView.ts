import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { Category } from "./constants";
import { todayUtc } from "./availability";

export type LoanView = {
  _id: Id<"loans">;
  tool: { name: string; category: Category; shortCode: string };
  counterpartFirstName: string;
  startDate: string;
  endDate: string;
  status: Doc<"loans">["status"];
  overdue: boolean;
  activity: { kind: string; at: number; detail?: string }[];
  deliveryFailed: boolean;
};

export function firstName(name: string | undefined): string {
  return name?.trim().split(/\s+/)[0] ?? "";
}

/**
 * Builds a LoanView field by field (never spreads a document, so no ids or emails
 * of the other party leak). perspective "borrower" shows the lender's first name
 * (the viewer is borrowing); "lender" shows the borrower's.
 */
export async function buildLoanView(
  ctx: QueryCtx,
  loan: Doc<"loans">,
  perspective: "borrower" | "lender",
): Promise<LoanView> {
  const [tool, counterpart] = await Promise.all([
    ctx.db.get(loan.toolId),
    ctx.db.get(perspective === "borrower" ? loan.lenderId : loan.borrowerId),
  ]);
  return {
    _id: loan._id,
    tool: {
      name: tool?.name ?? "",
      category: tool?.category ?? "other",
      shortCode: tool?.shortCode ?? "",
    },
    counterpartFirstName: firstName(counterpart?.name),
    startDate: loan.startDate,
    endDate: loan.endDate,
    status: loan.status,
    overdue: loan.status === "approved" && loan.endDate < todayUtc(),
    activity: [],
    deliveryFailed: false,
  };
}
