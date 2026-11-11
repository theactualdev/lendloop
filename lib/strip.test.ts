import { describe, expect, test } from "vitest";
import { STRIP_DAYS, stripCells, stripSummary, type StripBooking } from "./strip";

const TODAY = "2026-11-11";

const booked = (startDate: string, endDate: string): StripBooking => ({
  startDate,
  endDate,
  kind: "booked",
});
const requested = (startDate: string, endDate: string): StripBooking => ({
  startDate,
  endDate,
  kind: "requested",
});

/** The kinds as a compact string, one letter per day, for readable assertions. */
function pattern(cells: { kind: string }[]): string {
  const letter: Record<string, string> = {
    free: ".",
    booked: "B",
    requested: "r",
    yours: "y",
    overdue: "O",
    clash: "X",
  };
  return cells.map((c) => letter[c.kind]).join("");
}

describe("stripCells window", () => {
  test("21 cells, today through today+20, all free with no bookings", () => {
    const cells = stripCells({ today: TODAY, bookings: [] });
    expect(STRIP_DAYS).toBe(21);
    expect(cells).toHaveLength(21);
    expect(cells[0].date).toBe("2026-11-11");
    expect(cells[19].date).toBe("2026-11-30");
    expect(cells[20].date).toBe("2026-12-01");
    expect(cells.every((c) => c.kind === "free")).toBe(true);
  });

  test("crosses a year boundary", () => {
    const cells = stripCells({ today: "2026-12-25", bookings: [] });
    expect(cells[6].date).toBe("2026-12-31");
    expect(cells[7].date).toBe("2027-01-01");
    expect(cells[20].date).toBe("2027-01-14");
  });

  test("bookings are clipped to the window on both ends", () => {
    const cells = stripCells({
      today: TODAY,
      bookings: [booked("2026-11-01", "2026-11-12"), requested("2026-11-30", "2026-12-20")],
    });
    expect(pattern(cells)).toBe("BB.................rr");
  });

  test("a booking that touches only the first or last day", () => {
    const cells = stripCells({
      today: TODAY,
      bookings: [booked("2026-11-11", "2026-11-11"), booked("2026-12-01", "2026-12-01")],
    });
    expect(pattern(cells)).toBe("B...................B");
  });

  test("bookings entirely outside the window are ignored", () => {
    const cells = stripCells({
      today: TODAY,
      bookings: [booked("2026-11-01", "2026-11-10"), booked("2026-12-02", "2026-12-05")],
    });
    expect(pattern(cells)).toBe(".".repeat(21));
  });
});

describe("stripCells kinds", () => {
  test("booked and requested come from bookings, inclusive on both ends", () => {
    const cells = stripCells({
      today: TODAY,
      bookings: [booked("2026-11-14", "2026-11-16"), requested("2026-11-20", "2026-11-23")],
    });
    expect(pattern(cells)).toBe("...BBB...rrrr........");
  });

  test("booked wins over requested on the same day", () => {
    const cells = stripCells({
      today: TODAY,
      bookings: [requested("2026-11-12", "2026-11-15"), booked("2026-11-14", "2026-11-16")],
    });
    expect(pattern(cells)).toBe(".rrBBB...............");
  });

  test("yours marks the selected range", () => {
    const cells = stripCells({
      today: TODAY,
      bookings: [],
      selection: { from: "2026-11-12", to: "2026-11-14" },
    });
    expect(pattern(cells)).toBe(".yyy.................");
  });

  test("a selection running past the window is clipped", () => {
    const cells = stripCells({
      today: TODAY,
      bookings: [],
      selection: { from: "2026-11-29", to: "2026-12-10" },
    });
    expect(pattern(cells)).toBe("..................yyy");
  });

  test("clash marks selected days that are booked", () => {
    const cells = stripCells({
      today: TODAY,
      bookings: [booked("2026-11-10", "2026-11-13")],
      selection: { from: "2026-11-12", to: "2026-11-15" },
    });
    expect(pattern(cells)).toBe("BXXyy................");
  });

  test("clash is exact: booked outside the selection stays booked", () => {
    const cells = stripCells({
      today: TODAY,
      bookings: [booked("2026-11-11", "2026-11-13")],
      selection: { from: "2026-11-13", to: "2026-11-15" },
    });
    expect(pattern(cells)).toBe("BBXyy................");
  });

  test("a requested day inside the selection stays requested", () => {
    const cells = stripCells({
      today: TODAY,
      bookings: [requested("2026-11-13", "2026-11-13")],
      selection: { from: "2026-11-12", to: "2026-11-14" },
    });
    expect(pattern(cells)).toBe(".yry.................");
  });
});

describe("stripCells overdue", () => {
  test("on loan with no booking covering today marks today overdue", () => {
    const cells = stripCells({
      today: TODAY,
      bookings: [booked("2026-11-20", "2026-11-21")],
      availability: "on_loan",
    });
    expect(pattern(cells)).toBe("O........BB..........");
  });

  test("on loan with a booking covering today is booked, not overdue", () => {
    const cells = stripCells({
      today: TODAY,
      bookings: [booked("2026-11-09", "2026-11-12")],
      availability: "on_loan",
    });
    expect(pattern(cells)).toBe("BB...................");
  });

  test("available tools are never overdue", () => {
    const cells = stripCells({ today: TODAY, bookings: [], availability: "available" });
    expect(cells[0].kind).toBe("free");
  });

  test("overdue only ever marks today, and wins over the selection and a request", () => {
    const cells = stripCells({
      today: TODAY,
      bookings: [requested("2026-11-11", "2026-11-12")],
      selection: { from: "2026-11-11", to: "2026-11-13" },
      availability: "on_loan",
    });
    expect(pattern(cells)).toBe("Ory..................");
  });
});

describe("stripSummary", () => {
  test("names each run, then says free otherwise", () => {
    const cells = stripCells({ today: TODAY, bookings: [booked("2026-11-14", "2026-11-16")] });
    expect(stripSummary(cells)).toBe("Booked Nov 14 to 16; free otherwise");
  });

  test("all free", () => {
    expect(stripSummary(stripCells({ today: TODAY, bookings: [] }))).toBe(
      "Free every day for the next three weeks",
    );
  });

  test("calls today today, names single days and month changes", () => {
    const cells = stripCells({
      today: TODAY,
      bookings: [requested("2026-11-20", "2026-11-20"), booked("2026-11-30", "2026-12-02")],
      selection: { from: "2026-11-12", to: "2026-11-13" },
      availability: "on_loan",
    });
    expect(stripSummary(cells)).toBe(
      "Overdue today; your dates Nov 12 to 13; requested Nov 20; booked Nov 30 to Dec 1; free otherwise",
    );
  });

  test("describes a clash in words", () => {
    const cells = stripCells({
      today: TODAY,
      bookings: [booked("2026-11-11", "2026-11-13")],
      selection: { from: "2026-11-13", to: "2026-11-14" },
    });
    expect(stripSummary(cells)).toBe(
      "Booked today to Nov 12; your dates clash with a booking Nov 13; your dates Nov 14; free otherwise",
    );
  });

  test("no 'free otherwise' when nothing is free", () => {
    const cells = stripCells({ today: TODAY, bookings: [booked("2026-11-01", "2026-12-31")] });
    expect(stripSummary(cells)).toBe("Booked today to Dec 1");
  });
});
