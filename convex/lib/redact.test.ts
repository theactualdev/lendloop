import { describe, expect, test } from "vitest";
import { redactEmails } from "./redact";

describe("redactEmails", () => {
  test("redacts every email-shaped substring", () => {
    expect(redactEmails("550 <bob@example.com>: rejected; cc o'neil+x@mail.co.uk too")).toBe(
      "550 <[redacted]>: rejected; cc [redacted] too",
    );
  });
  test("leaves text without emails untouched", () => {
    expect(redactEmails("connect ECONNREFUSED 127.0.0.1:1025 at @host")).toBe(
      "connect ECONNREFUSED 127.0.0.1:1025 at @host",
    );
  });
});
