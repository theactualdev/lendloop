import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Ruling R34-2: pending requests whose dates have passed expire quietly (no email).
crons.daily("expire stale requests", { hourUTC: 0, minuteUTC: 30 }, internal.loans.expireStale, {});

// Ruling R34-4: sent-email data does not linger. See convex/retention.ts.
crons.daily("outbox and automation retention", { hourUTC: 1, minuteUTC: 0 }, internal.retention.run, {});

export default crons;
