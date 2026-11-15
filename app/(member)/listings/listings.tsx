"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { catchError, type ErrorInfo } from "next/error";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { CATEGORY_LABELS, CONDITION_LABELS } from "@/convex/lib/constants";
import { AvailabilityStrip, StripLegend, StripScale } from "@/components/availability-strip";
import { ListEmpty, ListError, ListSkeleton } from "@/components/list-state";
import { PageFrame, PageIntro } from "@/components/page-intro";
import { Stamp } from "@/components/stamp";
import { ToolForm } from "@/components/tool-form";
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
import { toastError } from "@/lib/errors";
import { neighborName } from "@/lib/names";
import { backOn } from "@/lib/tool-status";
import { useTodayUtc } from "@/lib/use-today";
import { cn } from "@/lib/utils";

/*
 * Screen D2, My listings. The list of your tools sits beside the "List a tool"
 * card; the same card edits a tool when you press Edit on its row. The header's
 * "List a tool" link lands on the card with `#list-a-tool`.
 */

type ListedTool = FunctionReturnType<typeof api.tools.myListings>[number];

const FORM_ID = "list-a-tool";

export function Listings() {
  const [editing, setEditing] = useState<ListedTool | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  // "#list-a-tool" (the header link, also when already on this page) puts you in the Name field.
  useEffect(() => {
    const focusFromHash = () => {
      if (window.location.hash === `#${FORM_ID}`) nameRef.current?.focus();
    };
    focusFromHash();
    window.addEventListener("hashchange", focusFromHash);
    return () => window.removeEventListener("hashchange", focusFromHash);
  }, []);

  function edit(tool: ListedTool) {
    setEditing(tool);
    // The form is below the list on narrow screens: bring it into view, then focus it.
    formRef.current?.scrollIntoView({ block: "start" });
    window.setTimeout(() => nameRef.current?.focus(), 0);
  }

  return (
    <PageFrame>
      <PageIntro eyebrow="Your tools" title="My listings">
        What you lend, when it&apos;s out, and who&apos;s asking for it next.
      </PageIntro>
      <div className="mt-8 flex flex-wrap items-start gap-x-7 gap-y-10">
        <section aria-label="Your listings" className="min-w-0 flex-[999_1_620px]">
          <ListingsBoundary>
            <ListingsList onEdit={edit} editingId={editing?._id ?? null} />
          </ListingsBoundary>
        </section>
        <aside id={FORM_ID} ref={formRef} className="min-w-0 flex-[1_1_340px] scroll-mt-6">
          <ToolForm key={editing?._id ?? "new"} tool={editing ?? undefined} nameRef={nameRef} onDone={() => setEditing(null)} />
        </aside>
      </div>
    </PageFrame>
  );
}

// ---- the list ---------------------------------------------------------------

/** The wide row, shared by the header and the rows so the strips line up under the scale. */
const WIDE =
  "@[680px]/list:grid-cols-[64px_minmax(190px,1.3fr)_minmax(200px,1.6fr)_176px] @[680px]/list:items-center @[680px]/list:px-5";

function ListingsList({ onEdit, editingId }: { onEdit: (tool: ListedTool) => void; editingId: string | null }) {
  const today = useTodayUtc();
  const tools = useQuery(api.tools.myListings);
  const incoming = useQuery(api.loans.incoming);
  if (tools === undefined || today === null) return <ListSkeleton label="Loading your listings…" />;

  if (tools.length === 0) {
    return (
      <ListEmpty title="You haven't listed a tool yet.">
        Fill in the card to list your first one. Neighbors see it on the board straight away.
      </ListEmpty>
    );
  }

  // Short codes are unique and never reused, so they join a tool to its approved, unreturned loan.
  const borrowers = new Map<string, string>();
  for (const loan of [...(incoming ?? [])].sort((a, b) => a.startDate.localeCompare(b.startDate))) {
    if (loan.status === "approved" && !borrowers.has(loan.tool.shortCode)) {
      borrowers.set(loan.tool.shortCode, loan.counterpartFirstName);
    }
  }

  return (
    <>
      <div className="@container/list overflow-hidden rounded-xl border bg-paper">
        <div
          aria-hidden="true"
          className="hidden items-end gap-x-4 px-5 pt-4 pb-2.5 @[680px]/list:grid @[680px]/list:grid-cols-[64px_minmax(190px,1.3fr)_minmax(200px,1.6fr)_176px]"
        >
          <span className={HEAD}>No.</span>
          <span className={HEAD}>Tool</span>
          <StripScale today={today} />
          <span />
        </div>
        <ul role="list" className="m-0 list-none p-0">
          {tools.map((tool) => (
            <ListingRow
              key={tool._id}
              tool={tool}
              today={today}
              borrower={borrowers.get(tool.shortCode) ?? null}
              onEdit={onEdit}
              editing={editingId === tool._id}
            />
          ))}
        </ul>
      </div>
      <StripLegend
        kinds={["free", "booked", "requested", "overdue"]}
        labels={{ booked: "Lent out", requested: "Someone asked" }}
        className="mt-3.5 pl-1"
      />
    </>
  );
}

