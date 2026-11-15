"use client";

import { useId, type ReactNode } from "react";
import { formatDistanceToNow } from "date-fns";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { adminSection } from "@/components/admin/section-boundary";
import { Button } from "@/components/ui/button";
import { formatActivityTime } from "@/lib/activity";
import { outboxTypeLabel, reminderCount, todayReminderSummary } from "@/lib/admin";
import { shortDay } from "@/lib/dates";
import { memberName } from "@/lib/names";
import { useCardAction } from "@/lib/use-card-action";
import { useTodayUtc } from "@/lib/use-today";
import { cn } from "@/lib/utils";

/*
 * Needs attention (screen D5): emails that didn't send (with Retry now), emails
 * stuck in the queue (shown only; the scheduler owns those), n8n workflow
 * failures, overdue loans with their reminder count, and a line confirming
 * today's reminder run. Each group has its own empty state.
 */

type Health = FunctionReturnType<typeof api.admin.automationHealth>;
type AdminLoan = FunctionReturnType<typeof api.admin.allLoans>[number];

const HealthBoundary = adminSection("We couldn't load delivery health.");
const LoansBoundary = adminSection("We couldn't load overdue loans.");

const LABEL = "font-mono text-[11px] font-semibold tracking-[0.1em] uppercase";
const META = "font-mono text-xs leading-normal text-ink-muted";

export function NeedsAttention() {
  return (
    <section
      aria-labelledby="attention-title"
      className="overflow-hidden rounded-[4px] border bg-paper shadow-card-raised"
    >
      <div className="border-b-2 border-card-rule px-5 pt-4 pb-3">
        <h2 id="attention-title" className="font-heading text-[22px] font-extrabold">
          Needs attention
        </h2>
      </div>
      <HealthBoundary>
        <HealthGroups />
      </HealthBoundary>
      <LoansBoundary>
        <LoanGroups />
      </LoansBoundary>
    </section>
  );
}

// ---- shared bits ------------------------------------------------------------

