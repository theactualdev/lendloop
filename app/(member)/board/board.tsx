"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { catchError, type ErrorInfo } from "next/error";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CATEGORY_LABELS, type Category } from "@/convex/lib/constants";
import type { ToolCard } from "@/convex/tools";
import { StripLegend } from "@/components/availability-strip";
import { CategoryTabs } from "@/components/category-tabs";
import { RequestCard } from "@/components/request-card";
import { ToolRow, ToolRowHeader } from "@/components/tool-row";
import { TrustedStar } from "@/components/trusted-star";
import { YourLoans } from "@/components/your-loans";
import { Button, buttonVariants } from "@/components/ui/button";
import { boardSearch, readBoardParams, type BoardParams } from "@/lib/board-params";
import { dayLabels, type DayRange } from "@/lib/dates";
import { messageFor } from "@/lib/errors";
import { useStableQuery } from "@/lib/use-stable-query";
import { useTodayUtc } from "@/lib/use-today";
import { cn } from "@/lib/utils";
import { DateBar } from "./date-bar";

/*
 * The board (screen D). Dates and category live in the URL (`?from=&to=`,
 * `?category=`); bad values are dropped quietly. The list and the request card
 * read the same tools.list subscription (Convex shares identical queries), each
 * inside its own error boundary.
 */

const GUTTER = "px-[clamp(16px,4vw,48px)]";
/** From here the request card sits beside the list instead of under it. */
const SIDE_BY_SIDE = "(min-width: 1060px)";

type ListArgs = { category?: Category; from?: string; to?: string };

export function Board() {
  const today = useTodayUtc();
  if (today === null) return <BoardSkeleton />;
  return <BoardForDay today={today} />;
}

function BoardForDay({ today }: { today: string }) {
  const searchParams = useSearchParams();
  const { category, range } = readBoardParams(searchParams, today);
  const cardId = useId();
  const [search, setSearch] = useState("");
  const [hideBooked, setHideBooked] = useState(false);
  const [pickedId, setPickedId] = useState<Id<"tools"> | null>(null);

  // Drop malformed params from the address bar too (no toast: it's just a bad link).
  const from = range?.from;
  const to = range?.to;
  useEffect(() => {
    const clean = boardSearch({ category, range: from && to ? { from, to } : null });
    if (window.location.search !== clean) {
      window.history.replaceState(null, "", `${window.location.pathname}${clean}`);
    }
  }, [category, from, to]);

  // Next.js syncs history.pushState/replaceState into useSearchParams without a
  // server round trip, but a render later. So build the next URL from the
  // address bar itself, never from this render's (possibly older) params.
  function go(change: Partial<BoardParams>, mode: "push" | "replace") {
    const current = readBoardParams(new URLSearchParams(window.location.search), today);
    const url = `${window.location.pathname}${boardSearch({ ...current, ...change })}`;
    if (mode === "push") window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  }
  const setRange = (next: DayRange | null) => go({ range: next }, "replace");
  const setCategory = (next: Category | null) => go({ category: next }, "push");

  function pick(toolId: Id<"tools">) {
    setPickedId(toolId);
    // Stacked layout: bring the card into view and move focus there.
    if (!window.matchMedia(SIDE_BY_SIDE).matches) {
      const card = document.getElementById(cardId);
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      card?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
      card?.focus({ preventScroll: true });
    }
  }

  const args: ListArgs = {
    ...(category ? { category } : {}),
    ...(range ? { from: range.from, to: range.to } : {}),
  };

  return (
    <div className={cn("mx-auto w-full max-w-[1280px]", GUTTER)}>
      <BoardIntro today={today} search={search} onSearch={setSearch} />
      <DateBar
        today={today}
        range={range}
        onRangeChange={setRange}
        hideBooked={hideBooked}
        onHideBookedChange={setHideBooked}
      />

      <div className="mt-8 grid grid-cols-1 items-start gap-x-7 gap-y-10 min-[1060px]:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-labelledby={`${cardId}-tools`} className="min-w-0">
          <h2 id={`${cardId}-tools`} className="sr-only">
            Tools
          </h2>
          <CategoryTabs value={category} onChange={setCategory} />
          <ToolListBoundary>
            <ToolList
              args={args}
              today={today}
              range={range}
              category={category}
              search={search}
              hideBooked={hideBooked && range !== null}
              pickedId={pickedId}
              onPick={pick}
              cardId={cardId}
              onShowAll={() => setCategory(null)}
              onClearSearch={() => setSearch("")}
              onShowBooked={() => setHideBooked(false)}
            />
          </ToolListBoundary>
          <StripLegend className="mt-3.5 pl-1">
            <li className="inline-flex items-center gap-1.5">
              <TrustedStar />
              Trusted lender
            </li>
          </StripLegend>
        </section>

        <aside
          aria-label="Request a tool"
          className="grid min-w-0 items-start gap-8 md:max-[1059px]:grid-cols-2 min-[1060px]:pt-[47px]"
        >
          <PickedCardBoundary cardId={cardId} today={today} range={range} onRangeChange={setRange}>
            <PickedCard
              args={args}
              pickedId={pickedId}
              cardId={cardId}
              today={today}
              range={range}
              onRangeChange={setRange}
            />
          </PickedCardBoundary>
          <YourLoans today={today} />
        </aside>
      </div>
    </div>
  );
}

