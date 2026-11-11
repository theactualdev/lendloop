import { afterEach, describe, expect, test, vi } from "vitest";
import { SignJWT } from "jose";
import { InvalidTokenError, signToken, verifyToken } from "./signing";

const SECRET = "test-secret-test-secret-test-secret-0123456789";
const AUD = "n8n";

afterEach(() => {
  vi.useRealTimers();
});

describe("signing", () => {
  test("round-trips claims", async () => {
    const token = await signToken(
      { scope: "email.send", to: "a@b.c" },
      { secret: SECRET, audience: AUD },
    );
    const out = await verifyToken<{ scope: string; to: string }>(token, {
      secret: SECRET,
      audience: AUD,
      scope: "email.send",
    });
    expect(out.to).toBe("a@b.c");
    expect(typeof out.jti).toBe("string");
    expect(out.jti.length).toBeGreaterThan(0);
  });

  test("rejects a token signed with a different secret", async () => {
    const token = await signToken({}, { secret: SECRET, audience: AUD });
    await expect(
      verifyToken(token, { secret: SECRET + "x", audience: AUD }),
    ).rejects.toBeInstanceOf(InvalidTokenError);
  });

  test("rejects an expired token", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = await signToken(
      {},
      { secret: SECRET, audience: AUD, ttlSeconds: 1 },
    );
    vi.setSystemTime(new Date("2026-01-01T00:00:02Z"));
    await expect(
      verifyToken(token, { secret: SECRET, audience: AUD }),
    ).rejects.toBeInstanceOf(InvalidTokenError);
  });

  test("rejects wrong audience", async () => {
    const token = await signToken({}, { secret: SECRET, audience: AUD });
    await expect(
      verifyToken(token, { secret: SECRET, audience: "lendloop-convex" }),
    ).rejects.toBeInstanceOf(InvalidTokenError);
  });

  test("rejects wrong scope", async () => {
    const token = await signToken(
      { scope: "a" },
      { secret: SECRET, audience: AUD },
    );
    await expect(
      verifyToken(token, { secret: SECRET, audience: AUD, scope: "b" }),
    ).rejects.toBeInstanceOf(InvalidTokenError);
  });

  test("rejects alg none and HS512", async () => {
    const b64 = (o: object) =>
      btoa(JSON.stringify(o))
        .replace(/=+$/, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
    const now = Math.floor(Date.now() / 1000);
    const none = `${b64({ alg: "none", typ: "JWT" })}.${b64({ aud: AUD, exp: now + 60 })}.`;
    await expect(
      verifyToken(none, { secret: SECRET, audience: AUD }),
    ).rejects.toBeInstanceOf(InvalidTokenError);

    const hs512 = await new SignJWT({})
      .setProtectedHeader({ alg: "HS512" })
      .setAudience(AUD)
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode(SECRET));
    await expect(
      verifyToken(hs512, { secret: SECRET, audience: AUD }),
    ).rejects.toBeInstanceOf(InvalidTokenError);
  });
});
