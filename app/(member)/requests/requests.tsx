"use client";

import { useState } from "react";
import { catchError, type ErrorInfo } from "next/error";
import { useQuery } from "convex/react";
import type { LoanView } from "@/convex/lib/loanView";
import { api } from "@/convex/_generated/api";
import { ListEmpty, ListError, ListSkeleton } from "@/components/list-state";
import { GoToBoard, MyRequestCard } from "@/components/loan-row";
import { PageFrame, PageIntro } from "@/components/page-intro";
import { useTodayUtc } from "@/lib/use-today";
import { cn } from "@/lib/utils";

/*
 * Screen D3, My requests: everything you've asked to borrow, as index cards
 * with the email activity beside each. Two tabs, Active and Past.
 */

type Tab = "active" | "past";

const isActive = (loan: LoanView) => loan.status === "pending" || loan.status === "approved";

/** Overdue first, then what you hold now, what's coming, then pending. */
function rank(loan: LoanView, today: string): number {
  if (loan.overdue) return 0;
  if (loan.status === "approved") return loan.startDate <= today ? 1 : 2;
  return 3;
}

export function Requests() {
  return (
    <PageFrame>
      <PageIntro eyebrow="Your borrowing" title="My requests">
        Everything you&apos;ve asked to borrow, and every email sent about it.
      </PageIntro>
      <RequestsBoundary>
        <RequestsPanel />
      </RequestsBoundary>
    </PageFrame>
  );
}

function RequestsPanel() {
  const today = useTodayUtc();
  const loans = useQuery(api.loans.myRequests);
  const [tab, setTab] = useState<Tab>("active");

  if (loans === undefined || today === null) {
    return <ListSkeleton label="Loading your requests…" className="mt-8" />;
  }

  const active = loans
    .filter(isActive)
    .sort((a, b) => rank(a, today) - rank(b, today) || a.startDate.localeCompare(b.startDate));
  const past = loans.filter((loan) => !isActive(loan)).sort((a, b) => b.endDate.localeCompare(a.endDate));
  const shown = tab === "active" ? active : past;

  return (
    <>
      <div role="group" aria-label="Show requests" className="mt-8 flex flex-wrap items-end gap-1 pl-3">
        <TabButton pressed={tab === "active"} count={active.length} onClick={() => setTab("active")}>
          Active
        </TabButton>
        <TabButton pressed={tab === "past"} count={past.length} onClick={() => setTab("past")}>
          Past
        </TabButton>
      </div>
      <div className="flex flex-col gap-5 rounded-[0_12px_12px_12px] border bg-header p-4 sm:p-6">
        {shown.length === 0 ? (
          tab === "active" ? (
            <ListEmpty title="Nothing active right now.">
              Pick a tool and your dates on the board, and your request shows up here. <GoToBoard />.
            </ListEmpty>
          ) : (
            <ListEmpty title="No past requests yet.">
              Returned, declined and cancelled requests are kept here.
            </ListEmpty>
          )
        ) : (
          <ul role="list" className="m-0 flex list-none flex-col gap-5 p-0">
            {shown.map((loan) => (
              <li key={loan._id}>
                <MyRequestCard loan={loan} today={today} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function TabButton({
  pressed,
  count,
  onClick,
  children,
}: {
  pressed: boolean;
  count: number;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-t-[10px] border border-border text-sm transition-colors",
        pressed
          ? "relative z-[1] -mb-px min-h-12 border-b-header bg-header px-[18px] font-bold text-ink"
          : "min-h-11 border-b-0 bg-tab px-4 font-medium text-ink-quiet hover:bg-paper-muted hover:text-ink",
      )}
    >
      {children} <span className="font-mono text-xs font-medium text-ink-muted">{count}</span>
    </button>
  );
}

const RequestsBoundary = catchError(function RequestsFallback(_props: object, { error, retry }: ErrorInfo) {
  return <ListError title="We couldn't load your requests." error={error} onRetry={retry} className="mt-8" />;
});
