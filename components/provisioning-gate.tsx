"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { SignInButton, SignOutButton, useAuth, useUser } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cleanDisplayName } from "@/convex/lib/text";
import { Button } from "@/components/ui/button";
import { errorCode, isMissingEmailClaim, messageFor } from "@/lib/errors";
import { cn } from "@/lib/utils";

/*
 * Member pages call member queries, which fail "user not provisioned" until
 * users.ensureUser has created the viewer's row. The gate runs ensureUser once
 * per signed-in user as soon as Convex has the Clerk token, and renders the
 * page only after it resolves or once `viewer` exists (a returning member).
 *
 * It also syncs the name. When Clerk's name (from the client-side user, so it is
 * current the moment the member saves it in the profile dialog) differs from the
 * stored one, the gate calls users.setMyName once per distinct name. That is a
 * direct mutation on the member's own row, so it does not depend on Convex
 * picking up a refreshed token. Convex reactivity then updates `viewer`.
 */

type Setup =
  | { status: "running" }
  | { status: "done" }
  | { status: "failed"; error: unknown };

export function ProvisioningGate({ children }: { children: ReactNode }) {
  const { isLoaded: clerkLoaded, isSignedIn, userId } = useAuth();
  const { isLoading: convexLoading, isAuthenticated } = useConvexAuth();
  const ensureUser = useMutation(api.users.ensureUser);
  const setMyName = useMutation(api.users.setMyName);
  const viewer = useQuery(api.users.viewer, isAuthenticated ? {} : "skip");

  const { user } = useUser();
  // Cleaned as Convex stores it (cut to 60, whitespace collapsed), so a long or
  // oddly spaced Clerk name compares equal once saved and is not re-sent.
  const clerkName = cleanDisplayName(user?.fullName ?? user?.firstName ?? "");

  const [attempt, setAttempt] = useState(0);
  const [setup, setSetup] = useState<{ key: string; state: Setup } | null>(null);
  const started = useRef<string | null>(null);
  const key = `${userId ?? ""}:${attempt}`;

  useEffect(() => {
    if (!isAuthenticated || !userId) return;
    // Once per user and attempt, StrictMode's double effect included.
    if (started.current === key) return;
    started.current = key;
    ensureUser().then(
      () => setSetup({ key, state: { status: "done" } }),
      (error: unknown) => {
        // Log the code only: the message can carry identity details.
        console.error("[member] ensureUser failed:", errorCode(error) ?? "unknown");
        setSetup({ key, state: { status: "failed", error } });
      },
    );
  }, [ensureUser, isAuthenticated, key, userId]);

  const sentName = useRef<string | null>(null);
  const storedName = viewer?.name.trim();
  useEffect(() => {
    if (!clerkLoaded || storedName === undefined || !clerkName || clerkName === storedName) return;
    // Once per distinct name, so a failure cannot turn into a retry loop.
    if (sentName.current === clerkName) return;
    sentName.current = clerkName;
    setMyName({ name: clerkName }).catch((error: unknown) => {
      // Quiet: the next page load tries again. Log the code only.
      console.error("[member] setMyName failed:", errorCode(error) ?? "unknown");
    });
  }, [clerkLoaded, clerkName, storedName, setMyName]);

  const state: Setup = setup?.key === key ? setup.state : { status: "running" };

  if (!clerkLoaded) return <MemberLoading />;

  // Signed out while the page was open (another tab, or the session ended).
  // proxy.ts guards fresh loads; this covers the page that is already here.
  if (!isSignedIn) {
    return (
      <GateMessage
        eyebrow="Signed out"
        title="You're signed out"
        body="Sign in again to see the board, your listings and your requests."
        action={
          <SignInButton mode="modal">
            <Button>Sign in</Button>
          </SignInButton>
        }
      />
    );
  }

  if (convexLoading) return <MemberLoading />;

  // Signed in to Clerk, but Convex did not accept the token: usually the
  // Clerk -> Convex integration (Integrations -> Convex) is not turned on.
  if (!isAuthenticated) {
    return (
      <SetupProblem
        title="We couldn't connect your account"
        body="You're signed in, but LendLoop's database didn't accept the sign-in. The site's administrator needs to turn on the Convex integration in the Clerk dashboard. Then reload this page."
        action={
          <Button variant="outline" onClick={() => window.location.reload()}>
            Reload
          </Button>
        }
      />
    );
  }

  if (state.status === "done" || viewer) return <>{children}</>;

  if (state.status === "failed" && viewer === null) {
    const missingEmail = isMissingEmailClaim(state.error);
    return (
      <SetupProblem
        title="We couldn't set up your account"
        body={
          missingEmail
            ? "Your sign-in didn't include an email address, and LendLoop needs one for request updates and reminders. The site's administrator needs to add your email to the sign-in token in the Clerk dashboard (Sessions → Customize session token). Then sign out and back in."
            : messageFor(state.error)
        }
        // Retrying re-runs ensureUser with the token Convex already holds, which
        // still lacks the email; only a fresh sign-in gets a new one.
        action={
          missingEmail ? (
            <SignOutButton>
              <Button>Sign out and sign back in</Button>
            </SignOutButton>
          ) : (
            <Button onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
          )
        }
        showSignOut={!missingEmail}
      />
    );
  }

  return <MemberLoading />;
}

