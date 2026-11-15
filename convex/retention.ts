import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

/*
 * Ruling R34-4: sent-email data does not linger. Nightly (crons.ts, 01:00 UTC):
 *   a) delivered outbox rows older than 7 days lose the recipient's email and
 *      first name (blanked to "", which the payload validator allows) and get
 *      `redactedAt`, so the next run skips them;
 *   b) delivered outbox rows older than 90 days are deleted;
 *   c) automationEvents and automationFailures older than 180 days are deleted.
 * Pending and failed rows are never touched: they still need their payload to
 * be sent or retried. Ages count from _creationTime. Batches are bounded; a full
 * batch schedules another run, like loans.expireStale.
 */

const DAY = 86_400_000;
export const REDACT_AFTER_MS = 7 * DAY;
export const DELETE_OUTBOX_AFTER_MS = 90 * DAY;
export const DELETE_AUTOMATION_AFTER_MS = 180 * DAY;
export const RETENTION_BATCH = 100;

export const run = internalMutation({
  // `now` exists for tests; the cron and the follow-up run pass nothing.
  args: { now: v.optional(v.number()) },
  handler: async (ctx, { now = Date.now() }) => {
    const deletable = await ctx.db
      .query("outbox")
      .withIndex("by_status", (q) =>
        q.eq("status", "delivered").lt("_creationTime", now - DELETE_OUTBOX_AFTER_MS),
      )
      .take(RETENTION_BATCH);
    for (const row of deletable) await ctx.db.delete(row._id);

    const redactable = await ctx.db
      .query("outbox")
      .withIndex("by_status_redacted", (q) =>
        q
          .eq("status", "delivered")
          .eq("redactedAt", undefined)
          .lt("_creationTime", now - REDACT_AFTER_MS),
      )
      .take(RETENTION_BATCH);
    for (const row of redactable) {
      await ctx.db.patch(row._id, {
        payload: { ...row.payload, recipient: { email: "", firstName: "" } },
        redactedAt: now,
      });
    }

    const oldEvents = await ctx.db
      .query("automationEvents")
      .withIndex("by_creation_time", (q) => q.lt("_creationTime", now - DELETE_AUTOMATION_AFTER_MS))
      .take(RETENTION_BATCH);
    for (const row of oldEvents) await ctx.db.delete(row._id);

    const oldFailures = await ctx.db
      .query("automationFailures")
      .withIndex("by_creation_time", (q) => q.lt("_creationTime", now - DELETE_AUTOMATION_AFTER_MS))
      .take(RETENTION_BATCH);
    for (const row of oldFailures) await ctx.db.delete(row._id);

    const full = [deletable, redactable, oldEvents, oldFailures].some((b) => b.length === RETENTION_BATCH);
    if (full) await ctx.scheduler.runAfter(0, internal.retention.run, {});

    return {
      redacted: redactable.length,
      outboxDeleted: deletable.length,
      eventsDeleted: oldEvents.length,
      failuresDeleted: oldFailures.length,
    };
  },
});
