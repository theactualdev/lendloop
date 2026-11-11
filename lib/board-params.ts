import { CATEGORIES, type Category } from "@/convex/lib/constants";
import { validateRange } from "@/convex/lib/loanRules";
import type { DayRange } from "@/lib/dates";

/*
 * The board keeps its filters in the URL: `?category=` and `?from=&to=`.
 * Anything malformed is dropped quietly (no toast for a bad link).
 */

export type BoardParams = { category: Category | null; range: DayRange | null };

/**
 * True when loans.request would accept these dates: valid days, not in the
 * past, end on or after start, at most 30 days inclusive. It runs the backend's
 * own validateRange, so the two can never disagree.
 */
export function isRequestableRange(range: DayRange, today: string): boolean {
  try {
    validateRange({ startDate: range.from, endDate: range.to }, today);
    return true;
  } catch {
    return false;
  }
}

function readCategory(raw: string | null): Category | null {
  return raw !== null && (CATEGORIES as readonly string[]).includes(raw) ? (raw as Category) : null;
}

/** Reads the board's params, keeping only the valid ones. */
export function readBoardParams(
  params: { get(name: string): string | null },
  today: string,
): BoardParams {
  const from = params.get("from");
  const to = params.get("to");
  const range = from !== null && to !== null && isRequestableRange({ from, to }, today) ? { from, to } : null;
  return { category: readCategory(params.get("category")), range };
}

/** The query string for a board state: "?category=garden&from=…&to=…", or "" when empty. */
export function boardSearch({ category, range }: BoardParams): string {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (range) {
    params.set("from", range.from);
    params.set("to", range.to);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}
