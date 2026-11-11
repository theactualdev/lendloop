"use client";

import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { CircleAlert, Clock } from "lucide-react";
import type { Matcher } from "react-day-picker";
import { api } from "@/convex/_generated/api";
import { addDays } from "@/convex/lib/availability";
import { CATEGORY_LABELS, CONDITION_LABELS } from "@/convex/lib/constants";
import { MAX_LOAN_DAYS } from "@/convex/lib/loanRules";
import type { ToolCard } from "@/convex/tools";
import { IndexCard, IndexCardHeader, IndexCardTitle } from "@/components/index-card";
import { Stamp } from "@/components/stamp";
import { TrustedStar } from "@/components/trusted-star";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { isRequestableRange } from "@/lib/board-params";
import {
  dayLabels,
  dayToLocalDate,
  daysInclusive,
  formatRange,
  localDateToDay,
  shortDay,
  type DayRange,
} from "@/lib/dates";
import { toastError } from "@/lib/errors";
import { backOn } from "@/lib/tool-status";

/*
 * The board's side panel (screen D): an index card for the picked tool, a month
 * calendar that edits the same dates as the date bar, the dates as a stamp,
 * the Request button and what happens next. Requests go to loans.request;
 * every failure is shown through toastError.
 */

type RequestCardProps = {
  id?: string;
  /** The picked tool, or null before one is picked. */
  tool: ToolCard | null;
  today: string;
  selection: DayRange | null;
  onSelectionChange: (range: DayRange) => void;
};

export function RequestCard({ id, tool, today, selection, onSelectionChange }: RequestCardProps) {
  const titleId = useId();
  const reasonId = useId();
  const request = useMutation(api.loans.request);
  const [sending, setSending] = useState(false);

  const lender = tool ? tool.ownerFirstName || "The lender" : "";
  // The dates as the backend would take them (the URL is already checked; today may have moved on).
  const dates = selection !== null && isRequestableRange(selection, today) ? selection : null;
  const blocked = !tool ? "no-tool" : tool.isMine ? "own" : !dates ? "no-dates" : null;

  async function send() {
    if (!tool || !dates || blocked) return;
    setSending(true);
    try {
      await request({ toolId: tool._id, startDate: dates.from, endDate: dates.to });
      toast.success(`Request sent to ${lender}`, {
        description: "You'll see the answer under My requests.",
      });
    } catch (error) {
      toastError(error);
    } finally {
      setSending(false);
    }
  }

  const range = dates ? formatRange(dates.from, dates.to) : null;
  const length = dates ? daysInclusive(dates.from, dates.to) : 0;

  return (
    // tabIndex -1: the board moves focus here after a pick when the card is stacked under the list.
    <IndexCard
      id={id}
      tabIndex={-1}
      elevation="raised"
      aria-labelledby={titleId}
      className="relative scroll-mt-4 overflow-hidden"
    >
      <IndexCardHeader className="px-5 pt-[18px] pb-3">
        <p className="font-mono text-xs font-medium tracking-[0.04em] text-ink-muted">
          {tool
            ? `${tool.shortCode} · ${CATEGORY_LABELS[tool.category]} · ${CONDITION_LABELS[tool.condition]}`
            : "Borrow a tool"}
        </p>
        <IndexCardTitle id={titleId} className="mt-1.5 text-[28px]">
          {tool ? tool.name : "Pick a tool"}
        </IndexCardTitle>
      </IndexCardHeader>

      <div className="bg-ruled px-5 text-sm leading-7 text-ink-soft">
        {tool ? (
          <>
            {tool.description ? <p>{tool.description}</p> : null}
            <p className="flex flex-wrap items-center gap-x-1.5">
              {tool.isMine ? (
                "Lent by you"
              ) : (
                <>
                  Lent by <strong className="font-semibold text-ink">{lender}</strong>
                  {tool.ownerTrusted ? (
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-violet">
                      <TrustedStar className="size-3" />
                      Trusted lender
                    </span>
                  ) : null}
                </>
              )}
            </p>
          </>
        ) : (
          <p>Choose a tool from the list to see who lends it and when it&apos;s free.</p>
        )}
      </div>

      <div className="px-5 pt-4">
        <RangeCalendar
          tool={tool}
          today={today}
          selection={selection}
          onSelectionChange={onSelectionChange}
        />
      </div>

      <div className="flex flex-col gap-3.5 p-5">
        {dates && range ? (
          <div className="flex items-center justify-between gap-3">
            <Stamp size="lg">{range}</Stamp>
            <span className="text-sm text-ink-soft">{length === 1 ? "1 day" : `${length} days`}</span>
          </div>
        ) : null}

        {tool && !tool.isMine ? (
          <ToolNotes tool={tool} today={today} selection={dates} lender={lender} />
        ) : null}

        <Button
          size="lg"
          className="w-full"
          disabled={blocked !== null || sending}
          aria-describedby={reasonId}
          onClick={send}
        >
          {sending ? "Sending…" : range && !tool?.isMine ? `Request ${range}` : "Request"}
        </Button>
        <p id={reasonId} className="text-[13px] leading-normal text-pretty text-ink-muted">
          {blocked === "no-tool" ? (
            "Pick a tool from the list, then your dates."
          ) : blocked === "own" ? (
            <span className="font-semibold text-ink-soft">
              This is your own tool, so you can&apos;t request it.
            </span>
          ) : blocked === "no-dates" ? (
            "Pick your dates on the calendar or under “When do you need it?”, from today up to 30 days."
          ) : (
            <>
              {lender} gets an email and can approve or decline. You&apos;ll see the answer under{" "}
              <Link href="/requests" className="font-semibold text-ink underline underline-offset-2">
                My requests
              </Link>
              .
            </>
          )}
        </p>
      </div>
    </IndexCard>
  );
}

