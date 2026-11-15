import { describe, expect, it } from "vitest";
import {
  filterLoans,
  lastEmailInfo,
  loanTab,
  outboxTypeLabel,
  reminderCount,
  tabCounts,
  todayReminderSummary,
  type AdminLoanLike,
} from "./admin";

const DAY = Date.UTC(2026, 10, 12, 9, 0); // 2026-11-12 09:00 UTC

function loan(partial: Partial<AdminLoanLike> = {}): AdminLoanLike {
  return { status: "pending", overdue: false, activity: [], deliveryFailed: false, lastEmail: null, ...partial };
}

describe("loanTab", () => {
  it("maps pending", () => expect(loanTab(loan({ status: "pending" }))).toBe("pending"));
  it("approved and not overdue is approved", () =>
    expect(loanTab(loan({ status: "approved", overdue: false }))).toBe("approved"));
  it("approved and overdue is overdue, not approved", () =>
    expect(loanTab(loan({ status: "approved", overdue: true }))).toBe("overdue"));
  it("returned, declined and cancelled are closed", () => {
    for (const status of ["returned", "declined", "cancelled"] as const) {
      expect(loanTab(loan({ status }))).toBe("closed");
    }
  });
});

describe("filterLoans and tabCounts", () => {
  const loans = [
    loan({ status: "pending" }),
    loan({ status: "approved" }),
    loan({ status: "approved", overdue: true }),
    loan({ status: "returned" }),
    loan({ status: "declined" }),
  ];
  it("all returns every loan", () => expect(filterLoans(loans, "all")).toHaveLength(5));
  it("each tab keeps its own", () => {
    expect(filterLoans(loans, "pending")).toHaveLength(1);
    expect(filterLoans(loans, "approved")).toHaveLength(1);
    expect(filterLoans(loans, "overdue")).toHaveLength(1);
    expect(filterLoans(loans, "closed")).toHaveLength(2);
  });
  it("counts match the filters", () => {
    expect(tabCounts(loans)).toEqual({ all: 5, pending: 1, approved: 1, overdue: 1, closed: 2 });
  });
  it("does not mutate its input", () => {
    const copy = [...loans];
    filterLoans(loans, "closed");
    expect(loans).toEqual(copy);
  });
});

describe("reminderCount", () => {
  it("counts reminder_sent events only", () => {
    const l = loan({
      activity: [
        { kind: "notification_sent", at: 1, detail: "request_approved" },
        { kind: "reminder_sent", at: 2 },
        { kind: "reminder_failed", at: 3 },
        { kind: "reminder_sent", at: 4 },
      ],
    });
    expect(reminderCount(l)).toBe(2);
  });
  it("is zero with no activity", () => expect(reminderCount(loan())).toBe(0));
});

describe("todayReminderSummary", () => {
  const today = "2026-11-12";
  it("counts sent and failed events on today's UTC date", () => {
    const loans = [
      loan({ activity: [{ kind: "reminder_sent", at: DAY }, { kind: "reminder_failed", at: DAY + 1000 }] }),
      loan({ activity: [{ kind: "reminder_sent", at: DAY + 5000 }] }),
    ];
    expect(todayReminderSummary(loans, today)).toEqual({ sent: 2, failed: 1 });
  });
  it("ignores other days, including the UTC edges", () => {
    const loans = [
      loan({
        activity: [
          { kind: "reminder_sent", at: Date.UTC(2026, 10, 11, 23, 59, 59, 999) },
          { kind: "reminder_sent", at: Date.UTC(2026, 10, 13, 0, 0, 0, 0) },
          { kind: "reminder_sent", at: Date.UTC(2026, 10, 12, 0, 0, 0, 0) },
        ],
      }),
    ];
    expect(todayReminderSummary(loans, today)).toEqual({ sent: 1, failed: 0 });
  });
  it("ignores notification emails", () => {
    const loans = [loan({ activity: [{ kind: "notification_sent", at: DAY, detail: "request_created" }] })];
    expect(todayReminderSummary(loans, today)).toEqual({ sent: 0, failed: 0 });
  });
});

describe("lastEmailInfo", () => {
  it("is null with no email and no failure", () => expect(lastEmailInfo(loan())).toBeNull());
  it("words a notification by its type", () => {
    const l = loan({
      activity: [{ kind: "notification_sent", at: DAY, detail: "request_declined" }],
      lastEmail: { kind: "notification_sent", at: DAY, failed: false },
    });
    expect(lastEmailInfo(l)).toEqual({ text: "Decline emailed", at: DAY, failed: false });
  });
  it("falls back to a generic line for an unknown type", () => {
    const l = loan({
      activity: [{ kind: "notification_sent", at: DAY, detail: "whatever" }],
      lastEmail: { kind: "notification_sent", at: DAY, failed: false },
    });
    expect(lastEmailInfo(l)?.text).toBe("Email sent");
  });
  it("marks a failed reminder", () => {
    const l = loan({ lastEmail: { kind: "reminder_failed", at: DAY, failed: true } });
    expect(lastEmailInfo(l)).toEqual({ text: "Reminder didn't send", at: DAY, failed: true });
  });
  it("marks a failed delivery even when the last event was a success", () => {
    const l = loan({
      deliveryFailed: true,
      lastEmail: { kind: "notification_sent", at: DAY, failed: false },
      activity: [{ kind: "notification_sent", at: DAY, detail: "request_approved" }],
    });
    expect(lastEmailInfo(l)).toEqual({ text: "Email didn't send", at: DAY, failed: true });
  });
  it("marks a failed delivery with no email on record", () => {
    expect(lastEmailInfo(loan({ deliveryFailed: true }))).toEqual({ text: "Email didn't send", at: null, failed: true });
  });
});

describe("outboxTypeLabel", () => {
  it("names each event type", () => {
    expect(outboxTypeLabel("request_created")).toBe("Request email");
    expect(outboxTypeLabel("request_approved")).toBe("Approval email");
    expect(outboxTypeLabel("request_declined")).toBe("Decline email");
    expect(outboxTypeLabel("request_cancelled")).toBe("Cancellation email");
    expect(outboxTypeLabel("loan_returned")).toBe("Return email");
  });
  it("is generic for anything else", () => expect(outboxTypeLabel("nope")).toBe("Email"));
});
