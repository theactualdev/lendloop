import { formatDistanceToNow } from "date-fns";
import { activityText, latestActivity, type ActivityEvent, type Perspective } from "@/lib/activity";
import { cn } from "@/lib/utils";

/*
 * The most recent email activity of a loan as one quiet line: "Reminder sent
 * 2 days ago". The full list is the Activity slip on My requests.
 */
export function ActivityLine({
  activity,
  perspective,
  counterpartFirstName,
  className,
}: {
  activity: readonly ActivityEvent[];
  perspective: Perspective;
  counterpartFirstName: string;
  className?: string;
}) {
  const latest = latestActivity(activity);
  if (!latest) {
    return <p className={cn("text-[13px] text-ink-muted", className)}>No emails yet</p>;
  }
  const text = activityText(latest, perspective, counterpartFirstName);
  const when = formatDistanceToNow(latest.at, { addSuffix: true });
  return (
    <p className={cn("text-[13px] text-ink-muted", className)}>
      {text}{" "}
      <time dateTime={new Date(latest.at).toISOString()} className="whitespace-nowrap">
        {when}
      </time>
    </p>
  );
}
