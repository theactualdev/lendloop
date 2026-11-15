import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Ruling R34-2: pending requests whose dates have passed expire quietly (no email).
crons.daily("expire stale requests", { hourUTC: 0, minuteUTC: 30 }, internal.loans.expireStale, {});

export default crons;
