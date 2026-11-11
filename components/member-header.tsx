"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { catchError } from "next/error";
import { UserButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { buttonVariants } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { cn } from "@/lib/utils";

/*
 * The signed-in header (screen D): wordmark, the main nav, "List a tool" and
 * the Clerk account button. Admin appears only for admins; that is a UX nicety,
 * Convex enforces the role on every admin function.
 */

const GUTTER = "px-[clamp(16px,4vw,48px)]";

const NAV = [
  { href: "/board", label: "Board" },
  { href: "/listings", label: "My listings" },
  { href: "/requests", label: "My requests" },
  { href: "/incoming", label: "Incoming" },
] as const;

const ADMIN = { href: "/admin", label: "Admin" } as const;

export function MemberHeader() {
  const pathname = usePathname();
  // viewer never throws: it is null until ensureUser has created the row.
  const viewer = useQuery(api.users.viewer);
  const links = viewer?.role === "admin" ? [...NAV, ADMIN] : NAV;

  return (
    <header className="border-b bg-header">
      <a
        href="#main"
        className="sr-only rounded-md bg-paper px-4 py-2 font-semibold focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
      >
        Skip to content
      </a>
      {/*
        One wrapping row in DOM order, as in the D file: wordmark, nav, actions.
        Narrow screens wrap it (nav under the wordmark, actions after the nav),
        so the tab order always follows what is on screen. No CSS reordering.
      */}
      <div className={cn("flex flex-wrap items-center gap-x-8 gap-y-1 py-3", GUTTER)}>
        <Wordmark />
        <nav aria-label="Main" className="min-w-0 flex-[1_1_auto] max-lg:-ml-2.5 lg:basis-0">
          <ul role="list" className="flex flex-wrap gap-x-2">
            {links.map((link) => {
              const current = pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center gap-2 px-2.5 text-[15px] no-underline transition-colors",
                      current
                        ? "font-bold text-ink shadow-[inset_0_-3px_0_var(--ll-ink)]"
                        : "font-medium text-ink-quiet hover:text-ink",
                    )}
                  >
                    {link.label}
                    {link.href === "/incoming" && viewer ? (
                      <IncomingBadgeBoundary>
                        <IncomingBadge />
                      </IncomingBadgeBoundary>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <Link href="/listings" className={buttonVariants({ className: "max-[379px]:px-3.5" })}>
            List a tool
          </Link>
          <div className="flex size-11 items-center justify-center">
            <UserButton />
          </div>
        </div>
      </div>
    </header>
  );
}

/** How many requests wait for the viewer's answer. Only mounted once the viewer exists. */
function IncomingBadge() {
  const incoming = useQuery(api.loans.incoming);
  const waiting = incoming?.filter((loan) => loan.status === "pending").length ?? 0;
  if (waiting === 0) return null;
  return (
    <>
      <span
        aria-hidden="true"
        className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-violet px-1.5 font-mono text-[11px] font-semibold text-paper"
      >
        {waiting}
      </span>
      <span className="sr-only">, {waiting} waiting</span>
    </>
  );
}

// The badge is a nicety: if its query fails, show no badge rather than break the header.
const IncomingBadgeBoundary = catchError(function NoBadge() {
  return null;
});
