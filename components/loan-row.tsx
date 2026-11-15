"use client";

import Link from "next/link";
import { useMutation } from "convex/react";
import { AlertCircle, Check } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { LoanView } from "@/convex/lib/loanView";
import { ActivityLine } from "@/components/activity-line";
import { AvailabilityStrip, StripScale } from "@/components/availability-strip";
import { IndexCard, IndexCardHeader, IndexCardTitle } from "@/components/index-card";
import { Stamp } from "@/components/stamp";
import { Button } from "@/components/ui/button";
import { CATEGORY_LABELS } from "@/convex/lib/constants";
import { activityText, formatActivityTime } from "@/lib/activity";
import { daysInclusive, formatRange, shortDay } from "@/lib/dates";
import { daysLate, requestStep } from "@/lib/loan-step";
import { neighborName } from "@/lib/names";
import type { StripBooking } from "@/lib/strip";
import { useCardAction } from "@/lib/use-card-action";
import { cn } from "@/lib/utils";

/*
 * Loan UI for My requests (screen D3) and Incoming (D4). The borrower sees an
 * index card per request with an Activity slip; the lender sees waiting
 * requests, loans that are out, and a short "Recently" list.
 *
 * Every button in a card is disabled while one of its mutations runs, and a
 * ref guards the gap before React re-renders, so a double click cannot submit
 * twice. Convex reactivity moves the card afterwards; there is no optimistic state.
 */

type IncomingLoan = LoanView & { clash: { borrowerFirstName: string; until: string } | null };

const MONO_LABEL = "font-mono text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase";

// ---- My requests (D3) ---------------------------------------------------------

/** Past requests that closed quietly are marked in plain text; only alerts and dates get stamps. */
const PLAIN_STATUS: Partial<Record<LoanView["status"], string>> = {
  cancelled: "Cancelled",
  returned: "Returned",
};

function RequestMark({ loan, today }: { loan: LoanView; today: string }) {
  if (loan.overdue) return <Stamp tone="alert" size="lg">Overdue</Stamp>;
  if (loan.status === "declined") return <Stamp tone="alert" size="lg">Declined</Stamp>;
  if (loan.status === "approved" && loan.startDate <= today) {
    return <Stamp size="lg">Due {shortDay(loan.endDate)}</Stamp>;
  }
  if (loan.status === "pending" || loan.status === "approved") {
    return <Stamp size="lg">{formatRange(loan.startDate, loan.endDate)}</Stamp>;
  }
  return (
    <span className="font-mono text-xs font-semibold tracking-[0.12em] text-ink-muted uppercase">
      {PLAIN_STATUS[loan.status]}
    </span>
  );
}

