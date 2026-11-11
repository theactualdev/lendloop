/*
 * Day helpers for the UI. Days are YYYY-MM-DD UTC dates everywhere in LendLoop
 * (plan Decision 6), so they are parsed and formatted in UTC and never shift by
 * a day. Day arithmetic itself lives in convex/lib/availability (addDays,
 * todayUtc, isValidDate) and is shared with the backend.
 */

const DAY_MS = 86_400_000;

/** An inclusive range of days, as kept in the board's `?from=&to=`. */
export type DayRange = { from: string; to: string };

function utc(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

function format(day: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options }).format(utc(day));
}

/**
 * Display labels for a day.
 *
 *   dayLabels("2026-11-10") -> { short: "Tue · Nov 10", long: "Tuesday, November 10" }
 *
 * `short` is the catalog style: set it in IBM Plex Mono, uppercase via CSS.
 * `long` is for screen readers and titles.
 */
export function dayLabels(day: string): { short: string; long: string } {
  return {
    short: `${format(day, { weekday: "short" })} · ${shortDay(day)}`,
    long: format(day, { weekday: "long", month: "long", day: "numeric" }),
  };
}

/** "Nov 14". */
export function shortDay(day: string): string {
  return format(day, { month: "short", day: "numeric" });
}

/**
 * "Nov 12 – 14", "Nov 30 – Dec 2", or "Nov 12" for a single day. The month is
 * written once when both ends share it. `separator` defaults to a spaced en
 * dash (buttons, stamps); use "–" in tight status text and " to " in sentences.
 */
export function formatRange(from: string, to: string, separator = " – "): string {
  if (from === to) return shortDay(from);
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  const end = sameMonth ? format(to, { day: "numeric" }) : shortDay(to);
  return `${shortDay(from)}${separator}${end}`;
}

/** Number of days in an inclusive range: Nov 12 to Nov 14 is 3. */
export function daysInclusive(from: string, to: string): number {
  return Math.round((utc(to).getTime() - utc(from).getTime()) / DAY_MS) + 1;
}

/**
 * The calendar (react-day-picker) works in local Dates. A day maps to local
 * midnight of the same calendar date and back, through the date parts only, so
 * the browser's time zone never moves a day.
 */
export function dayToLocalDate(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function localDateToDay(date: Date): string {
  const y = String(date.getFullYear()).padStart(4, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
