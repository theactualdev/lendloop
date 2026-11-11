import { ConvexError } from "convex/values";

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "INVALID_RANGE"
  | "INVALID_TRANSITION"
  | "OWN_TOOL"
  | "TOOL_UNAVAILABLE"
  | "TOOL_ON_LOAN";

export function fail(code: ErrorCode, message?: string): never {
  throw new ConvexError({ code, message });
}
