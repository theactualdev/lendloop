"use client";

import { useId } from "react";
import { catchError, type ErrorInfo } from "next/error";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { StripLegend } from "@/components/availability-strip";
import { ListEmpty, ListError, ListSkeleton } from "@/components/list-state";
import { OutOnLoanCard, RecentRow, WaitingCard } from "@/components/loan-row";
import { PageFrame, PageIntro } from "@/components/page-intro";
import type { StripBooking } from "@/lib/strip";
import { useTodayUtc } from "@/lib/use-today";

/*
 * Screen D4, Incoming: requests on your tools. Waiting requests to approve or
 * decline, tools that are out on loan, and a short Recently list. The strips
 * come from tools.myListings (joined by short code), plus the request's own
 * dates; the clash comes with each request from loans.incoming.
 */

type IncomingLoan = FunctionReturnType<typeof api.loans.incoming>[number];

const RECENT_SHOWN = 10;

export function Incoming() {
  return (
    <PageFrame>
      <PageIntro eyebrow="Requests for your tools" title="Incoming">
        Say yes or no to requests, and mark tools returned once they&apos;re back with you.
      </PageIntro>
      <IncomingBoundary>
        <IncomingSections />
      </IncomingBoundary>
    </PageFrame>
  );
}

function IncomingSections() {
  const today = useTodayUtc();
  const incoming = useQuery(api.loans.incoming);
  const listings = useQuery(api.tools.myListings);

  if (incoming === undefined || listings === undefined || today === null) {
    return <ListSkeleton label="Loading incoming requests…" className="mt-9" />;
  }

  // Short codes are unique and never reused: they join a loan to its tool's bookings.
  const bookingsByCode = new Map<string, StripBooking[]>(listings.map((t) => [t.shortCode, t.bookings]));
  const bookingsFor = (loan: IncomingLoan) => bookingsByCode.get(loan.tool.shortCode) ?? [];

  const waiting = incoming.filter((l) => l.status === "pending");
  const out = incoming
    .filter((l) => l.status === "approved")
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.endDate.localeCompare(b.endDate));
  const recent = incoming.filter((l) => l.status === "returned" || l.status === "declined" || l.status === "cancelled" || l.status === "expired");

  return (
    <>
      <Section
        title="Waiting for you"
        count={waiting.length}
        aside={
          <StripLegend
            kinds={["yours", "booked", "requested", "clash"]}
            labels={{ yours: "Dates asked for", booked: "Already lent", requested: "Also asking" }}
            emphasis
          />
        }
      >
        {waiting.length === 0 ? (
          <ListEmpty title="Nothing waiting.">New requests for your tools appear here, and you get an email too.</ListEmpty>
        ) : (
          <CardList>
            {waiting.map((loan) => (
              <li key={loan._id}>
                <WaitingCard loan={loan} today={today} bookings={bookingsFor(loan)} />
              </li>
            ))}
          </CardList>
        )}
      </Section>

      <Section title="Out on loan" count={out.length}>
        {out.length === 0 ? (
          <ListEmpty title="Nothing is out on loan.">When you approve a request it shows up here until it&apos;s back.</ListEmpty>
        ) : (
          <CardList>
            {out.map((loan) => (
              <li key={loan._id}>
                <OutOnLoanCard loan={loan} today={today} bookings={bookingsFor(loan)} />
              </li>
            ))}
          </CardList>
        )}
      </Section>

      <Section title="Recently">
        {recent.length === 0 ? (
          <ListEmpty title="Nothing yet.">Returned, declined, cancelled and expired requests are listed here.</ListEmpty>
        ) : (
          <>
            <ul role="list" className="m-0 list-none rounded-[6px] border bg-paper px-6 py-0">
              {recent.slice(0, RECENT_SHOWN).map((loan) => (
                <RecentRow key={loan._id} loan={loan} />
              ))}
            </ul>
            {recent.length > RECENT_SHOWN ? (
              <p className="mt-2 px-1 text-[13px] text-ink-muted">and {recent.length - RECENT_SHOWN} more</p>
            ) : null}
          </>
        )}
      </Section>
    </>
  );
}

function Section({
  title,
  count,
  aside,
  children,
}: {
  title: string;
  count?: number;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="mt-11 first:mt-9">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 id={titleId} className="font-heading text-[26px] font-extrabold">
          {title}
          {count !== undefined ? (
            <>
              {" "}
              <span className="font-mono text-sm font-medium text-ink-muted">{count}</span>
            </>
          ) : null}
        </h2>
        {aside}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function CardList({ children }: { children: React.ReactNode }) {
  return (
    <ul role="list" className="m-0 flex list-none flex-col gap-3.5 p-0">
      {children}
    </ul>
  );
}

const IncomingBoundary = catchError(function IncomingFallback(_props: object, { error, retry }: ErrorInfo) {
  return <ListError title="We couldn't load incoming requests." error={error} onRetry={retry} className="mt-9" />;
});
