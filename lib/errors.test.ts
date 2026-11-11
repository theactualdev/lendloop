import { describe, expect, test } from "vitest";
import { ConvexError } from "convex/values";
import { NO_EMAIL_CLAIM, type ErrorCode } from "@/convex/lib/errors";
import { FALLBACK_MESSAGE, errorCode, isMissingEmailClaim, messageFor, messageForCode } from "./errors";

// `satisfies` makes typecheck fail if a code is added to ErrorCode and not listed here.
const EXPECTED = {
  UNAUTHENTICATED: "Your session has ended. Sign in again to carry on.",
  FORBIDDEN: "You don't have permission to do that.",
  NOT_FOUND: "That's no longer here. It may have been removed.",
  INVALID_INPUT: "Some of those details aren't right. Check them and try again.",
  INVALID_RANGE: "Pick dates from today onward, up to 30 days.",
  INVALID_TRANSITION: "That request has already moved on. Refresh to see where it stands.",
  OWN_TOOL: "That's your own tool.",
  ALREADY_REQUESTED: "You've already asked for these dates.",
  TOOL_UNAVAILABLE: "That tool is already lent out on those dates.",
  TOOL_ON_LOAN: "That tool is out on loan right now.",
} satisfies Record<ErrorCode, string>;

const CODES = Object.keys(EXPECTED) as ErrorCode[];

describe("messageFor", () => {
  test.each(CODES)("maps %s to its human sentence", (code) => {
    expect(messageFor(new ConvexError({ code }))).toBe(EXPECTED[code]);
    expect(messageForCode(code)).toBe(EXPECTED[code]);
  });

  test("every code has its own sentence, none is the fallback", () => {
    const sentences = CODES.map((code) => messageFor(new ConvexError({ code })));
    expect(new Set(sentences).size).toBe(CODES.length);
    expect(sentences).not.toContain(FALLBACK_MESSAGE);
  });

  test("never shows the raw server message", () => {
    const error = new ConvexError({ code: "UNAUTHENTICATED", message: "user not provisioned" });
    expect(messageFor(error)).toBe(EXPECTED.UNAUTHENTICATED);
    expect(messageFor(error)).not.toContain("provisioned");
  });

  test.each([
    ["an unknown code", new ConvexError({ code: "SOMETHING_NEW" })],
    ["a ConvexError with string data", new ConvexError("raw server text")],
    ["a plain Error", new Error("[CONVEX Q(tools:list)] Server Error")],
    ["a string", "boom"],
    ["undefined", undefined],
    ["null", null],
  ])("falls back for %s", (_label, error) => {
    expect(messageFor(error)).toBe(FALLBACK_MESSAGE);
  });

  test("the fallback is a plain sentence", () => {
    expect(FALLBACK_MESSAGE).toBe("Something went wrong. Please try again.");
  });
});

describe("errorCode", () => {
  test("reads the code from a ConvexError", () => {
    expect(errorCode(new ConvexError({ code: "OWN_TOOL" }))).toBe("OWN_TOOL");
  });

  test("duck-types errors that crossed a module boundary", () => {
    const error = Object.assign(new Error("x"), { data: { code: "NOT_FOUND" } });
    expect(errorCode(error)).toBe("NOT_FOUND");
  });

  test("null for anything without a known code", () => {
    expect(errorCode(new ConvexError({ code: "NOPE" }))).toBeNull();
    expect(errorCode(new Error("x"))).toBeNull();
    expect(errorCode("x")).toBeNull();
  });
});

describe("isMissingEmailClaim", () => {
  test("true only for ensureUser's missing-email failure", () => {
    expect(NO_EMAIL_CLAIM).toBe("identity has no email claim");
    expect(
      isMissingEmailClaim(new ConvexError({ code: "UNAUTHENTICATED", message: NO_EMAIL_CLAIM })),
    ).toBe(true);
    expect(isMissingEmailClaim(new ConvexError({ code: "UNAUTHENTICATED" }))).toBe(false);
    expect(
      isMissingEmailClaim(new ConvexError({ code: "UNAUTHENTICATED", message: "user not provisioned" })),
    ).toBe(false);
    expect(isMissingEmailClaim(new Error("identity has no email claim"))).toBe(false);
  });
});
