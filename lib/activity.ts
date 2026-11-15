import { neighborName } from "@/lib/names";

/*
 * The email activity of a loan (LoanView.activity) as short sentences. Pure.
 * `detail` is only ever matched against the five known event types; any other
 * value is dropped, never shown.
 */

export type ActivityEvent = { kind: string; at: number; detail?: string };
export type Perspective = "borrower" | "lender";

type Sentence = (name: string) => string;

const BORROWER: Record<string, Sentence> = {
  request_created: (n) => `${n} was emailed your request`,
  request_approved: (n) => `${n} approved. You were emailed.`,
  request_declined: (n) => `${n} declined. You were emailed.`,
  request_cancelled: (n) => `You cancelled. ${n} was emailed.`,
  loan_returned: (n) => `${n} marked it returned. You were emailed.`,
};

const LENDER: Record<string, Sentence> = {
  request_created: () => "You were emailed about this request",
  request_approved: (n) => `You approved. ${n} was emailed.`,
  request_declined: (n) => `You declined. ${n} was emailed.`,
  request_cancelled: (n) => `${n} cancelled. You were emailed.`,
  loan_returned: (n) => `Marked returned. ${n} was emailed.`,
};

export function activityText(event: ActivityEvent, perspective: Perspective, counterpartFirstName: string): string {
  if (event.kind === "reminder_sent") return "Reminder sent";
  if (event.kind === "reminder_failed") return "Reminder didn't send";
  if (event.kind !== "notification_sent") return "Activity";

  const table = perspective === "borrower" ? BORROWER : LENDER;
  const sentence = event.detail !== undefined && Object.hasOwn(table, event.detail) ? table[event.detail] : null;
  if (!sentence) return "Email sent";
  // First word only, so a stored full name can never leak; a stand-in reads as a sentence.
  const first = counterpartFirstName.trim().split(/\s+/)[0];
  // Every name sits at the start of a sentence, so the stand-in is capitalised.
  const name = neighborName(first, { article: "a", capitalize: true });
  return sentence(name);
}

/** The newest event, or undefined. */
export function latestActivity<T extends ActivityEvent>(activity: readonly T[]): T | undefined {
  let latest: T | undefined;
  for (const event of activity) if (!latest || event.at > latest.at) latest = event;
  return latest;
}

/** "Nov 10 · 09:00" in 24-hour time, in `timeZone` (the viewer's own by default). */
export function formatActivityTime(at: number, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("month")} ${get("day")} · ${get("hour")}:${get("minute")}`;
}
