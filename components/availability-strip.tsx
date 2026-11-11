import type { ReactNode } from "react";
import { addDays } from "@/convex/lib/availability";
import { shortDay, type DayRange } from "@/lib/dates";
import { STRIP_DAYS, stripCells, stripSummary, type StripInput, type StripKind } from "@/lib/strip";
import { cn } from "@/lib/utils";

/*
 * The three-week availability strip, shared by every screen (board, listings,
 * incoming). The cells come from the pure `stripCells`; this file only draws
 * them. Screen readers get `stripSummary` instead of 21 boxes.
 */

const CELL: Record<StripKind, string> = {
  free: "bg-free",
  booked: "bg-booked",
  requested: "bg-hatch-requested",
  yours: "bg-yours",
  overdue: "bg-hatch-overdue",
  clash: "bg-hatch-clash",
};

type AvailabilityStripProps = StripInput & {
  /** Draw your dates in solid violet: the picked row on the board, the asked-for dates in Incoming. */
  emphasis?: boolean;
  /** Spoken before the summary. */
  label?: string;
  /** `compact` is a 14px-tall strip for cards and lists. */
  size?: "default" | "compact";
  className?: string;
};

export function AvailabilityStrip({
  today,
  bookings,
  selection,
  availability,
  emphasis = false,
  label = "Next three weeks",
  size = "default",
  className,
}: AvailabilityStripProps) {
  const cells = stripCells({ today, bookings, selection, availability });
  return (
    // Narrow containers scroll the strip sideways rather than squeeze it.
    <div data-slot="availability-strip" className={cn("min-w-0 overflow-x-auto", className)}>
      <span className="sr-only">
        {label}: {stripSummary(cells)}.
      </span>
      <div aria-hidden="true" className="flex min-w-[208px] gap-0.5">
        {cells.map((cell) => (
          <span
            key={cell.date}
            data-kind={cell.kind}
            className={cn(
              "min-w-0 flex-1 rounded-[2px]",
              size === "compact" ? "h-3.5" : "h-[26px]",
              CELL[cell.kind],
              emphasis && cell.kind === "yours" && "bg-violet",
            )}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The date scale above a column of strips: "Today", then a date each week, and
 * a violet bar under your dates. Decorative; each strip speaks for itself.
 */
export function StripScale({
  today,
  selection = null,
  className,
}: {
  today: string;
  selection?: DayRange | null;
  className?: string;
}) {
  const ticks = Array.from({ length: STRIP_DAYS }, (_, i) => {
    const date = addDays(today, i);
    const label = i === 0 ? "Today" : i % 7 === 6 ? shortDay(date) : "";
    const chosen = selection !== null && selection.from <= date && date <= selection.to;
    return { date, label, chosen, last: i === STRIP_DAYS - 1 };
  });
  return (
    <div aria-hidden="true" className={cn("flex min-w-[208px] flex-col gap-1.5", className)}>
      <div className="flex gap-0.5">
        {ticks.map((t) => (
          <span
            key={t.date}
            className={cn(
              "flex min-w-0 flex-1 font-mono text-[11px] leading-none font-medium whitespace-nowrap text-ink-muted",
              t.last ? "justify-end" : "justify-start",
            )}
          >
            {t.label}
          </span>
        ))}
      </div>
      <div className="flex gap-0.5">
        {ticks.map((t) => (
          <span key={t.date} className={cn("h-1 min-w-0 flex-1 rounded-[2px]", t.chosen && "bg-violet")} />
        ))}
      </div>
    </div>
  );
}

const LEGEND: { kind: StripKind; label: string }[] = [
  { kind: "free", label: "Free" },
  { kind: "booked", label: "Booked" },
  { kind: "requested", label: "Requested" },
  { kind: "yours", label: "Your dates" },
  { kind: "overdue", label: "Overdue" },
  { kind: "clash", label: "Clash" },
];

/**
 * The key under a set of strips. Pick the kinds a screen can show and relabel
 * them (Incoming says "Dates asked for"); `children` adds further `<li>`s.
 */
export function StripLegend({
  kinds = LEGEND.map((entry) => entry.kind),
  labels,
  emphasis = false,
  children,
  className,
}: {
  kinds?: StripKind[];
  labels?: Partial<Record<StripKind, string>>;
  /** Show "yours" as solid violet, matching strips drawn with `emphasis`. */
  emphasis?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <ul
      role="list"
      aria-label="Key"
      className={cn("flex flex-wrap items-center gap-x-5 gap-y-2.5 text-[13px] text-ink-soft", className)}
    >
      {LEGEND.filter((entry) => kinds.includes(entry.kind)).map((entry) => (
        <li key={entry.kind} className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className={cn(
              "h-3 w-4 rounded-[2px]",
              CELL[entry.kind],
              emphasis && entry.kind === "yours" && "bg-violet",
            )}
          />
          {labels?.[entry.kind] ?? entry.label}
        </li>
      ))}
      {children}
    </ul>
  );
}