/** Warnings about the picked tool and dates. Requests are still allowed: the lender decides. */
function ToolNotes({
  tool,
  today,
  selection,
  lender,
}: {
  tool: ToolCard;
  today: string;
  selection: DayRange | null;
  lender: string;
}) {
  const notes: ReactNode[] = [];
  const back = backOn(tool.bookings, today);
  if (tool.availability === "on_loan" && back === null) {
    notes.push(
      <Note key="overdue" tone="alert">
        Overdue: it hasn&apos;t come back from its last loan yet.
      </Note>,
    );
  } else if (tool.availability === "on_loan" && back && (!selection || tool.freeInRange === false)) {
    notes.push(
      <Note key="loan" tone="ink">
        Out on loan until {shortDay(back)}. You can ask for later dates.
      </Note>,
    );
  }
  if (selection && tool.freeInRange === false) {
    notes.push(
      <Note key="clash" tone="alert">
        Already lent out on some of these days. You can still ask, but {lender} can only approve once
        they&apos;re free.
      </Note>,
    );
  }
  if (
    selection &&
    tool.bookings.some(
      (b) => b.kind === "requested" && b.startDate <= selection.to && b.endDate >= selection.from,
    )
  ) {
    notes.push(
      <Note key="asked" tone="ink">
        You&apos;ve already asked for some of these days.
      </Note>,
    );
  }
  return notes.length ? <ul role="list" className="flex flex-col gap-2">{notes}</ul> : null;
}

function Note({ tone, children }: { tone: "alert" | "ink"; children: ReactNode }) {
  const Icon = tone === "alert" ? CircleAlert : Clock;
  return (
    <li
      className={
        tone === "alert"
          ? "flex gap-2 text-sm leading-snug font-semibold text-alert-ink"
          : "flex gap-2 text-sm leading-snug text-ink-soft"
      }
    >
      <Icon
        aria-hidden="true"
        strokeWidth={1.8}
        className={tone === "alert" ? "mt-px size-4 shrink-0 text-alert" : "mt-px size-4 shrink-0 text-ink-muted"}
      />
      <span>{children}</span>
    </li>
  );
}

/**
 * A month calendar for the request's dates. First click picks a one-day range
 * starting there; the next click on or after it sets the end (up to 30 days).
 * Past days and days the tool is booked can't be clicked; a range that spans a
 * booking shows those days as a clash.
 */
function RangeCalendar({
  tool,
  today,
  selection,
  onSelectionChange,
}: {
  tool: ToolCard | null;
  today: string;
  selection: DayRange | null;
  onSelectionChange: (range: DayRange) => void;
}) {
  // The start of a range the last click opened. It is dropped when the dates
  // change to anything but that click's one-day range (the date bar, Back).
  const [anchor, setAnchor] = useState<string | null>(null);
  const selectionKey = selection ? `${selection.from}|${selection.to}` : "";
  const [seenSelection, setSeenSelection] = useState(selectionKey);
  if (selectionKey !== seenSelection) {
    setSeenSelection(selectionKey);
    if (anchor && selectionKey !== `${anchor}|${anchor}`) setAnchor(null);
  }
  const openFrom = anchor;

  // Follow the dates to their month when they change elsewhere (the date bar).
  const [month, setMonth] = useState(() => dayToLocalDate((selection?.from ?? today).slice(0, 8) + "01"));
  const [shownFrom, setShownFrom] = useState(selection?.from ?? null);
  if ((selection?.from ?? null) !== shownFrom) {
    setShownFrom(selection?.from ?? null);
    if (selection) setMonth(dayToLocalDate(selection.from.slice(0, 8) + "01"));
  }

  function pick(day: string) {
    if (openFrom && day >= openFrom && day <= addDays(openFrom, MAX_LOAN_DAYS - 1)) {
      setAnchor(null);
      onSelectionChange({ from: openFrom, to: day });
    } else {
      setAnchor(day);
      onSelectionChange({ from: day, to: day });
    }
  }

  const booked: Date[] = [];
  const clash: Date[] = [];
  for (const b of tool?.bookings ?? []) {
    if (b.kind !== "booked") continue;
    for (let day = b.startDate < today ? today : b.startDate; day <= b.endDate; day = addDays(day, 1)) {
      booked.push(dayToLocalDate(day));
      if (selection && selection.from <= day && day <= selection.to) clash.push(dayToLocalDate(day));
    }
  }

  const disabled: Matcher[] = [{ before: dayToLocalDate(today) }, ...booked];
  if (openFrom) disabled.push({ after: dayToLocalDate(addDays(openFrom, MAX_LOAN_DAYS - 1)) });

  return (
    <Calendar
      mode="range"
      selected={
        selection ? { from: dayToLocalDate(selection.from), to: dayToLocalDate(selection.to) } : undefined
      }
      onSelect={(_range, triggerDate) => pick(localDateToDay(triggerDate))}
      today={dayToLocalDate(today)}
      month={month}
      onMonthChange={setMonth}
      startMonth={dayToLocalDate(today.slice(0, 8) + "01")}
      disabled={disabled}
      modifiers={{ booked, clash }}
      labels={{
        labelDayButton: (date, modifiers) => {
          let label = dayLabels(localDateToDay(date)).long;
          if (modifiers.today) label = `Today, ${label}`;
          if (modifiers.clash) label += ", booked, clashes with your dates";
          else if (modifiers.booked) label += ", booked";
          else if (modifiers.selected) label += ", in your dates";
          return label;
        },
      }}
    />
  );
}