function BoardIntro({
  today,
  search,
  onSearch,
}: {
  today: string;
  search: string;
  onSearch: (value: string) => void;
}) {
  const searchId = useId();
  return (
    <div className="flex flex-wrap items-end justify-between gap-6 pt-10">
      <div className="min-w-0 flex-[1_1_420px]">
        <p className="font-mono text-xs font-semibold tracking-[0.12em] text-ink-muted uppercase">
          {dayLabels(today).long}
        </p>
        <h1 className="mt-2.5 text-[clamp(40px,5vw,60px)] leading-none font-extrabold tracking-[-0.02em]">
          The board
        </h1>
        <p className="mt-3 max-w-[54ch] text-[17px] leading-[1.55] text-pretty text-ink-soft">
          Choose your dates, then a tool. Each strip shows the next three weeks; dark days are already
          booked.
        </p>
      </div>
      <div className="flex min-w-0 flex-[0_1_320px] flex-col gap-2 max-sm:flex-auto">
        <label htmlFor={searchId} className="text-sm font-semibold">
          Search the catalog
        </label>
        <input
          id={searchId}
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Drill, ladder, tent…"
          className="h-12 w-full rounded-lg border border-control bg-paper px-4 text-base text-ink placeholder:text-ink-muted"
        />
      </div>
    </div>
  );
}

// ---- the list -------------------------------------------------------------

function matches(tool: ToolCard, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [tool.name, tool.shortCode, tool.description].some((text) => text.toLowerCase().includes(q));
}

function ToolList({
  args,
  today,
  range,
  category,
  search,
  hideBooked,
  pickedId,
  onPick,
  cardId,
  onShowAll,
  onClearSearch,
  onShowBooked,
}: {
  args: ListArgs;
  today: string;
  range: DayRange | null;
  category: Category | null;
  search: string;
  hideBooked: boolean;
  pickedId: Id<"tools"> | null;
  onPick: (toolId: Id<"tools">) => void;
  cardId: string;
  onShowAll: () => void;
  onClearSearch: () => void;
  onShowBooked: () => void;
}) {
  const { data: tools, stale } = useStableQuery(api.tools.list, args);
  if (tools === undefined) return <ToolListSkeleton today={today} range={range} />;

  const shown = tools.filter(
    (tool) => matches(tool, search) && !(hideBooked && tool.freeInRange === false),
  );

  let empty = null;
  if (tools.length === 0 && category) {
    empty = (
      <ListEmpty
        title={`Nothing in ${CATEGORY_LABELS[category]} yet.`}
        body="Try another shelf, or list one of yours."
        action={
          <Button variant="outline" onClick={onShowAll}>
            Show all tools
          </Button>
        }
      />
    );
  } else if (tools.length === 0) {
    empty = (
      <ListEmpty
        title="Nothing on the shelf yet."
        body="When neighbors list tools, they show up here with their next three weeks."
        action={
          <Link href="/listings" className={buttonVariants({ variant: "outline" })}>
            List a tool
          </Link>
        }
      />
    );
  } else if (shown.length === 0 && search.trim()) {
    empty = (
      <ListEmpty
        title={`No tools match “${search.trim()}”.`}
        body="Check the spelling, or try a shorter word."
        action={
          <Button variant="outline" onClick={onClearSearch}>
            Clear search
          </Button>
        }
      />
    );
  } else if (shown.length === 0) {
    empty = (
      <ListEmpty
        title="Every tool here is booked on your dates."
        body="Try other dates, or show the booked tools and ask anyway."
        action={
          <Button variant="outline" onClick={onShowBooked}>
            Show booked tools
          </Button>
        }
      />
    );
  }

  return (
    <ListFrame>
      <ToolRowHeader today={today} selection={range} />
      {empty ?? (
        <ul
          role="list"
          aria-label="Tools"
          aria-busy={stale || undefined}
          className={cn("transition-opacity", stale && "opacity-60")}
        >
          {shown.map((tool) => (
            <ToolRow
              key={tool._id}
              tool={tool}
              today={today}
              selection={range}
              selected={tool._id === pickedId}
              onSelect={onPick}
              controls={cardId}
            />
          ))}
        </ul>
      )}
    </ListFrame>
  );
}

