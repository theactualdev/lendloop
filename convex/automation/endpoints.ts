import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "../_generated/server";
import { isValidDate } from "../lib/availability";
import { redactEmails } from "../lib/redact";
import { firstName } from "../lib/loanView";
import { loanEventType } from "./payload";

const DAY_MS = 86_400_000;
const ERROR_MAX = 300;
const MESSAGE_MAX = 1000;
const FIELD_MAX = 200;

type Counts = { written: number; duplicates: number };

export const overdueLoans = internalQuery({
  args: { asOf: v.string() },
  handler: async (ctx, { asOf }) => {
    // Approved, unreturned, and strictly past its end date.
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_status_end", (q) => q.eq("status", "approved").lt("endDate", asOf))
      .collect();
    const out = [];
    for (const loan of loans) {
      if (loan.returnedAt !== undefined) continue;
      const reminderKey = `reminder:${loan._id}:${asOf}`;
      const prior = await ctx.db
        .query("automationEvents")
        .withIndex("by_key", (q) => q.eq("idempotencyKey", reminderKey))
        .first();
      // A failed reminder is retried next run; a sent one is not repeated.
      if (prior?.kind === "reminder_sent") continue;
      const [tool, borrower] = await Promise.all([
        ctx.db.get(loan.toolId),
        ctx.db.get(loan.borrowerId),
      ]);
      if (!tool || !borrower) continue;
      out.push({
        loanId: loan._id,
        reminderKey,
        borrower: { email: borrower.email, firstName: firstName(borrower.name) },
        toolName: tool.name,
        endDate: loan.endDate,
        daysOverdue: Math.round(
          (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${loan.endDate}T00:00:00Z`)) / DAY_MS,
        ),
      });
    }
    return { asOf, loans: out };
  },
});

async function upsertEvent(
  ctx: MutationCtx,
  loanId: Id<"loans">,
  idempotencyKey: string,
  kind: "notification_sent" | "reminder_sent" | "reminder_failed",
  detail: string | undefined,
): Promise<"written" | "duplicate"> {
  const existing = await ctx.db
    .query("automationEvents")
    .withIndex("by_key", (q) => q.eq("idempotencyKey", idempotencyKey))
    .first();
  if (!existing) {
    await ctx.db.insert("automationEvents", {
      loanId,
      kind,
      idempotencyKey,
      at: Date.now(),
      ...(detail !== undefined ? { detail } : {}),
    });
    return "written";
  }
  // Only a failed reminder may be upgraded to sent; nothing else changes.
  if (existing.kind === "reminder_failed" && kind === "reminder_sent") {
    await ctx.db.patch(existing._id, { kind, at: Date.now(), detail: undefined });
    return "written";
  }
  return "duplicate";
}

/** Returns null (-> 400) when any item is malformed; nothing is written then. */
export const recordReminders = internalMutation({
  args: {
    results: v.array(
      v.object({
        reminderKey: v.string(),
        loanId: v.string(),
        status: v.union(v.literal("sent"), v.literal("failed")),
        error: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { results }): Promise<Counts | null> => {
    const valid: { loanId: Id<"loans">; r: (typeof results)[number] }[] = [];
    for (const r of results) {
      const loanId = ctx.db.normalizeId("loans", r.loanId);
      if (!loanId || !(await ctx.db.get(loanId))) return null;
      const prefix = `reminder:${loanId}:`;
      if (!r.reminderKey.startsWith(prefix) || !isValidDate(r.reminderKey.slice(prefix.length))) {
        return null;
      }
      valid.push({ loanId, r });
    }
    const counts: Counts = { written: 0, duplicates: 0 };
    for (const { loanId, r } of valid) {
      const kind = r.status === "sent" ? "reminder_sent" : "reminder_failed";
      const detail = r.status === "failed" ? redactEmails(r.error ?? "").slice(0, ERROR_MAX) : undefined;
      const res = await upsertEvent(ctx, loanId, r.reminderKey, kind, detail);
      if (res === "written") counts.written++;
      else counts.duplicates++;
    }
    return counts;
  },
});

export const ackNotification = internalMutation({
  args: { eventId: v.string(), loanId: v.string(), type: loanEventType },
  handler: async (ctx, { eventId, loanId: rawId, type }): Promise<Counts | null> => {
    const loanId = ctx.db.normalizeId("loans", rawId);
    if (!loanId || !(await ctx.db.get(loanId))) return null;
    const res = await upsertEvent(ctx, loanId, `notify:${eventId}`, "notification_sent", type);
    return res === "written" ? { written: 1, duplicates: 0 } : { written: 0, duplicates: 1 };
  },
});

export const recordFailure = internalMutation({
  args: {
    workflow: v.string(),
    executionId: v.string(),
    node: v.optional(v.string()),
    message: v.string(),
  },
  handler: async (ctx, args): Promise<Counts> => {
    const executionId = args.executionId.slice(0, FIELD_MAX);
    const existing = await ctx.db
      .query("automationFailures")
      .withIndex("by_execution", (q) => q.eq("executionId", executionId))
      .first();
    if (existing) return { written: 0, duplicates: 1 };
    await ctx.db.insert("automationFailures", {
      workflow: args.workflow.slice(0, FIELD_MAX),
      executionId,
      ...(args.node !== undefined ? { node: args.node.slice(0, FIELD_MAX) } : {}),
      message: redactEmails(args.message).slice(0, MESSAGE_MAX),
      at: Date.now(),
    });
    return { written: 1, duplicates: 0 };
  },
});