function Group({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="border-t border-divider px-5 pt-3.5 pb-1.5 first:border-t-0">
      <h3 id={id} className={cn(LABEL, "text-ink-muted")}>
        {title}
        {count !== undefined && count > 0 ? <span className="ml-2 text-alert-ink">{count}</span> : null}
      </h3>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-3 text-[14px] leading-normal text-ink-soft">{children}</p>;
}

function Loading({ label }: { label: string }) {
  return (
    <div role="status" className="px-5 py-4">
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className="block h-3 w-3/5 rounded-sm bg-divider motion-safe:animate-pulse" />
      <span aria-hidden="true" className="mt-2.5 block h-3 w-4/5 rounded-sm bg-divider motion-safe:animate-pulse" />
    </div>
  );
}

function Item({ children }: { children: ReactNode }) {
  return <li className="flex flex-col gap-1.5 border-t border-divider py-3.5 first:border-t-0">{children}</li>;
}

function loanLabel(loan: AdminLoan | undefined): string {
  return loan ? `${loan.tool.name} (${memberName(loan.lenderName)} → ${memberName(loan.borrowerName)})` : "A loan";
}

// ---- delivery health ----------------------------------------------------------

function HealthGroups() {
  const health = useQuery(api.admin.automationHealth, {});
  const loans = useQuery(api.admin.allLoans, {});
  if (health === undefined) return <Loading label="Loading delivery health…" />;
  const byId = new Map((loans ?? []).map((loan) => [loan._id as string, loan]));

  return (
    <>
      <Group title="Emails that didn't send" count={health.failedDeliveries.length}>
        {health.failedDeliveries.length === 0 ? (
          <Empty>Every email went out.</Empty>
        ) : (
          <ul role="list">
            {health.failedDeliveries.map((row) => (
              <FailedDelivery key={row._id} row={row} loan={byId.get(row.loanId)} />
            ))}
          </ul>
        )}
      </Group>
      <Group title="Stuck in the queue" count={health.stalePending.length}>
        {health.stalePending.length === 0 ? (
          <Empty>Nothing is waiting to send.</Empty>
        ) : (
          <ul role="list">
            {health.stalePending.map((row) => (
              <Item key={row._id}>
                <span className="text-[15px] leading-[1.4] font-semibold">
                  {outboxTypeLabel(row.type)} · {loanLabel(byId.get(row.loanId))}
                </span>
                <span className={META}>
                  Stuck since {formatActivityTime(row._creationTime)} · {row.attempts === 1 ? "1 try" : `${row.attempts} tries`}
                </span>
                <span className="text-[13px] leading-normal text-ink-soft">
                  Still waiting to send. The scheduler keeps retrying these, so there&apos;s nothing to press here.
                </span>
              </Item>
            ))}
          </ul>
        )}
      </Group>
      <Group title="Workflow failures" count={health.workflowFailures.length}>
        {health.workflowFailures.length === 0 ? (
          <Empty>No workflow has failed.</Empty>
        ) : (
          <ul role="list">
            {health.workflowFailures.map((failure) => (
              <Item key={failure._id}>
                <span className="text-[15px] leading-[1.4] font-semibold">
                  {failure.workflow}
                  {failure.node ? ` · ${failure.node}` : null}
                </span>
                <span className="text-[13px] leading-normal break-words text-ink-soft">{failure.message}</span>
                <span className={META}>{formatActivityTime(failure.at)}</span>
              </Item>
            ))}
          </ul>
        )}
      </Group>
    </>
  );
}

function FailedDelivery({ row, loan }: { row: Health["failedDeliveries"][number]; loan: AdminLoan | undefined }) {
  const retry = useMutation(api.admin.retryDelivery);
  const { busy, run } = useCardAction();
  const title = `${outboxTypeLabel(row.type)} · ${loanLabel(loan)}`;
  return (
    <Item>
      <span className={cn(LABEL, "text-alert-ink")}>Email didn&apos;t send</span>
      <span className="text-[15px] leading-[1.4] font-semibold">{title}</span>
      <span className={cn(META, "break-words")}>
        {row.attempts === 1 ? "1 try" : `${row.attempts} tries`} · last error: {row.lastError ?? "none recorded"} ·{" "}
        {formatActivityTime(row._creationTime)}
      </span>
      <Button
        variant="default"
        disabled={busy}
        onClick={() =>
          run(
            () => retry({ outboxId: row._id }),
            () => toast.success("Queued to retry", { description: title }),
          )
        }
        className="mt-1.5 self-start"
      >
        {busy ? "Retrying…" : "Retry now"}
        <span className="sr-only"> {title}</span>
      </Button>
    </Item>
  );
}

// ---- overdue loans and today's reminder run -------------------------------------

function LoanGroups() {
  const loans = useQuery(api.admin.allLoans, {});
  const today = useTodayUtc();
  if (loans === undefined || today === null) return <Loading label="Loading overdue loans…" />;

  const overdue = loans.filter((loan) => loan.overdue);
  const { sent, failed } = todayReminderSummary(loans, today);
  const ran = sent + failed > 0;

  return (
    <>
      <Group title="Overdue" count={overdue.length}>
        {overdue.length === 0 ? (
          <Empty>Nothing is overdue.</Empty>
        ) : (
          <ul role="list">
            {overdue.map((loan) => {
              const count = reminderCount(loan);
              const last = loan.activity.filter((e) => e.kind === "reminder_sent").at(-1);
              return (
                <Item key={loan._id}>
                  <span className="text-[15px] leading-[1.4] font-semibold">
                    {loan.tool.name}: {memberName(loan.borrowerName)} has it, was due {shortDay(loan.endDate)}
                  </span>
                  <span className={META}>
                    {count === 0 ? "No reminders sent yet" : count === 1 ? "1 reminder sent" : `${count} reminders sent`}
                    {last ? (
                      <>
                        {" "}
                        · last{" "}
                        <time dateTime={new Date(last.at).toISOString()}>
                          {formatDistanceToNow(last.at, { addSuffix: true })}
                        </time>
                      </>
                    ) : null}
                  </span>
                </Item>
              );
            })}
          </ul>
        )}
      </Group>
      <p
        aria-live="polite"
        className={cn(
          "flex items-start gap-2 bg-paper-muted px-5 py-3 text-[13px] leading-normal",
          failed > 0 ? "text-alert-ink" : ran ? "text-ok-ink" : "text-ink-soft",
        )}
      >
        <span
          aria-hidden="true"
          className={cn("mt-[5px] size-2 shrink-0 rounded-full", failed > 0 ? "bg-alert" : ran ? "bg-ok" : "bg-ink-faded")}
        />
        {ran
          ? `Today's reminders: ${sent} sent, ${failed} failed`
          : "No reminders recorded today. None were due, or the 09:00 UTC run hasn't happened yet."}
      </p>
    </>
  );
}
