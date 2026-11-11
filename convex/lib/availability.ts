import type { Doc } from "../_generated/dataModel";

const DAY_MS = 86_400_000;
export const BOOKING_WINDOW_DAYS = 21;

/** Today's date (UTC) as YYYY-MM-DD. */
export function todayUtc(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Adds whole days to a YYYY-MM-DD date (UTC). */
export function addDays(date: string, days: number): string {
  return todayUtc(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS);
}

export function isValidDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    todayUtc(Date.parse(`${value}T00:00:00Z`)) === value
  );
}

/** Approved and not yet returned: the loan holds the tool for its dates. */
export function isHolding(loan: Doc<"loans">): boolean {
  return loan.status === "approved" && loan.returnedAt === undefined;
}

/** On loan when an approved, unreturned loan has started on or before today. */
export function isOnLoan(loans: Doc<"loans">[], today: string): boolean {
  return loans.some((l) => isHolding(l) && l.startDate <= today);
}

/** True when the inclusive ranges share at least one day. */
export function overlaps(
  a: { startDate: string; endDate: string },
  from: string,
  to: string,
): boolean {
  return a.startDate <= to && a.endDate >= from;
}
