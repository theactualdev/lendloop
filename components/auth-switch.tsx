"use client";

import type { ReactNode } from "react";
import { useAuth } from "@clerk/nextjs";

/**
 * Signed-in or signed-out content, decided in the browser. The public pages use
 * this instead of Clerk's server <Show>, which calls auth() and so needs Clerk's
 * middleware on the route; keeping that middleware off public pages is what
 * lets crawlers reach them (see proxy.ts). `loading` holds the space until Clerk
 * has loaded, so nothing jumps.
 */
export function AuthSwitch({
  signedIn,
  signedOut,
  loading = null,
}: {
  signedIn: ReactNode;
  signedOut: ReactNode;
  loading?: ReactNode;
}) {
  const { isLoaded, userId } = useAuth();
  if (!isLoaded) return loading;
  return userId ? signedIn : signedOut;
}
