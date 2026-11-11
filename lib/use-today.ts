"use client";

import { useSyncExternalStore } from "react";
import { todayUtc } from "@/convex/lib/availability";

// Re-read the clock every minute so an open page rolls over at midnight (UTC).
function subscribe(onChange: () => void) {
  const id = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(id);
}

const getSnapshot = () => todayUtc();
const getServerSnapshot = () => null;

/**
 * Today's date (UTC, YYYY-MM-DD), the same "today" the backend uses. Null while
 * rendering on the server, so no clock is read at build time.
 */
export function useTodayUtc(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
