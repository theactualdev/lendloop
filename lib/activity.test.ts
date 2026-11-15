import { describe, expect, it } from "vitest";
import { activityText, formatActivityTime, latestActivity } from "./activity";

const sent = (detail?: string) => ({ kind: "notification_sent", at: 1, ...(detail ? { detail } : {}) });

describe("activityText: borrower", () => {
  const text = (e: { kind: string; at: number; detail?: string }) => activityText(e, "borrower", "Ada");
  it("names the lender in each email", () => {
    expect(text(sent("request_created"))).toBe("Ada was emailed your request");
    expect(text(sent("request_approved"))).toBe("Ada approved. You were emailed.");
    expect(text(sent("request_declined"))).toBe("Ada declined. You were emailed.");
    expect(text(sent("request_cancelled"))).toBe("You cancelled. Ada was emailed.");
    expect(text(sent("loan_returned"))).toBe("Ada marked it returned. You were emailed.");
  });
  it("reminders", () => {
    expect(text({ kind: "reminder_sent", at: 1 })).toBe("Reminder sent");
    expect(text({ kind: "reminder_failed", at: 1 })).toBe("Reminder didn't send");
  });
});

describe("activityText: lender", () => {
  const text = (e: { kind: string; at: number; detail?: string }) => activityText(e, "lender", "Ben");
  it("has its own sentences", () => {
    expect(text(sent("request_created"))).toBe("You were emailed about this request");
    expect(text(sent("request_approved"))).toBe("You approved. Ben was emailed.");
    expect(text(sent("request_declined"))).toBe("You declined. Ben was emailed.");
    expect(text(sent("request_cancelled"))).toBe("Ben cancelled. You were emailed.");
    expect(text(sent("loan_returned"))).toBe("Marked returned. Ben was emailed.");
  });
  it("reminders", () => {
    expect(text({ kind: "reminder_sent", at: 1 })).toBe("Reminder sent");
    expect(text({ kind: "reminder_failed", at: 1 })).toBe("Reminder didn't send");
  });
});

describe("activityText: safety", () => {
  it("falls back to a neighbor and never shows raw detail", () => {
    expect(activityText(sent("request_created"), "borrower", "")).toBe("A neighbor was emailed your request");
    expect(activityText(sent("request_approved"), "borrower", " ")).toBe("A neighbor approved. You were emailed.");
    const odd = activityText(sent("secret@example.com failed"), "borrower", "Ada");
    expect(odd).toBe("Email sent");
    expect(odd).not.toContain("secret");
    expect(activityText(sent(), "lender", "Ben")).toBe("Email sent");
    expect(activityText({ kind: "mystery", at: 1, detail: "x@y.z" }, "lender", "Ben")).toBe("Activity");
  });
  it("uses first names only", () => {
    expect(activityText(sent("request_created"), "borrower", "Ada Lovelace")).toBe("Ada was emailed your request");
  });
});

describe("latestActivity", () => {
  it("is undefined when empty", () => expect(latestActivity([])).toBeUndefined());
  it("picks the newest regardless of order", () => {
    const a = { kind: "reminder_sent", at: 5 };
    const b = { kind: "notification_sent", at: 9, detail: "request_approved" };
    const c = { kind: "reminder_failed", at: 2 };
    expect(latestActivity([a, b, c])).toBe(b);
    expect(latestActivity([b, a, c])).toBe(b);
  });
});

describe("formatActivityTime", () => {
  it("formats day and 24h time", () => {
    expect(formatActivityTime(Date.UTC(2026, 10, 10, 9, 0), "UTC")).toBe("Nov 10 · 09:00");
    expect(formatActivityTime(Date.UTC(2026, 10, 2, 16, 40), "UTC")).toBe("Nov 2 · 16:40");
    expect(formatActivityTime(Date.UTC(2026, 10, 2, 0, 5), "UTC")).toBe("Nov 2 · 00:05");
  });
});

describe("activityText: stand-in mid-sentence", () => {
  it("is capitalised only at the start of a sentence", () => {
    expect(activityText(sent("request_approved"), "lender", "")).toBe("You approved. A neighbor was emailed.");
    expect(activityText(sent("request_cancelled"), "borrower", "")).toBe("You cancelled. A neighbor was emailed.");
  });
});
