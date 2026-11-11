import { addDays } from "@/convex/lib/availability";
import { formatRange, type DayRange } from "@/lib/dates";

/*
 * The three-week availability strip, as data. Pure: no React, no clock. The
 * strip component, the board's rows and every later screen read these cells.
 */

/** The strip covers today through today+20 (UTC), the same window as tools.list. */
export const STRIP_DAYS = 21;

export type StripKind = "free" | "booked" | "requested" | "yours" | "overdue" | "clash";

/** One entry of ToolCard.bookings. */
export type StripBooking = {
  startDate: string;
  endDate: string;
  kind: "booked" | "requested";
};

export type StripCell = { date: string; kind: StripKind };

export type StripInput = {
  /** Today, YYYY-MM-DD (UTC). The first cell. */
  today: string;
  bookings: readonly StripBooking[];
  /** The viewer's dates, drawn as a band. */
  selection?: DayRange | null;
  /** ToolCard.availability; "on_loan" with nothing booked today means overdue. */
  availability?: "available" | "on_loan";
};

function covers(range: { startDate: string; endDate: string }, day: string): boolean {
  return range.startDate <= day && day <= range.endDate;
}

/**
 * 21 cells, one per day. Per day, the first rule that matches wins:
 *  1. booked and inside the selection -> "clash"
 *  2. booked                          -> "booked"
 *  3. today, on loan, nothing booked  -> "overdue" (the unreturned loan's dates
 *     ended before the window, so only today can show it)
 *  4. requested                       -> "requested" (a request stays visible
 *     inside your dates: it does not block, but you should see it)
 *  5. inside the selection            -> "yours"
 *  6. otherwise                       -> "free"
 */
export function stripCells({
  today,
  bookings,
  selection = null,
  availability = "available",
}: StripInput): StripCell[] {
  return Array.from({ length: STRIP_DAYS }, (_, i): StripCell => {
    const date = addDays(today, i);
    const booked = bookings.some((b) => b.kind === "booked" && covers(b, date));
    const requested = bookings.some((b) => b.kind === "requested" && covers(b, date));
    const selected = selection !== null && selection.from <= date && date <= selection.to;

    let kind: StripKind = "free";
    if (booked) kind = selected ? "clash" : "booked";
    else if (i === 0 && availability === "on_loan") kind = "overdue";
    else if (requested) kind = "requested";
    else if (selected) kind = "yours";
    return { date, kind };
  });
}

const SUMMARY_LABEL: Record<Exclude<StripKind, "free">, string> = {
  booked: "booked",
  requested: "requested",
  yours: "your dates",
  overdue: "overdue",
  clash: "your dates clash with a booking",
};

/**
 * The strip in words, for screen readers. Runs of the same kind are named in
 * date order; today's date reads as "today".
 *
 *   "Booked Nov 14 to 16; free otherwise"
 *   "Overdue today; your dates Nov 12 to 13; free otherwise"
 */
export function stripSummary(cells: readonly StripCell[]): string {
  if (cells.length === 0) return "";
  const today = cells[0].date;
  const label = (from: string, to: string) => {
    if (from === today) return to === today ? "today" : `today to ${formatRange(to, to)}`;
    return formatRange(from, to, " to ");
  };

  const parts: string[] = [];
  let anyFree = false;
  for (let start = 0; start < cells.length; ) {
    let end = start;
    while (end + 1 < cells.length && cells[end + 1].kind === cells[start].kind) end++;
    const kind = cells[start].kind;
    if (kind === "free") anyFree = true;
    else parts.push(`${SUMMARY_LABEL[kind]} ${label(cells[start].date, cells[end].date)}`);
    start = end + 1;
  }

  if (parts.length === 0) return "Free every day for the next three weeks";
  if (anyFree) parts.push("free otherwise");
  const sentence = parts.join("; ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
