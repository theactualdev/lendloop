import { DISPLAY_NAME_MAX } from "./constants";

/*
 * Cleaning for short, single-line text that other members see (display names and
 * tool names). Pure, so the client's inline checks can use the same rules.
 */

/**
 * Turns every run of whitespace (tabs and newlines included) into one space,
 * drops the remaining control characters, and trims. "Alice\nSmith" becomes
 * "Alice Smith", not "AliceSmith".
 */
export function cleanText(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/\p{Cc}/gu, "")
    .replace(/ {2,}/g, " ")
    .trim();
}

/**
 * A member's display name, from a token claim or from setMyName: cleanText, then
 * cut to DISPLAY_NAME_MAX characters (never mid-character) and trimmed again.
 * Can be "", which callers treat as "no name".
 */
export function cleanDisplayName(raw: string): string {
  return Array.from(cleanText(raw)).slice(0, DISPLAY_NAME_MAX).join("").trim();
}