export function MyRequestCard({ loan, today }: { loan: LoanView; today: string }) {
  const cancel = useMutation(api.loans.cancel);
  const { busy, run } = useCardAction();
  const titleId = `request-${loan._id}`;
  const lender = neighborName(loan.counterpartFirstName, { article: "a" });
  const days = daysInclusive(loan.startDate, loan.endDate);
  const late = loan.overdue ? daysLate(loan.endDate, today) : 0;

  return (
    <IndexCard aria-labelledby={titleId} className="flex flex-wrap overflow-hidden">
      <div className="relative min-w-0 flex-[1_1_420px]">
        {/*
          From `sm` up the mark is pinned to the top right corner, as in D3. Below
          `sm` the header is a grid: the mark sits in flow at the right of the meta
          line and the title takes the full width under both, so nothing overlaps.
          The mark stays after the title in the DOM (read after the heading).
        */}
        <IndexCardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 pt-4 pb-3 sm:block sm:px-[22px] sm:pt-[18px]">
          <p className="font-mono text-xs font-medium tracking-[0.04em] text-ink-muted">
            {loan.tool.shortCode} · {CATEGORY_LABELS[loan.tool.category]}
          </p>
          <IndexCardTitle
            id={titleId}
            className="col-span-2 mt-1.5 text-[26px] max-sm:text-balance max-sm:wrap-break-word sm:pr-32"
          >
            {loan.tool.name}
          </IndexCardTitle>
          <div className="col-start-2 row-start-1 sm:absolute sm:top-5 sm:right-5">
            <RequestMark loan={loan} today={today} />
          </div>
        </IndexCardHeader>
        <div className="bg-ruled px-4 pb-4 text-[15px] leading-7 text-ink-soft sm:px-[22px]">
          <p>
            From <strong className="font-semibold text-ink">{lender}</strong>
          </p>
          <p>
            {formatRange(loan.startDate, loan.endDate)} · {days === 1 ? "1 day" : `${days} days`}
            {late > 0 ? ` · ${late === 1 ? "1 day" : `${late} days`} late` : null}
          </p>
          <p className={cn("font-semibold", loan.overdue ? "text-alert-ink" : "text-ink")}>
            {requestStep(loan, loan.counterpartFirstName, today)}
          </p>
        </div>
        {loan.status === "pending" ? (
          <div className="px-4 pt-2 pb-5 sm:px-[22px]">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                run(
                  () => cancel({ loanId: loan._id }),
                  () => toast.success("Request cancelled", { description: `${neighborName(loan.counterpartFirstName, { article: "a", capitalize: true })} was emailed.` }),
                )
              }
            >
              {busy ? "Cancelling…" : "Cancel request"}
              <span className="sr-only"> for {loan.tool.name}</span>
            </Button>
          </div>
        ) : null}
      </div>
      <ActivitySlip loan={loan} perspective="borrower" />
    </IndexCard>
  );
}

