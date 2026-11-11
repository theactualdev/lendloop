import { describe, expect, test } from "vitest";
import type { StripBooking } from "./strip";
import { backOn, toolStatus, type StatusTool } from "./tool-status";

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
