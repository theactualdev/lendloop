/*
 * Pure helpers for the admin console (screen D5). The page fetches
 * admin.allLoans once and filters it here, on the client. Nothing in this file
 * reads an email address: admin views carry names only.
 */

export type AdminTab = "all" | "pending" | "approved" | "overdue" | "closed";

export const ADMIN_TABS: readonly { key: AdminTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "overdue", label: "Overdue" },
  { key: "closed", label: "Closed" },
];

type ActivityLike = { kind: string; at: number; detail?: string };

/** The fields of an AdminLoanView these helpers read. */
export type AdminLoanLike = {
  status: "pending" | "approved" | "declined" | "cancelled" | "returned" | "expired";
  overdue: boolean;
  activity: readonly ActivityLike[];
  deliveryFailed: boolean;
  lastEmail: { kind: string; at: number; failed: boolean } | null;
};

/** Approved means approved and not overdue; Overdue means approved and overdue. */
export function loanTab(loan: Pick<AdminLoanLike, "status" | "overdue">): Exclude<AdminTab, "all"> {
  if (loan.status === "pending") return "pending";
  if (loan.status === "approved") return loan.overdue ? "overdue" : "approved";
  return "closed";
}

export function filterLoans<T extends Pick<AdminLoanLike, "status" | "overdue">>(
  loans: readonly T[],
  tab: AdminTab,
): T[] {
  return tab === "all" ? [...loans] : loans.filter((loan) => loanTab(loan) === tab);
}

export function tabCounts(loans: readonly Pick<AdminLoanLike, "status" | "overdue">[]): Record<AdminTab, number> {
  const counts: Record<AdminTab, number> = { all: loans.length, pending: 0, approved: 0, overdue: 0, closed: 0 };
  for (const loan of loans) counts[loanTab(loan)] += 1;
  return counts;
}

/** How many reminders have been sent about a loan. */
export function reminderCount(loan: Pick<AdminLoanLike, "activity">): number {
  return loan.activity.filter((e) => e.kind === "reminder_sent").length;
}

/** Reminder runs recorded on `today` (a UTC YYYY-MM-DD), across all loans. */
export function todayReminderSummary(
  loans: readonly Pick<AdminLoanLike, "activity">[],
  today: string,
): { sent: number; failed: number } {
  const start = Date.parse(`${today}T00:00:00.000Z`);
  const end = start + 24 * 60 * 60 * 1000;
  let sent = 0;
  let failed = 0;
  for (const loan of loans) {
    for (const e of loan.activity) {
      if (e.at < start || e.at >= end) continue;
      if (e.kind === "reminder_sent") sent += 1;
      else if (e.kind === "reminder_failed") failed += 1;
    }
  }
  return { sent, failed };
}

const NOTIFICATION_TEXT: Record<string, string> = {
  request_created: "Request emailed",
  request_approved: "Approval emailed",
  request_declined: "Decline emailed",
  request_cancelled: "Cancellation emailed",
  loan_returned: "Return emailed",
  approval_withdrawn: "Withdrawal emailed",
};

const OUTBOX_LABEL: Record<string, string> = {
  request_created: "Request email",
  request_approved: "Approval email",
  request_declined: "Decline email",
  request_cancelled: "Cancellation email",
  loan_returned: "Return email",
  approval_withdrawn: "Withdrawal email",
};

/** "Decline email" for an outbox row type; anything unknown is just "Email". */
export function outboxTypeLabel(type: string): string {
  return Object.hasOwn(OUTBOX_LABEL, type) ? OUTBOX_LABEL[type] : "Email";
}

/**
 * The Last email cell: wording, time and whether it failed. A failed delivery
 * (the newest outbox row) wins over whatever the last recorded event was.
 */
export function lastEmailInfo(
  loan: Pick<AdminLoanLike, "lastEmail" | "activity" | "deliveryFailed">,
): { text: string; at: number | null; failed: boolean } | null {
  const last = loan.lastEmail;
  if (loan.deliveryFailed) return { text: "Email didn't send", at: last?.at ?? null, failed: true };
  if (!last) return null;
  if (last.kind === "reminder_failed") return { text: "Reminder didn't send", at: last.at, failed: true };
  if (last.kind === "reminder_sent") return { text: "Reminder sent", at: last.at, failed: last.failed };
  if (last.kind !== "notification_sent") return { text: "Activity", at: last.at, failed: last.failed };
  // `detail` is only ever matched against the six known types.
  const detail = [...loan.activity].reverse().find((e) => e.at === last.at && e.kind === last.kind)?.detail;
  const text = detail !== undefined && Object.hasOwn(NOTIFICATION_TEXT, detail) ? NOTIFICATION_TEXT[detail] : "Email sent";
  return { text, at: last.at, failed: last.failed };
}
