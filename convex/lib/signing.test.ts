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
    vi.setSystemTime(new Date("2026-01-01T00:01:00Z"));
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

  test("the error message is generic and keeps the jose error as cause", async () => {
    const token = await signToken({}, { secret: SECRET, audience: AUD });
    const err = await verifyToken(token, { secret: SECRET + "x", audience: AUD }).catch((e) => e);
    expect(err).toBeInstanceOf(InvalidTokenError);
    expect(err.message).toBe("invalid token");
    expect(err.cause).toBeInstanceOf(Error);
  });

  test("rejects a token without jti", async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setAudience(AUD)
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode(SECRET));
    await expect(verifyToken(token, { secret: SECRET, audience: AUD })).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
  });

  test("rejects a token without exp", async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setAudience(AUD)
      .setJti("abc")
      .sign(new TextEncoder().encode(SECRET));
    await expect(verifyToken(token, { secret: SECRET, audience: AUD })).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
  });

  test("rejects a missing or array scope when a scope is required", async () => {
    for (const claims of [{}, { scope: ["a"] }]) {
      const token = await signToken(claims, { secret: SECRET, audience: AUD });
      await expect(
        verifyToken(token, { secret: SECRET, audience: AUD, scope: "a" }),
      ).rejects.toBeInstanceOf(InvalidTokenError);
    }
  });

  test("rejects a numeric jti", async () => {
    const token = await new SignJWT({ jti: 123 } as never)
      .setProtectedHeader({ alg: "HS256" })
      .setAudience(AUD)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode(SECRET));
    await expect(verifyToken(token, { secret: SECRET, audience: AUD })).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
  });

  test("rejects a token issued more than 5 minutes ago even if exp is in the future", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setAudience(AUD)
      .setJti("abc")
      .setIssuedAt(now - 360)
      .setExpirationTime(now + 600)
      .sign(new TextEncoder().encode(SECRET));
    await expect(verifyToken(token, { secret: SECRET, audience: AUD })).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
  });

  test("rejects a token without iat", async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setAudience(AUD)
      .setJti("abc")
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode(SECRET));
    await expect(verifyToken(token, { secret: SECRET, audience: AUD })).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
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