/** The white sheet under the tabs; its width drives the rows' container queries. */
function ListFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="@container/list overflow-hidden rounded-[0_12px_12px_12px] border bg-paper">
      {children}
    </div>
  );
}

function ListEmpty({ title, body, action }: { title: string; body: string; action: React.ReactNode }) {
  return (
    <div className="border-t border-divider px-5 py-8">
      <p className="font-heading text-xl font-bold">{title}</p>
      <p className="mt-1.5 max-w-[48ch] text-[15px] leading-normal text-ink-soft">{body}</p>
      <div className="mt-4">{action}</div>
    </div>
  );
}

const SKELETON_ROWS = ["58%", "44%", "66%", "50%", "38%", "60%"];

function ToolListSkeleton({ today, range }: { today: string; range: DayRange | null }) {
  return (
    <ListFrame>
      <ToolRowHeader today={today} selection={range} />
      <div role="status">
        <span className="sr-only">Loading the board…</span>
        <ul role="list" aria-hidden="true">
          {SKELETON_ROWS.map((width) => (
            <li
              key={width}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2.5 border-t border-divider px-4 py-4 @[620px]/list:grid-cols-[56px_minmax(150px,1.2fr)_minmax(200px,2fr)_120px] @[620px]/list:px-5"
            >
              <span className="hidden h-3 w-12 self-center rounded-sm bg-divider motion-safe:animate-pulse @[620px]/list:block" />
              <span className="flex flex-col gap-2">
                <span className="h-4 rounded-sm bg-divider motion-safe:animate-pulse" style={{ width }} />
                <span className="h-2.5 w-14 rounded-sm bg-divider motion-safe:animate-pulse" />
              </span>
              <span className="col-span-2 flex gap-0.5 @[620px]/list:col-span-1 @[620px]/list:self-center">
                {Array.from({ length: 21 }, (_, i) => (
                  <span key={i} className="h-[26px] flex-1 rounded-[2px] bg-divider motion-safe:animate-pulse" />
                ))}
              </span>
              <span className="hidden h-3 w-20 self-center rounded-sm bg-divider motion-safe:animate-pulse @[620px]/list:block" />
            </li>
          ))}
        </ul>
      </div>
    </ListFrame>
  );
}

function ToolListError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <ListFrame>
      <div role="alert" className="px-5 py-8">
        <p className="font-heading text-xl font-bold">We couldn&apos;t load the board.</p>
        <p className="mt-1.5 max-w-[48ch] text-[15px] leading-normal text-ink-soft">{messageFor(error)}</p>
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </ListFrame>
  );
}

const ToolListBoundary = catchError(function ToolListFallback(_props: object, { error, retry }: ErrorInfo) {
  return <ToolListError error={error} onRetry={retry} />;
});

// ---- the request card -----------------------------------------------------

type CardProps = {
  cardId: string;
  today: string;
  range: DayRange | null;
  onRangeChange: (range: DayRange) => void;
};

/** The card for the picked tool, live from the same tools.list subscription as the rows. */
function PickedCard({ args, pickedId, ...card }: CardProps & { args: ListArgs; pickedId: Id<"tools"> | null }) {
  const { data: tools } = useStableQuery(api.tools.list, args);
  const tool = (pickedId && tools?.find((t) => t._id === pickedId)) || null;
  return <CardFor tool={tool} {...card} />;
}

function CardFor({ tool, cardId, today, range, onRangeChange }: CardProps & { tool: ToolCard | null }) {
  return (
    <RequestCard
      id={cardId}
      tool={tool}
      today={today}
      selection={range}
      onSelectionChange={onRangeChange}
    />
  );
}

// If tools.list fails, the list shows the error; the card falls back to "Pick a tool".
const PickedCardBoundary = catchError(function PickedCardFallback(props: CardProps) {
  return <CardFor tool={null} {...props} />;
});

// ---- loading --------------------------------------------------------------

export function BoardSkeleton() {
  return (
    <div role="status" className={cn("mx-auto w-full max-w-[1280px] pt-10", GUTTER)}>
      <span className="sr-only">Loading the board…</span>
      <div aria-hidden="true" className="flex flex-col gap-4">
        <span className="h-3 w-44 rounded-sm bg-divider motion-safe:animate-pulse" />
        <span className="h-12 w-64 max-w-full rounded-sm bg-divider motion-safe:animate-pulse" />
        <span className="h-4 w-[28rem] max-w-full rounded-sm bg-divider motion-safe:animate-pulse" />
        <span className="mt-4 h-[78px] w-full rounded-[10px] bg-divider motion-safe:animate-pulse" />
      </div>
    </div>
  );
}
