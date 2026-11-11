"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { SignOutButton, useAuth } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { errorCode, isMissingEmailClaim, messageFor } from "@/lib/errors";

/*
 * Member pages call member queries, which fail "user not provisioned" until
 * users.ensureUser has created the viewer's row. The gate runs ensureUser once
 * per signed-in user as soon as Convex has the Clerk token, and renders the
 * page only after it resolves or once `viewer` exists (a returning member).
 */

type Setup =
  | { status: "running" }
  | { status: "done" }
  | { status: "failed"; error: unknown };

export function ProvisioningGate({ children }: { children: ReactNode }) {
  const { isLoaded: clerkLoaded, isSignedIn, userId } = useAuth();
  const { isLoading: convexLoading, isAuthenticated } = useConvexAuth();
  const ensureUser = useMutation(api.users.ensureUser);
  const viewer = useQuery(api.users.viewer, isAuthenticated ? {} : "skip");

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

  const state: Setup = setup?.key === key ? setup.state : { status: "running" };

  if (!clerkLoaded || convexLoading || !isSignedIn) return <MemberLoading />;

  // Signed in to Clerk, but Convex did not accept the token: usually the
  // Clerk -> Convex integration (the "convex" JWT template) is not turned on.
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
            ? "Your sign-in didn't include an email address, and LendLoop needs one for request updates and reminders. The site's administrator needs to turn on the Convex integration in the Clerk dashboard, which adds your email to the sign-in. Then try again."
            : messageFor(state.error)
        }
        action={<Button onClick={() => setAttempt((n) => n + 1)}>Try again</Button>}
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

function SetupProblem({ title, body, action }: { title: string; body: string; action: ReactNode }) {
  return (
    <div role="alert" className="mx-auto w-full max-w-[1280px] px-[clamp(16px,4vw,48px)] pt-[clamp(40px,7vw,96px)]">
      <div className="max-w-[60ch]">
        <p className="font-mono text-xs font-semibold tracking-[0.12em] text-alert-ink uppercase">
          Account setup
        </p>
        <h1 className="mt-2.5 text-[clamp(32px,4vw,44px)] leading-[1.05] font-extrabold tracking-[-0.02em]">
          {title}
        </h1>
        <p className="mt-4 text-[17px] leading-[1.55] text-pretty text-ink-soft">{body}</p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {action}
          <SignOutButton>
            <Button variant="ghost">Sign out</Button>
          </SignOutButton>
        </div>
      </div>
    </div>
  );
}
