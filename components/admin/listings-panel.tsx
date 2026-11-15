"use client";

import { useId, useRef, useState, type RefObject } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { adminSection } from "@/components/admin/section-boundary";
import { ListEmpty, ListSkeleton } from "@/components/list-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { shortDay } from "@/lib/dates";
import { neighborName } from "@/lib/names";
import { backOn } from "@/lib/tool-status";
import { useCardAction } from "@/lib/use-card-action";
import { useTodayUtc } from "@/lib/use-today";
import { cn } from "@/lib/utils";

/*
 * Listings (screen D5): every active tool, with Remove. Removing hides the tool
 * from the board and declines its pending requests (those neighbors are
 * emailed); a loan that's already out stays as it is. Convex enforces admin.
 */

type Tool = FunctionReturnType<typeof api.tools.list>[number];

const Boundary = adminSection("We couldn't load the listings.");

/** The reason limit, counted on the trimmed text, as the server does. */
const REASON_MAX = 280;
const PREVIEW = 6;

export function ListingsPanel() {
  // A removed listing's row disappears with its Remove button, so focus goes here instead.
  const headingRef = useRef<HTMLHeadingElement>(null);
  return (
    <section aria-labelledby="listings-title" className="rounded-[4px] border bg-paper">
      <div className="px-5 pt-4 pb-1">
        <h2 id="listings-title" ref={headingRef} tabIndex={-1} className="font-heading text-[22px] font-extrabold">
          Listings
        </h2>
        <p className="mt-2 text-[13px] leading-normal text-ink-soft">
          Removing a listing hides it from the board and declines its pending requests. A loan that&apos;s already out
          stays as it is.
        </p>
      </div>
      <Boundary>
        <ListingRows headingRef={headingRef} />
      </Boundary>
    </section>
  );
}

function ListingRows({ headingRef }: { headingRef: RefObject<HTMLElement | null> }) {
  const tools = useQuery(api.tools.list, {});
  const today = useTodayUtc();
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);
  const searchId = useId();
  if (tools === undefined || today === null) return <ListSkeleton label="Loading listings…" rows={2} className="px-5 py-4" />;
  if (tools.length === 0) {
    return (
      <div className="px-5 pt-3 pb-5">
        <ListEmpty title="No listings yet.">Tools neighbors list appear here.</ListEmpty>
      </div>
    );
  }

  const needle = query.trim().toLowerCase();
  const matches = needle
    ? tools.filter((t) =>
        [t.name, t.shortCode, t.ownerFirstName].some((field) => field.toLowerCase().includes(needle)),
      )
    : tools;
  const visible = all || needle ? matches : matches.slice(0, PREVIEW);

  return (
    <>
      <div className="px-5 pt-3 pb-2">
        <label htmlFor={searchId} className="text-[13px] font-semibold">
          Find a listing
        </label>
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          placeholder="Name, code or owner"
          className="mt-1 box-border h-11 w-full rounded-md border border-control bg-paper px-3 text-[15px] text-ink placeholder:text-ink-muted"
        />
        <p aria-live="polite" className="mt-1.5 text-xs text-ink-muted">
          {needle ? `${matches.length} of ${tools.length} listings` : `${tools.length} listings`}
        </p>
      </div>
      {visible.length === 0 ? (
        <p className="border-t border-divider px-5 py-4 text-[14px] text-ink-soft">No listing matches that.</p>
      ) : (
        <ul role="list" className="px-5">
          {visible.map((tool) => (
            <ListingRow key={tool._id} tool={tool} today={today} headingRef={headingRef} />
          ))}
        </ul>
      )}
      {!needle && matches.length > PREVIEW ? (
        <div className="border-t border-divider px-5 pt-1 pb-3">
          <Button variant="ghost" aria-expanded={all} onClick={() => setAll((v) => !v)} className="-ml-3.5 px-3.5 font-bold">
            {all ? "Show fewer" : `Show all ${matches.length} listings`}
          </Button>
        </div>
      ) : null}
    </>
  );
}

