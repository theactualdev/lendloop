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
        Below `xl` (1280px) the header has two rows: the wordmark and the account
        button, then one row with the nav and "List a tool" as its last item. That
        row never wraps; when it is too narrow (phones, an admin's 5th tab) it
        scrolls sideways through the ScrollRow, with an edge fade. From `xl` up
        the swipe row is `display: contents` and everything sits on one row:
        wordmark, nav, "List a tool", account. Below `sm` (Ruling R32) the
        "List a tool" action is quieter and the tabs sit on the header's bottom
        edge. The account button is rendered in both places and CSS shows one;
        the hidden one is not focusable.
      */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-8 gap-y-1 py-3 max-xl:pb-0 max-sm:gap-y-1.5 max-sm:pt-2 xl:flex-nowrap",
          GUTTER,
        )}
      >
        <Wordmark />
        {/* pt-2 lowers the avatar onto the wordmark's optical centre (the wordmark has its own top padding). */}
        <AccountButton className="ml-auto pt-2 xl:hidden" />
        <ScrollRow
          revealKey={pathname}
          className={cn(
            "max-xl:grow max-xl:basis-full max-xl:items-center xl:contents",
            // Bleed to the screen edges; the padding leaves room for focus outlines.
            "max-xl:-mx-[clamp(16px,4vw,48px)] max-xl:-my-1.5 max-xl:px-[clamp(16px,4vw,48px)] max-xl:py-1.5",
          )}
        >
          <nav aria-label="Main" className="flex-none max-xl:-ml-2.5 xl:min-w-max xl:flex-[1_1_auto] xl:basis-0">
            <ul role="list" className="flex flex-nowrap gap-x-2">
              {links.map((link) => {
                const current = pathname === link.href || pathname.startsWith(`${link.href}/`);
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={current ? "page" : undefined}
                      className={cn(
                        "flex min-h-11 items-center gap-2 px-2.5 text-[15px] no-underline transition-colors whitespace-nowrap",
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
          <div className="ml-auto flex items-center gap-3 max-xl:shrink-0 max-sm:gap-2 max-sm:pl-2 max-sm:before:h-5 max-sm:before:w-px max-sm:before:bg-border">
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
            <AccountButton className="max-xl:hidden" />
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
