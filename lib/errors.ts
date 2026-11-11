import { toast } from "sonner";
import type { ErrorCode } from "@/convex/lib/errors";

/*
 * Every error a member can see goes through here. Convex functions throw
 * ConvexError({ code, message? }); the UI maps the code to one short sentence
 * and never shows the server's own text (it can name internals).
 */

const MESSAGES: Record<ErrorCode, string> = {
  UNAUTHENTICATED: "Your session has ended. Sign in again to carry on.",
  FORBIDDEN: "You don't have permission to do that.",
  NOT_FOUND: "That's no longer here. It may have been removed.",
  INVALID_INPUT: "Some of those details aren't right. Check them and try again.",
  INVALID_RANGE: "Pick dates from today onward, up to 30 days.",
  INVALID_TRANSITION: "That request has already moved on. Refresh to see where it stands.",
  OWN_TOOL: "That's your own tool.",
  TOOL_UNAVAILABLE: "That tool is already lent out on those dates.",
  TOOL_ON_LOAN: "That tool is out on loan right now.",
};

export const FALLBACK_MESSAGE = "Something went wrong. Please try again.";

/** The error's data, if it looks like a ConvexError's (duck-typed, not instanceof). */
function errorData(error: unknown): { code?: unknown; message?: unknown } | null {
  if (typeof error !== "object" || error === null || !("data" in error)) return null;
  const data = (error as { data: unknown }).data;
  return typeof data === "object" && data !== null ? data : null;
}

/** The ErrorCode carried by a ConvexError, or null. Safe to log. */
export function errorCode(error: unknown): ErrorCode | null {
  const code = errorData(error)?.code;
  return typeof code === "string" && Object.hasOwn(MESSAGES, code) ? (code as ErrorCode) : null;
}

/** The sentence for a known code. Use it for client-side checks that mirror a server rule. */
export function messageForCode(code: ErrorCode): string {
  return MESSAGES[code];
}

/** A short human sentence for any error. Unknown errors get a generic sentence. */
export function messageFor(error: unknown): string {
  const code = errorCode(error);
  return code ? MESSAGES[code] : FALLBACK_MESSAGE;
}

/**
 * ensureUser's one failure the user cannot fix by retrying: the Clerk token has
 * no email claim because the Clerk -> Convex integration is not turned on. Only
 * used to pick which message to show; the server text itself is never shown.
 */
export function isMissingEmailClaim(error: unknown): boolean {
  const data = errorData(error);
  return data?.code === "UNAUTHENTICATED" && data.message === "identity has no email claim";
}

/** Shows `messageFor(error)` as an error toast. */
export function toastError(error: unknown): void {
  toast.error(messageFor(error));
}