const HEAD = "font-mono text-[11px] font-semibold tracking-[0.1em] text-ink-faint uppercase";

function ListingRow({
  tool,
  today,
  borrower,
  onEdit,
  editing,
}: {
  tool: ListedTool;
  today: string;
  /** First name of whoever holds an approved, unreturned loan on this tool; null when nobody does. */
  borrower: string | null;
  onEdit: (tool: ListedTool) => void;
  editing: boolean;
}) {
  const noteId = useId();
  const back = backOn(tool.bookings, today);
  const overdue = tool.availability === "on_loan" && back === null;
  const out = tool.availability === "on_loan" || borrower !== null;
  const withName = neighborName(borrower, { article: "a" });

  return (
    <li
      className={cn(
        "grid grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-3 border-t border-divider px-4 py-[18px]",
        out
          ? "[grid-template-areas:'code'_'tool'_'strip'_'actions'_'note'] @[680px]/list:[grid-template-areas:'code_tool_strip_actions'_'._note_note_note']"
          : "[grid-template-areas:'code'_'tool'_'strip'_'actions'] @[680px]/list:[grid-template-areas:'code_tool_strip_actions']",
        WIDE,
        editing && "bg-selected-wash",
      )}
    >
      <span className="font-mono text-[13px] font-medium text-ink-muted [grid-area:code]">{tool.shortCode}</span>

      <div className="min-w-0 [grid-area:tool]">
        <h3 className="font-heading text-[19px] leading-[1.2] font-bold">{tool.name}</h3>
        <p className="mt-[3px] text-[13px] text-ink-muted">
          {CATEGORY_LABELS[tool.category]} · {CONDITION_LABELS[tool.condition]}
          {out && borrower !== null ? ` · with ${withName}` : null}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-2">
          {overdue ? (
            <Stamp tone="alert">Overdue</Stamp>
          ) : back !== null ? (
            <Stamp>Back {shortDay(back)}</Stamp>
          ) : tool.pendingCount === 0 ? (
            <span className="inline-flex items-center gap-[7px] text-[13px] font-semibold text-ok-ink">
              <span aria-hidden="true" className="size-2 rounded-full bg-ok" />
              Available
            </span>
          ) : null}
          {tool.pendingCount > 0 ? (
            <Link
              href="/incoming"
              className="inline-flex min-h-6 items-center text-[13px] font-bold text-violet underline-offset-4 hover:underline"
            >
              {tool.pendingCount === 1 ? "1 request waiting" : `${tool.pendingCount} requests waiting`} · Review
            </Link>
          ) : null}
        </div>
      </div>

      <AvailabilityStrip
        today={today}
        bookings={tool.bookings}
        availability={tool.availability}
        label={`${tool.name}, next three weeks`}
        className="[grid-area:strip]"
      />

      <div className="flex gap-2 [grid-area:actions] @[680px]/list:justify-end">
        <Button
          variant="outline"
          onClick={() => onEdit(tool)}
          aria-label={`Edit ${tool.name}`}
          aria-pressed={editing}
          className="px-4"
        >
          Edit
        </Button>
        <RemoveTool tool={tool} blocked={out} noteId={out ? noteId : undefined} />
      </div>

      {out ? (
        <p
          id={noteId}
          className="rounded-md bg-paper-muted px-3 py-2.5 text-[13px] leading-[1.45] text-ink-soft [grid-area:note]"
        >
          You can remove it once {withName} has returned it.
        </p>
      ) : null}
    </li>
  );
}

function RemoveTool({ tool, blocked, noteId }: { tool: ListedTool; blocked: boolean; noteId?: string }) {
  const remove = useMutation(api.tools.remove);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);

  async function confirm() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      await remove({ toolId: tool._id });
      toast.success(`Removed ${tool.name}`);
    } catch (error) {
      // TOOL_ON_LOAN lands here too, as its readable sentence.
      toastError(error);
    } finally {
      pending.current = false;
      setBusy(false);
      setOpen(false);
    }
  }

  const waiting = tool.pendingCount;
  return (
    <>
      <Button
        variant="destructive"
        disabled={blocked}
        aria-describedby={noteId}
        aria-label={`Remove ${tool.name}`}
        onClick={() => setOpen(true)}
        className={cn("px-3.5", blocked && "border-disabled-line bg-paper-muted text-disabled-ink")}
      >
        Remove
      </Button>
      <AlertDialog open={open} onOpenChange={(next) => (busy ? undefined : setOpen(next))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {tool.name}?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            It leaves the board for good.
            {waiting > 0
              ? ` The ${waiting === 1 ? "request" : `${waiting} requests`} waiting on it will be declined, and ${waiting === 1 ? "that neighbor gets" : "those neighbors get"} an email.`
              : null}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep it</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy} onClick={confirm}>
              {busy ? "Removing…" : "Remove tool"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

const ListingsBoundary = catchError(function ListingsFallback(_props: object, { error, retry }: ErrorInfo) {
  return <ListError title="We couldn't load your listings." error={error} onRetry={retry} />;
});
