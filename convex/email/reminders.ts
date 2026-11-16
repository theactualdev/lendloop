import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { todayUtc } from "../lib/availability";
import { redactEmails } from "../lib/redact";
import { readBrevoConfig, sendBrevoEmail } from "./brevo";
import { adminAlertEmail, reminderEmail } from "./templates";

/*
 * Hosted demo only: the daily overdue reminders without n8n. Same feed
 * (endpoints.overdueLoans), same write-back (endpoints.recordReminders, keys
 * reminder:<loanId>:<asOf>) and the same 500 cap as the /automation routes.
 * With any other EMAIL_TRANSPORT this returns at once: n8n's own schedule covers that case.
 */

const MAX_RESULTS = 500;
const WORKFLOW = "overdue-reminders (direct)";

export const sendDirectReminders = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    if (process.env.EMAIL_TRANSPORT !== "brevo") return;

    const asOf = todayUtc();
    const executionId = `direct-reminders:${asOf}`;
    const cfg = readBrevoConfig();
    if ("missing" in cfg) {
      await ctx.runMutation(internal.automation.endpoints.recordFailure, {
        workflow: WORKFLOW,
        executionId,
        message: `config: missing ${cfg.missing}`,
      });
      return;
    }

    // Loans already reminded today (reminder_sent) are not in the feed, so a rerun sends no repeat.
    // A failed one is, and gets another try, as in the n8n flow.
    const { loans } = await ctx.runQuery(internal.automation.endpoints.overdueLoans, { asOf });
    const results: { reminderKey: string; loanId: string; status: "sent" | "failed"; error?: string }[] = [];
    for (const loan of loans.slice(0, MAX_RESULTS)) {
      const mail = reminderEmail(loan, cfg.config.appUrl);
      const res = await sendBrevoEmail(cfg.config, {
        to: { email: loan.borrower.email, ...(loan.borrower.firstName ? { name: loan.borrower.firstName } : {}) },
        ...mail,
      });
      results.push({
        reminderKey: loan.reminderKey,
        loanId: loan.loanId,
        ...(res.ok
          ? { status: "sent" as const }
          : { status: "failed" as const, error: redactEmails(res.error).slice(0, 200) }),
      });
    }
    if (results.length === 0) return;
    await ctx.runMutation(internal.automation.endpoints.recordReminders, { results });

    const failed = results.filter((r) => r.status === "failed").length;
    if (failed === 0) return;
    const message = `${failed} of ${results.length} reminders failed`;
    const row = await ctx.runMutation(internal.automation.endpoints.recordFailure, {
      workflow: WORKFLOW,
      executionId,
      message,
    });
    // One alert per day: a same-day rerun finds the failure row and stays quiet.
    const adminEmail = process.env.ADMIN_ALERT_EMAIL;
    if (!adminEmail || row.written === 0) return;
    // Best effort: the failure row above is the record, so a failed alert is ignored.
    await sendBrevoEmail(cfg.config, {
      to: { email: adminEmail },
      ...adminAlertEmail({ workflow: WORKFLOW, executionId, node: "Send reminder", message }),
    });
  },
});
