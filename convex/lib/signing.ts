import { SignJWT, jwtVerify } from "jose";

/** Audience for Convex -> n8n webhooks. */
export const AUD_N8N = "n8n";
/** Audience for n8n -> Convex HTTP routes. */
export const AUD_CONVEX = "lendloop-convex";

export class InvalidTokenError extends Error {
  constructor(options?: { cause?: unknown }) {
    // Fixed generic message: callers must never learn why verification failed.
    super("invalid token", options);
    this.name = "InvalidTokenError";
  }
}

// The secret string is used as-is (UTF-8 bytes), which is what n8n's JWT
// credential does with a passphrase.
const key = (secret: string) => new TextEncoder().encode(secret);

export async function signToken(
  claims: Record<string, unknown>,
  opts: { secret: string; audience: string; ttlSeconds?: number },
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setAudience(opts.audience)
    .setIssuedAt()
    .setExpirationTime(`${opts.ttlSeconds ?? 300}s`)
    .setJti(crypto.randomUUID())
    .sign(key(opts.secret));
}

export async function verifyToken<T = Record<string, unknown>>(
  token: string,
  opts: { secret: string; audience: string; scope?: string },
): Promise<T & { jti: string }> {
  try {
    const { payload } = await jwtVerify(token, key(opts.secret), {
      algorithms: ["HS256"],
      audience: opts.audience,
      requiredClaims: ["exp", "iat", "jti"],
      maxTokenAge: "5m",
      clockTolerance: "30s",
    });
    if (typeof payload.jti !== "string") throw new Error("jti must be a string");
    // A missing or non-string (e.g. array) scope never equals the expected string.
    if (opts.scope !== undefined && payload.scope !== opts.scope) {
      throw new Error("wrong scope");
    }
    return payload as T & { jti: string };
  } catch (e) {
    throw new InvalidTokenError({ cause: e });
  }
}
