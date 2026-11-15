import { HOUR, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { fail } from "./errors";

const DAY = 24 * HOUR;

/**
 * Per-member limits for the writes a friendly demo should not see in bulk.
 * Token buckets: a full allowance at once, then it refills evenly, so a member
 * who hits a limit can try again soon rather than at a fixed hour.
 */
export const LIMITS = {
  "loans.request": { kind: "token bucket", rate: 10, period: HOUR, capacity: 10 },
  "tools.create": { kind: "token bucket", rate: 10, period: DAY, capacity: 10 },
  "users.setMyName": { kind: "token bucket", rate: 20, period: HOUR, capacity: 20 },
} as const;

export const rateLimiter = new RateLimiter(components.rateLimiter, LIMITS);

export type RateLimitName = keyof typeof LIMITS;

/**
 * Spends one token from `name` for this member, or fails RATE_LIMITED. Call it
 * after authorization and input validation, so a rejected call spends nothing,
 * and in the same mutation as the write (a throw rolls the spend back too).
 */
export async function enforceRateLimit(ctx: MutationCtx, name: RateLimitName, userId: Id<"users">): Promise<void> {
  const { ok } = await rateLimiter.limit(ctx, name, { key: userId });
  if (!ok) fail("RATE_LIMITED");
}

