import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { todayUtc } from "../lib/availability";
import { redactEmails } from "../lib/redact";
import { readBrevoConfig, sendBrevoEmail } from "./brevo";
import { adminAlertEmail, reminderEmail } from "./templates";

/*
 * Hosted demo only: the daily overdue reminders without n8n. Same feed
 * (endpoints.overdueLoans) and the same write-back (endpoints.recordReminders, keys
 * reminder:<loanId>:<asOf>) as the /automation routes.
 * With EMAIL_TRANSPORT unset or "n8n" this returns at once: n8n's own schedule covers that case.
 *
 * Each result is recorded right after its send, so a crash or time-out loses at most one
 * email's record, and a rerun skips everything already recorded as sent.
 */

/*
 * Per-run cap. Each send waits at most 10 s (TIMEOUT_MS in brevo.ts), so 40 sends take at
 * most 400 s, well under Convex's 10-minute action limit even with the database calls.
 * Anything beyond the cap is reported in a failure row and picked up by the next run.
 */
export const MAX_PER_RUN = 40;
const WORKFLOW = "overdue-reminders (direct)";

export const sendDirectReminders = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    const transport = process.env.EMAIL_TRANSPORT;
    if (transport === undefined || transport === "n8n") return;

    const asOf = todayUtc();
    const record = (executionId: string, message: string) =>
      ctx.runMutation(internal.automation.endpoints.recordFailure, { workflow: WORKFLOW, executionId, message });

    if (transport !== "brevo") {
      // Same exact matching as the outbox: a typo must not silently stop the reminders.
      await record(`direct-reminders-config:${asOf}`, "config: unknown EMAIL_TRANSPORT");
      return;
    }
    const executionId = `direct-reminders:${asOf}`;
    const cfg = readBrevoConfig();
    if ("missing" in cfg) {
      await record(executionId, `config: missing ${cfg.missing}`);
      return;
    }

    // Loans already reminded today (reminder_sent) are not in the feed, so a rerun sends no repeat.
    // A failed one is, and gets another try, as in the n8n flow.
    const { loans } = await ctx.runQuery(internal.automation.endpoints.overdueLoans, { asOf });
    const batch = loans.slice(0, MAX_PER_RUN);
    let failed = 0;
    for (const loan of batch) {
      const res = await sendBrevoEmail(cfg.config, {
        to: { email: loan.borrower.email, ...(loan.borrower.firstName ? { name: loan.borrower.firstName } : {}) },
        ...reminderEmail(loan, cfg.config.appUrl),
      });
      if (!res.ok) failed++;
      const written = await ctx.runMutation(internal.automation.endpoints.recordReminders, {
        results: [
          {
            reminderKey: loan.reminderKey,
            loanId: loan.loanId,
            ...(res.ok
              ? { status: "sent" as const }
              : { status: "failed" as const, error: redactEmails(res.error).slice(0, 200) }),
          },
        ],
      });
      if (written === null) {
        // Not recorded, so a rerun would email this loan again: stop and say so (loan id only).
        await record(executionId, `could not record the reminder for loan ${loan.loanId}; run stopped`);
        return;
      }
    }

    if (loans.length > batch.length) {
      await record(
        `direct-reminders-deferred:${asOf}`,
        `${loans.length - batch.length} reminders deferred to the next run (cap ${MAX_PER_RUN})`,
      );
    }
    if (failed === 0) return;

    const message = `${failed} of ${batch.length} reminders failed`;
    // Alert first, then write the row: if the alert is lost, the row is not there to
    // make a rerun stay quiet. Best effort, so a failed alert is ignored. A rerun that
    // fails again alerts again.
    const adminEmail = process.env.ADMIN_ALERT_EMAIL;
    if (adminEmail) {
      await sendBrevoEmail(cfg.config, {
        to: { email: adminEmail },
        ...adminAlertEmail({ workflow: WORKFLOW, executionId, node: "Send reminder", message }),
      });
    }
    await record(executionId, message);
  },
});