/** Shown while Clerk, Convex and ensureUser settle; usually a split second. */
function MemberLoading() {
  return (
    <div role="status" className="mx-auto w-full max-w-[1280px] px-[clamp(16px,4vw,48px)] pt-10">
      <span className="sr-only">Loading your account…</span>
      <div aria-hidden="true" className="flex flex-col gap-4">
        <span className="h-3 w-44 rounded-sm bg-divider motion-safe:animate-pulse" />
        <span className="h-12 w-72 max-w-full rounded-sm bg-divider motion-safe:animate-pulse" />
        <span className="h-4 w-[28rem] max-w-full rounded-sm bg-divider motion-safe:animate-pulse" />
      </div>
    </div>
  );
}

/** A setup problem: alert tone, with Sign out next to the action. */
function SetupProblem({
  title,
  body,
  action,
  showSignOut = true,
}: {
  title: string;
  body: string;
  action: ReactNode;
  showSignOut?: boolean;
}) {
  return (
    <GateMessage
      alert
      eyebrow="Account setup"
      title={title}
      body={body}
      action={
        <>
          {action}
          {showSignOut && (
            <SignOutButton>
              <Button variant="ghost">Sign out</Button>
            </SignOutButton>
          )}
        </>
      }
    />
  );
}

/** A full-page message in place of the member page, under the header. */
function GateMessage({
  alert = false,
  eyebrow,
  title,
  body,
  action,
}: {
  alert?: boolean;
  eyebrow: string;
  title: string;
  body: string;
  action: ReactNode;
}) {
  return (
    <div
      role={alert ? "alert" : "status"}
      className="mx-auto w-full max-w-[1280px] px-[clamp(16px,4vw,48px)] pt-[clamp(40px,7vw,96px)]"
    >
      <div className="max-w-[60ch]">
        <p
          className={cn(
            "font-mono text-xs font-semibold tracking-[0.12em] uppercase",
            alert ? "text-alert-ink" : "text-ink-muted",
          )}
        >
          {eyebrow}
        </p>
        <h1 className="mt-2.5 text-[clamp(32px,4vw,44px)] leading-[1.05] font-extrabold tracking-[-0.02em]">
          {title}
        </h1>
        <p className="mt-4 text-[17px] leading-[1.55] text-pretty text-ink-soft">{body}</p>
        <div className="mt-6 flex flex-wrap items-center gap-3">{action}</div>
      </div>
    </div>
  );
}
