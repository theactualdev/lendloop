"use client";

import { catchError, type ErrorInfo } from "next/error";
import { useRouter } from "next/navigation";
import { usePreloadedQuery, type Preloaded } from "convex/react";
import type { api } from "@/convex/_generated/api";
import { CATEGORY_LABELS } from "@/convex/lib/constants";
import { Button } from "@/components/ui/button";

/*
 * The "On the shelf now" list on the public landing page (screen D1).
 * Every row is a line on the index card: name, dotted leader, category.
 * It shows only what api.tools.listPublic returns (name and category); there is
 * no owner data on this page.
 */

type PreloadedShelf = Preloaded<typeof api.tools.listPublic>;

// One ruled line of the card. Text sits on the blue line, as on D1.
const LINE = "flex min-h-[52px] items-baseline gap-2.5 border-b border-card-line pt-5";

/**
 * Server-preloaded, then live: the first render uses the preloaded rows, after
 * which the Convex subscription keeps the list current.
 */
export function PublicToolList({ preloaded }: { preloaded: PreloadedShelf }) {
  const tools = usePreloadedQuery(preloaded);

  if (tools.length === 0) return <PublicToolListEmpty />;

  return (
    <ul role="list" className="px-6">
      {tools.map((tool, index) => (
        // listPublic deliberately returns no ids, and names can repeat.
        <li key={`${index}:${tool.name}`} className={LINE}>
          <span className="min-w-0 font-heading text-lg leading-snug font-bold">{tool.name}</span>
          <span aria-hidden="true" className="min-w-4 flex-1 border-b-2 border-dotted border-leader" />
          <span className="sr-only">, </span>
          <span className="shrink-0 font-mono text-[11px] font-semibold tracking-[0.1em] text-ink-muted uppercase">
            {CATEGORY_LABELS[tool.category]}
          </span>
        </li>
      ))}
    </ul>
  );
}

const SKELETON_WIDTHS = ["58%", "42%", "66%", "50%", "38%", "60%"];

/** Loading: blank ruled lines with bars where the names and categories go. */
export function PublicToolListSkeleton() {
  return (
    <div role="status">
      <span className="sr-only">Loading the shelf…</span>
      <ul role="list" aria-hidden="true" className="px-6">
        {SKELETON_WIDTHS.map((width) => (
          <li key={width} className={LINE}>
            <span
              className="h-3.5 shrink-0 rounded-sm bg-divider motion-safe:animate-pulse"
              style={{ width }}
            />
            <span className="min-w-4 flex-1" />
            <span className="h-2.5 w-16 shrink-0 rounded-sm bg-divider motion-safe:animate-pulse" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Empty: nothing listed, or everything is out on loan today. */
export function PublicToolListEmpty() {
  return (
    <div className="px-6">
      <p className={`${LINE} font-heading text-lg font-bold`}>The shelf is empty right now.</p>
      <p className={`${LINE} pb-1 text-[15px] leading-snug text-ink-soft`}>
        Tools show up here when a neighbor lists one or brings one back.
      </p>
    </div>
  );
}

/** Error: the list could not be loaded. `onRetry` defaults to refreshing the page data. */
export function PublicToolListError({ onRetry }: { onRetry?: () => void }) {
  const router = useRouter();
  return (
    <div role="alert" className="px-6">
      <p className={`${LINE} font-heading text-lg font-bold`}>We couldn&apos;t reach the shelf.</p>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-card-line py-3.5">
        <p className="text-[15px] leading-snug text-ink-soft">Check your connection, then try again.</p>
        <Button variant="outline" onClick={() => (onRetry ? onRetry() : router.refresh())}>
          Try again
        </Button>
      </div>
    </div>
  );
}

/** Catches errors from the live subscription (and the server render under it). */
export const PublicToolListBoundary = catchError(function ShelfErrorFallback(
  _props: object,
  { retry }: ErrorInfo,
) {
  return <PublicToolListError onRetry={retry} />;
});
