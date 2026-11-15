"use client";

import Link from "next/link";
import { catchError, type ErrorInfo } from "next/error";
import { ListError } from "@/components/list-state";
import { PageFrame, PageIntro } from "@/components/page-intro";
import { buttonVariants } from "@/components/ui/button";
import { LoansTable } from "@/components/admin/loans-table";
import { NeedsAttention } from "@/components/admin/needs-attention";
import { ListingsPanel } from "@/components/admin/listings-panel";
import { TrustedLenders } from "@/components/admin/trusted-lenders";
import { errorCode } from "@/lib/errors";

/*
 * Screen D5, the admin console. One page: every loan on the left; what needs
 * attention, listings and trusted lenders on the right. The Admin nav item is
 * hidden for non-admins, but that is cosmetic: every admin function in Convex
 * throws FORBIDDEN for anyone else, and that is what turns this page into the
 * "Not authorized" state below. No admin data is rendered for a non-admin.
 */
export function AdminConsole() {
  return (
    <ConsoleBoundary>
      <PageFrame>
        <PageIntro eyebrow="Admin" title="The whole board">
          Every loan and listing in the neighborhood, and the emails and reminders sent about them.
        </PageIntro>
        <div className="mt-8 flex flex-wrap items-start gap-x-7 gap-y-10">
          <LoansTable />
          <aside
            aria-label="Attention, listings and lenders"
            className="flex min-w-0 flex-[1_1_320px] flex-col gap-6 lg:pt-12"
          >
            <NeedsAttention />
            <ListingsPanel />
            <TrustedLenders />
          </aside>
        </div>
      </PageFrame>
    </ConsoleBoundary>
  );
}

function NotAuthorized() {
  return (
    <PageFrame>
      <section aria-labelledby="not-authorized-title" className="pt-10">
        <p className="font-mono text-xs font-semibold tracking-[0.12em] text-ink-muted uppercase">Admin</p>
        <h1
          id="not-authorized-title"
          className="mt-2.5 font-heading text-[clamp(38px,4.6vw,56px)] leading-none font-extrabold tracking-[-0.02em]"
        >
          Not authorized
        </h1>
        <p className="mt-3 max-w-[60ch] text-[17px] leading-[1.55] text-ink-soft">
          This page is for LendLoop admins, and your account isn&apos;t one. Nothing from it was loaded.
        </p>
        <Link href="/board" className={buttonVariants({ size: "lg", className: "mt-6" })}>
          Back to the Board
        </Link>
      </section>
    </PageFrame>
  );
}

const ConsoleBoundary = catchError(function ConsoleFallback(_props: object, { error, retry }: ErrorInfo) {
  if (errorCode(error) === "FORBIDDEN") return <NotAuthorized />;
  return (
    <PageFrame>
      <ListError title="We couldn't load the admin console." error={error} onRetry={retry} className="mt-10" />
    </PageFrame>
  );
});
