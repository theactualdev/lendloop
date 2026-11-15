import { describe, expect, it } from "vitest";
import { daysLate, requestStep } from "./loan-step";

const today = "2026-11-11";
const base = { startDate: "2026-11-12", endDate: "2026-11-13", overdue: false };
const step = (o: Partial<typeof base> & { status: string }, first = "Priya") =>
  requestStep({ ...base, ...o } as never, first, today);

describe("requestStep (borrower's next step)", () => {
  it("pending waits for the lender", () => expect(step({ status: "pending" })).toBe("Waiting for Priya to answer"));
  it("approved before the start: pick up", () =>
    expect(step({ status: "approved" })).toBe("Pick it up from Priya on Thursday, Nov 12. You can cancel until then."));
  it("approved and held: return it", () =>
    expect(step({ status: "approved", startDate: "2026-11-10" })).toBe("You have it until Nov 13. Return it to Priya."));
  it("overdue", () =>
    expect(step({ status: "approved", startDate: "2026-11-03", endDate: "2026-11-07", overdue: true })).toBe(
      "This was due back Nov 7. Return it to Priya.",
    ));
  it("closed states", () => {
    expect(step({ status: "declined" })).toBe("Priya declined this request.");
    expect(step({ status: "cancelled" })).toBe("This was cancelled.");
    expect(step({ status: "expired" })).toBe("The dates passed before it was answered.");
    expect(step({ status: "returned" })).toBe("Returned to Priya.");
  });
  it("uses stand-ins for a missing name", () => {
    expect(step({ status: "pending" }, "")).toBe("Waiting for a neighbor to answer");
    expect(step({ status: "declined" }, "")).toBe("A neighbor declined this request.");
  });
});

describe("daysLate", () => {
  it("counts days after the end", () => {
    expect(daysLate("2026-11-07", today)).toBe(4);
    expect(daysLate("2026-11-10", today)).toBe(1);
    expect(daysLate("2026-11-11", today)).toBe(0);
    expect(daysLate("2026-11-20", today)).toBe(0);
  });
});
