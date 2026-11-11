import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { withSignedClaims } from "./lib/signedRoute";
import { isValidDate } from "./lib/availability";
import { loanEventType, type LoanEventType } from "./automation/payload";

const http = httpRouter();

const MAX_RESULTS = 500;
const isString = (x: unknown): x is string => typeof x === "string";
const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const EVENT_TYPES = new Set<string>(loanEventType.members.map((m) => m.value));

http.route({
  path: "/automation/overdue-loans",
  method: "POST",
  handler: withSignedClaims("overdue:read", async (ctx, c) => {
    if (!isString(c.asOf) || !isValidDate(c.asOf)) return null;
    return await ctx.runQuery(internal.automation.endpoints.overdueLoans, { asOf: c.asOf });
  }),
});

http.route({
  path: "/automation/reminders",
  method: "POST",
  handler: withSignedClaims("reminders:write", async (ctx, c) => {
    if (!Array.isArray(c.results) || c.results.length > MAX_RESULTS) return null;
    const results: {
      reminderKey: string;
      loanId: string;
      status: "sent" | "failed";
      error?: string;
    }[] = [];
    for (const r of c.results as unknown[]) {
      if (!isObject(r)) return null;
      if (!isString(r.reminderKey) || !isString(r.loanId)) return null;
      if (r.status !== "sent" && r.status !== "failed") return null;
      if (r.error !== undefined && !isString(r.error)) return null;
      results.push({
        reminderKey: r.reminderKey,
        loanId: r.loanId,
        status: r.status,
        ...(r.error !== undefined ? { error: r.error } : {}),
      });
    }
    return await ctx.runMutation(internal.automation.endpoints.recordReminders, { results });
  }),
});

http.route({
  path: "/automation/notifications/ack",
  method: "POST",
  handler: withSignedClaims("notifications:write", async (ctx, c) => {
    if (!isString(c.eventId) || c.eventId === "" || c.eventId.length > 200 || !isString(c.loanId)) return null;
    if (!isString(c.type) || !EVENT_TYPES.has(c.type)) return null;
    return await ctx.runMutation(internal.automation.endpoints.ackNotification, {
      eventId: c.eventId,
      loanId: c.loanId,
      type: c.type as LoanEventType,
    });
  }),
});

http.route({
  path: "/automation/failures",
  method: "POST",
  handler: withSignedClaims("failures:write", async (ctx, c) => {
    if (!isString(c.workflow) || !isString(c.executionId) || c.executionId === "") return null;
    if (!isString(c.message)) return null;
    if (c.node !== undefined && !isString(c.node)) return null;
    return await ctx.runMutation(internal.automation.endpoints.recordFailure, {
      workflow: c.workflow,
      executionId: c.executionId,
      message: c.message,
      ...(c.node !== undefined ? { node: c.node } : {}),
    });
  }),
});

export default http;
