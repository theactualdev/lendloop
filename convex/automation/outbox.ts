import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "../_generated/server";
import { AUD_N8N, signToken } from "../lib/signing";
import { buildNotificationPayload, type LoanEventType, type NotificationPayload } from "./payload";

export type { LoanEventType };

/** Delay before retry n (1-based attempts so far): 30s, 2m, 10m, 1h. */
export const RETRY_DELAYS_MS = [30_000, 120_000, 600_000, 3_600_000];
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
const TIMEOUT_MS = 10_000;
const ERROR_MAX = 300;

/**
 * Writes the outbox row (a snapshot of the notification payload) in the caller's
 * transaction and schedules delivery. If the caller's mutation rolls back, so does
 * the row and the scheduled job.
 */
export async function enqueueLoanEvent(
  ctx: MutationCtx,
  loanId: Id<"loans">,
  type: LoanEventType,
): Promise<void> {
  const loan = await ctx.db.get(loanId);
  if (!loan) throw new Error("enqueueLoanEvent: loan not found");
  const [tool, lender, borrower] = await Promise.all([
    ctx.db.get(loan.toolId),
    ctx.db.get(loan.lenderId),
    ctx.db.get(loan.borrowerId),
  ]);
  if (!tool || !lender || !borrower) throw new Error("enqueueLoanEvent: loan references are missing");
  const eventId = crypto.randomUUID();
  const payload = buildNotificationPayload({ eventId, type, loan, tool, lender, borrower });
  const outboxId = await ctx.db.insert("outbox", {
    eventId,
    loanId,
    type,
    payload,
    status: "pending",
    attempts: 0,
  });
  await ctx.scheduler.runAfter(0, internal.automation.outbox.deliver, { outboxId });
}

export const getForDelivery = internalQuery({
  args: { outboxId: v.id("outbox") },
  handler: async (ctx, { outboxId }): Promise<{ payload: NotificationPayload } | null> => {
    const row = await ctx.db.get(outboxId);
    if (!row || row.status !== "pending") return null;
    return { payload: row.payload };
  },
});

export const markDelivered = internalMutation({
  args: { outboxId: v.id("outbox") },
  handler: async (ctx, { outboxId }): Promise<void> => {
    const row = await ctx.db.get(outboxId);
    if (!row || row.status === "delivered") return;
    await ctx.db.patch(outboxId, { status: "delivered", lastError: undefined });
  },
});

export const recordFailure = internalMutation({
  args: { outboxId: v.id("outbox"), error: v.string() },
  handler: async (ctx, { outboxId, error }): Promise<void> => {
    const row = await ctx.db.get(outboxId);
    if (!row || row.status !== "pending") return;
    const attempts = row.attempts + 1;
    const lastError = error.slice(0, ERROR_MAX);
    if (attempts >= MAX_ATTEMPTS) {
      await ctx.db.patch(outboxId, { attempts, lastError, status: "failed" });
      return;
    }
    await ctx.db.patch(outboxId, { attempts, lastError });
    await ctx.scheduler.runAfter(RETRY_DELAYS_MS[attempts - 1], internal.automation.outbox.deliver, {
      outboxId,
    });
  },
});

function postSignal(): { signal: AbortSignal; done: () => void } {
  if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) {
    return { signal: AbortSignal.timeout(TIMEOUT_MS), done: () => {} };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

export const deliver = internalAction({
  args: { outboxId: v.id("outbox") },
  handler: async (ctx, { outboxId }): Promise<void> => {
    const row = await ctx.runQuery(internal.automation.outbox.getForDelivery, { outboxId });
    if (!row) return; // missing, delivered or failed: never re-send

    const fail = async (error: string): Promise<void> => {
      await ctx.runMutation(internal.automation.outbox.recordFailure, { outboxId, error });
    };

    const secret = process.env.LENDLOOP_TO_N8N_SECRET;
    const url = process.env.N8N_REQUEST_WEBHOOK_URL;
    if (!secret) {
      await fail("config: missing LENDLOOP_TO_N8N_SECRET");
      return;
    }
    if (!url) {
      await fail("config: missing N8N_REQUEST_WEBHOOK_URL");
      return;
    }

    const { signal, done } = postSignal();
    try {
      const token = await signToken(
        { ...row.payload, scope: "loan-event" },
        { secret, audience: AUD_N8N },
      );
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
        signal,
      });
      if (res.ok) {
        await ctx.runMutation(internal.automation.outbox.markDelivered, { outboxId });
        return;
      }
      await fail(`HTTP ${res.status}`);
    } catch (e) {
      // Only the error's name and message: never the token, secret or payload.
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : "unknown error";
      await fail(msg);
    } finally {
      done();
    }
  },
});