/** Every email sent about a loan, newest first, with its date and time. */
export function ActivitySlip({ loan, perspective }: { loan: LoanView; perspective: "borrower" | "lender" }) {
  const events = [...loan.activity].sort((a, b) => b.at - a.at);
  return (
    <section
      aria-label={`Activity for ${loan.tool.name}`}
      className="min-w-0 flex-[1_1_320px] bg-paper-back px-4 pt-[18px] pb-5 shadow-[inset_1px_0_0_var(--ll-divider)] sm:px-[22px]"
    >
      <h3 className={MONO_LABEL}>Activity</h3>
      {events.length === 0 ? (
        <p className="mt-3 text-sm leading-[1.4] text-ink-muted">No emails yet.</p>
      ) : (
        <ol role="list" className="mt-3 flex list-none flex-col gap-2.5 p-0">
          {events.map((event, i) => (
            <li
              key={`${event.at}-${i}`}
              className="grid grid-cols-[112px_minmax(0,1fr)] items-baseline gap-3 max-[420px]:grid-cols-1 max-[420px]:gap-0.5"
            >
              <time
                dateTime={new Date(event.at).toISOString()}
                className="font-mono text-[11px] font-semibold tracking-[0.08em] text-violet uppercase"
              >
                {formatActivityTime(event.at)}
              </time>
              <span className={cn("text-sm leading-[1.4]", i === 0 && "font-semibold")}>
                {activityText(event, perspective, loan.counterpartFirstName)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ---- Incoming (D4) --------------------------------------------------------------

const CARD = "flex flex-wrap items-center gap-x-8 gap-y-5 px-4 py-5 shadow-card sm:px-6";

function DeliveryFailed({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-center gap-2 text-sm font-semibold text-alert-ink", className)}>
      <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
      Email didn&apos;t send. An admin has been alerted.
    </p>
  );
}

function RequestHead({ loan, id, children }: { loan: LoanView; id: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 flex-[1_1_260px]">
      <p className="font-mono text-xs font-medium tracking-[0.04em] text-ink-muted">
        {loan.tool.shortCode} · {CATEGORY_LABELS[loan.tool.category]}
      </p>
      <h3 id={id} className="mt-1 font-heading text-2xl leading-[1.15] font-extrabold">
        {loan.tool.name}
      </h3>
      {children}
    </div>
  );
}

/** The request's own email time, when its "request created" email was logged. */
function askedAt(loan: LoanView): string | null {
  const event = loan.activity.find((e) => e.kind === "notification_sent" && e.detail === "request_created");
  return event ? formatActivityTime(event.at) : null;
}

export function WaitingCard({
  loan,
  today,
  bookings,
}: {
  loan: IncomingLoan;
  today: string;
  /** The tool's bookings from tools.myListings (booked and requested). */
  bookings: readonly StripBooking[];
}) {
  const approve = useMutation(api.loans.approve);
  const decline = useMutation(api.loans.decline);
  const { busy, run } = useCardAction();
  const titleId = `waiting-${loan._id}`;
  const clashId = `clash-${loan._id}`;
  const borrower = neighborName(loan.counterpartFirstName, { article: "a", capitalize: true });
  const days = daysInclusive(loan.startDate, loan.endDate);
  const asked = askedAt(loan);

  // This request is in `bookings` as "requested"; drop one copy so it shows as the asked-for dates.
  const own = bookings.findIndex(
    (b) => b.kind === "requested" && b.startDate === loan.startDate && b.endDate === loan.endDate,
  );
  const others = bookings.filter((_, i) => i !== own);
  const selection = { from: loan.startDate, to: loan.endDate };

  return (
    <IndexCard aria-labelledby={titleId} className={CARD}>
      <RequestHead loan={loan} id={titleId}>
        <p className="mt-2 text-[15px] leading-[1.45]">
          <strong className="font-bold">{borrower}</strong> wants it {formatRange(loan.startDate, loan.endDate)} ·{" "}
          {days === 1 ? "1 day" : `${days} days`}
        </p>
        {asked ? <p className="mt-1 font-mono text-xs text-ink-muted">Asked {asked}</p> : null}
      </RequestHead>

      <div className="min-w-0 flex-[2_1_320px]">
        <StripScale today={today} selection={selection} className="mb-1.5" />
        <AvailabilityStrip
          today={today}
          bookings={others}
          selection={selection}
          emphasis
          label={`${loan.tool.name}, next three weeks`}
        />
        {loan.clash ? (
          <p id={clashId} className="mt-2.5 flex items-center gap-2 text-sm font-semibold text-alert-ink">
            <AlertCircle aria-hidden="true" className="size-4 shrink-0 text-alert" />
            Clashes with {neighborName(loan.clash.borrowerFirstName, { article: "a" })}&apos;s loan until{" "}
            {shortDay(loan.clash.until)}
          </p>
        ) : (
          <p className="mt-2.5 flex items-center gap-2 text-sm font-semibold text-ok-ink">
            <Check aria-hidden="true" className="size-4 shrink-0 text-ok" strokeWidth={2.5} />
            No clash with your other loans
          </p>
        )}
        {loan.deliveryFailed ? <DeliveryFailed className="mt-2" /> : null}
      </div>

      <div className="flex min-w-[150px] flex-col gap-2">
        <Button
          disabled={busy || loan.clash !== null}
          aria-describedby={loan.clash ? clashId : undefined}
          aria-label={`Approve ${loan.tool.name} for ${borrower}`}
          onClick={() =>
            run(
              () => approve({ loanId: loan._id }),
              () => toast.success("Request approved", { description: `${borrower} was emailed.` }),
            )
          }
          className={cn(loan.clash && "bg-divider text-disabled-ink opacity-100")}
        >
          {busy ? "Working…" : "Approve"}
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          aria-label={`Decline ${loan.tool.name} for ${borrower}`}
          onClick={() =>
            run(
              () => decline({ loanId: loan._id }),
              () => toast.success("Request declined", { description: `${borrower} was emailed.` }),
            )
          }
        >
          Decline
        </Button>
      </div>
    </IndexCard>
  );
}

export function OutOnLoanCard({
  loan,
  today,
  bookings,
}: {
  loan: IncomingLoan;
  today: string;
  bookings: readonly StripBooking[];
}) {
  const markReturned = useMutation(api.loans.markReturned);
  const { busy, run } = useCardAction();
  const titleId = `out-${loan._id}`;
  const borrower = neighborName(loan.counterpartFirstName, { article: "a" });
  const started = loan.startDate <= today;

  return (
    <IndexCard aria-labelledby={titleId} className={CARD}>
      <RequestHead loan={loan} id={titleId}>
        <p className="mt-2 text-[15px] leading-[1.45]">
          {started ? "With" : "Going to"} <strong className="font-bold">{borrower}</strong> ·{" "}
          {formatRange(loan.startDate, loan.endDate)}
        </p>
        <div className="mt-2.5">
          {loan.overdue ? (
            <Stamp tone="alert">Overdue</Stamp>
          ) : started ? (
            <Stamp>Due {shortDay(loan.endDate)}</Stamp>
          ) : (
            <Stamp>Starts {shortDay(loan.startDate)}</Stamp>
          )}
        </div>
      </RequestHead>

      <div className="min-w-0 flex-[2_1_320px]">
        <StripScale today={today} className="mb-1.5" />
        <AvailabilityStrip
          today={today}
          bookings={bookings}
          availability={loan.overdue ? "on_loan" : "available"}
          label={`${loan.tool.name}, next three weeks`}
        />
        <p className="mt-2.5 text-sm leading-normal text-ink-soft">
          {loan.overdue
            ? `This was due back ${shortDay(loan.endDate)}. Mark it returned once it's back with you.`
            : `Mark it returned once it's back with you. ${neighborName(loan.counterpartFirstName, { article: "a", capitalize: true })} gets an email to confirm.`}
        </p>
        {loan.deliveryFailed ? <DeliveryFailed className="mt-2" /> : null}
      </div>

      <div className="flex min-w-[150px] flex-col gap-2">
        <Button
          variant="outline-primary"
          disabled={busy}
          onClick={() =>
            run(
              () => markReturned({ loanId: loan._id }),
              () =>
                toast.success("Marked returned", {
                  description: `${neighborName(loan.counterpartFirstName, { article: "a", capitalize: true })} was emailed.`,
                }),
            )
          }
        >
          {busy ? "Working…" : "Mark returned"}
          <span className="sr-only"> for {loan.tool.name}</span>
        </Button>
      </div>
    </IndexCard>
  );
}

export function RecentRow({ loan }: { loan: IncomingLoan }) {
  const borrower = neighborName(loan.counterpartFirstName, { article: "a", capitalize: true });
  return (
    <li className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-divider py-4 first:border-t-0">
      <span className="min-w-0 flex-[1_1_220px]">
        <strong className="font-heading text-lg font-bold">{loan.tool.name}</strong>
        <span className="text-sm text-ink-soft">
          {" "}
          · {borrower} · {formatRange(loan.startDate, loan.endDate)}
        </span>
      </span>
      <span className="flex-[0_0_96px]">
        {loan.status === "declined" ? (
          <Stamp tone="alert">Declined</Stamp>
        ) : (
          <span className="font-mono text-[11px] font-semibold tracking-[0.1em] text-ink-muted uppercase">
            {PLAIN_STATUS[loan.status] ?? loan.status}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-[1_1_240px]">
        {loan.deliveryFailed ? (
          <DeliveryFailed className="font-mono text-xs" />
        ) : (
          <ActivityLine activity={loan.activity} perspective="lender" counterpartFirstName={loan.counterpartFirstName} />
        )}
      </span>
    </li>
  );
}

export function GoToBoard() {
  return (
    <Link href="/board" className="font-bold text-violet underline underline-offset-4">
      Find a tool on the board
    </Link>
  );
}
