import type { NotificationPayload } from "../automation/payload";

/*
 * Plain-text emails for the direct (Brevo) path. Every string is a verbatim port of
 * the n8n node it comes from: the Compose nodes in n8n/workflows/request-notification.json,
 * "Send reminder" in overdue-reminders.json and "Email admin" in error-handler.json.
 * templates.test.ts evaluates those n8n expressions and fails if the two ever differ.
 * Pure functions: `appUrl` is the APP_URL env value, used as n8n uses $env.APP_URL.
 */

export type Email = { subject: string; text: string };

export function notificationEmail(payload: NotificationPayload, appUrl: string): Email {
  const { recipient, tool, startDate, endDate } = payload;
  const hi = `Hi ${recipient.firstName || "there"},`;
  switch (payload.type) {
    case "request_created":
      return {
        subject: `New request to borrow your ${tool.name}`,
        text: `${hi}\n\nA neighbor asked to borrow your ${tool.name} from ${startDate} to ${endDate}.\n\nReview the request: ${appUrl}/incoming\n`,
      };
    case "request_approved":
      return {
        subject: `Your request was approved: ${tool.name}`,
        text: `${hi}\n\nGood news: your request to borrow the ${tool.name} from ${startDate} to ${endDate} was approved.\n\nSee your requests: ${appUrl}/requests\n`,
      };
    case "request_declined":
      return {
        subject: `Your request was declined: ${tool.name}`,
        text: `${hi}\n\nYour request to borrow the ${tool.name} from ${startDate} to ${endDate} was declined.\n\nSee your requests: ${appUrl}/requests\n`,
      };
    case "request_cancelled":
      return {
        subject: `Cancelled: ${tool.name}`,
        text: `${hi}\n\nA neighbor cancelled their plan to borrow your ${tool.name} (${startDate} to ${endDate}). Nothing more is needed from you, and the tool is free for those dates.\n\nSee your incoming requests: ${appUrl}/incoming\n`,
      };
    case "loan_returned":
      return {
        subject: `Returned: ${tool.name}`,
        text: `${hi}\n\nYour loan of the ${tool.name} (${startDate} to ${endDate}) is marked as returned. Thanks for borrowing.\n\nSee your requests: ${appUrl}/requests\n`,
      };
    case "approval_withdrawn":
      return {
        subject: `Your loan was cancelled: ${tool.name}`,
        text: `${hi}\n\nThe lender can no longer lend you the ${tool.name} for ${startDate} to ${endDate}, so the loan is cancelled.\n\nBrowse the board for another: ${appUrl}/board\n`,
      };
    default:
      // Same wording and 60-character cap as n8n's "Unknown event type" node. Never a blank email.
      throw new Error(`Unknown loan event type: ${String((payload as { type: unknown }).type).slice(0, 60)}`);
  }
}

/** One item of the overdue feed (`endpoints.overdueLoans`), as the reminder reads it. */
export type ReminderFields = {
  borrower: { firstName: string };
  toolName: string;
  endDate: string;
  daysOverdue: number;
};

export function reminderEmail(r: ReminderFields, appUrl: string): Email {
  return {
    subject: `Reminder: please return the ${r.toolName}`,
    text: `Hi ${r.borrower.firstName || "there"},\n\nThe ${r.toolName} you borrowed was due back on ${r.endDate} and is now ${r.daysOverdue} day${r.daysOverdue === 1 ? "" : "s"} overdue.\n\nPlease return it to the lender, who will mark it returned. Your requests: ${appUrl}/requests\n`,
  };
}

export type AlertFields = {
  workflow: string;
  executionId: string;
  node: string;
  message: string;
  url?: string;
};

/** The error handler's admin alert. `message` must already be redacted. */
export function adminAlertEmail(a: AlertFields): Email {
  return {
    subject: `[LendLoop] Workflow failed: ${a.workflow}`,
    text: `Workflow: ${a.workflow}\nExecution: ${a.executionId}\nFailed node: ${a.node}\nError: ${a.message}\n${a.url ? "Execution URL: " + a.url : ""}\n`,
  };
}
