import { SignJWT, jwtVerify } from "jose";

/** Audience for Convex -> n8n webhooks. */
export const AUD_N8N = "n8n";
/** Audience for n8n -> Convex HTTP routes. */
export const AUD_CONVEX = "lendloop-convex";

export class InvalidTokenError extends Error {
  constructor(message = "Invalid token") {
    super(message);
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
      requiredClaims: ["exp", "jti"],
    });
    if (opts.scope !== undefined && payload.scope !== opts.scope) {
      throw new InvalidTokenError("Wrong scope");
    }
    return payload as T & { jti: string };
  } catch (e) {
    if (e instanceof InvalidTokenError) throw e;
    throw new InvalidTokenError(e instanceof Error ? e.message : undefined);
  }
}
