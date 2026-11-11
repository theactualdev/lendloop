"use client";

import type { Id } from "@/convex/_generated/dataModel";
import type { ToolCard } from "@/convex/tools";
import { AvailabilityStrip, StripScale } from "@/components/availability-strip";
import { Stamp } from "@/components/stamp";
import { TrustedStar } from "@/components/trusted-star";
import type { DayRange } from "@/lib/dates";
import { toolStatus, type ToolStatus } from "@/lib/tool-status";
import { cn } from "@/lib/utils";

/*
 * One line of the board's catalog (screen D): short code, name and lender,
 * the three-week strip with your dates as a band, and a status. Rows sit in a
 * container with `@container/list`; from 620px wide they use the four columns
 * of the design, below that the strip drops under the name at full width.
 */

/** The wide grid, shared by the rows and the column header so the strips line up with the scale. */
const WIDE_GRID =
  "@[620px]/list:grid-cols-[56px_minmax(150px,1.2fr)_minmax(200px,2fr)_120px] @[620px]/list:px-5 @[620px]/list:[grid-template-areas:'code_tool_strip_status']";

type ToolRowProps = {
  tool: ToolCard;
  today: string;
  selection: DayRange | null;
  /** The row whose tool is in the request card. */
  selected: boolean;
  onSelect: (toolId: Id<"tools">) => void;
  /** The id of the request card the row's button fills in. */
  controls?: string;
};

export function ToolRow({ tool, today, selection, selected, onSelect, controls }: ToolRowProps) {
  const lender = tool.isMine ? "Your listing" : tool.ownerFirstName || "A neighbor";
  return (
    <li
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-4 [grid-template-areas:'code_status'_'tool_status'_'strip_strip']",
        WIDE_GRID,
        "relative border-t border-divider py-3.5 transition-colors",
        selected
          ? "bg-selected-wash shadow-[inset_0_0_0_1.5px_var(--ll-violet)]"
          : "hover:bg-paper-muted",
      )}
    >
      <span className="font-mono text-[13px] font-medium text-ink-muted [grid-area:code]">
        {tool.shortCode}
      </span>
      <div className="min-w-0 [grid-area:tool]">
        {/* The whole row is this button's hit area (the ::after overlay); focus rings the name. */}
        <button
          type="button"
          onClick={() => onSelect(tool._id)}
          aria-pressed={selected}
          aria-controls={controls}
          className="cursor-pointer text-left font-heading text-lg leading-[1.2] font-bold text-ink after:absolute after:inset-0 hover:underline hover:decoration-1 hover:underline-offset-4"
        >
          {tool.name}
        </button>
        <div className="mt-[3px] flex items-center gap-[5px] text-[13px] text-ink-muted">
          <span>{lender}</span>
          {tool.ownerTrusted && !tool.isMine ? <TrustedStar label="Trusted lender" /> : null}
        </div>
      </div>
      <AvailabilityStrip
        today={today}
        bookings={tool.bookings}
        selection={selection}
        availability={tool.availability}
        emphasis={selected}
        className="mt-2.5 [grid-area:strip] @[620px]/list:mt-0"
      />
      <div className="max-w-36 justify-self-end text-right [grid-area:status] @[620px]/list:justify-self-start @[620px]/list:text-left">
        <StatusLabel status={toolStatus(tool, today, selection)} />
      </div>
    </li>
  );
}

const TEXT_TONE = { ink: "text-ink", violet: "text-violet", alert: "text-alert-ink" } as const;

// Status texts end with their dates ("You asked for Nov 20–23"); never wrap inside them.
const DATE_TAIL = /^(.*?)([A-Z][a-z]{2} \d.*)$/;

function KeepDatesTogether({ text }: { text: string }) {
  const match = DATE_TAIL.exec(text);
  if (!match) return text;
  return (
    <>
      {match[1]}
      <span className="whitespace-nowrap">{match[2]}</span>
    </>
  );
}

function StatusLabel({ status }: { status: ToolStatus }) {
  switch (status.kind) {
    case "free":
      return (
        <span className="inline-flex items-center gap-[7px] text-[13px] leading-[1.3] font-semibold text-ok-ink">
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-ok" />
          <span>
            <KeepDatesTogether text={status.text} />
          </span>
        </span>
      );
    case "stamp":
      return <Stamp tone={status.tone}>{status.text}</Stamp>;
    case "text":
      return (
        <span className={cn("text-[13px] leading-[1.3] font-semibold", TEXT_TONE[status.tone])}>
          <KeepDatesTogether text={status.text} />
        </span>
      );
  }
}

/** The column header: "No.", "Tool", the date scale over the strips, "Status". */
export function ToolRowHeader({ today, selection }: { today: string; selection: DayRange | null }) {
  const label = "font-mono text-[11px] font-semibold tracking-[0.1em] text-ink-faint uppercase";
  return (
    <div
      aria-hidden="true"
      className={cn(
        "grid grid-cols-1 items-end gap-x-4 px-4 pt-4 pb-2.5 [grid-template-areas:'strip']",
        WIDE_GRID,
      )}
    >
      <span className={cn(label, "hidden @[620px]/list:block [grid-area:code]")}>No.</span>
      <span className={cn(label, "hidden @[620px]/list:block [grid-area:tool]")}>Tool</span>
      <StripScale today={today} selection={selection} className="[grid-area:strip]" />
      <span className={cn(label, "hidden @[620px]/list:block [grid-area:status]")}>Status</span>
    </div>
  );
}
