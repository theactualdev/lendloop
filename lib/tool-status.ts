import { addDays } from "@/convex/lib/availability";
import type { ToolCard } from "@/convex/tools";
import { formatRange, shortDay, type DayRange } from "@/lib/dates";
import type { StripBooking } from "@/lib/strip";

/*
 * The status column of a board row, as data. Free reads green with a dot;
 * dates and alerts are stamps (plan rule); everything else is plain text.
 */

export type ToolStatus =
  | { kind: "free"; text: string }
  | { kind: "stamp"; tone: "date" | "alert"; text: string }
  | { kind: "text"; tone: "ink" | "violet" | "alert"; text: string };

export type StatusTool = Pick<ToolCard, "isMine" | "availability" | "bookings" | "freeInRange">;

/**
 * The last day of the booked run that covers today, following bookings that
 * start the day after the previous one ends. Null when nothing booked covers today.
 */
export function backOn(bookings: readonly StripBooking[], today: string): string | null {
  const held = bookings.filter((b) => b.kind === "booked");
  const covering = held.filter((b) => b.startDate <= today && today <= b.endDate);
  if (covering.length === 0) return null;
  let end = covering.map((b) => b.endDate).sort().at(-1)!;
  for (let moved = true; moved; ) {
    moved = false;
    for (const b of held) {
      if (b.startDate <= addDays(end, 1) && b.endDate > end) {
        end = b.endDate;
        moved = true;
      }
    }
  }
  return end;
}

/**
 * First match wins:
 *  1. overdue (on loan, nothing booked today)  -> alert stamp "Overdue"
 *  2. your tool with requests in the window    -> "Request(s) waiting"
 *  3. your own pending request on this tool     -> "You asked for Nov 20–23"
 *  4. on loan now, unless free on your dates   -> date stamp "Back Nov 14"
 *  5. dates picked                             -> "Free Nov 12–14" or "Booked on your dates"
 *  6. otherwise                                -> "Free today"
 */
export function toolStatus(tool: StatusTool, today: string, selection: DayRange | null): ToolStatus {
  const back = backOn(tool.bookings, today);
  if (tool.availability === "on_loan" && back === null) {
    return { kind: "stamp", tone: "alert", text: "Overdue" };
  }

  const requests = tool.bookings.filter((b) => b.kind === "requested");
  if (tool.isMine && requests.length > 0) {
    return { kind: "text", tone: "violet", text: requests.length > 1 ? "Requests waiting" : "Request waiting" };
  }
  // For someone else's tool, tools.list only returns the viewer's own requests.
  if (!tool.isMine && requests.length > 0) {
    const first = requests[0];
    return { kind: "text", tone: "ink", text: `You asked for ${formatRange(first.startDate, first.endDate, "–")}` };
  }

  if (back !== null && !(selection && tool.freeInRange === true)) {
    return { kind: "stamp", tone: "date", text: `Back ${shortDay(back)}` };
  }

  if (selection) {
    return tool.freeInRange === false
      ? { kind: "text", tone: "alert", text: "Booked on your dates" }
      : { kind: "free", text: `Free ${formatRange(selection.from, selection.to, "–")}` };
  }
  return { kind: "free", text: "Free today" };
}
