import { describe, expect, test } from "vitest";
import type { StripBooking } from "./strip";
import { alreadyAsked, backOn, toolStatus, type StatusTool } from "./tool-status";

const TODAY = "2026-11-11";
const RANGE = { from: "2026-11-12", to: "2026-11-14" };

const tool = (over: Partial<StatusTool> = {}): StatusTool => ({
  isMine: false,
  availability: "available",
  bookings: [],
  freeInRange: null,
  ...over,
});
const booked = (startDate: string, endDate: string): StripBooking => ({ startDate, endDate, kind: "booked" });
const requested = (startDate: string, endDate: string): StripBooking => ({
  startDate,
  endDate,
  kind: "requested",
});

describe("toolStatus", () => {
  test("free today when no dates are picked", () => {
    expect(toolStatus(tool(), TODAY, null)).toEqual({ kind: "free", text: "Free today" });
  });

  test("free on the picked dates", () => {
    expect(toolStatus(tool({ freeInRange: true }), TODAY, RANGE)).toEqual({
      kind: "free",
      text: "Free Nov 12–14",
    });
  });

  test("booked on the picked dates, while on the shelf today", () => {
    expect(
      toolStatus(tool({ freeInRange: false, bookings: [booked("2026-11-13", "2026-11-15")] }), TODAY, RANGE),
    ).toEqual({ kind: "text", tone: "alert", text: "Booked on your dates" });
  });

  test("on loan: a date stamp for the day it comes back", () => {
    expect(
      toolStatus(tool({ availability: "on_loan", bookings: [booked("2026-11-09", "2026-11-14")] }), TODAY, null),
    ).toEqual({ kind: "stamp", tone: "date", text: "Back Nov 14" });
  });

  test("on loan but free on later picked dates: free", () => {
    expect(
      toolStatus(
        tool({ availability: "on_loan", freeInRange: true, bookings: [booked("2026-11-09", "2026-11-11")] }),
        TODAY,
        RANGE,
      ),
    ).toEqual({ kind: "free", text: "Free Nov 12–14" });
  });

  test("on loan and clashing with the picked dates: the back date", () => {
    expect(
      toolStatus(
        tool({ availability: "on_loan", freeInRange: false, bookings: [booked("2026-11-09", "2026-11-13")] }),
        TODAY,
        RANGE,
      ),
    ).toEqual({ kind: "stamp", tone: "date", text: "Back Nov 13" });
  });

  test("overdue: an alert stamp, whatever else is true", () => {
    expect(
      toolStatus(
        tool({ availability: "on_loan", isMine: true, bookings: [requested("2026-11-12", "2026-11-12")] }),
        TODAY,
        RANGE,
      ),
    ).toEqual({ kind: "stamp", tone: "alert", text: "Overdue" });
  });

  test("your own tool with requests in the window", () => {
    expect(toolStatus(tool({ isMine: true, bookings: [requested("2026-11-12", "2026-11-13")] }), TODAY, null)).toEqual(
      { kind: "text", tone: "violet", text: "Request waiting" },
    );
    expect(
      toolStatus(
        tool({ isMine: true, bookings: [requested("2026-11-12", "2026-11-13"), requested("2026-11-20", "2026-11-21")] }),
        TODAY,
        null,
      ),
    ).toEqual({ kind: "text", tone: "violet", text: "Requests waiting" });
  });

  test("your own pending request on someone else's tool", () => {
    expect(
      toolStatus(tool({ freeInRange: true, bookings: [requested("2026-11-20", "2026-11-23")] }), TODAY, RANGE),
    ).toEqual({ kind: "text", tone: "ink", text: "You asked for Nov 20–23" });
  });
});

describe("backOn", () => {
  test("the end of the booking covering today", () => {
    expect(backOn([booked("2026-11-09", "2026-11-14")], TODAY)).toBe("2026-11-14");
  });

  test("follows back-to-back bookings", () => {
    expect(
      backOn([booked("2026-11-15", "2026-11-17"), booked("2026-11-09", "2026-11-14"), booked("2026-11-20", "2026-11-22")], TODAY),
    ).toBe("2026-11-17");
  });

  test("null when nothing booked covers today", () => {
    expect(backOn([booked("2026-11-12", "2026-11-14")], TODAY)).toBeNull();
  });
});

describe("alreadyAsked (mirrors loans.request's ALREADY_REQUESTED)", () => {
  const drill = { isMine: false, shortCode: "PWR 001", bookings: [] as StripBooking[] };
  const loan = (status: string, startDate: string, endDate: string, shortCode = "PWR 001") => ({
    tool: { shortCode },
    status: status as "pending" | "approved" | "declined" | "cancelled" | "returned",
    startDate,
    endDate,
  });

  test("your pending request on the tool, seen in its bookings, overlapping", () => {
    expect(alreadyAsked({ ...drill, bookings: [requested("2026-11-14", "2026-11-16")] }, RANGE, [])).toBe(true);
    expect(alreadyAsked({ ...drill, bookings: [requested("2026-11-15", "2026-11-16")] }, RANGE, [])).toBe(false);
  });

  test("someone else's booked loan never counts: a clash may still be requested", () => {
    expect(alreadyAsked({ ...drill, bookings: [booked("2026-11-12", "2026-11-14")] }, RANGE, [])).toBe(false);
  });

  test("your pending or approved loan on the same tool (from myRequests), overlapping", () => {
    expect(alreadyAsked(drill, RANGE, [loan("approved", "2026-11-10", "2026-11-12")])).toBe(true);
    expect(alreadyAsked(drill, RANGE, [loan("pending", "2026-12-01", "2026-12-14"), loan("pending", "2026-11-14", "2026-11-20")])).toBe(true);
  });

  test("closed loans, other tools and other dates don't count", () => {
    expect(
      alreadyAsked(drill, RANGE, [
        loan("declined", "2026-11-12", "2026-11-14"),
        loan("cancelled", "2026-11-12", "2026-11-14"),
        loan("returned", "2026-11-12", "2026-11-14"),
        loan("pending", "2026-11-12", "2026-11-14", "PWR 002"),
        loan("pending", "2026-11-15", "2026-11-18"),
      ]),
    ).toBe(false);
    expect(alreadyAsked(drill, RANGE, undefined)).toBe(false);
  });

  test("never for your own tool", () => {
    expect(alreadyAsked({ ...drill, isMine: true, bookings: [requested("2026-11-12", "2026-11-14")] }, RANGE, [])).toBe(false);
  });
});
