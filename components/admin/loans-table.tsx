"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { adminSection } from "@/components/admin/section-boundary";
import { ListEmpty, ListSkeleton } from "@/components/list-state";
import { Stamp } from "@/components/stamp";
import { ADMIN_TABS, filterLoans, lastEmailInfo, tabCounts, type AdminTab } from "@/lib/admin";
import { formatRange } from "@/lib/dates";
import { memberName } from "@/lib/names";
import { cn } from "@/lib/utils";

/*
 * All loans (screen D5). admin.allLoans is fetched once and the status tabs
 * filter it here. A semantic table inside its own scroll box: at 360px the box
 * scrolls, the page does not.
 */

type AdminLoan = FunctionReturnType<typeof api.admin.allLoans>[number];

const Boundary = adminSection("We couldn't load the loans.");

const HEAD = "px-4 pt-4 pb-2.5 text-left font-mono text-[11px] font-semibold tracking-[0.1em] text-ink-faint uppercase";
const CELL = "px-4 py-3 align-middle";

export function LoansTable() {
  return (
    <section aria-labelledby="loans-title" className="min-w-0 flex-[999_1_640px]">
      <h2 id="loans-title" className="mb-3.5 font-heading text-[26px] font-extrabold">
        All loans
      </h2>
      <Boundary>
        <Loans />
      </Boundary>
    </section>
  );
}

function Loans() {
  const loans = useQuery(api.admin.allLoans, {});
  const [tab, setTab] = useState<AdminTab>("all");
  if (loans === undefined) return <ListSkeleton label="Loading all loans…" rows={4} />;
  if (loans.length === 0) {
    return <ListEmpty title="No loans yet.">Requests show up here the moment a neighbor asks for a tool.</ListEmpty>;
  }

  const counts = tabCounts(loans);
  const shown = filterLoans(loans, tab);
  const label = ADMIN_TABS.find((t) => t.key === tab)?.label ?? "All";

  return (
    <>
      <div role="group" aria-label="Filter loans" className="flex flex-wrap items-end gap-1 pl-3">
        {ADMIN_TABS.map((t) => {
          const pressed = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              aria-pressed={pressed}
              onClick={() => setTab(t.key)}
              className={cn(
                "cursor-pointer rounded-t-[10px] border border-border text-sm transition-colors",
                pressed
                  ? "relative z-[1] -mb-px min-h-12 border-b-paper bg-paper px-4 font-bold text-ink"
                  : "min-h-11 border-b-0 bg-tab px-3.5 font-medium text-ink-quiet hover:bg-paper-muted hover:text-ink",
              )}
            >
              {t.label}{" "}
              <span
                className={cn(
                  "font-mono text-xs",
                  t.key === "overdue" && counts.overdue > 0 ? "font-semibold text-alert-ink" : "font-medium text-ink-muted",
                )}
              >
                {counts[t.key]}
              </span>
            </button>
          );
        })}
      </div>
      <div
        role="region"
        aria-label="Loans table"
        tabIndex={0}
        className="overflow-x-auto rounded-[0_12px_12px_12px] border bg-paper"
      >
        <table className="w-full min-w-[760px] border-collapse">
          <caption className="sr-only">
            {label} loans, {shown.length === 1 ? "1 loan" : `${shown.length} loans`}
          </caption>
          <thead>
            <tr>
              <th scope="col" className={HEAD}>
                Tool
              </th>
              <th scope="col" className={HEAD}>
                Lender → borrower
              </th>
              <th scope="col" className={HEAD}>
                Dates
              </th>
              <th scope="col" className={HEAD}>
                Status
              </th>
              <th scope="col" className={HEAD}>
                Last email
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr className="border-t border-divider">
                <td colSpan={5} className="px-4 py-6 text-[15px] text-ink-soft">
                  No {label.toLowerCase()} loans.
                </td>
              </tr>
            ) : (
              shown.map((loan) => <LoanTableRow key={loan._id} loan={loan} />)
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function LoanTableRow({ loan }: { loan: AdminLoan }) {
  return (
    <tr className="border-t border-divider">
      <th scope="row" className={cn(CELL, "text-left font-normal")}>
        <span className="block font-heading text-[17px] leading-tight font-bold">{loan.tool.name}</span>
        <span className="mt-0.5 block font-mono text-xs text-ink-muted">{loan.tool.shortCode}</span>
      </th>
      <td className={cn(CELL, "text-sm font-semibold")}>
        {memberName(loan.lenderName)} <span aria-hidden="true">→</span>
        <span className="sr-only"> lends to </span> {memberName(loan.borrowerName)}
      </td>
      <td className={cn(CELL, "font-mono text-[13px] whitespace-nowrap text-ink-soft")}>
        {formatRange(loan.startDate, loan.endDate)}
      </td>
      <td className={CELL}>
        <StatusMark loan={loan} />
      </td>
      <td className={CELL}>
        <LastEmail loan={loan} />
      </td>
    </tr>
  );
}

const STATUS_WORD: Record<AdminLoan["status"], string> = {
  pending: "Pending",
  approved: "Approved",
  declined: "Declined",
  cancelled: "Cancelled",
  returned: "Returned",
  expired: "Expired",
};

/** Alerts get a stamp (plan rule); everything else is a dot and a plain word. */
function StatusMark({ loan }: { loan: AdminLoan }) {
  if (loan.overdue) return <Stamp tone="alert">Overdue</Stamp>;
  if (loan.status === "declined") return <Stamp tone="alert">Declined</Stamp>;
  const dot =
    loan.status === "pending"
      ? "border-violet bg-paper"
      : loan.status === "approved"
        ? "border-violet bg-violet"
        : "border-ink-faded bg-ink-faded";
  return (
    <span className="inline-flex items-center gap-[7px] text-[13px] font-semibold">
      <span aria-hidden="true" className={cn("size-[9px] rounded-full border-2", dot)} />
      {STATUS_WORD[loan.status]}
    </span>
  );
}

function LastEmail({ loan }: { loan: AdminLoan }) {
  const info = lastEmailInfo(loan);
  if (!info) return <span className="font-mono text-xs text-ink-muted">No emails yet</span>;
  return (
    <span
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1.5 font-mono text-xs leading-[1.45]",
        info.failed ? "font-semibold text-alert-ink" : "font-medium text-ink-muted",
      )}
    >
      {info.failed ? (
        <Stamp tone="alert" size="sm">
          Failed
        </Stamp>
      ) : null}
      <span>
        {info.text}
        {info.at !== null ? (
          <>
            {" "}
            <time dateTime={new Date(info.at).toISOString()} className="whitespace-nowrap">
              {formatDistanceToNow(info.at, { addSuffix: true })}
            </time>
          </>
        ) : null}
      </span>
    </span>
  );
}
