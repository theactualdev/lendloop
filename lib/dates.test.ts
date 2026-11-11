import { describe, expect, test } from "vitest";
import { dayLabels, daysInclusive, formatRange, shortDay } from "./dates";

describe("dayLabels", () => {
  test("short and long labels in UTC", () => {
    expect(dayLabels("2026-11-10")).toEqual({
      short: "Tue · Nov 10",
      long: "Tuesday, November 10",
    });
  });
});

describe("shortDay", () => {
  test("month and day", () => {
    expect(shortDay("2026-11-14")).toBe("Nov 14");
    expect(shortDay("2027-01-01")).toBe("Jan 1");
  });
});

describe("formatRange", () => {
  test("same month: the month once", () => {
    expect(formatRange("2026-11-12", "2026-11-14")).toBe("Nov 12 – 14");
  });

  test("across months: both months", () => {
    expect(formatRange("2026-11-30", "2026-12-02")).toBe("Nov 30 – Dec 2");
  });

  test("a single day", () => {
    expect(formatRange("2026-11-12", "2026-11-12")).toBe("Nov 12");
  });

  test("custom separator", () => {
    expect(formatRange("2026-11-12", "2026-11-14", "–")).toBe("Nov 12–14");
    expect(formatRange("2026-11-12", "2026-11-14", " to ")).toBe("Nov 12 to 14");
  });

  test("the same day number in different years is not one day", () => {
    expect(formatRange("2026-12-31", "2027-01-02")).toBe("Dec 31 – Jan 2");
  });
});

describe("daysInclusive", () => {
  test("counts both ends", () => {
    expect(daysInclusive("2026-11-12", "2026-11-14")).toBe(3);
    expect(daysInclusive("2026-11-12", "2026-11-12")).toBe(1);
    expect(daysInclusive("2026-11-30", "2026-12-29")).toBe(30);
  });
});
