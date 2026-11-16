import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation, type ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { writeNotificationAck } from "../automation/endpoints";
import type { NotificationPayload } from "../automation/payload";
import { redactEmails } from "../lib/redact";
import { readBrevoConfig, sendBrevoEmail } from "./brevo";
import { notificationEmail } from "./templates";

/*
 * Hosted demo only: with EMAIL_TRANSPORT=brevo, outbox.deliver calls this instead of
 * posting to n8n. The outbox row, its retries and the notification_sent event are the same.
 */

/** Marks the row delivered and writes the notification_sent event, in one transaction. */
export const markDeliveredAndAck = internalMutation({
  args: { outboxId: v.id("outbox") },
  handler: async (ctx, { outboxId }): Promise<void> => {
    const row = await ctx.db.get(outboxId);
    if (!row) return;
    if (row.status !== "delivered") await ctx.db.patch(outboxId, { status: "delivered", lastError: undefined });
    // The same row n8n's ack writes (key notify:<eventId>), so the UI and activity match.
    if (await ctx.db.get(row.loanId)) await writeNotificationAck(ctx, row.loanId, row.eventId, row.type);
  },
});

export async function deliverViaBrevo(
  ctx: ActionCtx,
  outboxId: Id<"outbox">,
  payload: NotificationPayload,
  fail: (error: string) => Promise<void>,
): Promise<void> {
  const cfg = readBrevoConfig();
  if ("missing" in cfg) {
    await fail(`config: missing ${cfg.missing}`);
    return;
  }

  let mail;
  try {
    mail = notificationEmail(payload, cfg.config.appUrl);
  } catch (e) {
    // An unknown event type: fail the row, send nothing.
    await fail(redactEmails(e instanceof Error ? e.message : "template error"));
    return;
  }

  const { recipient } = payload;
  const res = await sendBrevoEmail(cfg.config, {
    to: { email: recipient.email, ...(recipient.firstName ? { name: recipient.firstName } : {}) },
    ...mail,
  });
  if (!res.ok) {
    await fail(res.error);
    return;
  }
  // Outside the send's error handling on purpose: once Brevo accepted the email, a
  // database error must not turn into a retry that sends it a second time.
  await ctx.runMutation(internal.email.direct.markDeliveredAndAck, { outboxId });
}
