import { fail } from "./errors";
import { addDays, isValidDate, overlaps } from "./availability";

export type LoanStatus = "pending" | "approved" | "declined" | "cancelled" | "returned" | "expired";
export type LoanAction = "approve" | "decline" | "cancel" | "withdraw" | "return";
export type LoanActor = "lender" | "borrower" | "admin";
export type DateRange = { startDate: string; endDate: string };

export const MAX_LOAN_DAYS = 30;

const MOVES: { from: LoanStatus; action: LoanAction; to: LoanStatus; actors: LoanActor[] }[] = [
  { from: "pending", action: "approve", to: "approved", actors: ["lender"] },
  { from: "pending", action: "decline", to: "declined", actors: ["lender"] },
  { from: "pending", action: "cancel", to: "cancelled", actors: ["borrower"] },
  { from: "approved", action: "cancel", to: "cancelled", actors: ["borrower"] },
  { from: "approved", action: "withdraw", to: "cancelled", actors: ["lender", "admin"] },
  { from: "approved", action: "return", to: "returned", actors: ["lender", "admin"] },
];

/** `expired` has no moves: it is terminal. The only legal moves. Wrong actor: FORBIDDEN. Anything else: INVALID_TRANSITION. */
export function nextStatus(status: LoanStatus, action: LoanAction, actor: LoanActor): LoanStatus {
  const move = MOVES.find((m) => m.from === status && m.action === action);
  if (!move) fail("INVALID_TRANSITION");
  if (!move.actors.includes(actor)) fail("FORBIDDEN");
  return move.to;
}

/** Inclusive on both ends. Single source of truth lives in availability.overlaps. */
export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return overlaps(a, b.startDate, b.endDate);
}

export function validateRange(r: DateRange, today: string): void {
  if (!isValidDate(r.startDate) || !isValidDate(r.endDate)) fail("INVALID_RANGE");
  if (r.startDate < today || r.endDate < r.startDate) fail("INVALID_RANGE");
  // Inclusive day count must be at most MAX_LOAN_DAYS.
  if (r.endDate > addDays(r.startDate, MAX_LOAN_DAYS - 1)) fail("INVALID_RANGE");
}
