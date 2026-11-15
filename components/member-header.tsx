"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { catchError } from "next/error";
import { UserButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { ScrollRow } from "@/components/scroll-row";
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
        DOM order is visual order at every width; nothing is reordered with CSS.
        From `sm` up: one wrapping row, as in the D file (wordmark, nav, "List a
        tool", account). The swipe row is `display: contents` there, so the nav
        and actions are plain items of that row.
        Below `sm` (Ruling R32), two rows: the wordmark and the account button,
        then one swipeable row with the nav and "List a tool" as its last item.
        Its tabs sit on the header's bottom edge. The account button is rendered
        in both places and CSS shows one; the hidden one is not focusable.
      */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-8 gap-y-1 py-3 max-sm:gap-y-1.5 max-sm:pt-2 max-sm:pb-0",
          GUTTER,
        )}
      >
        <Wordmark />
        {/* pt-2 lowers the avatar onto the wordmark's optical centre (the wordmark has its own top padding). */}
        <AccountButton className="ml-auto pt-2 sm:hidden" />
        <ScrollRow
          revealKey={pathname}
          className={cn(
            "max-sm:grow max-sm:basis-full max-sm:items-center sm:contents",
            // Bleed to the screen edges; the padding leaves room for focus outlines.
            "max-sm:-mx-[clamp(16px,4vw,48px)] max-sm:-my-1.5 max-sm:px-[clamp(16px,4vw,48px)] max-sm:py-1.5",
          )}
        >
          <nav aria-label="Main" className="min-w-0 flex-[1_1_auto] max-lg:-ml-2.5 max-sm:flex-none lg:basis-0">
            <ul role="list" className="flex flex-wrap gap-x-2 max-sm:flex-nowrap">
              {links.map((link) => {
                const current = pathname === link.href || pathname.startsWith(`${link.href}/`);
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={current ? "page" : undefined}
                      className={cn(
                        "flex min-h-11 items-center gap-2 px-2.5 text-[15px] no-underline transition-colors max-sm:whitespace-nowrap",
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
          <div className="ml-auto flex items-center gap-3 max-sm:shrink-0 max-sm:gap-2 max-sm:pl-2 max-sm:before:h-5 max-sm:before:w-px max-sm:before:bg-border">
            {/* Below `sm` it is a violet text action after a hairline, not a filled button. */}
            <Link
              href="/listings#list-a-tool"
              className={buttonVariants({
                className:
                  "max-sm:gap-1.5 max-sm:bg-transparent max-sm:px-2.5 max-sm:text-violet max-sm:hover:bg-transparent max-sm:hover:text-ink",
              })}
            >
              <Plus aria-hidden="true" strokeWidth={2.5} className="sm:hidden" />
              List a tool
            </Link>
            <AccountButton className="max-sm:hidden" />
          </div>
        </ScrollRow>
      </div>
    </header>
  );
}

function AccountButton({ className }: { className?: string }) {
  return (
    <div className={cn("flex size-11 items-center justify-center", className)}>
      <UserButton />
    </div>
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
