"use client";

import { useId } from "react";
import Link from "next/link";
import { catchError, type ErrorInfo } from "next/error";
import { useQuery } from "convex/react";
import { ArrowRight } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { LoanView } from "@/convex/lib/loanView";
import { Stamp } from "@/components/stamp";
import { Button } from "@/components/ui/button";
import { formatRange, shortDay } from "@/lib/dates";
import { messageFor } from "@/lib/errors";

/*
 * "Your loans" beside the board (screen D): the viewer's open requests and
 * loans, most urgent first, as small slips. The full list is My requests.
 */

const SHOWN = 3;

/** Overdue first, then what you hold now, then what's coming, then pending. */
function rank(loan: LoanView, today: string): number {
  if (loan.overdue) return 0;
  if (loan.status === "approved") return loan.startDate <= today ? 1 : 2;
  return 3;
}

export function YourLoans({ today }: { today: string }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <h2 id={titleId} className="text-2xl font-extrabold tracking-[-0.01em]">
        Your loans
      </h2>
      <YourLoansBoundary>
        <YourLoansList today={today} />
      </YourLoansBoundary>
      <Link
        href="/requests"
        className="inline-flex min-h-11 items-center gap-1.5 self-start text-[15px] font-bold text-ink underline-offset-4 hover:underline"
      >
        All my requests
        <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={2.25} />
      </Link>
    </section>
  );
}

function YourLoansList({ today }: { today: string }) {
  const loans = useQuery(api.loans.myRequests);
  if (loans === undefined) return <YourLoansSkeleton />;

  const open = loans
    .filter((loan) => loan.status === "pending" || loan.status === "approved")
    .sort((a, b) => rank(a, today) - rank(b, today) || a.startDate.localeCompare(b.startDate));

  if (open.length === 0) {
    return (
      <div className="rounded-[4px] border border-dashed border-control px-4 py-3.5">
        <p className="font-heading text-[17px] font-bold">Nothing borrowed yet.</p>
        <p className="mt-1 text-[13px] leading-normal text-ink-soft">
          Pick a tool and your dates; your requests show up here.
        </p>
      </div>
    );
  }

  return (
    <ul role="list" className="flex flex-col gap-2.5">
      {open.slice(0, SHOWN).map((loan) => (
        <LoanSlip key={loan._id} loan={loan} today={today} />
      ))}
      {open.length > SHOWN ? (
        <li className="px-1 text-[13px] text-ink-muted">and {open.length - SHOWN} more</li>
      ) : null}
    </ul>
  );
}

function LoanSlip({ loan, today }: { loan: LoanView; today: string }) {
  const lender = loan.counterpartFirstName || "a neighbor";
  const dates = formatRange(loan.startDate, loan.endDate);
  let mark;
  let line;
  if (loan.overdue) {
    mark = (
      <Stamp tone="alert" size="sm">
        Overdue
      </Stamp>
    );
    line = `From ${lender} · was due ${shortDay(loan.endDate)}`;
  } else if (loan.status === "approved" && loan.startDate <= today) {
    mark = <Stamp size="sm">Due {shortDay(loan.endDate)}</Stamp>;
    line = `From ${lender} · ${dates}`;
  } else if (loan.status === "approved") {
    mark = <span className="font-mono text-[11px] font-semibold tracking-[0.1em] text-ok-ink uppercase">Approved</span>;
    line = `From ${lender} · ${dates}`;
  } else {
    mark = <span className="font-mono text-[11px] font-semibold tracking-[0.1em] text-violet uppercase">Pending</span>;
    line = `From ${lender} · ${dates}`;
  }
  return (
    <li className="flex flex-col gap-1 rounded-[4px] border bg-paper px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <strong className="min-w-0 font-heading text-[17px] font-bold">{loan.tool.name}</strong>
        {mark}
      </div>
      <span className="text-[13px] text-ink-soft">{line}</span>
    </li>
  );
}

function YourLoansSkeleton() {
  return (
    <div role="status">
      <span className="sr-only">Loading your loans…</span>
      <ul role="list" aria-hidden="true" className="flex flex-col gap-2.5">
        {["62%", "48%"].map((width) => (
          <li key={width} className="flex flex-col gap-2.5 rounded-[4px] border bg-paper px-4 py-4">
            <span className="h-3.5 rounded-sm bg-divider motion-safe:animate-pulse" style={{ width }} />
            <span className="h-2.5 w-2/5 rounded-sm bg-divider motion-safe:animate-pulse" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function YourLoansError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-[4px] border border-alert-line bg-paper px-4 py-3.5">
      <p className="font-heading text-[17px] font-bold">We couldn&apos;t load your loans.</p>
      <p className="text-[13px] leading-normal text-ink-soft">{messageFor(error)}</p>
      <Button variant="outline" size="sm" className="self-start" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

const YourLoansBoundary = catchError(function YourLoansFallback(_props: object, { error, retry }: ErrorInfo) {
  return <YourLoansError error={error} onRetry={retry} />;
});
