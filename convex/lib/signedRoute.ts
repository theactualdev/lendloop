import { httpAction, type ActionCtx } from "../_generated/server";
import { AUD_CONVEX, verifyToken } from "./signing";

const JSON_HEADERS = { "content-type": "application/json" };

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

const unauthorized = () => json({ error: "unauthorized" }, 401);
const badRequest = () => json({ error: "bad_request" }, 400);

/** Claims that belong to the token itself, not to the route's payload. */
const STANDARD_CLAIMS = ["iat", "exp", "jti", "aud", "scope"];

/**
 * Wraps a route handler: parses `{ token }`, verifies it for this route's scope,
 * and hands over the payload claims (standard claims removed). Every verification
 * failure is the same opaque 401: no jose message, no token, no secret.
 * The handler returns the JSON body, or null for a claims-shape mismatch (400).
 */
export function withSignedClaims(
  scope: string,
  handler: (ctx: ActionCtx, claims: Record<string, unknown>) => Promise<unknown>,
) {
  return httpAction(async (ctx, request) => {
    const secret = process.env.N8N_TO_LENDLOOP_SECRET;
    if (!secret) return unauthorized();
    let token: unknown;
    try {
      token = ((await request.json()) as { token?: unknown } | null)?.token;
    } catch {
      return unauthorized();
    }
    if (typeof token !== "string" || token === "") return unauthorized();

    let claims: Record<string, unknown>;
    try {
      claims = await verifyToken(token, { secret, audience: AUD_CONVEX, scope });
    } catch {
      return unauthorized();
    }
    for (const k of STANDARD_CLAIMS) delete claims[k];

    try {
      const result = await handler(ctx, claims);
      return result === null ? badRequest() : json(result);
    } catch {
      // Never include the error message or token in the response.
      return json({ error: "internal" }, 500);
    }
  });
}
