import { ConvexError } from "convex/values";

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "INVALID_RANGE"
  | "INVALID_TRANSITION"
  | "OWN_TOOL"
  | "ALREADY_REQUESTED"
  | "TOOL_UNAVAILABLE"
  | "TOOL_ON_LOAN";

/**
 * ensureUser's message when the Clerk token carries no email (the Clerk ->
 * Convex integration is off). Shared with the client, which matches on it to
 * pick its explanation; the text itself is never shown.
 */
export const NO_EMAIL_CLAIM = "identity has no email claim";

export function fail(code: ErrorCode, message?: string): never {
  throw new ConvexError({ code, message });
}
