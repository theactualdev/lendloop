import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import { preloadQuery } from "convex/nextjs";
import { ArrowRight, Lock } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { todayUtc } from "@/convex/lib/availability";
import { IndexCard, IndexCardHeader, IndexCardTitle } from "@/components/index-card";
import {
  PublicToolList,
  PublicToolListBoundary,
  PublicToolListError,
  PublicToolListSkeleton,
} from "@/components/public-tool-list";
import { Button, buttonVariants } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { dayLabels } from "@/lib/dates";
import { cn } from "@/lib/utils";

/*
 * Public landing page (screen D1). Static parts prerender into the shell.
 * Everything that depends on the request streams in behind its own <Suspense>
 * (Cache Components): the auth-dependent actions (Clerk <Show> reads the
 * session), today's date, and the shelf list (preloaded from Convex per request).
 */

const GUTTER = "px-[clamp(16px,4vw,48px)]";

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col overflow-x-clip pb-18">
      <header
        className={cn(
          "flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b bg-header py-3",
          GUTTER,
        )}
      >
        <Wordmark />
        <Suspense fallback={<div aria-hidden="true" className="h-11" />}>
          <Show
            when="signed-in"
            fallback={
              <SignInButton mode="modal">
                <Button variant="outline-primary">Sign in</Button>
              </SignInButton>
            }
          >
            <div className="flex h-11 items-center">
              <UserButton />
            </div>
          </Show>
        </Suspense>
      </header>

      <main className={cn("mx-auto w-full max-w-[1280px]", GUTTER)}>
        <div className="flex flex-wrap items-center gap-x-[72px] gap-y-14 pt-[clamp(40px,7vw,96px)]">
          <div className="min-w-0 flex-[1_1_480px]">
            <h1 className="text-[clamp(46px,6.4vw,86px)] leading-[0.98] font-extrabold tracking-[-0.025em] text-balance">
              Borrow what you need. Lend what you don&apos;t.
            </h1>
            <p className="mt-[26px] max-w-[44ch] text-[19px] leading-[1.55] text-pretty text-ink-soft">
              Neighbors list the tools they&apos;re happy to lend. Ask for the days you need one,
              and the owner says yes or no.
            </p>
            <div className="mt-[34px]">
              <Suspense fallback={<div aria-hidden="true" className="h-14" />}>
                <Show
                  when="signed-in"
                  fallback={
                    <SignInButton mode="modal">
                      <Button size="xl" className="max-sm:w-full">
                        Sign in to lend or borrow
                        <ArrowRight strokeWidth={2.25} />
                      </Button>
                    </SignInButton>
                  }
                >
                  <Link href="/board" className={buttonVariants({ size: "xl", className: "max-sm:w-full" })}>
                    Go to the board
                    <ArrowRight strokeWidth={2.25} />
                  </Link>
                </Show>
              </Suspense>
            </div>
            <p className="mt-5 max-w-[48ch] text-sm leading-[1.55] text-pretty text-ink-muted">
              Neighbors only see your first name. Your email is used for request updates and
              return reminders.
            </p>
          </div>

          <div className="relative min-w-0 flex-[1_1_400px] px-2.5 pt-3.5 pb-1.5">
            {/* The card underneath: paper stacked on the desk. */}
            <div
              aria-hidden="true"
              className="absolute top-[26px] right-0.5 bottom-0 left-5 -rotate-[2.5deg] rounded-[4px] border bg-paper-back"
            />
            <IndexCard
              elevation="lifted"
              aria-labelledby="shelf-title"
              className="relative rotate-[0.8deg]"
            >
              <IndexCardHeader className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
                <IndexCardTitle id="shelf-title">On the shelf now</IndexCardTitle>
                <Suspense fallback={null}>
                  <Today />
                </Suspense>
              </IndexCardHeader>
              <PublicToolListBoundary>
                <Suspense fallback={<PublicToolListSkeleton />}>
                  <Shelf />
                </Suspense>
              </PublicToolListBoundary>
              <Suspense fallback={<ShelfNote signedIn={false} placeholder />}>
                <Show when="signed-in" fallback={<ShelfNote signedIn={false} />}>
                  <ShelfNote signedIn />
                </Show>
              </Suspense>
            </IndexCard>
          </div>
        </div>
      </main>
    </div>
  );
}

/** Preloads the public list for this request, then hands it to the live client list. */
async function Shelf() {
  await connection();
  const preloaded = await preloadQuery(api.tools.listPublic).catch((error: unknown) => {
    console.error("[landing] tools:listPublic failed", error);
    return null;
  });
  if (!preloaded) return <PublicToolListError />;
  return <PublicToolList preloaded={preloaded} />;
}

/** Today's date in the card corner. UTC, like "on loan today" in listPublic. */
async function Today() {
  await connection();
  const today = todayUtc();
  const { short, long } = dayLabels(today);
  return (
    <time
      dateTime={today}
      className="font-mono text-xs font-medium tracking-[0.08em] text-ink-muted uppercase"
    >
      <span aria-hidden="true">{short}</span>
      <span className="sr-only">{long}</span>
    </time>
  );
}

function ShelfNote({ signedIn, placeholder }: { signedIn: boolean; placeholder?: boolean }) {
  return (
    <p
      aria-hidden={placeholder || undefined}
      className={cn(
        "flex items-center gap-2 px-6 pt-4 pb-[22px] text-sm leading-snug text-ink-soft",
        placeholder && "invisible",
      )}
    >
      {signedIn ? (
        <>
          <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
          The board shows who&apos;s lending and which days are free.
        </>
      ) : (
        <>
          <Lock aria-hidden="true" className="size-4 shrink-0 text-ink-muted" strokeWidth={1.75} />
          Sign in to see who&apos;s lending and to pick your dates.
        </>
      )}
    </p>
  );
}