function ListingRow({
  tool,
  today,
  headingRef,
}: {
  tool: Tool;
  today: string;
  headingRef: RefObject<HTMLElement | null>;
}) {
  const back = backOn(tool.bookings, today);
  const asking = tool.bookings.filter((b) => b.kind === "requested").length;
  const status =
    tool.availability === "on_loan" ? (back ? `out until ${shortDay(back)}` : "overdue") : "available";
  return (
    <li className="flex items-center justify-between gap-3 border-t border-divider py-3">
      <span className="min-w-0">
        <span className="block font-heading text-base leading-tight font-bold">{tool.name}</span>
        <span className="block text-[13px] text-ink-muted">
          <span className="font-mono text-xs">{tool.shortCode}</span> · {neighborName(tool.ownerFirstName, { article: "a" })} ·{" "}
          {status}
          {asking > 0 ? ` · ${asking === 1 ? "1 request" : `${asking} requests`}` : null}
        </span>
      </span>
      <RemoveListing tool={tool} pendingRequests={asking} headingRef={headingRef} />
    </li>
  );
}

function RemoveListing({
  tool,
  pendingRequests,
  headingRef,
}: {
  tool: Tool;
  pendingRequests: number;
  headingRef: RefObject<HTMLElement | null>;
}) {
  const remove = useMutation(api.admin.removeListing);
  const { busy, run } = useCardAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const removed = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const counterId = useId();
  const reasonId = useId();

  const trimmed = reason.trim().length;
  const over = trimmed > REASON_MAX;

  function openDialog() {
    setReason("");
    removed.current = false;
    setOpen(true);
  }

  async function confirm() {
    if (over) return;
    const clean = reason.trim();
    const ok = await run(
      () => remove({ toolId: tool._id, ...(clean ? { reason: clean } : {}) }),
      () => toast.success(`Removed ${tool.name}`, { description: "It's off the board. Pending requests were declined." }),
    );
    // On success the row goes away with the tool; on failure the dialog stays open with its toast.
    if (ok) {
      removed.current = true;
      setOpen(false);
    }
  }

  return (
    <>
      <Button
        ref={triggerRef}
        variant="destructive"
        aria-label={`Remove ${tool.name}`}
        onClick={openDialog}
        className="shrink-0 px-3.5"
      >
        Remove
      </Button>
      <AlertDialog open={open} onOpenChange={(next) => (busy ? undefined : setOpen(next))}>
        <AlertDialogContent
          // The row is about to disappear, so a successful remove hands focus to the panel heading; Keep it returns to Remove.
          finalFocus={() => (removed.current ? (headingRef.current ?? true) : true)}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {tool.name}?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            It leaves the board for good. Pending requests on it are declined and those neighbors are emailed
            {pendingRequests > 0 ? ` (${pendingRequests === 1 ? "1 right now" : `${pendingRequests} right now`})` : null}.
            A loan that&apos;s already out stays as it is.
          </AlertDialogDescription>
          <div className="px-[22px] pt-4">
            <label htmlFor={reasonId} className="text-sm font-semibold">
              Reason <span className="font-normal text-ink-muted">(optional)</span>
            </label>
            <textarea
              id={reasonId}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-describedby={counterId}
              aria-invalid={over ? true : undefined}
              disabled={busy}
              className="mt-1.5 box-border w-full resize-y rounded-md border border-control bg-paper px-3.5 py-3 text-[15px] leading-normal text-ink aria-invalid:border-alert"
            />
            <p
              id={counterId}
              aria-live="polite"
              className={cn("mt-1 text-right font-mono text-xs", over ? "font-semibold text-alert-ink" : "text-ink-muted")}
            >
              {trimmed} / {REASON_MAX}
              {over ? " · too long" : null}
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep it</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy || over} onClick={confirm}>
              {busy ? "Removing…" : "Remove tool"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
