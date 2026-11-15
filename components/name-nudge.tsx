"use client";

import { useSyncExternalStore } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

/*
 * A slim strip under the member header for accounts with no first name. It is
 * driven by Clerk's client-side user, not by Convex, so it disappears the moment
 * the name is saved in the profile dialog. (ProvisioningGate then re-syncs the
 * name to Convex so other members see it.) The "×" hides it for this browser
 * session only.
 */

const DISMISS_KEY = "ll:name-nudge-dismissed";

const listeners = new Set<() => void>();
let dismissedFallback = false; // when sessionStorage is unavailable

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

function readDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return dismissedFallback;
  }
}

function dismiss() {
  dismissedFallback = true;
  try {
    window.sessionStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* private mode: hidden until the page reloads */
  }
  listeners.forEach((cb) => cb());
}

export function NameNudge() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { openUserProfile } = useClerk();
  // The server snapshot is "dismissed", so SSR and hydration both render nothing.
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => true);

  if (!isLoaded || !isSignedIn || dismissed) return null;
  if (user.firstName?.trim()) return null;

  return (
    <section aria-label="Add your name" className="border-b border-divider bg-paper-muted">
      <div className="mx-auto flex w-full max-w-[1280px] items-center gap-x-4 gap-y-1 px-[clamp(16px,4vw,48px)] py-2">
        <p className="min-w-0 flex-1 text-[14px] leading-snug text-ink-soft">
          Add your first name so neighbors know who&apos;s asking.
        </p>
        <Button variant="outline" size="sm" onClick={() => openUserProfile()}>
          Add your name
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Dismiss for this session"
          onClick={dismiss}
        >
          <span aria-hidden="true" className="text-lg leading-none">
            ×
          </span>
        </Button>
      </div>
    </section>
  );
}
