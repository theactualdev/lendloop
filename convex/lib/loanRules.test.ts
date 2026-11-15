import { describe, expect, test } from "vitest";
import { ConvexError } from "convex/values";
import { nextStatus, rangesOverlap, validateRange } from "./loanRules";

type Status = "pending" | "approved" | "declined" | "cancelled" | "returned" | "expired";
type Action = "approve" | "decline" | "cancel" | "withdraw" | "return";
type Actor = "lender" | "borrower" | "admin";

const STATUSES: Status[] = ["pending", "approved", "declined", "cancelled", "returned", "expired"];
const ACTIONS: Action[] = ["approve", "decline", "cancel", "withdraw", "return"];
const ACTORS: Actor[] = ["lender", "borrower", "admin"];

// (status:action) -> allowed actors and result
const LEGAL: Record<string, { actors: Actor[]; to: Status }> = {
  "pending:approve": { actors: ["lender"], to: "approved" },
  "pending:decline": { actors: ["lender"], to: "declined" },
  "pending:cancel": { actors: ["borrower"], to: "cancelled" },
  "approved:cancel": { actors: ["borrower"], to: "cancelled" },
  "approved:withdraw": { actors: ["lender", "admin"], to: "cancelled" },
  "approved:return": { actors: ["lender", "admin"], to: "returned" },
};

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    if (e instanceof ConvexError) return (e.data as { code: string }).code;
    throw e;
  }
}

describe("nextStatus", () => {
  const cases = STATUSES.flatMap((s) =>
    ACTIONS.flatMap((a) => ACTORS.map((who) => [s, a, who] as const)),
  );
  test("covers 90 triples", () => expect(cases).toHaveLength(90));

  test.each(cases)(
    "only the six legal moves succeed; wrong actor is FORBIDDEN; rest is INVALID_TRANSITION: %s + %s by %s",
    (status, action, actor) => {
      const legal = LEGAL[`${status}:${action}`];
      if (legal && legal.actors.includes(actor)) {
        expect(nextStatus(status, action, actor)).toBe(legal.to);
      } else if (legal) {
        expect(codeOf(() => nextStatus(status, action, actor))).toBe("FORBIDDEN");
      } else {
        expect(codeOf(() => nextStatus(status, action, actor))).toBe("INVALID_TRANSITION");
      }
    },
  );
});

describe("rangesOverlap", () => {
  const r = { startDate: "2030-01-10", endDate: "2030-01-15" };
  test("rangesOverlap is inclusive on both ends", () => {
    expect(rangesOverlap(r, { startDate: "2030-01-15", endDate: "2030-01-20" })).toBe(true);
    expect(rangesOverlap(r, { startDate: "2030-01-05", endDate: "2030-01-10" })).toBe(true);
    expect(rangesOverlap(r, { startDate: "2030-01-16", endDate: "2030-01-20" })).toBe(false);
    expect(rangesOverlap(r, { startDate: "2030-01-05", endDate: "2030-01-09" })).toBe(false);
    expect(rangesOverlap(r, { startDate: "2030-01-11", endDate: "2030-01-12" })).toBe(true);
  });
});

describe("validateRange", () => {
  const today = "2030-01-10";
  const bad = (s: string, e: string) =>
    codeOf(() => validateRange({ startDate: s, endDate: e }, today));
  test("accepts today and a 30-day span", () => {
    expect(bad("2030-01-10", "2030-01-10")).toBeNull();
    expect(bad("2030-01-10", "2030-02-08")).toBeNull();
  });
  test("rejects past start, reversed, over 30 days, malformed", () => {
    expect(bad("2030-01-09", "2030-01-12")).toBe("INVALID_RANGE");
    expect(bad("2030-01-12", "2030-01-11")).toBe("INVALID_RANGE");
    expect(bad("2030-01-10", "2030-02-09")).toBe("INVALID_RANGE");
    expect(bad("2030-02-30", "2030-03-01")).toBe("INVALID_RANGE");
    expect(bad("nope", "2030-03-01")).toBe("INVALID_RANGE");
  });
});
