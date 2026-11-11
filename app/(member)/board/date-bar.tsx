"use client";

import { useId, useState } from "react";
import { addDays } from "@/convex/lib/availability";
import { MAX_LOAN_DAYS } from "@/convex/lib/loanRules";
import { Button } from "@/components/ui/button";
import { isRequestableRange } from "@/lib/board-params";
import type { DayRange } from "@/lib/dates";
import { messageForCode } from "@/lib/errors";
import { cn } from "@/lib/utils";

/*
 * "When do you need it?" (screen D). Two date fields that write `?from=&to=`
 * once they hold dates loans.request would accept. Anything else stays in the
 * fields with the INVALID_RANGE sentence under them, and the board shows no dates.
 */

type Draft = { from: string; to: string };

const keyOf = (range: DayRange | null) => (range ? `${range.from}|${range.to}` : "");

export function DateBar({
  today,
  range,
  onRangeChange,
  hideBooked,
  onHideBookedChange,
}: {
  today: string;
  range: DayRange | null;
  onRangeChange: (range: DayRange | null) => void;
  hideBooked: boolean;
  onHideBookedChange: (hide: boolean) => void;
}) {
  const fromId = useId();
  const toId = useId();
  const errorId = useId();

  const [draft, setDraft] = useState<Draft>({ from: range?.from ?? "", to: range?.to ?? "" });
  const [touched, setTouched] = useState(false);
  // When the URL dates change to something this bar did not write (the
  // calendar, Back), the fields follow them. The URL catches up with our own
  // writes a render later (Next syncs history updates in a transition), so
  // compare against what we wrote, not against the draft.
  const urlKey = keyOf(range);
  const [seenUrl, setSeenUrl] = useState(urlKey);
  const [written, setWritten] = useState(urlKey);
  if (urlKey !== seenUrl) {
    setSeenUrl(urlKey);
    if (urlKey !== written) {
      setWritten(urlKey);
      setDraft({ from: range?.from ?? "", to: range?.to ?? "" });
      setTouched(false);
    }
  }

  const complete = draft.from !== "" && draft.to !== "";
  const accepted = complete && isRequestableRange(draft, today) ? draft : null;
  const showError = touched && complete && !accepted;

  function change(next: Draft) {
    setDraft(next);
    const ok = next.from !== "" && next.to !== "" && isRequestableRange(next, today) ? next : null;
    setWritten(keyOf(ok));
    onRangeChange(ok);
  }

  const field =
    "h-11 w-full rounded-lg border-[1.5px] border-violet bg-paper px-2.5 text-[15px] text-ink aria-invalid:border-alert";

  return (
    <div className="mt-7 rounded-[10px] border bg-header px-5 py-4">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <p className="flex-[1_1_200px] self-center font-heading text-xl font-bold">When do you need it?</p>
        <div className="flex min-w-0 flex-[1_1_140px] flex-col gap-1.5 sm:flex-[0_1_170px]">
          <label htmlFor={fromId} className="text-[13px] font-semibold text-ink-soft">
            Free from
          </label>
          <input
            id={fromId}
            type="date"
            value={draft.from}
            min={today}
            aria-invalid={showError || undefined}
            aria-describedby={showError ? errorId : undefined}
            onChange={(event) => {
              const from = event.target.value;
              // A new start drags an empty or earlier end along with it.
              const to = from && (!draft.to || draft.to < from) ? from : draft.to;
              change({ from, to });
            }}
            onBlur={() => setTouched(true)}
            className={field}
          />
        </div>
        <div className="flex min-w-0 flex-[1_1_140px] flex-col gap-1.5 sm:flex-[0_1_170px]">
          <label htmlFor={toId} className="text-[13px] font-semibold text-ink-soft">
            Until
          </label>
          <input
            id={toId}
            type="date"
            value={draft.to}
            min={draft.from || today}
            max={addDays(draft.from || today, MAX_LOAN_DAYS - 1)}
            aria-invalid={showError || undefined}
            aria-describedby={showError ? errorId : undefined}
            onChange={(event) => change({ from: draft.from, to: event.target.value })}
            onBlur={() => setTouched(true)}
            className={field}
          />
        </div>
        <label
          className={cn(
            "flex min-h-11 items-center gap-2 text-sm font-medium",
            range ? "cursor-pointer" : "cursor-not-allowed text-disabled-ink",
          )}
        >
          <input
            type="checkbox"
            checked={hideBooked && range !== null}
            disabled={range === null}
            onChange={(event) => onHideBookedChange(event.target.checked)}
            className="size-[18px] accent-ink"
          />
          Hide tools booked on those days
        </label>
        {draft.from || draft.to ? (
          <Button
            variant="ghost"
            className="px-3"
            onClick={() => {
              setTouched(false);
              change({ from: "", to: "" });
            }}
          >
            Clear dates
          </Button>
        ) : null}
      </div>
      {showError ? (
        <p id={errorId} role="alert" className="mt-3 text-sm font-semibold text-alert-ink">
          {messageForCode("INVALID_RANGE")}
        </p>
      ) : null}
    </div>
  );
}
