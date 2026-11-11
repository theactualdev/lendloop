/**
 * Display labels for a YYYY-MM-DD day. Days are UTC dates everywhere in LendLoop
 * (plan Decision 6), so they are formatted in UTC too and never shift by a day.
 *
 *   dayLabels("2026-11-10") -> { short: "Tue · Nov 10", long: "Tuesday, November 10" }
 *
 * `short` is the catalog style: set it in IBM Plex Mono, uppercase via CSS.
 * `long` is for screen readers and titles.
 */
export function dayLabels(day: string): { short: string; long: string } {
  const at = new Date(`${day}T00:00:00Z`);
  const fmt = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options }).format(at);
  return {
    short: `${fmt({ weekday: "short" })} · ${fmt({ month: "short", day: "numeric" })}`,
    long: fmt({ weekday: "long", month: "long", day: "numeric" }),
  };
}
